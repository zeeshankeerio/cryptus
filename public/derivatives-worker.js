/**
 * RSIQ Pro — Derivatives Intelligence Worker v1
 * 
 * Connects to FREE exchange WebSocket streams to provide institutional-grade
 * derivatives data that competitors charge $28+/mo for.
 *
 * Streams:
 *  1. Binance Futures markPrice@arr@1s  → Funding rates + mark prices (ALL symbols)
 *  2. Bybit Linear allLiquidation       → Real-time liquidation events
 *  3. Binance aggTrade (top symbols)    → Whale trade detection + order flow
 *  4. Binance REST /fapi/v1/openInterest → Open interest (polled every 30s)
 *
 * Architecture:
 *  - Each stream has its own reconnection state with exponential backoff + jitter
 *  - Data is buffered and flushed to main thread every 500ms to prevent postMessage storms
 *  - Circular buffers for liquidations (100) and whale trades (50) to cap memory
 *  - Order flow is accumulated per 1-minute window then reset
 */

// ── Constants ────────────────────────────────────────────────────
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const FLUSH_INTERVAL_MS = 300;
const OI_POLL_INTERVAL_MS = 30000;
let LIQUIDATION_THRESHOLD = 10000;         // Default $10K, can be toggled to $5K
const WHALE_THRESHOLD_USD = 100000;        // $100K+ = whale trade
const MEGA_WHALE_THRESHOLD_USD = 500000;   // $500K+ = mega whale
const ORDER_FLOW_WINDOW_MS = 60000;        // 1-minute accumulation window
const MAX_LIQUIDATIONS = 100;
const MAX_WHALE_ALERTS = 50;
const HEARTBEAT_MS = 25000;

// Top symbols for aggTrade monitoring (high liquidity, most whale activity)
const WHALE_WATCH_SYMBOLS = [
  'btcusdt', 'ethusdt', 'solusdt', 'bnbusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'avaxusdt', 'dotusdt', 'maticusdt',
  'linkusdt', 'ltcusdt', 'uniusdt', 'atomusdt', 'nearusdt',
  'aptusdt', 'arbusdt', 'opusdt', 'suiusdt', 'pepeusdt'
];

// ── State ────────────────────────────────────────────────────────
let currentSymbols = new Set();
let isRunning = false;

// Buffers
let fundingBuffer = new Map();      // symbol → { rate, annualized, nextFundingTime, markPrice, indexPrice, updatedAt }
let liquidationBuffer = [];         // circular array of LiquidationEvent
let whaleBuffer = [];               // circular array of WhaleTradeEvent
let orderFlowBuffer = new Map();    // symbol → { buyVol, sellVol, tradeCount, windowStart }
let oiBuffer = new Map();           // symbol → { value, prevValue, updatedAt }

// Flush state
let fundingDirty = false;
let oiDirty = false;
let orderFlowDirty = false;
let flushTimer = null;

// WebSocket connections
let fundingWs = null;
let liquidationWs = null;
let whaleWsSockets = new Map();     // symbol → WebSocket

// Reconnection tracking
let reconnectAttempts = new Map();  // streamKey → attempt count
let reconnectTimers = new Map();    // streamKey → setTimeout id

// OI polling
let oiPollTimer = null;
let oiHistory = new Map();          // symbol → { value1hAgo, value24hAgo, snapshots[] }

// ── Utility Functions ────────────────────────────────────────────

function getReconnectDelay(streamKey) {
  const attempts = reconnectAttempts.get(streamKey) || 0;
  reconnectAttempts.set(streamKey, attempts + 1);
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts), RECONNECT_MAX_MS);
  // Add 0-30% jitter to prevent thundering herd
  return delay + (delay * Math.random() * 0.3);
}

function resetReconnect(streamKey) {
  reconnectAttempts.set(streamKey, 0);
  const timer = reconnectTimers.get(streamKey);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(streamKey);
  }
}

