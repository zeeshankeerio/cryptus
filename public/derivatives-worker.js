/**
 * RSIQ Pro - Derivatives Intelligence Worker v1
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
const FLUSH_INTERVAL_MS = 300;     // 300ms for ultra-live feel
const OI_POLL_INTERVAL_MS = 30000;
const ZOMBIE_WATCHDOG_MS = 10000;   // check every 10s (reduced from 30s)
const ZOMBIE_THRESHOLD_MS = 15000;  // force reconnect if no data for 15s (reduced from 60s)
let LIQUIDATION_THRESHOLD = 10000;         // Default $10K (aligned with UI standard)
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

// ── Broadcast Channel for Service Worker Bridge (2026 Resilience) ──
const alertChannel = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('rsiq-alerts') 
  : null;

// ── State ────────────────────────────────────────────────────────
let currentSymbols = new Set();
let isRunning = false;

// Buffers
let fundingBuffer = new Map();      // symbol → { rate, annualized, nextFundingTime, markPrice, indexPrice, updatedAt }
let liquidationBuffer = [];         // circular array of LiquidationEvent
let whaleBuffer = [];               // circular array of WhaleTradeEvent
let orderFlowBuffer = new Map();    // symbol → { buyVol, sellVol, tradeCount, windowStart }
let oiBuffer = new Map();           // symbol → { value, prevValue, updatedAt }
let lastPrices = new Map();        // symbol → last known price for fallback

// Flush state
let fundingDirty = false;
let oiDirty = false;
let orderFlowDirty = false;
let flushTimer = null;

// WebSocket connections
let fundingWs = null;
let liquidationWs = null;      // Bybit
let binanceLiqWs = null;       // Binance Aggregated Force Orders
let whaleWsSockets = new Map();     // symbol → WebSocket

// Reconnection tracking
let reconnectAttempts = new Map();  // streamKey → attempt count
let reconnectTimers = new Map();    // streamKey → setTimeout id

// OI polling state
let oiPollTimer = null;
let currentOiInterval = OI_POLL_INTERVAL_MS;
let consecutiveOiErrors = 0;
let oiHistory = new Map();          // symbol → { value1hAgo, value24hAgo, snapshots[] }
let lastDataReceived = Date.now();  // tracker for watchdog
let streamHealth = {
  funding: false,
  liquidationBybit: false,
  liquidationBinance: false,
  whale: false
};
let zombieWatchdog = null;
let healthTimer = null;

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
    
    // Direct Bridge: If this is a critical alert, send to SW channel immediately
    if (alertChannel && (message.type === 'WHALE_TRADE' || message.type === 'LIQUIDATION')) {
      const p = message.payload;
      alertChannel.postMessage({
        type: 'ALERT_NOTIFICATION',
        payload: {
          title: message.type === 'WHALE_TRADE' 
            ? `🐋 WHALE ${p.side.toUpperCase()} - ${p.symbol}`
            : `💀 ${p.side === 'Sell' ? 'LONG' : 'SHORT'} Liquidated - ${p.symbol}`,
          body: message.type === 'WHALE_TRADE'
            ? `$${Math.round(p.valueUsd / 1000)}K @ $${p.price.toLocaleString()} [Binance]`
            : `$${Math.round(p.valueUsd / 1000)}K @ $${p.price.toLocaleString()} [Bybit]`,
          symbol: p.symbol,
          exchange: p.exchange,
          priority: p.valueUsd >= 500000 ? 'critical' : 'high',
          type: message.type === 'WHALE_TRADE' ? 'whale' : 'liquidation'
        }
      });
    }
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
      streamHealth.funding = true;
      resetReconnect(STREAM_KEY);
      
      // Heartbeat: Binance requires a ping every 3 minutes to keep the connection alive
      // We do it every 30s to be safe
      const pingInterval = setInterval(() => {
        if (fundingWs && fundingWs.readyState === WebSocket.OPEN) {
          try { fundingWs.send(JSON.stringify({ method: 'PING', id: Date.now() })); } catch(e) {}
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    };

    fundingWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data)) return;

        const now = Date.now();
        lastDataReceived = now;
        for (const item of data) {
          // Only track symbols we care about
          const symbol = item.s;
          if (!symbol || !currentSymbols.has(symbol)) continue;

          const rate = parseFloat(item.r);
          const markPrice = parseFloat(item.p);
          const indexPrice = parseFloat(item.i);
          const nextFundingTime = parseInt(item.T);

          if (isNaN(rate) || isNaN(markPrice)) continue;

          // Cache last price for alert fallback
          lastPrices.set(symbol.toUpperCase(), markPrice);

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
      streamHealth.funding = false;
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

// ── Stream 2: Aggregated Liquidations ────────────────────────────
// Connects to Bybit (Linear) and Binance (Futures Force Orders)
// Provides a unified real-time liquidation feed.

function connectLiquidationStream() {
  connectBybitLiquidationStream();
  connectBinanceLiquidationStream();
}

// ── Stream 2A: Bybit Linear Liquidations ─────────
function connectBybitLiquidationStream() {
  if (liquidationWs) {
    try { liquidationWs.close(); } catch(e) {}
    liquidationWs = null;
  }

  const STREAM_KEY = 'liquidation_bybit';
  try {
    liquidationWs = new WebSocket('wss://stream.bybit.com/v5/public/linear');

    liquidationWs.onopen = () => {
      console.log('[deriv-worker] Liquidation stream connected (Bybit Linear)');
      streamHealth.liquidationBybit = true;
      resetReconnect(STREAM_KEY);

      const symbolsToWatch = new Set([
        ...WHALE_WATCH_SYMBOLS.map(s => s.toUpperCase()),
        ...Array.from(currentSymbols)
      ]);

      const topics = Array.from(symbolsToWatch).slice(0, 50).map(s => `allLiquidation.${s}`);
      
      if (liquidationWs.readyState === WebSocket.OPEN) {
        liquidationWs.send(JSON.stringify({ op: 'subscribe', args: topics }));
      }
    };

    liquidationWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        lastDataReceived = Date.now();
        if (data.op === 'pong' || data.op === 'subscribe') return;

        if (data.topic && data.topic.startsWith('allLiquidation.') && data.data) {
          const liq = data.data;
          const symbol = (liq.symbol || data.topic.replace('allLiquidation.', '')).toUpperCase();
          const size = parseFloat(liq.size) || 0;
          const price = parseFloat(liq.price) || lastPrices.get(symbol) || 0;
          const valueUsd = size * price;

          if (valueUsd < LIQUIDATION_THRESHOLD) return;

          const eventPayload = {
            id: generateId(),
            symbol,
            side: liq.side || 'Buy',
            size,
            price,
            valueUsd,
            exchange: 'bybit',
            timestamp: parseInt(liq.updatedTime) || Date.now()
          };

          liquidationBuffer.push(eventPayload);
          if (liquidationBuffer.length > MAX_LIQUIDATIONS) liquidationBuffer = liquidationBuffer.slice(-MAX_LIQUIDATIONS);
          broadcast({ type: 'LIQUIDATION', payload: eventPayload });
        }
      } catch (e) {}
    };

    // Bybit requires periodic ping with a touch of entropy to prevent synchronized disconnects
    const pingInterval = setInterval(() => {
      if (liquidationWs && liquidationWs.readyState === WebSocket.OPEN) {
        try {
          liquidationWs.send(JSON.stringify({ op: 'ping' }));
        } catch (e) {
          console.warn('[deriv-worker] Failed to send Bybit ping', e.message);
        }
      }
    }, HEARTBEAT_MS + (Math.random() * 2000));

    liquidationWs.onclose = () => {
      clearInterval(pingInterval);
      streamHealth.liquidationBybit = false;
      if (isRunning) scheduleReconnect(STREAM_KEY, connectBybitLiquidationStream);
    };
    liquidationWs.onerror = () => liquidationWs?.close();
  } catch (e) {
    if (isRunning) scheduleReconnect(STREAM_KEY, connectBybitLiquidationStream);
  }
}

// ── Stream 2B: Binance Futures Global Force Orders ───────
function connectBinanceLiquidationStream() {
  if (binanceLiqWs) {
    try { binanceLiqWs.close(); } catch(e) {}
    binanceLiqWs = null;
  }

  const STREAM_KEY = 'liquidation_binance';
  try {
    // !forceOrder@arr: Single stream for ALL Binance Futures liquidations
    binanceLiqWs = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');

    binanceLiqWs.onopen = () => {
      console.log('[deriv-worker] Liquidation stream connected (Binance Futures)');
      streamHealth.liquidationBinance = true;
      resetReconnect(STREAM_KEY);
    };

    binanceLiqWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        lastDataReceived = Date.now();
        
        // Binance returns an array of force orders
        if (data.e === 'forceOrder' && data.o) {
          const o = data.o;
          const symbol = o.s.toUpperCase();
          // Force orders are per-symbol, but we filter for symbols we're tracking or top market caps
          const isTracked = currentSymbols.has(symbol) || WHALE_WATCH_SYMBOLS.some(s => s.toUpperCase() === symbol);
          if (!isTracked) return;

          const size = parseFloat(o.q) || 0;
          const price = parseFloat(o.p) || lastPrices.get(symbol) || 0;
          const valueUsd = size * price;

          if (valueUsd < LIQUIDATION_THRESHOLD) return;

          const eventPayload = {
            id: generateId(),
            symbol,
            // In Binance forceOrder, S: "SELL" means a long was liquidated.
            // But for UI consistency we want 'Sell' as the side of the liquidation trade.
            side: o.S === 'SELL' ? 'Sell' : 'Buy', 
            size,
            price,
            valueUsd,
            exchange: 'binance',
            timestamp: o.T || Date.now()
          };

          liquidationBuffer.push(eventPayload);
          if (liquidationBuffer.length > MAX_LIQUIDATIONS) liquidationBuffer = liquidationBuffer.slice(-MAX_LIQUIDATIONS);
          broadcast({ type: 'LIQUIDATION', payload: eventPayload });
        }
      } catch (e) {}
    };

    binanceLiqWs.onclose = () => {
      streamHealth.liquidationBinance = false;
      if (isRunning) scheduleReconnect(STREAM_KEY, connectBinanceLiquidationStream);
    };
    binanceLiqWs.onerror = () => binanceLiqWs?.close();
  } catch (e) {
    if (isRunning) scheduleReconnect(STREAM_KEY, connectBinanceLiquidationStream);
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
    // Combined stream: monitor top symbols + whatever the user is currently viewing
    const activeSet = new Set([
      ...WHALE_WATCH_SYMBOLS, 
      ...Array.from(currentSymbols).map(s => s.toLowerCase())
    ]);
    const streams = Array.from(activeSet).slice(0, 100).map(s => `${s}@aggTrade`).join('/');
    const url = `wss://stream.binance.com/stream?streams=${streams}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[deriv-worker] Whale/OrderFlow stream connected (${WHALE_WATCH_SYMBOLS.length} symbols)`);
      streamHealth.whale = true;
      resetReconnect(STREAM_KEY);

      // Heartbeat
      const pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ method: 'PING', id: Date.now() })); } catch(e) {}
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const wrapper = JSON.parse(event.data);
        const data = wrapper.data;
        if (!data || !data.s) return;
        
        lastDataReceived = Date.now();

        const symbol = data.s.toUpperCase();
        const price = parseFloat(data.p) || lastPrices.get(symbol) || 0;
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

          // Broadcast immediately - whale alerts are time-critical
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
      streamHealth.whale = false;
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
  // ── Intelligence: Dynamic Symbol Prioritization ──
  // Prioritize symbols user is viewing, then fill rest with top market cap symbols
  const activeSymbols = Array.from(currentSymbols);
  const prioritizedSymbols = new Set([...activeSymbols, ...WHALE_WATCH_SYMBOLS.map(s => s.toUpperCase())]);
  const OI_SYMBOLS = Array.from(prioritizedSymbols).slice(0, 25);

  if (OI_SYMBOLS.length === 0) return;

  try {
    const res = await fetch(
      `/api/derivatives/oi?symbols=${OI_SYMBOLS.join(',')}`,
      { 
        signal: AbortSignal.timeout(12000),
        cache: 'no-store' 
      }
    );
    
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        // ── Intelligence: Adaptive Backoff ──
        consecutiveOiErrors++;
        currentOiInterval = Math.min(OI_POLL_INTERVAL_MS * Math.pow(1.5, consecutiveOiErrors), 300000); // Max 5 mins
        console.warn(`[deriv-worker] OI Proxy overloaded. Backing off to ${Math.round(currentOiInterval/1000)}s`);
        
        // Reschedule with new interval
        if (oiPollTimer) {
          clearInterval(oiPollTimer);
          oiPollTimer = setInterval(pollOpenInterest, currentOiInterval);
        }
      }
      return;
    }

    // Success - reset backoff gracefully
    if (consecutiveOiErrors > 0) {
      consecutiveOiErrors = 0;
      currentOiInterval = OI_POLL_INTERVAL_MS;
      if (oiPollTimer) {
        clearInterval(oiPollTimer);
        oiPollTimer = setInterval(pollOpenInterest, currentOiInterval);
      }
    }

    const json = await res.json();
    const oiDataMap = json.data;
    if (!oiDataMap || typeof oiDataMap !== 'object') return;

    const now = Date.now();

    // 2. Process each symbol returned by the proxy
    Object.entries(oiDataMap).forEach(([symbol, value]) => {
      const oiValue = parseFloat(value);
      if (isNaN(oiValue) || oiValue <= 0) return;

      // Intelligence: Data Integrity Check
      // If we don't have a fresh markPrice, the OI USD value is misleading.
      const funding = fundingBuffer.get(symbol);
      const markPrice = funding ? funding.markPrice : 0;
      if (markPrice <= 0) return; 

      const valueUsd = oiValue * markPrice;

      // Track history for change calculation
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
    });

    oiDirty = true;
  } catch (e) {
    console.error('[deriv-worker] pollOpenInterest critical error:', e);
  }

  // ── Intelligence: REST Fallback for Funding ──
  // If WebSocket is offline, attempt to poll current rates via proxy
  if (!streamHealth.funding) {
    try {
      const activeSymbols = Array.from(currentSymbols).slice(0, 10);
      if (activeSymbols.length > 0) {
        const res = await fetch(`/api/derivatives/funding?symbols=${activeSymbols.join(',')}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            Object.entries(json.data).forEach(([symbol, rateData]) => {
              const prev = fundingBuffer.get(symbol);
              fundingBuffer.set(symbol, { 
                ...(prev || {}), 
                ...rateData, 
                updatedAt: Date.now() 
              });
            });
            fundingDirty = true;
          }
        }
      }
    } catch (e) { /* silent */ }
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

    // Task: Periodic Health Pulse for UI Heartbeat
    broadcast({ 
      type: 'HEALTH_STATUS', 
      payload: { 
        lastDataReceived, 
        isRunning,
        streamHealth,
        timestamp: Date.now()
      } 
    });
  }, FLUSH_INTERVAL_MS);
}

