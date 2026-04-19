/**
 * RSIQ PRO Ticker Worker - v4 (Robust Multi-Exchange Architecture)
 * Offloads WebSocket parsing, buffering, and real-time alert evaluation.
 * Supports Binance and Bybit (Spot & Linear).
 *
 * v4 changes:
 * - Exponential backoff with jitter for WebSocket reconnections
 * - Zombie connection watchdog (force reconnect if no data for 60s)
 * - Fixed zone/cooldown cleanup key parsing (was never matching bare symbols)
 * - Normalised alert cooldown keys (bare symbol) to prevent duplicate alerts
 * - Alert-active symbols prioritised in Bybit Spot subscriptions
 */

const RECONNECT_BASE_DELAY = 2000;
const RECONNECT_MAX_DELAY = 30000;
const HEARTBEAT_MS = 30000;
const ZOMBIE_WATCHDOG_MS = 30000;   // check every 30s
const ZOMBIE_THRESHOLD_MS = 60000;  // force reconnect if no data for 60s
const BYBIT_SPOT_REST_POLL_MS = 2000;  // Task 2.7: REST poll interval for stale Bybit Spot symbols
const BYBIT_SPOT_STALE_THRESHOLD_MS = 5000; // Symbol is stale if no WS update for 5s

// Internal buffer to minimize postMessage frequency
let tickerBuffer = new Map();
let flushInterval = null;
let zombieWatchdog = null;
let stalenessInterval = null; // Task 2.3: periodic staleness check handle
let bybitSpotRestPollInterval = null; // Task 2.7: REST polling for Bybit Spot overflow
let lastDataReceived = Date.now();  // track data freshness
let currentSymbols = new Set();
let volatilityBuffer = new Map();
let currentExchangeName = 'binance';
let activeExchange = null;

// Per-exchange reconnection tracking (exponential backoff with jitter)
let reconnectAttempts = new Map();

// Real-time Intelligence State
let rsiStates = new Map();
let coinConfigs = new Map();
let zoneStates = new Map();
let lastTriggered = new Map();
let configLastUpdated = new Map(); // Track manual updates for cold-start alerts
let liveCandleStates = new Map(); // Track current 1m candle: { lastMin, open, volStart }
let latestTickerState = new Map(); // Track last known valid values for partial updates
const COOLDOWN_MS = 3 * 60 * 1000;
let globalRsiPeriod = 14;
let globalAlertsEnabled = false;
let globalThresholdsEnabled = false;
let globalLongCandleThreshold = 3.0;
let globalVolumeSpikeThreshold = 5.0;
let globalThresholdTimeframes = [];
let globalSignalThresholdMode = 'standard';
let globalVolatilityEnabled = true;
let globalEnabledIndicators = null;
let portVisibility = new Map(); // Track visibility per port
function isAnyTabVisible() {
  for (const v of portVisibility.values()) if (v) return true;
  return false;
}

// ── Direct Alert Channel (Worker -> Service Worker) ─────────────
// Bypasses the Main Thread for background reliability when minimized.
const alertChannel = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('rsiq-alerts') 
  : null;

// ── Shared Utility Logic ──────────────────────────────────────────

function getSymbolAlias(symbol) {
  if (symbol === 'PAXGUSDT' || symbol === 'XAUUSDT') return 'GOLD (XAU)';
  if (symbol === 'SILVER' || symbol === 'XAGUSDT') return 'SILVER (XAG)';
  if (symbol === 'SPX') return 'S&P 500';
  if (symbol === 'NDAQ') return 'NASDAQ 100';
  if (symbol === 'DOW') return 'DOW JONES';
  if (symbol === 'FTSE') return 'FTSE 100';
  if (symbol === 'DAX') return 'DAX 40';
  if (symbol === 'NKY') return 'NIKKEI 225';
  if (symbol === 'EURUSDT') return 'EUR/USD';
  if (symbol === 'GBPUSDT') return 'GBP/USD';
  if (symbol === 'AUDUSDT') return 'AUD/USD';
  if (symbol === 'USDJPY' || symbol === 'JPYUSDT') return 'USD/JPY';
  
  let clean = symbol.replace('USDT', '');
  if (clean.endsWith('USD') && clean.length > 3) clean = clean.replace('USD', '');
  clean = clean.replace('.P', '');
  return clean;
}

function extractBareSymbol(key) {
  if (!key) return '';
  // Handles "exchange:SYMBOL-timeframe" or "SYMBOL-timeframe" or "exchange:SYMBOL"
  let s = key.includes(':') ? key.split(':').pop() : key;
  // If it has a timeframe suffix like -1m or -5m
  if (s.includes('-')) {
    const parts = s.split('-');
    // The symbol is always the first part before any '-'
    s = parts[0];
  }
  return s;
}

// ── Exchange Adapters ──────────────────────────────────────────

class ExchangeAdapter {
  constructor() {
    this.socket = null;
    this.heartbeatInterval = null;
  }

  connect() { }
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

  sendPing() { }
  updateSymbols(symbols) { }
}

class BinanceAdapter extends ExchangeAdapter {
  connect() {
    this.socket = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    this.socket.onopen = () => {
      console.log('[worker] Binance Connected');
      resetReconnectAttempts(this.exchangeName || 'binance');
      this.startHeartbeat();
    };
    this.socket.onmessage = (event) => {
      try {
        lastDataReceived = Date.now();
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          // Task 13.1: Process in batches of 50 to prevent event loop blocking
          const BATCH = 50;
          let i = 0;
          const processBatch = () => {
            const end = Math.min(i + BATCH, data.length);
            for (; i < end; i++) this.process(data[i]);
            if (i < data.length) setTimeout(processBatch, 0);
          };
          processBatch();
        } else if (data && typeof data === 'object' && 's' in data) {
          this.process(data);
        }
      } catch (e) { }
    };
    this.socket.onclose = () => {
      const delay = getReconnectDelay(this.exchangeName || 'binance');
      console.log(`[worker] Binance Closed, reconnecting in ${Math.round(delay)}ms...`);
      this.disconnect();
      setTimeout(() => ensureExchange(this.exchangeName || currentExchangeName), delay);
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
      q: parseFloat(t.q),
      v: parseFloat(t.v),
      ts: t.E
    }, this.exchangeName || 'binance');
  }
}

class BybitAdapter extends ExchangeAdapter {
  constructor(type = 'spot') {
    super();
    this.type = type; // 'spot' or 'linear'
    this.sockets = []; // Multi-socket pool for Spot
    this.subscribedTopics = new Map(); // socket -> topics[]
  }

  connect() {
    if (this.type === 'linear') {
      this._connectSocket('wss://stream.bybit.com/v5/public/linear');
    } else {
      // For Spot, we start with one socket; subscribeAll will add more if needed
      this._connectSocket('wss://stream.bybit.com/v5/public/spot');
    }
  }

