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
let volatilityBuffer = new Map(); // symbol -> { startPrice, startTime }

// Real-time Intelligence State
let rsiStates = new Map(); // symbol -> { indicator states: rsi, ema, macd, etc. }
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
      // payload: { configs, rsiStates }
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
  const change = livePrice - (state.lastClose || 0);
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

function approximateEma(state, livePrice, period = 9) {
  if (!state || state.ema === undefined) return null;
  const alpha = 2 / (period + 1);
  return livePrice * alpha + state.ema * (1 - alpha);
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

  // ── Volatility Monitor ──
  const now = Date.now();
  const volEntry = volatilityBuffer.get(t.s);
  if (!volEntry) {
    volatilityBuffer.set(t.s, { startPrice: close, startTime: now });
  } else {
    if (now - volEntry.startTime > 30000) {
      const movePct = Math.abs(close - volEntry.startPrice) / volEntry.startPrice;
      if (movePct >= 0.02) { // 2% move in 30s
        self.postMessage({ type: 'PRIORITY_SYNC', payload: t.s });
      }
      volatilityBuffer.set(t.s, { startPrice: close, startTime: now });
    }
  }

  // ── Real-time Indicator Shadowing ──
  const state = rsiStates.get(t.s);
  const config = coinConfigs.get(t.s);
  
  let liveIndicators = {};

  if (state && config) {
    const r1mP = config.rsi1mPeriod || 14;
    const r5mP = config.rsi5mPeriod || 14;
    const r15mP = config.rsi15mPeriod || 14;
    const r1hP = config.rsi1hPeriod || 14;
    const rCP = state.rsiPeriodAtCreation || 14;
    const obT = config.overboughtThreshold || 70;
    const osT = config.oversoldThreshold || 30;
    const hysteresis = computeHysteresis(obT, osT);

    // Live RSI shadowing
    const rsi1m = approximateRsi(state.rsiState1m, close, r1mP);
    const rsi5m = approximateRsi(state.rsiState5m, close, r5mP);
    const rsi15m = approximateRsi(state.rsiState15m, close, r15mP);
    const rsi1h = approximateRsi(state.rsiState1h, close, r1hP);
    const rsiCustom = approximateRsi(state.rsiStateCustom, close, rCP);

    // Live EMA shadowing
    const ema9 = approximateEma(state.ema9State, close, 9);
    const ema21 = approximateEma(state.ema21State, close, 21);
    const emaCross = (ema9 && ema21) ? (ema9 > ema21 ? 'bullish' : 'bearish') : null;

    // Live MACD shadowing
    const ema12 = approximateEma(state.macdFastState, close, 12);
    const ema26 = approximateEma(state.macdSlowState, close, 26);
    let macdHistogram = null;
    if (ema12 && ema26 && state.macdSignalState) {
      const macdLine = ema12 - ema26;
      const macdSignal = approximateEma(state.macdSignalState, macdLine, 9);
      macdHistogram = macdLine - macdSignal;
    }

    // Live BB Position shadowing
    let bbPosition = null;
    if (state.bbUpper && state.bbLower) {
      const range = state.bbUpper - state.bbLower;
      bbPosition = range > 0 ? (close - state.bbLower) / range : 0.5;
    }

    const currentStrategy = computeWorkerStrategyScore({
      symbol: t.s,
      price: close,
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram,
      bbPosition,
      emaCross,
      confluence: state.confluence // static baseline
    });

    liveIndicators = {
      rsi1m, rsi5m, rsi15m, rsi1h, rsiCustom,
      ema9, ema21, emaCross,
      macdHistogram,
      bbPosition,
      strategyScore: currentStrategy.score,
      strategySignal: currentStrategy.signal
    };

    // ── Alert Evaluation ──
    const tfs = [
      { label: '1m', rsi: rsi1m, cfgKey: 'alertOn1m' },
      { label: '5m', rsi: rsi5m, cfgKey: 'alertOn5m' },
      { label: '15m', rsi: rsi15m, cfgKey: 'alertOn15m' },
      { label: '1h', rsi: rsi1h, cfgKey: 'alertOn1h' },
      { label: 'Custom', rsi: rsiCustom, cfgKey: 'alertOnCustom' }
    ];

    tfs.forEach(tf => {
      if (!config[tf.cfgKey] || tf.rsi === null) return;
      const stateKey = `${t.s}-${tf.label}`;
      const previousZone = zoneStates.get(stateKey) || 'NEUTRAL';
      let zone = 'NEUTRAL';

      if (previousZone === 'OVERSOLD') {
        zone = tf.rsi > osT + hysteresis ? 'NEUTRAL' : 'OVERSOLD';
      } else if (previousZone === 'OVERBOUGHT') {
        zone = tf.rsi < obT - hysteresis ? 'NEUTRAL' : 'OVERBOUGHT';
      } else {
        if (tf.rsi <= osT) zone = 'OVERSOLD';
        else if (tf.rsi >= obT) zone = 'OVERBOUGHT';
      }

      if (previousZone !== zone && zone !== 'NEUTRAL') {
        // Confluence check
        let hasConfluence = !config.alertConfluence || tfs.some(other => 
           other.label !== tf.label && config[other.cfgKey] && other.rsi !== null && 
           (zone === 'OVERSOLD' ? other.rsi <= osT : other.rsi >= obT)
        );

        if (hasConfluence) {
          const alertKey = `${t.s}-${tf.label}`;
          const now = Date.now();
          if (now - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
            lastTriggered.set(alertKey, now);
            self.postMessage({
              type: 'ALERT_TRIGGERED',
              payload: { symbol: t.s, timeframe: tf.label, value: tf.rsi, type: zone }
            });
          }
        }
      }
      zoneStates.set(stateKey, zone);
    });

    // Strategy Shift Alerts
    if (config.alertOnStrategyShift) {
      const stratKey = `${t.s}-STRAT`;
      const prevStrat = zoneStates.get(stratKey) || 'neutral';
      const currentStrat = currentStrategy.signal;

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
              value: currentStrategy.score,
              type: currentStrat === 'strong-buy' ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL',
            }
          });
        }
      }
      zoneStates.set(stratKey, currentStrat);
    }
  }

  tickerBuffer.set(t.s, {
    price: close,
    change24h,
    volume24h: parseFloat(t.q) || 0,
    updatedAt: Date.now(),
    ...liveIndicators
  });
}

