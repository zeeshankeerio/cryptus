/**
 * RSIQ PRO Ticker Worker — v4 (Robust Multi-Exchange Architecture)
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

// Internal buffer to minimize postMessage frequency
let tickerBuffer = new Map();
let flushInterval = null;
let zombieWatchdog = null;
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
const COOLDOWN_MS = 3 * 60 * 1000;
let globalRsiPeriod = 14;
let globalAlertsEnabled = false;

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
  if (symbol === 'JPYUSDT') return 'USD/JPY';
  
  let clean = symbol.replace('USDT', '');
  if (clean.endsWith('USD') && clean.length > 3) clean = clean.replace('USD', '');
  clean = clean.replace('.P', '');
  return clean;
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
          data.forEach(t => this.process(t));
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
      q: parseFloat(t.q)
    }, this.exchangeName || 'binance');
  }
}

class BybitAdapter extends ExchangeAdapter {
  constructor(type = 'spot') {
    super();
    this.type = type; // 'spot' or 'linear'
    this.subscribedTopics = [];
  }

  connect() {
    const url = this.type === 'spot'
      ? 'wss://stream.bybit.com/v5/public/spot'
      : 'wss://stream.bybit.com/v5/public/linear';

    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      console.log(`[worker] Bybit ${this.type} Connected`);
      resetReconnectAttempts(this.exchangeName || 'bybit');
      this.startHeartbeat();
      this.subscribeAll();
    };
    this.socket.onmessage = (event) => {
      try {
        lastDataReceived = Date.now();
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
      } catch (e) { }
    };
    this.socket.onclose = () => {
      const delay = getReconnectDelay(this.exchangeName || 'bybit');
      console.log(`[worker] Bybit ${this.type} Closed, reconnecting in ${Math.round(delay)}ms...`);
      this.disconnect();
      setTimeout(() => ensureExchange(this.exchangeName || currentExchangeName), delay);
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
      // PRO TRICK: For Linear/Inverse, use unified "tickers" topic to get ALL symbols at once
      if (this.subscribedTopics.includes('tickers')) return;
      this.socket.send(JSON.stringify({
        op: 'subscribe',
        args: ['tickers']
      }));
      this.subscribedTopics = ['tickers'];
      return;
    }

    // Bybit Spot requires explicit subscription. Max 10 per message. Max 33 topics per connection.
    // Unsubscribe all previous to keep topic count low
    if (this.subscribedTopics.length > 0) {
      for (let i = 0; i < this.subscribedTopics.length; i += 10) {
        this.socket.send(JSON.stringify({
          op: 'unsubscribe',
          args: this.subscribedTopics.slice(i, i + 10)
        }));
      }
    }

    // Prioritise: alert symbols → viewport symbols → major pairs → remaining by volume
    const allSymbols = Array.from(currentSymbols);
    const alertSymbols = allSymbols.filter(s => {
      const cfg = coinConfigs.get(s);
      return cfg && (cfg.alertOn1m || cfg.alertOn5m || cfg.alertOn15m || cfg.alertOn1h || cfg.alertOnCustom || cfg.alertOnStrategyShift);
    });

    // Major pairs should always get live ticks for best UX
    const majorPairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];
    const majors = majorPairs.filter(s => currentSymbols.has(s));

    const remaining = allSymbols.filter(s => !alertSymbols.includes(s) && !majors.includes(s));
    const prioritised = [...new Set([...alertSymbols, ...majors, ...remaining])].slice(0, 30);
    const topicSet = prioritised.map(s => `tickers.${s}`);
    this.subscribedTopics = topicSet;

    for (let i = 0; i < topicSet.length; i += 10) {
      const batch = topicSet.slice(i, i + 10);
      this.socket.send(JSON.stringify({
        op: 'subscribe',
        args: batch
      }));
    }
    console.log(`[worker] Bybit Spot subscribed to ${topicSet.length} symbols (${alertSymbols.length} alerts, ${majors.length} majors)`);
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

/** Exponential backoff with jitter — prevents thundering herd on reconnect */
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