/** Sends a full snapshot of current buffers to the main thread for instant UI hydration */
function sendSnapshot() {
  const now = Date.now();
  
  // Prepare order flow snapshot
  const flowPayload = [];
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

  broadcast({
    type: 'SNAPSHOT',
    payload: {
      fundingRates: Array.from(fundingBuffer.entries()),
      liquidations: liquidationBuffer,
      whaleAlerts: whaleBuffer,
      orderFlow: flowPayload,
      openInterest: Array.from(oiBuffer.entries()),
      timestamp: now
    }
  });
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
  startZombieWatchdog();

  broadcast({ type: 'CONNECTED' });
  
  // Send initial snapshot immediately if we have data
  sendSnapshot();
}

/** Zombie connection watchdog - prevents silent death of WebSocket streams */
function startZombieWatchdog() {
  if (zombieWatchdog) clearInterval(zombieWatchdog);
  zombieWatchdog = setInterval(() => {
    if (!isRunning) return;
    const silenceMs = Date.now() - lastDataReceived;
    if (silenceMs > ZOMBIE_THRESHOLD_MS) {
      console.warn(`[deriv-worker] ZOMBIE DETECTED: No data for ${Math.round(silenceMs/1000)}s - Revitalizing streams...`);
      // Force reconnect all by stopping/starting
      reconnectAll();
    }
  }, ZOMBIE_WATCHDOG_MS);
}

