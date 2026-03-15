/**
 * RSIQ PRO Ticker Worker — v3 (Multi-Exchange Architecture)
 * Offloads WebSocket parsing, buffering, and real-time alert evaluation.
 * Supports Binance and Bybit (Spot & Linear).
 */

const RECONNECT_DELAY = 2000;
const HEARTBEAT_MS = 30000;

// Internal buffer to minimize postMessage frequency
let tickerBuffer = new Map();
let flushInterval = null;
let currentSymbols = new Set();
let volatilityBuffer = new Map(); 
let currentExchangeName = 'binance';
let activeExchange = null;

// Real-time Intelligence State
let rsiStates = new Map();   
let coinConfigs = new Map(); 
let zoneStates = new Map();  
let lastTriggered = new Map(); 
const COOLDOWN_MS = 3 * 60 * 1000;
let globalRsiPeriod = 14;

// ── Exchange Adapters ──────────────────────────────────────────

class ExchangeAdapter {
  constructor() {
    this.socket = null;
    this.heartbeatInterval = null;
  }

  connect() {}
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.stopHeartbeat();
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => this.sendPing(), HEARTBEAT_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  sendPing() {}
  updateSymbols(symbols) {}
}

class BinanceAdapter extends ExchangeAdapter {
  connect() {
    this.socket = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    this.socket.onopen = () => {
      console.log('[worker] Binance Connected');
      this.startHeartbeat();
    };
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          data.forEach(t => this.process(t));
        } else if (data && typeof data === 'object' && 's' in data) {
          this.process(data);
        }
      } catch (e) {}
    };
    this.socket.onclose = () => {
      console.log('[worker] Binance Closed, reconnecting...');
      this.disconnect();
      setTimeout(() => ensureExchange(currentExchangeName), RECONNECT_DELAY);
    };
    this.socket.onerror = () => this.socket?.close();
  }

  sendPing() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ method: 'listProperty', id: Date.now() }));
    }
  }

  process(t) {
    // Normalize Binance miniTicker to internal schema
    // s: symbol, c: close, o: open, q: quote volume
    processNormalizedTicker({
      s: t.s,
      c: parseFloat(t.c),
      o: parseFloat(t.o),
      q: parseFloat(t.q)
    }, this.exchangeName || 'binance');
  }
}

class BybitAdapter extends ExchangeAdapter {
  constructor(type = 'spot') {
    super();
    this.type = type; // 'spot' or 'linear'
  }

  connect() {
    const url = this.type === 'spot' 
      ? 'wss://stream.bybit.com/v5/public/spot' 
      : 'wss://stream.bybit.com/v5/public/linear';
    
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      console.log(`[worker] Bybit ${this.type} Connected`);
      this.startHeartbeat();
      this.subscribeAll();
    };
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.op === 'pong') return;
        
        // Handle both tickers.SYMBOL and unified tickers topics
        if (data.topic && (data.topic.startsWith('tickers.') || data.topic === 'tickers')) {
          const tickData = data.data;
          if (Array.isArray(tickData)) {
            tickData.forEach(t => this.process(t));
          } else {
            this.process(tickData);
          }
        }
      } catch (e) {}
    };
    this.socket.onclose = () => {
      console.log(`[worker] Bybit ${this.type} Closed, reconnecting...`);
      this.disconnect();
      setTimeout(() => ensureExchange(currentExchangeName), RECONNECT_DELAY);
    };
    this.socket.onerror = () => this.socket?.close();
  }

  sendPing() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ op: 'ping' }));
    }
  }

  updateSymbols(symbols) {
    if (this.socket?.readyState === WebSocket.OPEN && this.type === 'spot') {
      this.subscribeAll();
    }
  }

  subscribeAll() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    
    if (this.type !== 'spot') {
      // PRO TRICK: For Linear/Inverse, user unified "tickers" topic to get ALL symbols at once
      this.socket.send(JSON.stringify({
        op: 'subscribe',
        args: ['tickers']
      }));
      return;
    }

    // Bybit Spot requires explicit subscription. Max 10 per message. Max 33 topics per connection.
    // We prioritize the top symbols for Spot.
    const symbols = Array.from(currentSymbols).slice(0, 30);
    const topics = symbols.map(s => `tickers.${s}`);
    
    for (let i = 0; i < topics.length; i += 10) {
      const batch = topics.slice(i, i + 10);
      this.socket.send(JSON.stringify({
        op: 'subscribe',
        args: batch
      }));
    }
  }

  process(data) {
    if (!data) return;
    // Normalize Bybit V5 ticker to internal schema
    // Bybit payloads vary slightly between linear and spot, but v5 is unified.
    processNormalizedTicker({
      s: data.symbol,
      c: parseFloat(data.lastPrice),
      o: parseFloat(data.prevPrice24h),
      q: parseFloat(data.turnover24h)
    }, this.exchangeName || 'bybit');
  }
}