/** Zombie connection watchdog — forces reconnect if no data received for ZOMBIE_THRESHOLD_MS */
function startZombieWatchdog() {
  stopZombieWatchdog();
  zombieWatchdog = setInterval(() => {
    if (activeAdapters.size === 0) return;
    const silenceMs = Date.now() - lastDataReceived;
    if (silenceMs > ZOMBIE_THRESHOLD_MS) {
      console.warn(`[worker] ZOMBIE DETECTED: No data for ${Math.round(silenceMs / 1000)}s — forcing reconnect`);
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

    const alias = getSymbolAlias(t.s);
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
      stochK: state.stochK,
      stochD: state.stochD,
      vwapDiff: state.vwapDiff,
      volumeSpike: state.volumeSpike,
      emaCross,
      confluence: state.confluence,
      rsiDivergence: state.rsiDivergence,
      momentum: state.momentum
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
      if (!config[tf.cfgKey] || tf.rsi === null || tf.rsi === undefined) return;

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
            // Inverted reach: "Very near or reach"
            if (tf.rsi >= osT - NEAR_BUFFER) zone = 'OVERSOLD';
            else if (tf.rsi <= obT + NEAR_BUFFER) zone = 'OVERBOUGHT';
          } else {
            // Normal reach: "Very near or reach"
            if (tf.rsi <= osT + NEAR_BUFFER) zone = 'OVERSOLD';
            else if (tf.rsi >= obT - NEAR_BUFFER) zone = 'OVERBOUGHT';
          }
        }

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
                type: zone
              }
            });

            // Direct broadcast to Service Worker for background reliability
            if (alertChannel && globalAlertsEnabled) {
              const zoneLabel = zone === 'OVERSOLD' ? 'BUY' : 'SELL';
              alertChannel.postMessage({
                type: 'ALERT_NOTIFICATION',
                payload: {
                  title: `${alias} ${zoneLabel}`,
                  body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] ${tf.label} RSI reached ${tf.rsi.toFixed(1)}`,
                  exchange: exchangeName
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
            }
          });

          // Direct broadcast to Service Worker for background reliability
          if (alertChannel && globalAlertsEnabled) {
            const isBuy = currentStrat === 'strong-buy';
            alertChannel.postMessage({
              type: 'ALERT_NOTIFICATION',
              payload: {
                title: `${alias} ${isBuy ? 'Strong Buy' : 'Strong Sell'}`,
                body: `[${exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1)}] Strategy shift detected. Score: ${currentStrategy.score.toFixed(0)}`,
                exchange: exchangeName
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
      startFlushing(payload.flushInterval || 300);
      startZombieWatchdog();
      break;

    case 'SET_EXCHANGE': {
      if (!payload.exchange || payload.exchange === currentExchangeName) break;
      const prevExchange = currentExchangeName;
      currentExchangeName = payload.exchange;

      // ── Tear down old adapter to stop stale data flow ──
      const oldAdapter = activeAdapters.get(prevExchange);
      if (oldAdapter) {
        oldAdapter.disconnect();
        activeAdapters.delete(prevExchange);
        console.log(`[worker] Disconnected old adapter: ${prevExchange}`);
      }

      // ── Clear all cross-exchange state for clean isolation ──
      tickerBuffer.clear();
      zoneStates.clear();
      lastTriggered.clear();
      rsiStates.clear();
      volatilityBuffer.clear();
      lastDataReceived = Date.now(); // Reset zombie watchdog

      // Connect the new exchange
      ensureExchange(currentExchangeName);
      console.log(`[worker] Exchange switched: ${prevExchange} → ${currentExchangeName}`);
      break;
    }

    case 'UPDATE_SYMBOLS':
      currentSymbols = new Set(payload.symbols);
      // Memory Hygiene: Clean up state for symbols no longer being tracked
      for (const [s] of rsiStates) { if (!currentSymbols.has(s)) rsiStates.delete(s); }
      for (const [s] of coinConfigs) { if (!currentSymbols.has(s)) coinConfigs.delete(s); }
      // Zone keys: "exchange:SYMBOL-timeframe" → extract bare symbol
      for (const [k] of zoneStates) {
        const bareSymbol = extractBareSymbol(k);
        if (!currentSymbols.has(bareSymbol)) zoneStates.delete(k);
      }
      // Alert cooldown keys: "SYMBOL-timeframe" (bare) → extract bare symbol
      for (const [k] of lastTriggered) {
        const bareSymbol = extractBareSymbol(k);
        if (!currentSymbols.has(bareSymbol)) lastTriggered.delete(k);
      }
      // Volatility keys: "exchange:SYMBOL" → extract bare symbol
      for (const [s] of volatilityBuffer) {
        const bareSymbol = s.includes(':') ? s.split(':').pop() : s;
        if (!currentSymbols.has(bareSymbol)) volatilityBuffer.delete(s);
      }
      for (const [s] of tickerBuffer) { if (!currentSymbols.has(s)) tickerBuffer.delete(s); }

      activeAdapters.forEach(adapter => adapter.updateSymbols(currentSymbols));
      break;

    case 'SYNC_STATES':
      if (payload.alertsEnabled !== undefined) {
        globalAlertsEnabled = payload.alertsEnabled;
      }
      if (payload.configs) {
        const now = Date.now();
        const isInitialSync = coinConfigs.size === 0;
        Object.keys(payload.configs).forEach(s => {
          // Avoid boot storm: only mark as updated if we already had configs
          if (!isInitialSync) configLastUpdated.set(s, now);
          coinConfigs.set(s, payload.configs[s]);
        });
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
        configLastUpdated.set(payload.symbol, Date.now());
        // Clear zone states: keys may be "exchange:SYMBOL-tf" or "SYMBOL-tf"
        for (const [key] of zoneStates) {
          const bare = extractBareSymbol(key);
          if (bare === payload.symbol) zoneStates.delete(key);
        }
        // Clear cooldown: keys are "SYMBOL-tf" (bare)
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
      stopZombieWatchdog();
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

/**
 * Extract bare symbol from composite keys.
 * Handles multiple formats:
 *   "exchange:SYMBOL-timeframe" → "SYMBOL"
 *   "SYMBOL-timeframe"         → "SYMBOL"
 *   "exchange:SYMBOL"          → "SYMBOL"
 *   "SYMBOL"                   → "SYMBOL"
 */
function extractBareSymbol(key) {
  // Remove exchange prefix (e.g., "binance:BTCUSDT-1m" → "BTCUSDT-1m")
  let bare = key.includes(':') ? key.split(':').pop() : key;
  // Remove timeframe suffix (e.g., "BTCUSDT-1m" → "BTCUSDT")
  const dashIdx = bare.indexOf('-');
  if (dashIdx > 0) bare = bare.substring(0, dashIdx);
  return bare;
}

function approximateRsi(state, livePrice, period = 14) {
  // Fix: use == null instead of ! to allow avgGain=0 (flat market edge case)
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

  if (params.stochK != null && params.stochD != null) {
    factors += 1;
    if (params.stochK < 20 && params.stochD < 20) score += 80 * 1;
    else if (params.stochK < 30) score += 40 * 1;
    else if (params.stochK > 80 && params.stochD > 80) score -= 80 * 1;
    else if (params.stochK > 70) score -= 40 * 1;

    if (params.stochK > params.stochD && params.stochK < 50) score += 20;
    else if (params.stochK < params.stochD && params.stochK > 50) score -= 20;
  }

  if (params.emaCross) {
    factors += 1.5;
    score += (params.emaCross === 'bullish' ? 60 : -60) * 1.5;
  }

  if (params.vwapDiff != null) {
    factors += 0.5;
    if (params.vwapDiff < -2) score += 40 * 0.5;
    else if (params.vwapDiff > 2) score -= 40 * 0.5;
  }

  if (params.volumeSpike && factors > 0) {
    score *= 1.15;
  }

  if (params.confluence !== undefined) {
    factors += 2;
    score += params.confluence * 2;
  }

  if (params.rsiDivergence && params.rsiDivergence !== 'none') {
    factors += 1.5;
    score += (params.rsiDivergence === 'bullish' ? 70 : -70) * 1.5;
  }

  if (params.momentum != null && Math.abs(params.momentum) > 0.5) {
    factors += 0.5;
    const mScore = Math.max(-60, Math.min(60, params.momentum * 15));
    score += mScore * 0.5;
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
