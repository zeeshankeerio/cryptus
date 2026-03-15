/**
 * RSIQ PRO Ticker Worker
 * Offloads Binance WebSocket parsing and buffering from the main thread.
 * Ensures 60fps UI even with 600+ coins updating rapidly.
 */

let socket = null;
let heartbeatInterval = null;
const HEARTBEAT_MS = 30000;
const RECONNECT_DELAY = 2000;

// Internal buffer to minimize postMessage frequency
let tickerBuffer = new Map();
let flushInterval = null;
let currentSymbols = new Set();

// Real-time Intelligence State
let rsiStates = new Map(); // symbol -> { 1m, 5m, 15m, 1h, custom, lastPrice }
let coinConfigs = new Map(); // symbol -> config
let zoneStates = new Map(); // symbol-timeframe -> zone
let lastTriggered = new Map(); // alertKey -> timestamp
const COOLDOWN_MS = 3 * 60 * 1000;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'START':
      currentSymbols = new Set(payload.symbols);
      initSocket();
      startFlushing(payload.flushInterval || 800);
      break;

    case 'UPDATE_SYMBOLS':
      currentSymbols = new Set(payload.symbols);
      break;

    case 'SYNC_STATES':
      // payload: { symbol, configs, rsiStates }
      if (payload.configs) {
        Object.entries(payload.configs).forEach(([s, c]) => coinConfigs.set(s, c));
      }
      if (payload.rsiStates) {
        Object.keys(payload.rsiStates).forEach(s => {
            const prevState = rsiStates.get(s) || {};
            rsiStates.set(s, { ...prevState, ...payload.rsiStates[s] });
        });
      }
      break;

    case 'STOP':
      stopSocket();
      stopFlushing();
      break;
    
    case 'VIRTUAL_TICKET':
      // payload: { s: symbol, c: close, o: open, q: volume }
      processTicker(payload);
      break;

    case 'UPDATE_CONFIG':
        if (payload.flushInterval) {
            stopFlushing();
            startFlushing(payload.flushInterval);
        }
        break;
  }
};

// ── Indicator Helpers ──────────────────────────────────────────