// ── Controller Logic ──────────────────────────────────────────
let activeAdapters = new Map();

function ensureExchange(name) {
  if (activeAdapters.has(name)) return;

  let adapter;
  if (name === 'bybit' || name === 'bybit-linear') {
    adapter = new BybitAdapter(name === 'bybit-linear' ? 'linear' : 'spot');
  } else {
    adapter = new BinanceAdapter();
  }
  
  adapter.exchangeName = name;
  activeAdapters.set(name, adapter);
  adapter.connect();
  console.log(`[worker] Concurrent adapter added: ${name}`);
}

function stopExchange(name) {
  const adapter = activeAdapters.get(name);
  if (adapter) {
    adapter.disconnect();
    activeAdapters.delete(name);
  }
}

function processNormalizedTicker(t, exchangeName = 'binance') {
  if (!currentSymbols.has(t.s)) return;
  if (isNaN(t.c) || t.c <= 0) return;

  const change24h = isNaN(t.o) || t.o <= 0
    ? 0
    : Math.round(((t.c - t.o) / t.o) * 10000) / 100;

  const trackingKey = `${exchangeName}:${t.s}`;

  // ── Volatility Monitor ──
  const now = Date.now();
  const volEntry = volatilityBuffer.get(trackingKey);
  if (!volEntry) {
    volatilityBuffer.set(trackingKey, { startPrice: t.c, startTime: now });
  } else {
    if (now - volEntry.startTime > 30000) {
      const movePct = Math.abs(t.c - volEntry.startPrice) / volEntry.startPrice;
      if (movePct >= 0.02) {
        self.postMessage({ type: 'PRIORITY_SYNC', payload: t.s });
      }
      volatilityBuffer.set(trackingKey, { startPrice: t.c, startTime: now });
    }
  }

  // ── Real-time Indicator Shadowing ──
  const state = rsiStates.get(t.s); // Note: rsiStates is synced from main thread which is symbol-based
  const config = coinConfigs.get(t.s);

  let liveIndicators = {};

  if (state && config) {
    const r1mP = config.rsi1mPeriod || 14;
    const r5mP = config.rsi5mPeriod || 14;
    const r15mP = config.rsi15mPeriod || 14;
    const r1hP = config.rsi1hPeriod || 14;
    const rCP = globalRsiPeriod;

    const obT = config.overboughtThreshold != null ? config.overboughtThreshold : 70;
    const osT = config.oversoldThreshold != null ? config.oversoldThreshold : 30;
    const hysteresis = computeHysteresis(obT, osT);

    const rsi1m = approximateRsi(state.rsiState1m, t.c, r1mP);
    const rsi5m = approximateRsi(state.rsiState5m, t.c, r5mP);
    const rsi15m = approximateRsi(state.rsiState15m, t.c, r15mP);
    const rsi1h = approximateRsi(state.rsiState1h, t.c, r1hP);
    const rsiCustom = approximateRsi(state.rsiStateCustom, t.c, rCP);

    const ema9 = approximateEma(state.ema9State, t.c, 9);
    const ema21 = approximateEma(state.ema21State, t.c, 21);
    const emaCross = (ema9 && ema21) ? (ema9 > ema21 ? 'bullish' : 'bearish') : null;

    let macdHistogram = null;
    if (state.macdFastState && state.macdSlowState && state.macdSignalState) {
        const ema12 = approximateEma(state.macdFastState, t.c, 12);
        const ema26 = approximateEma(state.macdSlowState, t.c, 26);
        if (ema12 && ema26) {
          const macdLine = ema12 - ema26;
          const macdSignal = approximateEma(state.macdSignalState, macdLine, 9);
          macdHistogram = macdLine - macdSignal;
        }
    }

    let bbPosition = null;
    if (state.bbUpper && state.bbLower) {
      const range = state.bbUpper - state.bbLower;
      bbPosition = range > 0 ? (t.c - state.bbLower) / range : 0.5;
    }

    const currentStrategy = computeWorkerStrategyScore({
      symbol: t.s,
      price: t.c,
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram,
      bbPosition,
      emaCross,
      confluence: state.confluence
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
      { label: '1m',     rsi: rsi1m,     cfgKey: 'alertOn1m'     },
      { label: '5m',     rsi: rsi5m,     cfgKey: 'alertOn5m'     },
      { label: '15m',    rsi: rsi15m,    cfgKey: 'alertOn15m'    },
      { label: '1h',     rsi: rsi1h,     cfgKey: 'alertOn1h'     },
      { label: 'Custom', rsi: rsiCustom, cfgKey: 'alertOnCustom' }
    ];

    tfs.forEach(tf => {
      if (!config[tf.cfgKey] || tf.rsi === null || tf.rsi === undefined) return;

      const stateKey = `${trackingKey}-${tf.label}`;
      const previousZone = zoneStates.get(stateKey);
      let zone = 'NEUTRAL';
      const isInverted = obT < osT;

      if (previousZone === 'OVERSOLD') {
        zone = isInverted 
          ? (tf.rsi < osT - hysteresis ? 'NEUTRAL' : 'OVERSOLD')
          : (tf.rsi > osT + hysteresis ? 'NEUTRAL' : 'OVERSOLD');
      } else if (previousZone === 'OVERBOUGHT') {
        zone = isInverted
          ? (tf.rsi > obT + hysteresis ? 'NEUTRAL' : 'OVERBOUGHT')
          : (tf.rsi < obT - hysteresis ? 'NEUTRAL' : 'OVERBOUGHT');
      } else {
        if (isInverted) {
          if (tf.rsi >= osT) zone = 'OVERSOLD';
          else if (tf.rsi <= obT) zone = 'OVERBOUGHT';
        } else {
          if (tf.rsi <= osT) zone = 'OVERSOLD';
          else if (tf.rsi >= obT) zone = 'OVERBOUGHT';
        }
      }

      if (previousZone !== undefined && previousZone !== zone && zone !== 'NEUTRAL') {
        let hasConfluence = !config.alertConfluence || tfs.some(other =>
          other.label !== tf.label && config[other.cfgKey] && other.rsi !== null &&
          (zone === 'OVERSOLD' 
            ? (isInverted ? other.rsi >= osT : other.rsi <= osT) 
            : (isInverted ? other.rsi <= obT : other.rsi >= obT))
        );

        if (hasConfluence) {
          const alertKey = stateKey;
          const nowTs = Date.now();
          if (nowTs - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
            lastTriggered.set(alertKey, nowTs);
            self.postMessage({
              type: 'ALERT_TRIGGERED',
              payload: { 
                symbol: t.s, 
                exchange: exchangeName,
                timeframe: tf.label, 
                value: tf.rsi, 
                type: zone 
              }
            });
          }
        }
      }
      zoneStates.set(stateKey, zone);
    });

    if (config.alertOnStrategyShift) {
      const stratKey = `${trackingKey}-STRAT`;
      const prevStrat = zoneStates.get(stratKey);
      const currentStrat = currentStrategy.signal;

      if (prevStrat !== undefined && prevStrat !== currentStrat &&
          (currentStrat === 'strong-buy' || currentStrat === 'strong-sell')) {
        const alertKey = stratKey;
        const nowTs = Date.now();
        if (nowTs - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
          lastTriggered.set(alertKey, nowTs);
          self.postMessage({
            type: 'ALERT_TRIGGERED',
            payload: {
              symbol: t.s,
              exchange: exchangeName,
              timeframe: 'STRATEGY',
              value: currentStrategy.score,
              type: currentStrat === 'strong-buy' ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL',
            }
          });
        }
      }
      zoneStates.set(stratKey, currentStrat);
    }
  }

  // ── Update UI Buffer (Prioritize Active Exchange) ──
  if (exchangeName === currentExchangeName || !tickerBuffer.has(t.s)) {
    tickerBuffer.set(t.s, {
      price: t.c,
      change24h,
      volume24h: t.q,
      exchange: exchangeName,
      updatedAt: Date.now(),
      ...liveIndicators
    });
  }
}

// ── Workers Global Handlers ────────────────────────────────────

self.onmessage = (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'START':
      currentSymbols = new Set(payload.symbols);
      currentExchangeName = payload.exchange || 'binance';
      ensureExchange(currentExchangeName);
      startFlushing(payload.flushInterval || 800);
      break;

    case 'SET_EXCHANGE':
      if (payload.exchange) {
        currentExchangeName = payload.exchange;
        ensureExchange(payload.exchange);
      }
      break;

    case 'UPDATE_SYMBOLS':
      currentSymbols = new Set(payload.symbols);
      // Memory Hygiene: Clean up state for symbols no longer being tracked
      for (const [s] of rsiStates) { if (!currentSymbols.has(s)) rsiStates.delete(s); }
      for (const [s] of coinConfigs) { if (!currentSymbols.has(s)) coinConfigs.delete(s); }
      for (const [k] of zoneStates) {
        const symbol = k.split('-')[0];
        if (!currentSymbols.has(symbol)) zoneStates.delete(k);
      }
      for (const [k] of lastTriggered) {
        const symbol = k.split('-')[0];
        if (!currentSymbols.has(symbol)) lastTriggered.delete(k);
      }
      for (const [s] of volatilityBuffer) { if (!currentSymbols.has(s)) volatilityBuffer.delete(s); }
      for (const [s] of tickerBuffer) { if (!currentSymbols.has(s)) tickerBuffer.delete(s); }

      activeAdapters.forEach(adapter => adapter.updateSymbols(currentSymbols));
      break;

    case 'SYNC_STATES':
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

    case 'SYNC_CONFIG_FAST':
      if (payload.symbol && payload.config) {
        coinConfigs.set(payload.symbol, payload.config);
        for (const [key] of zoneStates) {
          if (key.startsWith(`${payload.symbol}-`)) zoneStates.delete(key);
        }
        for (const [key] of lastTriggered) {
          if (key.startsWith(`${payload.symbol}-`)) lastTriggered.delete(key);
        }
      }
      break;

    case 'UPDATE_PERIOD':
      if (typeof payload.period === 'number' && payload.period >= 2) {
        globalRsiPeriod = payload.period;
        for (const [key] of zoneStates) {
          if (key.endsWith('-Custom')) zoneStates.delete(key);
        }
      }
      break;

    case 'STOP':
      activeAdapters.forEach(adapter => adapter.disconnect());
      activeAdapters.clear();
      stopFlushing();
      break;

    case 'VIRTUAL_TICKET':
      processNormalizedTicker({
        s: payload.s,
        c: parseFloat(payload.c),
        o: parseFloat(payload.o),
        q: parseFloat(payload.q)
      }, payload.exchange || 'binance');
      break;

    case 'UPDATE_CONFIG':
      if (payload.flushInterval) {
        stopFlushing();
        startFlushing(payload.flushInterval);
      }
      break;
  }
};

// ── Utility Helpers ────────────────────────────────────────────

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
      // Small optimization: only send if we have fresh data
      self.postMessage({
        type: 'TICKS',
        payload: Array.from(tickerBuffer.entries())
      });
      tickerBuffer.clear();
    }
  }, interval || 300);
}

function stopFlushing() { if (flushInterval) clearInterval(flushInterval); }