  _connectSocket(url) {
    const ws = new WebSocket(url);
    this.sockets.push(ws);
    
    ws.onopen = () => {
      console.log(`[worker] Bybit ${this.type} Socket Connected (${this.sockets.length})`);
      resetReconnectAttempts(this.exchangeName || 'bybit');
      this.startHeartbeat();
      this.subscribeAll();
    };

    ws.onmessage = (event) => {
      try {
        lastDataReceived = Date.now();
        const data = JSON.parse(event.data);
        if (data.op === 'pong') return;

        // Handle both tickers.SYMBOL and unified tickers topics
        if (data.topic && (data.topic.startsWith('tickers.') || data.topic === 'tickers')) {
          const tickData = data.data;
          if (Array.isArray(tickData)) {
            tickData.forEach(t => this.process(t, data.ts));
          } else {
            this.process(tickData, data.ts);
          }
        }
      } catch (e) { }
    };

    ws.onclose = () => {
      const delay = getReconnectDelay(this.exchangeName || 'bybit');
      console.log(`[worker] Bybit ${this.type} Socket Closed, reconnecting in ${Math.round(delay)}ms...`);
      this.disconnect();
      setTimeout(() => ensureExchange(this.exchangeName || currentExchangeName), delay);
    };

    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.sockets.forEach(s => {
      if (s.readyState <= WebSocket.OPEN) s.close();
    });
    this.sockets = [];
    this.subscribedTopics.clear();
    this.stopHeartbeat();
  }

  sendPing() {
    this.sockets.forEach(s => {
      if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ op: 'ping' }));
    });
  }

  updateSymbols(symbols) {
    if (this.type === 'spot') {
      this.subscribeAll();
    }
  }

  subscribeAll() {
    if (this.sockets.length === 0) return;

    if (this.type !== 'spot') {
      const ws = this.sockets[0];
      if (ws.readyState !== WebSocket.OPEN) return;
      const topics = this.subscribedTopics.get(ws) || [];
      if (topics.includes('tickers')) return;
      
      ws.send(JSON.stringify({ op: 'subscribe', args: ['tickers'] }));
      this.subscribedTopics.set(ws, ['tickers']);
      return;
    }

    // Bybit Spot Multi-WebSocket Scaling Logic (2026 Strategy)
    const allSymbols = Array.from(currentSymbols);
    const alertSymbols = allSymbols.filter(s => {
      const cfg = coinConfigs.get(s);
      return cfg && (cfg.alertOn1m || cfg.alertOn5m || cfg.alertOn15m || cfg.alertOn1h || cfg.alertOnCustom || cfg.alertOnStrategyShift);
    });
    const majorPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];
    const majors = majorPairs.filter(s => currentSymbols.has(s));
    const remaining = allSymbols.filter(s => !alertSymbols.includes(s) && !majors.includes(s));
    
    const prioritised = [...new Set([...alertSymbols, ...majors, ...remaining])];
    const topicSet = prioritised.map(s => `tickers.${s}`);
    
    // Bybit V5 allows up to 500 topics per connection, but 100/200 is safer for stability.
    const TOPICS_PER_WS = 200;
    const requiredSockets = Math.ceil(topicSet.length / TOPICS_PER_WS);

    // Add missing sockets if needed (limit to 5 to avoid resource exhaustion)
    while (this.sockets.length < requiredSockets && this.sockets.length < 5) {
      this._connectSocket('wss://stream.bybit.com/v5/public/spot');
      return; // Wait for onopen
    }

    this.sockets.forEach((s, idx) => {
      if (s.readyState !== WebSocket.OPEN) return;
      
      const start = idx * TOPICS_PER_WS;
      const end = start + TOPICS_PER_WS;
      const batchTopics = topicSet.slice(start, end);
      
      if (batchTopics.length === 0) return;

      // Only re-subscribe if topics changed
      const current = this.subscribedTopics.get(s) || [];
      if (JSON.stringify(current) === JSON.stringify(batchTopics)) return;

      // Unsubscribe old
      if (current.length > 0) {
        for (let i = 0; i < current.length; i += 10) {
          s.send(JSON.stringify({ op: 'unsubscribe', args: current.slice(i, i + 10) }));
        }
      }

      // Subscribe new
      for (let i = 0; i < batchTopics.length; i += 10) {
        const batch = batchTopics.slice(i, i + 10);
        s.send(JSON.stringify({ op: 'subscribe', args: batch }));
      }
      this.subscribedTopics.set(s, batchTopics);
    });
  }

  process(data, ts) {
    if (!data) return;
    processNormalizedTicker({
      s: data.symbol,
      c: parseFloat(data.lastPrice),
      o: parseFloat(data.prevPrice24h),
      q: parseFloat(data.turnover24h),
      v: parseFloat(data.volume24h),
      ts: ts || Date.now()
    }, this.exchangeName || 'bybit');
  }
}

// ── Controller Logic ──────────────────────────────────────────
let activeAdapters = new Map();

/** Exponential backoff with jitter - prevents thundering herd on reconnect */
function getReconnectDelay(exchangeName) {
  const attempts = reconnectAttempts.get(exchangeName) || 0;
  reconnectAttempts.set(exchangeName, attempts + 1);
  const base = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempts), RECONNECT_MAX_DELAY);
  const jitter = Math.random() * Math.min(1000, base * 0.3);
  return base + jitter;
}

function resetReconnectAttempts(exchangeName) {
  reconnectAttempts.set(exchangeName, 0);
}

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

/** Zombie connection watchdog - forces reconnect if no data received for ZOMBIE_THRESHOLD_MS */
function startZombieWatchdog() {
  stopZombieWatchdog();
  zombieWatchdog = setInterval(() => {
    if (activeAdapters.size === 0) return;
    const silenceMs = Date.now() - lastDataReceived;
    if (silenceMs > ZOMBIE_THRESHOLD_MS) {
      console.warn(`[worker] ZOMBIE DETECTED: No data for ${Math.round(silenceMs / 1000)}s - forcing reconnect`);
      // Force reconnect all active adapters
      const names = Array.from(activeAdapters.keys());
      activeAdapters.forEach(adapter => adapter.disconnect());
      activeAdapters.clear();
      lastDataReceived = Date.now(); // reset to avoid immediate re-trigger
      names.forEach(name => ensureExchange(name));
    }
  }, ZOMBIE_WATCHDOG_MS);
}

function stopZombieWatchdog() {
  if (zombieWatchdog) {
    clearInterval(zombieWatchdog);
    zombieWatchdog = null;
  }
}

// ── Task 2.7: Bybit Spot REST Polling Fallback ─────────────────────────────
// Bybit Spot WS subscriptions are capped at 200 topics per connection.
// For symbols beyond that cap, or symbols that go stale (no WS update for 5s),
// we fall back to REST polling at 2-second intervals.

