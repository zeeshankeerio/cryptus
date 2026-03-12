'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface LiveTick {
  price: number;
  change24h: number;
  volume24h: number;
  updatedAt: number;
}

interface BinanceMiniTicker {
  s: string;  // Symbol
  c: string;  // Close price
  o: string;  // Open price
  v: string;  // Base asset volume
  q: string;  // Quote asset volume
}

interface CombinedStreamMessage {
  stream: string;
  data: BinanceMiniTicker;
}

const WS_BASE = 'wss://stream.binance.com:9443/stream?streams=';
let FLUSH_INTERVAL_MS = 1500; // Increased base for smoothness
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const MAX_WS_CONNECTIONS = Math.max(1, Number(process.env.NEXT_PUBLIC_MAX_WS_CONNECTIONS ?? '3'));
const STREAMS_PER_CONNECTION = Math.max(50, Number(process.env.NEXT_PUBLIC_STREAMS_PER_WS ?? '180'));
const MAX_BUFFER_SIZE = 1000; // prevent unbounded buffer growth
const STALE_THRESHOLD_MS = 300_000; // 5 min — drop stale ticks
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s heartbeat

function toStream(symbol: string): string {
  return `${symbol.toLowerCase()}@miniTicker`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function useLivePrices(symbols: Set<string>) {
  const [livePrices, setLivePrices] = useState<Map<string, LiveTick>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const socketsRef = useRef<Map<number, WebSocket>>(new Map());
  const bufferRef = useRef<Map<string, LiveTick>>(new Map());
  const symbolsRef = useRef(symbols);
  const reconnectAttemptsRef = useRef<Map<number, number>>(new Map());
  const reconnectTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setInterval>>(undefined!);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const openSocketsRef = useRef(0);

  symbolsRef.current = symbols;

  // Dynamically adjust flush interval for smoothness at scale
  useEffect(() => {
    if (symbols.size > 800) FLUSH_INTERVAL_MS = 2500;
    else if (symbols.size > 500) FLUSH_INTERVAL_MS = 2000;
    else if (symbols.size > 200) FLUSH_INTERVAL_MS = 1500;
    else FLUSH_INTERVAL_MS = 1000;
  }, [symbols.size]);

  // Flush buffered ticks to React state at a throttled interval using RAF for smoothness
  useEffect(() => {
    let rafId: number;
    let lastFlush = 0;

    const flush = () => {
      const now = Date.now();
      // Flush every ~1000ms or when buffer is large, but check every frame
      if (now - lastFlush >= FLUSH_INTERVAL_MS || bufferRef.current.size > 50) {
        if (typeof document !== 'undefined' && !document.hidden && bufferRef.current.size > 0) {
          const buf = bufferRef.current;
          setLivePrices((prev) => {
            const next = new Map(prev);
            buf.forEach((tick, sym) => next.set(sym, tick));
            buf.clear();
            // Prune stale ticks
            if (next.size > 0) {
              for (const [sym, tick] of next) {
                if (now - tick.updatedAt > STALE_THRESHOLD_MS) next.delete(sym);
              }
            }
            return next;
          });
          lastFlush = now;
        }
      }
      rafId = requestAnimationFrame(flush);
    };

    rafId = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const closeAllSockets = useCallback(() => {
    reconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    reconnectTimersRef.current.clear();
    reconnectAttemptsRef.current.clear();
    socketsRef.current.forEach((ws) => {
      try {
        ws.close();
      } catch {
        // no-op
      }
    });
    socketsRef.current.clear();
    openSocketsRef.current = 0;
    setIsConnected(false);
  }, []);

  const handleTicker = useCallback((t: BinanceMiniTicker) => {
    // Fast path: existence check before any parsing
    if (!symbolsRef.current.has(t.s)) return;

    // Fast path: avoid duplicate processing if price hasn't changed (optional but good for efficiency)
    const existing = bufferRef.current.get(t.s);
    if (existing && existing.price === Number(t.c)) return;

    const close = parseFloat(t.c);
    const open = parseFloat(t.o);
    if (!Number.isFinite(close) || close <= 0) return;

    const change24h = Number.isFinite(open) && open > 0
      ? Math.round(((close - open) / open) * 10000) / 100
      : 0;

    bufferRef.current.set(t.s, {
      price: close,
      change24h,
      volume24h: parseFloat(t.q) || 0,
      updatedAt: Date.now(),
    });

    if (bufferRef.current.size > MAX_BUFFER_SIZE) {
      // Very fast pruning: find the oldest or just clear the first
      const firstKey = bufferRef.current.keys().next().value as string | undefined;
      if (firstKey) bufferRef.current.delete(firstKey);
    }
  }, []);

  const connectShard = useCallback((shardIndex: number, shardSymbols: string[], generation: number) => {
    if (!mountedRef.current || generationRef.current !== generation || shardSymbols.length === 0) return;

    const streams = shardSymbols.map(toStream).join('/');
    const ws = new WebSocket(`${WS_BASE}${streams}`);
    let opened = false;

    socketsRef.current.set(shardIndex, ws);

    let heartbeatTimer: ReturnType<typeof setInterval>;

    const startHeartbeat = () => {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Binance WS sends a pong for every ping or any message.
            // We just send a ping frame (simple string in standard WS, but Binance usually handles empty messages or actual ping frames)
            // For browser WebSocket, we can't send ping frames, but we can send a "ping" message or just rely on the server's timeout.
            // Actually, Binance sends a ping frame to the client, and the client must respond with a pong.
            // Browser WebSockets handle this automatically in many cases, but we can send a keep-alive pulse.
            ws.send(JSON.stringify({ method: 'listProperty', id: Date.now() }));
          } catch {
             ws.close();
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onopen = () => {
      if (!mountedRef.current || generationRef.current !== generation) return;
      opened = true;
      openSocketsRef.current += 1;
      setIsConnected(openSocketsRef.current > 0);
      reconnectAttemptsRef.current.set(shardIndex, 0);
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as CombinedStreamMessage | BinanceMiniTicker;
        if (payload && typeof payload === 'object' && 'data' in payload) {
          handleTicker((payload as CombinedStreamMessage).data);
          return;
        }
        if (payload && typeof payload === 'object' && 's' in payload) {
          handleTicker(payload as BinanceMiniTicker);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      if (!mountedRef.current || generationRef.current !== generation) return;
      socketsRef.current.delete(shardIndex);
      if (opened) {
        openSocketsRef.current = Math.max(0, openSocketsRef.current - 1);
        setIsConnected(openSocketsRef.current > 0);
      }

      const attempts = reconnectAttemptsRef.current.get(shardIndex) ?? 0;
      const delay = RECONNECT_DELAYS[Math.min(attempts, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptsRef.current.set(shardIndex, attempts + 1);

      const timer = setTimeout(() => {
        connectShard(shardIndex, shardSymbols, generation);
      }, delay);
      reconnectTimersRef.current.set(shardIndex, timer);
    };

    ws.onerror = () => {
      clearInterval(heartbeatTimer);
      try {
        ws.close();
      } catch {
        // no-op
      }
    };
  }, [handleTicker]);

  useEffect(() => {
    mountedRef.current = true;
    closeAllSockets();
    generationRef.current += 1;
    const generation = generationRef.current;

    if (symbols.size === 0) return () => {
      mountedRef.current = false;
      closeAllSockets();
    };

    // "Super-Liveness" Hack: Use the aggregated miniTicker stream for all symbols.
    // This receives all Binance tickers in a single socket, which is much more efficient
    // than sharding hundreds of individual stream subscriptions for large lists.
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    socketsRef.current.set(0, ws);

    let heartbeatTimer: ReturnType<typeof setInterval>;

    ws.onopen = () => {
      if (!mountedRef.current || generationRef.current !== generation) return;
      openSocketsRef.current = 1;
      setIsConnected(true);
      
      heartbeatTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ method: 'listProperty', id: Date.now() }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          // Process the array of tickers (the !miniTicker@arr format)
          data.forEach((t) => handleTicker(t as BinanceMiniTicker));
        } else if (data && typeof data === 'object' && 's' in data) {
          handleTicker(data as BinanceMiniTicker);
        }
      } catch {
        // Ignore
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      if (!mountedRef.current || generationRef.current !== generation) return;
      socketsRef.current.delete(0);
      openSocketsRef.current = 0;
      setIsConnected(false);

      const attempts = reconnectAttemptsRef.current.get(0) ?? 0;
      const delay = RECONNECT_DELAYS[Math.min(attempts, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptsRef.current.set(0, attempts + 1);

      setTimeout(() => {
        if (mountedRef.current && generationRef.current === generation) {
           // Simple trigger re-render to reconnect
           setReconnectTrigger((prev) => prev + 1);
        }
      }, delay);
    };

    return () => {
      mountedRef.current = false;
      closeAllSockets();
      clearInterval(heartbeatTimer);
    };
  }, [symbols, handleTicker, closeAllSockets, reconnectTrigger]);

  return { livePrices, isConnected };
}