function scheduleReconnect(streamKey, connectFn) {
  const delay = getReconnectDelay(streamKey);
  console.log(`[deriv-worker] Reconnecting ${streamKey} in ${Math.round(delay)}ms (attempt ${reconnectAttempts.get(streamKey)})`);
  const timer = setTimeout(connectFn, delay);
  reconnectTimers.set(streamKey, timer);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function broadcast(message) {
  if (typeof self !== 'undefined') {
    self.postMessage(message);
  }
}

// ── Stream 1: Binance Futures Mark Price (Funding Rates) ─────────
// FREE: wss://fstream.binance.com/ws/!markPrice@arr@1s
// Provides funding rate, mark price, index price for ALL futures symbols

function connectFundingStream() {
  if (fundingWs) {
    try { fundingWs.close(); } catch(e) {}
    fundingWs = null;
  }

  const STREAM_KEY = 'funding';
  try {
    fundingWs = new WebSocket('wss://fstream.binance.com/ws/!markPrice@arr@1s');

    fundingWs.onopen = () => {
      console.log('[deriv-worker] Funding rate stream connected (Binance Futures)');
      resetReconnect(STREAM_KEY);
    };

    fundingWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data)) return;

        const now = Date.now();
        for (const item of data) {
          // Only track symbols we care about
          const symbol = item.s;
          if (!symbol || !currentSymbols.has(symbol)) continue;

          const rate = parseFloat(item.r);
          const markPrice = parseFloat(item.p);
          const indexPrice = parseFloat(item.i);
          const nextFundingTime = parseInt(item.T);

          if (isNaN(rate) || isNaN(markPrice)) continue;

          // Annualized: rate × 3 funding periods/day × 365 days × 100 for percentage
          const annualized = rate * 3 * 365 * 100;

          fundingBuffer.set(symbol, {
            symbol,
            rate,
            annualized,
            nextFundingTime,
            markPrice,
            indexPrice: isNaN(indexPrice) ? markPrice : indexPrice,
            updatedAt: now
          });
        }
        fundingDirty = true;
      } catch (e) {
        // Silent parse errors
      }
    };

    fundingWs.onclose = () => {
      console.log('[deriv-worker] Funding stream closed');
      fundingWs = null;
      if (isRunning) scheduleReconnect(STREAM_KEY, connectFundingStream);
    };

    fundingWs.onerror = () => {
      fundingWs?.close();
    };
  } catch (e) {
    console.error('[deriv-worker] Funding stream error:', e);
    if (isRunning) scheduleReconnect(STREAM_KEY, connectFundingStream);
  }
}

// ── Stream 2: Bybit Linear Liquidations ──────────────────────────
// FREE: wss://stream.bybit.com/v5/public/linear → allLiquidation

function connectLiquidationStream() {
  if (liquidationWs) {
    try { liquidationWs.close(); } catch(e) {}
    liquidationWs = null;
  }

  const STREAM_KEY = 'liquidation';
  try {
    liquidationWs = new WebSocket('wss://stream.bybit.com/v5/public/linear');

    liquidationWs.onopen = () => {
      console.log('[deriv-worker] Liquidation stream connected (Bybit Linear)');
      resetReconnect(STREAM_KEY);

      // Subscribe to liquidations for all watched symbols
      const topics = WHALE_WATCH_SYMBOLS.map(s => `allLiquidation.${s.toUpperCase()}`);
      liquidationWs.send(JSON.stringify({
        op: 'subscribe',
        args: topics
      }));
    };

    liquidationWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Bybit heartbeat response
        if (data.op === 'pong' || data.op === 'subscribe') return;

        if (data.topic && data.topic.startsWith('allLiquidation.') && data.data) {
          const liq = data.data;
          const symbol = liq.symbol || data.topic.replace('allLiquidation.', '');
          const size = parseFloat(liq.size) || 0;
          const price = parseFloat(liq.price) || 0;
          const valueUsd = size * price;

          // Only track significant liquidations (dynamic threshold)
          if (valueUsd < LIQUIDATION_THRESHOLD) return;

          const event = {
            id: generateId(),
            symbol,
            side: liq.side || 'Buy',
            size,
            price,
            valueUsd,
            exchange: 'bybit',
            timestamp: parseInt(liq.updatedTime) || Date.now()
          };

          // Circular buffer
          liquidationBuffer.push(event);
          if (liquidationBuffer.length > MAX_LIQUIDATIONS) {
            liquidationBuffer = liquidationBuffer.slice(-MAX_LIQUIDATIONS);
          }

          // Broadcast immediately for real-time feed
          broadcast({ type: 'LIQUIDATION', payload: event });
        }
      } catch (e) {
        // Silent
      }
    };

    // Bybit requires periodic ping
    const pingInterval = setInterval(() => {
      if (liquidationWs && liquidationWs.readyState === WebSocket.OPEN) {
        liquidationWs.send(JSON.stringify({ op: 'ping' }));
      }
    }, HEARTBEAT_MS);

    liquidationWs.onclose = () => {
      console.log('[deriv-worker] Liquidation stream closed');
      clearInterval(pingInterval);
      liquidationWs = null;
      if (isRunning) scheduleReconnect(STREAM_KEY, connectLiquidationStream);
    };

    liquidationWs.onerror = () => {
      liquidationWs?.close();
    };
  } catch (e) {
    console.error('[deriv-worker] Liquidation stream error:', e);
    if (isRunning) scheduleReconnect(STREAM_KEY, connectLiquidationStream);
  }
}

// ── Stream 3: Binance aggTrade (Whale Detection + Order Flow) ────
// FREE: wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade/...
// We use combined stream to monitor top 20 symbols in a single connection

