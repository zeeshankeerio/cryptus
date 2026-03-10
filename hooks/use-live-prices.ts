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

const WS_URL = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
const FLUSH_INTERVAL_MS = 2000;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const MAX_BUFFER_SIZE = 1000; // prevent unbounded buffer growth
const STALE_THRESHOLD_MS = 300_000; // 5 min — drop stale ticks

export function useLivePrices(symbols: Set<string>) {
  const [livePrices, setLivePrices] = useState<Map<string, LiveTick>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef<Map<string, LiveTick>>(new Map());
  const symbolsRef = useRef(symbols);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined!);
  const flushTimerRef = useRef<ReturnType<typeof setInterval>>(undefined!);
  const mountedRef = useRef(true);

  symbolsRef.current = symbols;

  // Flush buffered ticks to React state at a throttled interval
  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const buf = bufferRef.current;
      if (buf.size === 0) return;
      const now = Date.now();
      setLivePrices((prev) => {
        const next = new Map(prev);
        buf.forEach((tick, sym) => next.set(sym, tick));
        buf.clear();
        // Prune stale ticks that haven't been updated in 5 minutes
        if (next.size > 0) {
          for (const [sym, tick] of next) {
            if (now - tick.updatedAt > STALE_THRESHOLD_MS) next.delete(sym);
          }
        }
        return next;
      });
    }, FLUSH_INTERVAL_MS);

    return () => clearInterval(flushTimerRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const tickers: BinanceMiniTicker[] = JSON.parse(event.data);
          const now = Date.now();
          const tracked = symbolsRef.current;

          for (const t of tickers) {
            if (!tracked.has(t.s)) continue;
            const close = parseFloat(t.c);
            const open = parseFloat(t.o);
            if (!Number.isFinite(close) || close <= 0) continue;
            const change24h = Number.isFinite(open) && open > 0
              ? Math.round(((close - open) / open) * 10000) / 100
              : 0;
            const volume = parseFloat(t.q);
            bufferRef.current.set(t.s, {
              price: close,
              change24h,
              volume24h: Number.isFinite(volume) ? volume : 0,
              updatedAt: now,
            });
            // Cap buffer size to prevent memory issues if symbols set is huge
            if (bufferRef.current.size > MAX_BUFFER_SIZE) break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        const delay = RECONNECT_DELAYS[
          Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
        ];
        reconnectAttemptRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      const delay = RECONNECT_DELAYS[
        Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
      ];
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      clearInterval(flushTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { livePrices, isConnected };
}