function reconnectAll() {
  // Close sockets
  if (fundingWs) { try { fundingWs.close(); } catch(e) {} fundingWs = null; }
  if (liquidationWs) { try { liquidationWs.close(); } catch(e) {} liquidationWs = null; }
  if (binanceLiqWs) { try { binanceLiqWs.close(); } catch(e) {} binanceLiqWs = null; }
  whaleWsSockets.forEach(ws => { try { ws.close(); } catch(e) {} });
  whaleWsSockets.clear();
  
  // Immeditae reconnect
  connectFundingStream();
  connectLiquidationStream();
  connectWhaleStream();
  lastDataReceived = Date.now();
  
  // Also force a refresh of OI if technically feasible
  pollOpenInterest();
}

function stop() {
  isRunning = false;
  console.log('[deriv-worker] Stopping derivatives intelligence engine...');

  // Close all WebSockets
  if (fundingWs) { try { fundingWs.close(); } catch(e) {} fundingWs = null; }
  if (liquidationWs) { try { liquidationWs.close(); } catch(e) {} liquidationWs = null; }
  if (binanceLiqWs) { try { binanceLiqWs.close(); } catch(e) {} binanceLiqWs = null; }
  whaleWsSockets.forEach(ws => { try { ws.close(); } catch(e) {} });
  whaleWsSockets.clear();

  // Clear timers
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
  if (oiPollTimer) { clearInterval(oiPollTimer); oiPollTimer = null; }
  if (zombieWatchdog) { clearInterval(zombieWatchdog); zombieWatchdog = null; }
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  
  reconnectTimers.forEach(timer => clearTimeout(timer));
  reconnectTimers.clear();
  reconnectAttempts.clear();

  broadcast({ type: 'DISCONNECTED' });
}