function startBybitSpotRestPoll() {
  stopBybitSpotRestPoll();
  bybitSpotRestPollInterval = setInterval(async () => {
    if (currentExchangeName !== 'bybit') return;
    if (currentSymbols.size === 0) return;

    // Find symbols that are stale (no WS update in BYBIT_SPOT_STALE_THRESHOLD_MS)
    const now = Date.now();
    const staleSymbols = [];
    for (const sym of currentSymbols) {
      const trackingKey = `bybit:${sym}`;
      const state = latestTickerState.get(trackingKey);
      if (!state || (now - state.lastUpdate) > BYBIT_SPOT_STALE_THRESHOLD_MS) {
        staleSymbols.push(sym);
      }
    }

    if (staleSymbols.length === 0) return;

    // Batch REST requests: Bybit allows multiple symbols in one call
    // Cap at 50 per request to avoid URL length limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < staleSymbols.length; i += BATCH_SIZE) {
      const batch = staleSymbols.slice(i, i + BATCH_SIZE);
      try {
        const symbolParam = batch.join(',');
        const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbolParam}`;
        const res = await fetch(url, { 
          signal: AbortSignal.timeout(4000),
          cache: 'no-store' 
        });
        if (!res.ok) continue;
        const payload = await res.json();
        const rows = payload.result?.list ?? [];
        for (const row of rows) {
          if (!row.symbol || !row.lastPrice) continue;
          processNormalizedTicker({
            s: row.symbol,
            c: parseFloat(row.lastPrice),
            o: parseFloat(row.prevPrice24h) || parseFloat(row.lastPrice),
            q: parseFloat(row.turnover24h) || 0,
            v: parseFloat(row.volume24h) || 0,
            ts: Date.now()
          }, 'bybit');
        }
      } catch (e) {
        // Silent fail - WS is primary, REST is fallback
      }
      // Small stagger between batches to avoid rate limits
      if (i + BATCH_SIZE < staleSymbols.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }, BYBIT_SPOT_REST_POLL_MS);
}

function stopBybitSpotRestPoll() {
  if (bybitSpotRestPollInterval) {
    clearInterval(bybitSpotRestPollInterval);
    bybitSpotRestPollInterval = null;
  }
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

  // Task 2.1: Explicit validation - skip update if symbol missing or price invalid
  if (!t.s || t.c == null || isNaN(t.c) || t.c === 0) return;

  const trackingKey = `${exchangeName}:${t.s}`;
  const prevState = latestTickerState.get(trackingKey) || {};

  // Merge partial updates: use new if finite/valid, else keep existing
  // We use curC, curO, etc to avoid confusion with the input 't' object
  const curC = (t.c != null && !isNaN(t.c) && t.c > 0) ? t.c : (prevState.c || 0);
  const curO = (t.o != null && !isNaN(t.o) && t.o > 0) ? t.o : (prevState.o || 0);
  const curQ = (t.q != null && !isNaN(t.q)) ? t.q : (prevState.q || 0);
  const curV = (t.v != null && !isNaN(t.v)) ? t.v : (prevState.v || 0);

  // Task 2.1: Track session high/low and timestamp every update
  const curH = Math.max(prevState.h || curC, curC);
  const curL = Math.min(prevState.l || curC, curC);

  // Store the most recent valid values for next delta update, including h/l and lastUpdate
  latestTickerState.set(trackingKey, { c: curC, o: curO, q: curQ, v: curV, h: curH, l: curL, lastUpdate: Date.now() });

  // Guard: price must be valid for any indicator processing
  if (!curC || curC <= 0) return;

  const change24h = (!curO || curO <= 0)
    ? 0
    : Math.round(((curC - curO) / curO) * 10000) / 100;

    const alias = getSymbolAlias(t.s);

  // ── Volatility Monitor ──
  const now = t.ts || Date.now();
  const currentMinKey = Math.floor(now / 60000);
  const volEntry = volatilityBuffer.get(trackingKey);
  if (!volEntry) {
    volatilityBuffer.set(trackingKey, { startPrice: curC, startTime: now });
  } else {
    if (now - volEntry.startTime > 30000) {
      const movePct = Math.abs(curC - volEntry.startPrice) / volEntry.startPrice;
      if (movePct >= 0.02) {
        self.postMessage({ type: 'PRIORITY_SYNC', payload: t.s });
      }
      volatilityBuffer.set(trackingKey, { startPrice: curC, startTime: now });
    }
  }

  // ── Real-time Indicator Shadowing ──
  const state = rsiStates.get(t.s); 
  const config = coinConfigs.get(t.s) || {};

  // ── Live Candle & Volume Detector ──
  // Use synced open1m and volStart1m if candleState is fresh/not yet established
  const candleState = liveCandleStates.get(trackingKey) || { 
    lastMin: currentMinKey, 
    open: (state && state.open1m != null) ? state.open1m : curC, 
    lastTickerVol: curV || 0,
    accumulatedVol: (state && state.volStart1m != null) ? state.volStart1m : 0 
  };
  
  if (candleState.lastMin !== currentMinKey) {
    candleState.lastMin = currentMinKey;
    candleState.open = curC;
    candleState.lastTickerVol = curV || 0;
    candleState.accumulatedVol = 0;
    liveCandleStates.set(trackingKey, candleState);
  } else if (!liveCandleStates.has(trackingKey)) {
    // First time seeing this symbol in this minute
    liveCandleStates.set(trackingKey, candleState);
  } else {
    // Accumulate volume delta securely to handle rolling 24h ticker volume
    const tickVolDelta = Math.max(0, (curV || 0) - candleState.lastTickerVol);
    candleState.accumulatedVol += tickVolDelta;
    candleState.lastTickerVol = curV || 0;
  }

  const curCandleSize = Math.abs(curC - candleState.open);
  const curCandleVol = candleState.accumulatedVol;

  let liveIndicators = {
    curCandleSize,
    curCandleVol,
    candleDirection: curC >= candleState.open ? 'bullish' : 'bearish',
    avgBarSize1m: state ? state.avgBarSize1m : null,
    avgVolume1m: state ? state.avgVolume1m : null
  };

  if (state) {
    const r1mP = config.rsi1mPeriod || 14;
    const r5mP = config.rsi5mPeriod || 14;
    const r15mP = config.rsi15mPeriod || 14;
    const r1hP = config.rsi1hPeriod || 14;
    // GAP-C2 FIX: Use per-coin custom RSI period from config, fallback to global
    const rCP = config.rsiCustomPeriod || globalRsiPeriod;

    const obT = config.overboughtThreshold != null ? config.overboughtThreshold : 70;
    const osT = config.oversoldThreshold != null ? config.oversoldThreshold : 30;
    const hysteresis = computeHysteresis(obT, osT);

    const rsi1m = approximateRsi(state.rsiState1m, curC, r1mP);
    const rsi5m = approximateRsi(state.rsiState5m, curC, r5mP);
    const rsi15m = approximateRsi(state.rsiState15m, curC, r15mP);
    const rsi1h = approximateRsi(state.rsiState1h, curC, r1hP);
    const rsiCustom = approximateRsi(state.rsiStateCustom, curC, rCP);

    const ema9 = approximateEma(state.ema9State, curC, 9);
    const ema21 = approximateEma(state.ema21State, curC, 21);
    const emaCross = (ema9 && ema21) ? (ema9 > ema21 ? 'bullish' : 'bearish') : null;

    let macdHistogram = null;
    if (state.macdFastState && state.macdSlowState && state.macdSignalState) {
      const ema12 = approximateEma(state.macdFastState, curC, 12);
      const ema26 = approximateEma(state.macdSlowState, curC, 26);
      if (ema12 && ema26) {
        const macdLine = ema12 - ema26;
        const macdSignal = approximateEma(state.macdSignalState, macdLine, 9);
        // Precision parity with main thread lib/indicators.ts
        macdHistogram = Math.round((macdLine - macdSignal) * 1e8) / 1e8;
      }
    }

    let bbPosition = null;
    if (state.bbUpper && state.bbLower) {
      const range = state.bbUpper - state.bbLower;
      bbPosition = range > 0 ? (curC - state.bbLower) / range : 0.5;
    }

    const strategyVolMult =
      (config.volumeSpikeThreshold != null && config.volumeSpikeThreshold > 0)
        ? config.volumeSpikeThreshold
        : globalVolumeSpikeThreshold;
    const liveVolumeSpike =
      state.avgVolume1m > 0 &&
      curCandleVol > state.avgVolume1m * strategyVolMult;

    const currentStrategy = computeWorkerStrategyScore({
      symbol: t.s,
      price: curC,
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram,
      bbPosition,
      stochK: state.stochK,
      stochD: state.stochD,
      vwapDiff: state.vwapDiff,
      volumeSpike: liveVolumeSpike || state.volumeSpike,
      emaCross,
      confluence: state.confluence,
      rsiDivergence: state.rsiDivergence,
      momentum: state.momentum,
      globalLongCandleThreshold,
      globalVolumeSpikeThreshold,
      globalVolatilityEnabled,
      enabledIndicators: globalEnabledIndicators,
      globalSignalThresholdMode
    });

    Object.assign(liveIndicators, {
      rsi1m, rsi5m, rsi15m, rsi1h, rsiCustom,
      ema9, ema21, emaCross,
      macdHistogram,
      bbPosition,
      bbUpper: state.bbUpper,
      bbLower: state.bbLower,
      bbMiddle: state.bbMiddle,
      stochK: state.stochK,
      stochD: state.stochD,
      vwap: state.vwap,
      vwapDiff: state.vwapDiff,
      momentum: state.momentum,
      rsiDivergence: state.rsiDivergence,
      confluence: state.confluence,
      strategyScore: currentStrategy.score,
      strategySignal: currentStrategy.signal,
      volumeSpike: liveVolumeSpike || state.volumeSpike,
      avgBarSize1m: state.avgBarSize1m,
      avgVolume1m: state.avgVolume1m,
    });

    // ── Live Volatility Alerts (Long Candle & Volume Spike) ──
    const candleMult = (config.longCandleThreshold != null && config.longCandleThreshold > 0) 
      ? config.longCandleThreshold 
      : (globalVolatilityEnabled ? globalLongCandleThreshold : 10);
    const alertVolMult = (config.volumeSpikeThreshold != null && config.volumeSpikeThreshold > 0)
      ? config.volumeSpikeThreshold
      : (globalVolatilityEnabled ? globalVolumeSpikeThreshold : 10);
    
    const candleAlertEnabled = config.alertOnLongCandle || globalVolatilityEnabled;
    const volumeAlertEnabled = config.alertOnVolumeSpike || globalVolatilityEnabled;
    const candleDirection = curC >= candleState.open ? 'bullish' : 'bearish';

    if (candleAlertEnabled && state.avgBarSize1m > 0 && curCandleSize > state.avgBarSize1m * candleMult) {
      const alertKey = `${t.s}-VOLATILITY-CANDLE`;
      if (now - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
        lastTriggered.set(alertKey, now);
        // Direct bridge for background notifications
        if (alertChannel && globalAlertsEnabled && !isAnyTabVisible()) {
          const alias = getSymbolAlias(t.s);
          alertChannel.postMessage({
            type: 'ALERT_NOTIFICATION',
            payload: {
              title: `⚡ VOLATILITY: ${alias}`,
              body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] Large ${candleDirection} move detected @ $${curC.toLocaleString()}`,
              exchange: exchangeName,
              priority: 'high',
              type: 'rsi' // Map to existing notification logic
            }
          });
        }
      }
    }

    if (volumeAlertEnabled && state.avgVolume1m > 0 && curCandleVol > state.avgVolume1m * alertVolMult) {
      const alertKey = `${t.s}-VOLATILITY-VOLUME`;
      if (now - (lastTriggered.get(alertKey) || 0) > COOLDOWN_MS) {
        lastTriggered.set(alertKey, now);
        self.postMessage({
          type: 'ALERT_TRIGGERED',
          payload: {
            symbol: t.s,
            exchange: exchangeName,
            timeframe: '1m',
            value: curCandleVol / state.avgVolume1m,
            type: 'VOLUME_SPIKE',
            price: curC,
            direction: candleDirection // Volume spike typically follows the price action direction
          }
        });

        // Direct bridge for background notifications
        if (alertChannel && globalAlertsEnabled && !isAnyTabVisible()) {
          const alias = getSymbolAlias(t.s);
          alertChannel.postMessage({
            type: 'ALERT_NOTIFICATION',
            payload: {
              title: `📊 VOL SPIKE: ${alias}`,
              body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] Significant volume surge detected (${(curCandleVol / state.avgVolume1m).toFixed(1)}x) @ $${curC.toLocaleString()}`,
              exchange: exchangeName,
              priority: 'medium',
              type: 'rsi'
            }
          });
        }
      }
    }

    // ── Alert Evaluation ──
    // NOTE: Zone state keys use exchange:symbol for isolation per-exchange.
    // Cooldown/alert keys use bare symbol-timeframe to match main-thread and prevent duplicate alerts.
    const tfs = [
      { label: '1m', rsi: rsi1m, cfgKey: 'alertOn1m' },
      { label: '5m', rsi: rsi5m, cfgKey: 'alertOn5m' },
      { label: '15m', rsi: rsi15m, cfgKey: 'alertOn15m' },
      { label: '1h', rsi: rsi1h, cfgKey: 'alertOn1h' },
      { label: 'Custom', rsi: rsiCustom, cfgKey: 'alertOnCustom' }
    ];

    tfs.forEach(tf => {
      // Zone state key includes exchange to track per-exchange zones separately
      const zoneKey = `${trackingKey}-${tf.label}`;
      const previousZone = zoneStates.get(zoneKey);
      let zone = 'NEUTRAL';
      const isInverted = obT < osT;

      const NEAR_BUFFER = 0.3; // Allow "near" reach alerts
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
          // If already OVERSOLD, stay OVERSOLD until RSI drops below (osT - hysteresis)
          if (previousZone === 'OVERSOLD' && tf.rsi >= osT - hysteresis) zone = 'OVERSOLD';
          else if (previousZone === 'OVERBOUGHT' && tf.rsi <= obT + hysteresis) zone = 'OVERBOUGHT';
          else if (tf.rsi >= osT) zone = 'OVERSOLD';
          else if (tf.rsi <= obT) zone = 'OVERBOUGHT';
        } else {
          // If already OVERSOLD, stay OVERSOLD until RSI rises above (osT + hysteresis)
          if (previousZone === 'OVERSOLD' && tf.rsi <= osT + hysteresis) zone = 'OVERSOLD';
          else if (previousZone === 'OVERBOUGHT' && tf.rsi >= obT - hysteresis) zone = 'OVERBOUGHT';
          else if (tf.rsi <= osT) zone = 'OVERSOLD';
          else if (tf.rsi >= obT) zone = 'OVERBOUGHT';
        }
      }

      // INTELLIGENCE: Strict Custom Mode Whitelisting.
      const hasManualAlert = !!config?.[tf.cfgKey];
      
      // Determine if this hit a global threshold fallback
      let isGlobalHit = false;
      if (globalThresholdsEnabled && globalThresholdTimeframes.includes(tf.label)) {
        if (tf.rsi !== null && tf.rsi !== undefined) {
          if (zone === 'OVERSOLD') {
            isGlobalHit = (globalObT < globalOsT) ? tf.rsi >= globalOsT : tf.rsi <= globalOsT;
          } else if (zone === 'OVERBOUGHT') {
            isGlobalHit = (globalObT < globalOsT) ? tf.rsi <= globalObT : tf.rsi >= globalObT;
          }
        }
      }

      // INTELLIGENCE: Extreme RSI Mode (Alerts) Fallback logic overrides visual mode
      // Extreme alerts fire if either a manual alert exists, or a global extreme is hit 
      // (and we check if the user specifically turned off manual alert for this TF).
      const hasManualSpecific = config && config.hasOwnProperty(tf.cfgKey);
      const shouldNotify = hasManualAlert || (globalThresholdsEnabled && isGlobalHit && !hasManualSpecific);

      if (!shouldNotify || tf.rsi === null || tf.rsi === undefined) return;


        const recentlyUpdated = (configLastUpdated.get(t.s) || 0) > Date.now() - 15000;
        const isFirstSeen = previousZone === undefined || previousZone === 'NEUTRAL';
        const justEntered = isFirstSeen && zone !== 'NEUTRAL';

        if (justEntered && (previousZone !== undefined || recentlyUpdated)) {
          let hasConfluenceWithBuffer = !config.alertConfluence || tfs.some(other => {
            if (other.label === tf.label || !config[other.cfgKey] || other.rsi === null) return false;
            if (zone === 'OVERSOLD') {
              return isInverted ? (other.rsi >= osT - NEAR_BUFFER) : (other.rsi <= osT + NEAR_BUFFER);
            } else {
              return isInverted ? (other.rsi <= obT + NEAR_BUFFER) : (other.rsi >= obT - NEAR_BUFFER);
            }
          });

          if (hasConfluenceWithBuffer) {
          // Cooldown key uses BARE symbol (no exchange prefix) to prevent duplicate alerts
          // when the main-thread evaluator also fires for the same event
          const alertKey = `${t.s}-${tf.label}`;
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
                type: zone,
                price: curC // GAP-A2 FIX: Include price in payload
              }
            });

            // Direct broadcast to Service Worker for background reliability
            // SILENCE THIS if any tab is visible (UI handles it) 
            // OR if strictly backgrounding to prevent queuing.
            if (alertChannel && globalAlertsEnabled && !isAnyTabVisible()) {
              const zoneLabel = zone === 'OVERSOLD' ? 'BUY' : 'SELL';
              alertChannel.postMessage({
                type: 'ALERT_NOTIFICATION',
                payload: {
                  title: `${alias} ${zoneLabel}`,
                  body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] ${tf.label} RSI reached ${tf.rsi.toFixed(1)} @ $${curC.toLocaleString()}`,
                  exchange: exchangeName,
                  priority: config.priority || 'medium'
                }
              });
            }
          }
        }
      }
      zoneStates.set(zoneKey, zone);
    });

    if (config.alertOnStrategyShift) {
      const stratZoneKey = `${trackingKey}-STRAT`;
      const prevStrat = zoneStates.get(stratZoneKey);
      const currentStrat = currentStrategy.signal;

      if (prevStrat !== undefined && prevStrat !== currentStrat &&
        (currentStrat === 'strong-buy' || currentStrat === 'strong-sell')) {
        // Cooldown key uses BARE symbol to match main-thread
        const alertKey = `${t.s}-STRAT`;
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
              price: curC // GAP-A2 FIX: Include price in payload
            }
          });

          // Direct broadcast to Service Worker for background reliability
          if (alertChannel && globalAlertsEnabled && !isAnyTabVisible()) {
            const isBuy = currentStrat === 'strong-buy';
            alertChannel.postMessage({
              type: 'ALERT_NOTIFICATION',
              payload: {
                title: `${alias} ${isBuy ? 'Strong Buy' : 'Strong Sell'}`,
                body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] Strategy shift detected. Score: ${currentStrategy.score.toFixed(0)} @ $${curC.toLocaleString()}`,
                exchange: exchangeName,
                priority: config.priority || 'medium'
              }
            });
          }
        }
      }
      zoneStates.set(stratZoneKey, currentStrat);
    }
  }

  // ── Update UI Buffer (Prioritize Active Exchange) ──
  if (exchangeName === currentExchangeName || !tickerBuffer.has(t.s)) {
    // Task 2.1: Expose isStale flag - false on every live update (staleness check sets it later)
    const tickerEntry = latestTickerState.get(trackingKey);
    const isStale = tickerEntry ? (Date.now() - tickerEntry.lastUpdate > 60000) : false;
    tickerBuffer.set(t.s, {
      price: curC,
      change24h,
      volume24h: curQ,
      exchange: exchangeName,
      updatedAt: Date.now(),
      isStale,
      ...liveIndicators
    });
  }
}

// ── Workers Global Handlers ────────────────────────────────────

// ── Unified Communication Layer (Hybrid Worker/SharedWorker) ──────
let connectedPorts = new Set();
const isSharedWorker = typeof SharedWorkerGlobalScope !== 'undefined' && self instanceof SharedWorkerGlobalScope;

function broadcast(msg) {
  if (isSharedWorker) {
    connectedPorts.forEach(port => {
      try {
        port.postMessage(msg);
      } catch (e) {
        connectedPorts.delete(port);
      }
    });
  } else {
    self.postMessage(msg);
  }
}

function handleMessage(e, port = null) {
  const { type, payload } = e.data;

  switch (type) {
    case 'START':
      // Deduplication: Only start if symbols or exchange actually changed or not yet started
      const newSymbols = new Set(payload.symbols);
      const newExchange = payload.exchange || 'binance';
      
      const symbolsChanged = !setsEqual(currentSymbols, newSymbols);
      const exchangeChanged = newExchange !== currentExchangeName;

      if (symbolsChanged || exchangeChanged || activeAdapters.size === 0) {
        currentSymbols = newSymbols;
        currentExchangeName = newExchange;
        ensureExchange(currentExchangeName);
        console.log(`[worker] Data stream started/updated: ${currentExchangeName} (${currentSymbols.size} symbols)`);
      }
      
      // Hydration: Send stored ticks immediately to the starting port
      getStoredTicks().then(stored => {
        if (stored.length > 0) {
          const msg = { type: 'TICKS', payload: stored };
          if (port) port.postMessage(msg);
          else self.postMessage(msg);
        }
      });

      // Rehydrate global settings
      getStoredConfig().then(cfg => {
        if (cfg.rsiPeriod) globalRsiPeriod = cfg.rsiPeriod;
        if (cfg.alertsEnabled !== undefined) globalAlertsEnabled = cfg.alertsEnabled;
        if (cfg.volatilityEnabled !== undefined) globalVolatilityEnabled = cfg.volatilityEnabled;
        console.log(`[worker] Rehydrated config: rsi=${globalRsiPeriod}, alerts=${globalAlertsEnabled}, vol=${globalVolatilityEnabled}`);
        // Task 2.5: Confirm baseline sync is ready - open1m/volStart1m will arrive via SYNC_STATES
        console.log('[worker] Cold-start baseline sync ready - awaiting SYNC_STATES with open1m/volStart1m');
      });
      
      // Institutional Latency: Default to 100ms for "smooth" real-time experience
      startFlushing(payload.flushInterval || 100);
      startZombieWatchdog();
      startStalenessCheck(); // Task 2.3: begin periodic staleness detection
      // Task 2.7: Start REST polling fallback for Bybit Spot stale symbols
      if (currentExchangeName === 'bybit') {
        startBybitSpotRestPoll();
      }
      break;

    case 'RESUME': {
      const now = Date.now();
      const silenceMs = now - lastDataReceived;
      
      // PWA CRITICAL: Lower threshold to 3s. PWA containers can background
      // WebSockets almost instantly; 10s was too lenient and left the UI stale.
      if (silenceMs > 3000) {
        console.log(`[worker] Health check on resume (silence: ${Math.round(silenceMs/1000)}s)`);
        activeAdapters.forEach((adapter, name) => {
          // Force reconnect if socket is closed, closing, OR stuck in CONNECTING
          // (zombie CONNECTING state happens when OS kills the TCP connection
          // without a proper close frame - common on mobile PWA sleep)
          if (!adapter.socket || 
              adapter.socket.readyState === WebSocket.CLOSED ||
              adapter.socket.readyState === WebSocket.CLOSING ||
              (adapter.socket.readyState === WebSocket.CONNECTING && silenceMs > 10000)) {
            console.log(`[worker] Force-reconnecting ${name} (state: ${adapter.socket?.readyState})`);
            adapter.disconnect();
            activeAdapters.delete(name);
            ensureExchange(name);
          }
        });
        lastDataReceived = now;
      }
      
      // PWA CRITICAL: Immediately flush any buffered ticks to the UI
      // so the user sees fresh data the moment they switch back to the app.
      if (tickerBuffer.size > 0) {
        const payload = Array.from(tickerBuffer.entries());
        broadcast({ type: 'TICKS', payload });
        tickerBuffer.clear();
      }
      break;
    }

    case 'SET_EXCHANGE': {
      if (!payload.exchange || payload.exchange === currentExchangeName) break;
      const prevExchange = currentExchangeName;
      currentExchangeName = payload.exchange;

      const oldAdapter = activeAdapters.get(prevExchange);
      if (oldAdapter) {
        oldAdapter.disconnect();
        activeAdapters.delete(prevExchange);
      }

      tickerBuffer.clear();
      zoneStates.clear();
      lastTriggered.clear();
      rsiStates.clear();
      volatilityBuffer.clear();
      lastDataReceived = Date.now();

      ensureExchange(currentExchangeName);
      // Persist exchange to IndexedDB for Service Worker background sync (GAP-A5)
      persistExchangeToConfig(currentExchangeName);
      // Task 2.7: Start/stop REST polling based on exchange
      if (currentExchangeName === 'bybit') {
        startBybitSpotRestPoll();
      } else {
        stopBybitSpotRestPoll();
      }
      console.log(`[worker] Multi-tab exchange switch: ${prevExchange} → ${currentExchangeName}`);
      break;
    }

    case 'UPDATE_SYMBOLS':
      const updateSyms = new Set(payload.symbols);
      if (setsEqual(currentSymbols, updateSyms)) break;
      
      currentSymbols = updateSyms;
      // Memory Hygiene - Task 3.4: full cleanup of all per-symbol state maps
      for (const [s] of rsiStates) { if (!currentSymbols.has(s)) rsiStates.delete(s); }
      for (const [s] of coinConfigs) { if (!currentSymbols.has(s)) coinConfigs.delete(s); }
      for (const [k] of zoneStates) {
        if (!currentSymbols.has(extractBareSymbol(k))) zoneStates.delete(k);
      }
      for (const [k] of lastTriggered) {
        if (!currentSymbols.has(extractBareSymbol(k))) lastTriggered.delete(k);
      }
      for (const [s] of volatilityBuffer) {
        const bare = s.includes(':') ? s.split(':').pop() : s;
        if (!currentSymbols.has(bare)) volatilityBuffer.delete(s);
      }
      for (const [s] of tickerBuffer) { if (!currentSymbols.has(s)) tickerBuffer.delete(s); }
      // Task 3.4: Also clean latestTickerState and liveCandleStates keyed as "exchange:symbol"
      for (const [k] of latestTickerState) {
        const bare = k.includes(':') ? k.split(':').slice(1).join(':') : k;
        if (!currentSymbols.has(bare)) latestTickerState.delete(k);
      }
      for (const [k] of liveCandleStates) {
        const bare = k.includes(':') ? k.split(':').slice(1).join(':') : k;
        if (!currentSymbols.has(bare)) liveCandleStates.delete(k);
      }

      activeAdapters.forEach(adapter => adapter.updateSymbols(currentSymbols));
      break;

    case 'SYNC_STATES':
      if (payload.alertsEnabled !== undefined) {
        globalAlertsEnabled = payload.alertsEnabled;
      }
      if (payload.globalThresholdsEnabled !== undefined) {
        globalThresholdsEnabled = payload.globalThresholdsEnabled;
      }
      if (payload.globalOverbought !== undefined) {
        globalObT = payload.globalOverbought;
      }
      if (payload.globalOversold !== undefined) {
        globalOsT = payload.globalOversold;
      }
      if (payload.globalThresholdTimeframes !== undefined) {
        globalThresholdTimeframes = payload.globalThresholdTimeframes;
      }
      if (payload.globalSignalThresholdMode !== undefined) {
        globalSignalThresholdMode = payload.globalSignalThresholdMode;
      }


      if (payload.globalLongCandleThreshold !== undefined) {
        globalLongCandleThreshold = payload.globalLongCandleThreshold;
      }
      if (payload.globalVolumeSpikeThreshold !== undefined) {
        globalVolumeSpikeThreshold = payload.globalVolumeSpikeThreshold;
      }
      if (payload.globalVolatilityEnabled !== undefined) {
        globalVolatilityEnabled = payload.globalVolatilityEnabled;
      }
      if (payload.enabledIndicators !== undefined) {
        globalEnabledIndicators = payload.enabledIndicators;
      }
      if (payload.configs) {
        const now = Date.now();
        const isInitialSync = coinConfigs.size === 0;
        Object.keys(payload.configs).forEach(s => {
          if (!isInitialSync) configLastUpdated.set(s, now);
          coinConfigs.set(s, payload.configs[s]);
        });
      }
      if (payload.rsiStates) {
        const currentMinKey = Math.floor(Date.now() / 60000);
        Object.keys(payload.rsiStates).forEach(s => {
          const prevState = rsiStates.get(s) || {};
          const newState = payload.rsiStates[s];
          rsiStates.set(s, { ...prevState, ...newState });
          
          // NEW: Patch liveCandleStates with true API open and volume baseline
          const trackingKey = `${currentExchangeName}:${s}`;
          // Task 2.5 - Cold-start baseline mechanism:
          // When the worker first starts it has no open price or accumulated volume for the
          // current 1-minute candle. The main thread sends `open1m` (the true API open from
          // the most recent kline) and `volStart1m` (volume already traded in this minute)
          // via SYNC_STATES. We patch liveCandleStates here so that the very first RSI
          // approximation uses the real candle open rather than the first WebSocket tick,
          // and volume accumulation starts from the correct baseline rather than zero.
          const cs = liveCandleStates.get(trackingKey);
          if (cs && cs.lastMin === currentMinKey) {
            if (newState.open1m != null) cs.open = newState.open1m;
            if (newState.volStart1m != null) cs.accumulatedVol = Math.max(cs.accumulatedVol, Math.max(0, newState.volStart1m));
          }
        });
      }
      break;

    case 'SYNC_CONFIG_FAST':
      if (payload.symbol && payload.config) {
        coinConfigs.set(payload.symbol, payload.config);
        configLastUpdated.set(payload.symbol, Date.now());
        for (const [key] of zoneStates) {
          if (extractBareSymbol(key) === payload.symbol) zoneStates.delete(key);
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
      if (isSharedWorker) {
        if (port) {
          connectedPorts.delete(port);
          portVisibility.delete(port);
        }
        if (connectedPorts.size === 0) {
          teardown();
        }
      } else {
        teardown();
      }
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

    case 'VISIBILITY_CHANGE':
      if (port) portVisibility.set(port, payload.visible);
      break;
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (let x of a) if (!b.has(x)) return false;
  return true;
}

function teardown() {
  activeAdapters.forEach(adapter => adapter.disconnect());
  activeAdapters.clear();
  stopFlushing();
  stopZombieWatchdog();
  stopStalenessCheck(); // Task 2.3: stop staleness interval on teardown
  stopBybitSpotRestPoll(); // Task 2.7: stop REST polling fallback
  console.log('[worker] Stream fully terminated');
}

// ── IndexedDB Mirroring (Instant-Start) ───────────────────────
const DB_NAME = 'rsiq-storage';
const STORE_NAME = 'prices';
const CONFIG_STORE = 'config';
let db = null;

async function initDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4); // Incremented version
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE);
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/** 
 * Persist config to IndexedDB 
 */
async function persistConfig(config) {
  try {
    const database = await initDB();
    const tx = database.transaction(CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(CONFIG_STORE);
    store.put(config.rsiPeriod, 'rsiPeriod');
    store.put(config.alertsEnabled, 'alertsEnabled');
    if (config.exchange) store.put(config.exchange, 'exchange');
  } catch (e) {}
}

async function persistExchangeToConfig(exchange) {
  try {
    const database = await initDB();
    const tx = database.transaction(CONFIG_STORE, 'readwrite');
    const store = tx.objectStore(CONFIG_STORE);
    store.put(exchange, 'exchange');
  } catch (e) {}
}

async function getStoredConfig() {
  try {
    const database = await initDB();
    const tx = database.transaction(CONFIG_STORE, 'readonly');
    const store = tx.objectStore(CONFIG_STORE);
    const rsiReq = store.get('rsiPeriod');
    const alertsReq = store.get('alertsEnabled');
    
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        resolve({
          rsiPeriod: rsiReq.result,
          alertsEnabled: alertsReq.result
        });
      };
      tx.onerror = () => resolve({});
    });
  } catch (e) {
    return {};
  }
}

/** 
 * Persist ticks to IndexedDB.
 * Throttled to avoid IO-heavy churn during high volatility.
 */
async function persistToDB(ticks) {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    ticks.forEach(([sym, tick]) => {
      store.put(tick, sym);
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    // Silent fail on persistence errors
  }
}

async function getStoredTicks() {
  try {
    const database = await initDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const keysRequest = store.getAllKeys();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const results = request.result;
        const keys = keysRequest.result;
        const map = results.map((v, i) => [keys[i], v]);
        resolve(map);
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

// ── Entry Points ──────────────────────────────────────────────

if (isSharedWorker) {
  self.onconnect = (e) => {
    const port = e.ports[0];
    connectedPorts.add(port);
    port.onmessage = (msg) => {
      handleMessage(msg, port);
    };
    port.start();
    console.log(`[worker] Shared tab connected (Total: ${connectedPorts.size})`);
  };
} else {
  self.onmessage = (e) => {
    handleMessage(e);
  };
}

// ── Utility Helpers ────────────────────────────────────────────

function approximateRsi(state, livePrice, period = 14) {
  if (!state || state.avgGain == null || state.avgLoss == null) return null;
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
  const enabled = params.enabledIndicators || {
    rsi: true, macd: true, bb: true, stoch: true, ema: true, 
    vwap: true, confluence: true, divergence: true, momentum: true
  };

  const rsiScore = (val, weight) => {
    if (val === null || val === undefined || enabled.rsi === false) return;
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

  if (enabled.macd !== false && params.macdHistogram !== null && params.price > 0) {
    factors += 1.5;
    const hPct = (params.macdHistogram / params.price) * 100;
    if (hPct > 0) score += Math.min(hPct * 200, 100) * 1.5;
    else score += Math.max(hPct * 200, -100) * 1.5;
  }

  if (enabled.bb !== false && params.bbPosition !== null) {
    factors += 1;
    const bp = params.bbPosition;
    if (bp <= 0.1) score += 80 * 1;
    else if (bp <= 0.25) score += 40 * 1;
    else if (bp >= 0.9) score -= 80 * 1;
    else if (bp >= 0.75) score -= 40 * 1;
  }

  if (enabled.stoch !== false && params.stochK != null && params.stochD != null) {
    factors += 1;
    if (params.stochK < 20 && params.stochD < 20) score += 80 * 1;
    else if (params.stochK < 30) score += 40 * 1;
    else if (params.stochK > 80 && params.stochD > 80) score -= 80 * 1;
    else if (params.stochK > 70) score -= 40 * 1;

    if (params.stochK > params.stochD && params.stochK < 50) score += 20;
    else if (params.stochK < params.stochD && params.stochK > 50) score -= 20;
  }

  if (enabled.ema !== false && params.emaCross) {
    factors += 1.5;
    score += (params.emaCross === 'bullish' ? 60 : -60) * 1.5;
  }

  if (enabled.vwap !== false && params.vwapDiff != null) {
    factors += 0.5;
    if (params.vwapDiff < -2) score += 40 * 0.5;
    else if (params.vwapDiff > 2) score -= 40 * 0.5;
  }

  if (enabled.confluence !== false && typeof params.confluence === 'number' && Math.abs(params.confluence) >= 20) {
    factors += 2;
    score += params.confluence * 2;
  }

  if (enabled.divergence !== false && params.rsiDivergence && params.rsiDivergence !== 'none') {
    factors += 2.0;
    score += (params.rsiDivergence === 'bullish' ? 80 : -80) * 2.0;
  }

  if (enabled.rsi !== false && params.rsiCrossover && params.rsiCrossover !== 'none') {
    factors += 1.0;
    score += (params.rsiCrossover === 'bullish_reversal' ? 60 : -60) * 1.0;
  }

  if (enabled.momentum !== false && params.momentum != null && Math.abs(params.momentum) > 0.5) {
    factors += 0.5;
    const mScore = Math.max(-60, Math.min(60, params.momentum * 15));
    score += mScore * 0.5;
  }

  if (params.volumeSpike && factors > 0) {
    score *= 1.15;
  }

  let normalized = factors > 0 ? score / factors : 0;
  if (factors < 3 && Math.abs(normalized) > 50) {
    normalized = normalized * 0.7; // Dampen low-confidence signals
  }
  normalized = Math.round(Math.max(-100, Math.min(100, normalized)));

  let signal = 'neutral';
  if (normalized >= 50) signal = 'strong-buy';
  else if (normalized >= 20) signal = 'buy';
  else if (normalized <= -50) signal = 'strong-sell';
  else if (normalized <= -20) signal = 'sell';

  return { score: normalized, signal };
}

// ── Task 2.3: Staleness Detection ────────────────────────────────
const STALE_THRESHOLD_MS = 60000; // 60 seconds
const STALENESS_CHECK_INTERVAL_MS = 10000; // check every 10 seconds

/**
 * Iterates latestTickerState and marks symbols as stale if they haven't
 * received an update within STALE_THRESHOLD_MS. Returns the list of stale
 * symbol names (bare, without exchange prefix).
 */
function detectAndMarkStaleSymbols() {
  const now = Date.now();
  const staleSymbols = [];

  for (const [key, state] of latestTickerState) {
    if (now - state.lastUpdate > STALE_THRESHOLD_MS) {
      // Mark as stale in the state entry
      state.isStale = true;
      // Extract bare symbol (key format is "exchange:SYMBOL")
      const bareSymbol = key.includes(':') ? key.split(':').pop() : key;
      staleSymbols.push(bareSymbol);
    }
  }

  return staleSymbols;
}

function startStalenessCheck() {
  stopStalenessCheck();
  stalenessInterval = setInterval(() => {
    const staleSymbols = detectAndMarkStaleSymbols();
    if (staleSymbols.length > 0) {
      broadcast({ type: 'STALENESS_ALERT', payload: { staleSymbols } });
    }
  }, STALENESS_CHECK_INTERVAL_MS);
}

function stopStalenessCheck() {
  if (stalenessInterval) {
    clearInterval(stalenessInterval);
    stalenessInterval = null;
  }
}

function startFlushing(interval) {
  if (flushInterval) clearInterval(flushInterval);
  
  const performFlush = () => {
    if (tickerBuffer.size > 0) {
      const payload = Array.from(tickerBuffer.entries());
      broadcast({
        type: 'TICKS',
        payload
      });
      persistToDB(payload);
      tickerBuffer.clear();
    }

    // Adaptive Flushing Logic (2026 Optimization)
    // Faster flushes (50ms) during high volatility/large buffers.
    // Slower flushes (300ms) during idle periods to save battery/CPU.
    const currentSize = tickerBuffer.size;
    let nextInterval = 300; 
    if (currentSize > 100) nextInterval = 50; 
    else if (currentSize > 40) nextInterval = 100;
    else if (currentSize > 15) nextInterval = 200;

    flushInterval = setTimeout(performFlush, nextInterval);
  };

  flushInterval = setTimeout(performFlush, interval || 100);
}

function stopFlushing() {
  if (flushInterval) {
    clearTimeout(flushInterval);
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

// ── Task: Mathematical Drift Guard (Resync) ───────────────────
let driftGuardInterval = null;
function startDriftGuard() {
  if (driftGuardInterval) clearInterval(driftGuardInterval);
  driftGuardInterval = setInterval(() => {
    // Every 10 minutes, request a full state refresh for all active symbols
    // to recalibrate the incremental RSI/EMA math and clear any rounding drift.
    if (currentSymbols.size > 0 && isAnyTabVisible()) {
      broadcast({ type: 'RECALIBRATE_REQUEST' });
      console.log(`[worker] Drift Guard: Requesting state recalibration for ${currentSymbols.size} symbols`);
    }
  }, 10 * 60 * 1000);
}

function stopDriftGuard() {
  if (driftGuardInterval) clearInterval(driftGuardInterval);
  driftGuardInterval = null;
}

// Start mathematical safety monitor
startDriftGuard();