function computeWorkerStrategyScore(params) {
    let score = 0;
    let factors = 0;

    const rsiScore = (val, weight) => {
        if (val === null || val === undefined) return;
        factors += weight;
        if (val <= 20) score += 100 * weight;
        else if (val <= 30) score += 70 * weight;
        else if (val <= 40) score += 30 * weight;
        else if (val <= 60) score += 0;
        else if (val <= 70) score -= 30 * weight;
        else if (val <= 80) score -= 70 * weight;
        else score -= 100 * weight;
    };

    rsiScore(params.rsi1m, 0.5);
    rsiScore(params.rsi5m, 1);
    rsiScore(params.rsi15m, 1.5);
    rsiScore(params.rsi1h, 2);

    if (params.macdHistogram !== null && params.price > 0) {
        factors += 1.5;
        const hPct = (params.macdHistogram / params.price) * 100;
        if (hPct > 0) score += Math.min(hPct * 200, 100) * 1.5;
        else score += Math.max(hPct * 200, -100) * 1.5;
    }

    if (params.bbPosition !== null) {
        factors += 1;
        const bp = params.bbPosition;
        if (bp <= 0.1) score += 80 * 1;
        else if (bp <= 0.25) score += 40 * 1;
        else if (bp >= 0.9) score -= 80 * 1;
        else if (bp >= 0.75) score -= 40 * 1;
    }

    if (params.emaCross) {
        factors += 1.5;
        score += (params.emaCross === 'bullish' ? 60 : -60) * 1.5;
    }

    if (params.confluence !== undefined) {
        factors += 2;
        score += params.confluence * 2;
    }

    let normalized = factors > 0 ? score / factors : 0;
    // Dampen low-confidence signals (fewer factors)
    if (factors < 3 && Math.abs(normalized) > 50) normalized *= 0.7;
    normalized = Math.round(Math.max(-100, Math.min(100, normalized)));

    let signal = 'neutral';
    if (normalized >= 50) signal = 'strong-buy';
    else if (normalized >= 20) signal = 'buy';
    else if (normalized <= -50) signal = 'strong-sell';
    else if (normalized <= -20) signal = 'sell';

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
