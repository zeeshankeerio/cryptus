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

    case 'STOP':
      stopSocket();
      stopFlushing();
      break;
    
    case 'UPDATE_CONFIG':
        if (payload.flushInterval) {
            stopFlushing();
            startFlushing(payload.flushInterval);
        }
        break;
  }
};

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
    } catch (e) {
      // Ignore
    }
  };

  socket.onclose = () => {
    console.log('[worker] WebSocket closed, reconnecting...');
    stopHeartbeat();
    socket = null;
    setTimeout(initSocket, RECONNECT_DELAY);
  };

  socket.onerror = () => {
    if (socket) socket.close();
  };
}

function processTicker(t) {
  // Only buffer if it's in our interest list
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
}

function startFlushing(interval) {
  flushInterval = setInterval(() => {
    if (tickerBuffer.size > 0) {
      // Send buffer to main thread and clear
      self.postMessage({
        type: 'TICKS',
        payload: Array.from(tickerBuffer.entries())
      });
      tickerBuffer.clear();
    }
  }, interval);
}

function stopFlushing() {
  if (flushInterval) clearInterval(flushInterval);
}

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ method: 'listProperty', id: Date.now() }));
    }
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
}

function stopSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  stopHeartbeat();
}