function connectWhaleStream() {
  // Close existing
  whaleWsSockets.forEach((ws) => {
    try { ws.close(); } catch(e) {}
  });
  whaleWsSockets.clear();

  const STREAM_KEY = 'whale';
  try {
    // Combined stream: all top symbols in one WebSocket
    const streams = WHALE_WATCH_SYMBOLS.map(s => `${s}@aggTrade`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[deriv-worker] Whale/OrderFlow stream connected (${WHALE_WATCH_SYMBOLS.length} symbols)`);
      resetReconnect(STREAM_KEY);
    };

    ws.onmessage = (event) => {
      try {
        const wrapper = JSON.parse(event.data);
        const data = wrapper.data;
        if (!data || !data.s) return;

        const symbol = data.s;
        const price = parseFloat(data.p);
        const quantity = parseFloat(data.q);
        const isBuyerMaker = data.m;  // true = seller is taker (sell), false = buyer is taker (buy)
        const tradeTime = data.T || Date.now();
        const valueUsd = price * quantity;

        // ── Order Flow Accumulation ──
        let flow = orderFlowBuffer.get(symbol);
        const now = Date.now();
        if (!flow || (now - flow.windowStart) > ORDER_FLOW_WINDOW_MS) {
          // New window
          flow = { buyVol: 0, sellVol: 0, tradeCount: 0, windowStart: now };
        }

        if (isBuyerMaker) {
          // Seller is the taker → sell pressure
          flow.sellVol += valueUsd;
        } else {
          // Buyer is the taker → buy pressure
          flow.buyVol += valueUsd;
        }
        flow.tradeCount++;
        orderFlowBuffer.set(symbol, flow);
        orderFlowDirty = true;

        // ── Whale Detection ──
        if (valueUsd >= WHALE_THRESHOLD_USD) {
          const whaleEvent = {
            id: generateId(),
            symbol,
            side: isBuyerMaker ? 'sell' : 'buy',
            price,
            quantity,
            valueUsd,
            exchange: 'binance',
            timestamp: tradeTime
          };

          whaleBuffer.push(whaleEvent);
          if (whaleBuffer.length > MAX_WHALE_ALERTS) {
            whaleBuffer = whaleBuffer.slice(-MAX_WHALE_ALERTS);
          }

          // Broadcast immediately — whale alerts are time-critical
          broadcast({ type: 'WHALE_TRADE', payload: whaleEvent });

          const sizeLabel = valueUsd >= MEGA_WHALE_THRESHOLD_USD ? '🐋 MEGA WHALE' : '🐳 WHALE';
          console.log(`[deriv-worker] ${sizeLabel}: ${symbol} ${whaleEvent.side.toUpperCase()} $${Math.round(valueUsd / 1000)}K @ ${price}`);
        }
      } catch (e) {
        // Silent
      }
    };

    ws.onclose = () => {
      console.log('[deriv-worker] Whale stream closed');
      whaleWsSockets.delete('combined');
      if (isRunning) scheduleReconnect(STREAM_KEY, connectWhaleStream);
    };

    ws.onerror = () => {
      ws?.close();
    };

    whaleWsSockets.set('combined', ws);
  } catch (e) {
    console.error('[deriv-worker] Whale stream error:', e);
    if (isRunning) scheduleReconnect(STREAM_KEY, connectWhaleStream);
  }
}

// ── Stream 4: Open Interest REST Polling ─────────────────────────
// FREE: GET https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT
// Polled every 30s for top symbols (no WebSocket stream available)

async function pollOpenInterest() {
  const OI_SYMBOLS = WHALE_WATCH_SYMBOLS.slice(0, 20).map(s => s.toUpperCase());

  for (const symbol of OI_SYMBOLS) {
    if (!isRunning) return;
    try {
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();

      const value = parseFloat(data.openInterest);
      if (isNaN(value)) continue;

      // Get mark price for USD conversion
      const funding = fundingBuffer.get(symbol);
      const markPrice = funding ? funding.markPrice : 0;
      const valueUsd = value * markPrice;

      // Track history for change calculation
      const now = Date.now();
      let history = oiHistory.get(symbol);
      if (!history) {
        history = { snapshots: [] };
        oiHistory.set(symbol, history);
      }
      history.snapshots.push({ value: valueUsd, timestamp: now });
      // Keep only last 24h of snapshots (at 30s intervals = max 2880)
      if (history.snapshots.length > 2880) {
        history.snapshots = history.snapshots.slice(-2880);
      }

      // Calculate changes
      const snap1h = history.snapshots.find(s => (now - s.timestamp) >= 3600000) || history.snapshots[0];
      const snap24h = history.snapshots.find(s => (now - s.timestamp) >= 86400000) || history.snapshots[0];
      const change1h = snap1h && snap1h.value > 0 ? ((valueUsd - snap1h.value) / snap1h.value) * 100 : 0;
      const change24h = snap24h && snap24h.value > 0 ? ((valueUsd - snap24h.value) / snap24h.value) * 100 : 0;

      oiBuffer.set(symbol, {
        symbol,
        value: valueUsd,
        change1h: Math.round(change1h * 100) / 100,
        change24h: Math.round(change24h * 100) / 100,
        updatedAt: now
      });
      oiDirty = true;

      // Small stagger between requests to avoid rate limits
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      // Silent — REST polling is best-effort
    }
  }
}

// ── Flush Engine ─────────────────────────────────────────────────
// Batches all buffered data and sends to main thread every 500ms

function startFlushing() {
  if (flushTimer) clearInterval(flushTimer);

  flushTimer = setInterval(() => {
    // Flush funding rates
    if (fundingDirty && fundingBuffer.size > 0) {
      broadcast({
        type: 'FUNDING_UPDATE',
        payload: Array.from(fundingBuffer.entries())
      });
      fundingDirty = false;
    }

    // Flush order flow
    if (orderFlowDirty && orderFlowBuffer.size > 0) {
      const flowPayload = [];
      const now = Date.now();

      orderFlowBuffer.forEach((flow, symbol) => {
        const totalVol = flow.buyVol + flow.sellVol;
        const ratio = totalVol > 0 ? flow.buyVol / totalVol : 0.5;

        let pressure = 'neutral';
        if (ratio > 0.65) pressure = 'strong-buy';
        else if (ratio > 0.55) pressure = 'buy';
        else if (ratio < 0.35) pressure = 'strong-sell';
        else if (ratio < 0.45) pressure = 'sell';

        flowPayload.push([symbol, {
          symbol,
          buyVolume1m: Math.round(flow.buyVol),
          sellVolume1m: Math.round(flow.sellVol),
          ratio: Math.round(ratio * 1000) / 1000,
          pressure,
          tradeCount1m: flow.tradeCount,
          updatedAt: now
        }]);
      });

      broadcast({ type: 'ORDER_FLOW_UPDATE', payload: flowPayload });
      orderFlowDirty = false;
    }

    // Flush OI
    if (oiDirty && oiBuffer.size > 0) {
      broadcast({
        type: 'OI_UPDATE',
        payload: Array.from(oiBuffer.entries())
      });
      oiDirty = false;
    }
  }, FLUSH_INTERVAL_MS);
}

// ── Lifecycle ────────────────────────────────────────────────────

function start(symbols) {
  if (isRunning) return;
  isRunning = true;
  currentSymbols = new Set(symbols.map(s => s.toUpperCase()));

  console.log('[deriv-worker] Starting derivatives intelligence engine...');
  console.log(`[deriv-worker] Tracking ${currentSymbols.size} symbols`);

  // Start all streams
  connectFundingStream();
  connectLiquidationStream();
  connectWhaleStream();

  // Start OI polling
  pollOpenInterest();
  oiPollTimer = setInterval(pollOpenInterest, OI_POLL_INTERVAL_MS);

  // Start flush engine
  startFlushing();

  broadcast({ type: 'CONNECTED' });
}

function stop() {
  isRunning = false;
  console.log('[deriv-worker] Stopping derivatives intelligence engine...');

  // Close all WebSockets
  if (fundingWs) { try { fundingWs.close(); } catch(e) {} fundingWs = null; }
  if (liquidationWs) { try { liquidationWs.close(); } catch(e) {} liquidationWs = null; }
  whaleWsSockets.forEach(ws => { try { ws.close(); } catch(e) {} });
  whaleWsSockets.clear();

  // Clear timers
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (oiPollTimer) { clearInterval(oiPollTimer); oiPollTimer = null; }
  reconnectTimers.forEach(timer => clearTimeout(timer));
  reconnectTimers.clear();
  reconnectAttempts.clear();

  broadcast({ type: 'DISCONNECTED' });
}

function updateSymbols(symbols) {
  currentSymbols = new Set(symbols.map(s => s.toUpperCase()));
}

// ── Message Handler ──────────────────────────────────────────────

self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'START':
      start(payload?.symbols || []);
      break;

    case 'STOP':
      stop();
      break;

    case 'UPDATE_SYMBOLS':
      updateSymbols(payload?.symbols || []);
      break;

    case 'UPDATE_CONFIG':
      if (payload?.liquidationThreshold) {
        LIQUIDATION_THRESHOLD = payload.liquidationThreshold;
        console.log(`[deriv-worker] Liquidation threshold updated to $${LIQUIDATION_THRESHOLD}`);
      }
      break;

    default:
      break;
  }
};

console.log('[deriv-worker] Derivatives Intelligence Worker loaded');