function approximateRsi(state, livePrice, period = 14) {
  if (!state || !state.avgGain || !state.avgLoss) return null;
  const change = livePrice - (state.lastClose || state.lastPrice || 0);
  let avgGain, avgLoss;

  if (change > 0) {
    avgGain = (state.avgGain * (period - 1) + change) / period;
    avgLoss = (state.avgLoss * (period - 1)) / period;
  } else {
    avgGain = (state.avgGain * (period - 1)) / period;
    avgLoss = (state.avgLoss * (period - 1) + Math.abs(change)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeHysteresis(obT, osT) {
  const gap = Math.max(0, obT - osT);
  return Math.max(2, gap * 0.15);
}

// ── Core Logic ────────────────────────────────────────────────

function initSocket() {
  if (socket) return;
  socket = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');

  socket.onopen = () => {
    console.log('[worker] WebSocket connected');
    startHeartbeat();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (Array.isArray(data)) {
        data.forEach(t => processTicker(t));
      } else if (data && typeof data === 'object' && 's' in data) {
        processTicker(data);
      }
    } catch (e) { }
  };

  socket.onclose = () => {
    console.log('[worker] WebSocket closed, reconnecting...');
    stopHeartbeat();
    socket = null;
    setTimeout(initSocket, RECONNECT_DELAY);
  };
  socket.onerror = () => { if (socket) socket.close(); };
}

function processTicker(t) {
  if (!currentSymbols.has(t.s)) return;

  const close = parseFloat(t.c);
  const open = parseFloat(t.o);
  if (isNaN(close) || close <= 0) return;

  const change24h = isNaN(open) || open <= 0
    ? 0
    : Math.round(((close - open) / open) * 10000) / 100;

  tickerBuffer.set(t.s, {
    price: close,
    change24h,
    volume24h: parseFloat(t.q) || 0,
    updatedAt: Date.now(),
  });

  // ── Real-time Alert Evaluation ──
  const state = rsiStates.get(t.s);
  const config = coinConfigs.get(t.s);
  if (!state || !config) return;

  const r1mP = config.rsi1mPeriod || 14;
  const r5mP = config.rsi5mPeriod || 14;
  const r15mP = config.rsi15mPeriod || 14;
  const r1hP = config.rsi1hPeriod || 14;
  const rCP = state.rsiPeriodAtCreation || 14;
  const obT = config.overboughtThreshold || 70;
  const osT = config.oversoldThreshold || 30;
  const hysteresis = computeHysteresis(obT, osT);

  const tfs = [
    { label: '1m', state: state.rsiState1m, p: r1mP, cfgKey: 'alertOn1m' },
    { label: '5m', state: state.rsiState5m, p: r5mP, cfgKey: 'alertOn5m' },
    { label: '15m', state: state.rsiState15m, p: r15mP, cfgKey: 'alertOn15m' },
    { label: '1h', state: state.rsiState1h, p: r1hP, cfgKey: 'alertOn1h' },
    { label: 'Custom', state: state.rsiStateCustom, p: rCP, cfgKey: 'alertOnCustom' }
  ];

  // ── Phase 1: Evaluate all enabled timeframes ──
  const tfResults = tfs.map(tf => {
    if (!tf.state) return { ...tf, rsi: null, zone: 'NEUTRAL' };
    const rsi = approximateRsi(tf.state, close, tf.p);
    const stateKey = `${t.s}-${tf.label}`;
    const previousZone = zoneStates.get(stateKey) || 'NEUTRAL';
    let zone = 'NEUTRAL';

    // State-First Hysteresis
    if (previousZone === 'OVERSOLD') {
      zone = rsi > osT + hysteresis ? 'NEUTRAL' : 'OVERSOLD';
    } else if (previousZone === 'OVERBOUGHT') {
      zone = rsi < obT - hysteresis ? 'NEUTRAL' : 'OVERBOUGHT';
    } else {
      if (rsi <= osT) zone = 'OVERSOLD';
      else if (rsi >= obT) zone = 'OVERBOUGHT';
    }
    return { ...tf, rsi, zone, previousZone };
  });

  // ── Phase 2: Fire RSI alerts with Confluence support ──
  tfResults.forEach(res => {
    if (!config[res.cfgKey] || res.rsi === null) return;

    if (res.previousZone !== res.zone && res.zone !== 'NEUTRAL') {
      let hasConfluence = true;
      if (config.alertConfluence) {
        // Confluence: At least one OTHER enabled TF must match the current zone
        hasConfluence = tfResults.some(other => 
          other.label !== res.label && 
          config[other.cfgKey] && 
          other.zone === res.zone
        );
      }

      if (hasConfluence) {
        const alertKey = `${t.s}-${res.label}`;
        const now = Date.now();
        if (now - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
          lastTriggered.set(alertKey, now);
          self.postMessage({
            type: 'ALERT_TRIGGERED',
            payload: {
              symbol: t.s,
              timeframe: res.label,
              value: res.rsi,
              type: res.zone,
            }
          });
        }
      }
    }
    zoneStates.set(`${t.s}-${res.label}`, res.zone);
  });

  // ── Strategy Shift Alerts (Worker-Side) ──
  if (config.alertOnStrategyShift) {
    const stratKey = `${t.s}-STRAT`;
    const prevStrat = zoneStates.get(stratKey) || 'neutral';
    
    // Evaluate Strategy Score using live price and approximated indicators
    const currentScore = computeWorkerStrategyScore(t.s, close, rsiStates.get(t.s));
    const currentStrat = currentScore.signal;

    if (prevStrat !== currentStrat && (currentStrat === 'strong-buy' || currentStrat === 'strong-sell')) {
      const alertKey = `${t.s}-STRAT-WATCH`;
      const now = Date.now();
      if (now - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
        lastTriggered.set(alertKey, now);
        self.postMessage({
          type: 'ALERT_TRIGGERED',
          payload: {
            symbol: t.s,
            timeframe: 'STRAT',
            value: currentScore.score,
            type: currentStrat === 'strong-buy' ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL',
          }
        });
      }
    }
    zoneStates.set(stratKey, currentStrat);
  }
}

function computeWorkerStrategyScore(symbol, price, state) {
    const config = coinConfigs.get(symbol);
    if (!config || !state) return { score: 0, signal: 'neutral' };

    // Approximation logic for price-dependent factors
    const r1m = approximateRsi(state.rsiState1m, price, config.rsi1mPeriod || 14);
    const r5m = approximateRsi(state.rsiState5m, price, config.rsi5mPeriod || 14);
    const r15m = approximateRsi(state.rsiState15m, price, config.rsi15mPeriod || 14);
    const r1h = approximateRsi(state.rsiState1h, price, config.rsi1hPeriod || 14);

    let score = 0;
    let factors = 0;

    const rsiScore = (val, weight) => {
        if (val === null || val === undefined) return;
        factors += weight;
        if (val <= 30) score += 100 * weight;
        else if (val <= 40) score += 40 * weight;
        else if (val >= 70) score -= 100 * weight;
        else if (val >= 60) score -= 40 * weight;
    };

    rsiScore(r1m, 0.5);
    rsiScore(r5m, 1);
    rsiScore(r15m, 1.5);
    rsiScore(r1h, 2);

    // Use static baseline for the rest of parameters synced from main thread
    if (state.macdHistogram !== undefined) {
        factors += 1.5;
        const hPct = (state.macdHistogram / price) * 100;
        score += Math.min(Math.max(hPct * 200, -100), 100) * 1.5;
    }

    if (state.bbPosition !== undefined) {
        factors += 1;
        if (state.bbPosition <= 0.1) score += 80 * 1;
        else if (state.bbPosition >= 0.9) score -= 80 * 1;
    }

    if (state.confluence !== undefined) {
        factors += 2;
        score += state.confluence * 2;
    }

    let normalized = factors > 0 ? score / factors : 0;
    normalized = Math.round(Math.max(-100, Math.min(100, normalized)));

    let signal = 'neutral';
    if (normalized >= 70) signal = 'strong-buy';
    else if (normalized <= -70) signal = 'strong-sell';

    return { score: normalized, signal };
}

function startFlushing(interval) {
  flushInterval = setInterval(() => {
    if (tickerBuffer.size > 0) {
      self.postMessage({
        type: 'TICKS',
        payload: Array.from(tickerBuffer.entries())
      });
      tickerBuffer.clear();
    }
  }, interval);
}

function stopFlushing() { if (flushInterval) clearInterval(flushInterval); }
function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ method: 'listProperty', id: Date.now() }));
    }
  }, HEARTBEAT_MS);
}
function stopHeartbeat() { if (heartbeatInterval) clearInterval(heartbeatInterval); }
function stopSocket() {
  if (socket) { socket.close(); socket = null; }
  stopHeartbeat();
}