function updateSymbols(symbols) {
  currentSymbols = new Set(symbols.map(s => s.toUpperCase()));
  
  // Refresh liquidation subscriptions if socket is open
  if (liquidationWs && liquidationWs.readyState === WebSocket.OPEN) {
    const symbolsToWatch = new Set([
      ...WHALE_WATCH_SYMBOLS.map(s => s.toUpperCase()),
      ...Array.from(currentSymbols)
    ]);
    const topics = Array.from(symbolsToWatch).slice(0, 50).map(s => `allLiquidation.${s}`);
    
    try {
      if (liquidationWs.readyState === WebSocket.OPEN) {
        liquidationWs.send(JSON.stringify({
          op: 'subscribe',
          args: topics
        }));
      }
    } catch (e) {
      console.warn('[deriv-worker] Mutation subscription failed', e.message);
    }
  }

  // ── Intelligence: Whale Stream Resynchronization ──
  // If any current symbol is missing from the whale stream, reconnect to add it.
  // This ensures whale alerts work for ANY symbol the user views, not just the top 20.
  const needsWhaleRefresh = Array.from(currentSymbols).some(s => !WHALE_WATCH_SYMBOLS.includes(s.toLowerCase()));
  if (needsWhaleRefresh && isRunning) {
    // Reconnect whale stream with the new symbols (throttled naturally by scheduleReconnect logic if needed)
    connectWhaleStream();
  }
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

    case 'RESUME':
      // Priority resync called on tab focus
      const silenceMs = Date.now() - lastDataReceived;
      if (silenceMs > 5000) {
        console.log('[deriv-worker] RESUME: Health check triggered priority resync');
        reconnectAll();
      }
      // Always send current state on resume to ensure UI is in sync
      sendSnapshot();
      break;

    case 'REQUEST_SNAPSHOT':
      sendSnapshot();
      break;

    default:
      break;
  }
};

console.log('[deriv-worker] Derivatives Intelligence Worker loaded');
