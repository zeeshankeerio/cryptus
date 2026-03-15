'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

export interface LiveTick {
  price: number;
  change24h: number;
  volume24h: number;
  updatedAt: number;
  tickDelta?: number;
  // shadowed indicators
  rsi1m?: number;
  rsi5m?: number;
  rsi15m?: number;
  rsi1h?: number;
  rsiCustom?: number;
  ema9?: number;
  ema21?: number;
  emaCross?: 'bullish' | 'bearish' | 'none';
  macdHistogram?: number;
  bbPosition?: number;
  strategyScore?: number;
  strategySignal?: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';
}

/**
 * RSIQ PRO Event-Based Price Engine
 * This allows individual components to subscribe to ticker updates for a specific symbol.
 * This is the ONLY way to handle 600+ live coins in React without parent-level re-render storms.
 */
class PriceTickEngine extends EventTarget {
  private prices = new Map<string, LiveTick>();
  private worker: Worker | null = null;
  private symbols = new Set<string>();
  private virtualPollInterval: any = null;
  private exchange: string = 'binance';

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crypto-rsi-exchange');
      if (saved) {
        console.log(`[PriceEngine] Restoring exchange: ${saved}`);
        this.exchange = saved;
      }
    }
  }

  start(initialSymbols: Set<string>) {
    if (typeof window === 'undefined' || this.worker) return;
    this.symbols = initialSymbols;

    this.worker = new Worker('/ticker-worker.js');

    this.worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'TICKS') {
        const batch = new Map<string, LiveTick>();
        payload.forEach(([sym, tick]: [string, LiveTick]) => {
          this.prices.set(sym, tick);
          batch.set(sym, tick);
          this.dispatchEvent(new CustomEvent(`tick:${sym}`, { detail: tick }));
        });
        this.dispatchEvent(new CustomEvent('ticks', { detail: batch }));
      } else if (type === 'ALERT_TRIGGERED') {
        this.dispatchEvent(new CustomEvent('alert', { detail: payload }));
      } else if (type === 'PRIORITY_SYNC') {
        this.dispatchEvent(new CustomEvent('priority-sync', { detail: payload }));
      }
    };

    this.worker.postMessage({
      type: 'START',
      payload: { 
        symbols: Array.from(this.symbols), 
        flushInterval: 300,
        exchange: this.exchange
      }
    });

    // ── Virtual Market Emulation (Indices/CFDs) ──
    // Pull fresh data for assets not in Binance WebSocket (Yahook symbols)
    this.startVirtualPolling();
  }

  private startVirtualPolling() {
    if (this.virtualPollInterval) return;
    
    this.virtualPollInterval = setInterval(async () => {
      if (this.exchange !== 'binance') return;
      const yahooSymbols = Array.from(this.symbols).filter(s => 
        ['SPX', 'NDAQ', 'DOW', 'SILVER', 'FTSE', 'DAX', 'NKY'].includes(s)
      );
      if (yahooSymbols.length === 0) return;

      try {
        // We can use the screener API itself to get the latest cached entry for these
        const res = await fetch(`/api/screener?symbolCount=100`); 
        if (!res.ok) return;
        const json = await res.json();
        const data = json.data as any[];

        yahooSymbols.forEach(sym => {
          const entry = data.find(e => e.symbol === sym);
          if (entry && this.worker) {
            this.worker.postMessage({
              type: 'VIRTUAL_TICKET',
              payload: {
                s: sym,
                c: entry.price,
                o: entry.price, // simple emulation
                q: entry.volume24h
              }
            });
          }
        });
      } catch (e) {
        console.warn('[price-engine] virtual poll failed', e);
      }
    }, 5000); // 5s poll for indices is plenty for RSI
  }

  updateSymbols(newSymbols: Set<string>) {
    this.symbols = newSymbols;
    if (this.worker) {
      this.worker.postMessage({
        type: 'UPDATE_SYMBOLS',
        payload: { symbols: Array.from(this.symbols) }
      });
    }
  }

  setExchange(exchange: string) {
    if (this.exchange === exchange) return;
    this.exchange = exchange;
    
    // Clear UI-side price cache to avoid "flash" of previous exchange data
    this.prices.clear();
    
    localStorage.setItem('crypto-rsi-exchange', exchange);
    if (this.worker) {
      this.worker.postMessage({
        type: 'SET_EXCHANGE',
        payload: { exchange }
      });
    }
  }

  getExchange() {
    return this.exchange;
  }

  getLatest(symbol: string): LiveTick | undefined {
    return this.prices.get(symbol);
  }

  syncStates(data: { configs?: Record<string, any>, rsiStates?: Record<string, any> }) {
    if (this.worker) {
      this.worker.postMessage({ type: 'SYNC_STATES', payload: data });
    }
  }

  /** Post any typed message directly to the worker (for fast-path updates like SYNC_CONFIG_FAST, UPDATE_PERIOD) */
  postToWorker(message: { type: string; payload?: any }) {
    if (this.worker) {
      this.worker.postMessage(message);
    }
  }

  stop() {
    if (this.virtualPollInterval) {
      clearInterval(this.virtualPollInterval);
      this.virtualPollInterval = null;
    }
    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
const engine = new PriceTickEngine();

if (typeof window !== 'undefined') {
  (window as any).__priceEngine = engine;
}

export function useLivePrices(symbols: Set<string>, throttleMs: number = 1000) {
  const [isConnected, setIsConnected] = useState(false);
  const [livePrices, setLivePrices] = useState<Map<string, LiveTick>>(new Map());
  const [exchange, setExchangeState] = useState<string>(() => engine.getExchange());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    engine.start(symbols);
    setIsConnected(true);

    let lastUpdate = Date.now();
    let pendingBatch = new Map<string, LiveTick>();
    let previousPricesObj = new Map<string, number>();

    const handleBatch = (e: Event) => {
      if (!mountedRef.current) return;
      const detail = (e as CustomEvent).detail as Map<string, LiveTick>;
      
      // Accumulate
      detail.forEach((tick, sym) => {
        const prevPrice = previousPricesObj.get(sym);
        let tickDelta = prevPrice ? tick.price - prevPrice : 0;
        
        if (tick.price !== prevPrice) {
          previousPricesObj.set(sym, tick.price);
        } else {
          // If the price is the same, keep the previous tick delta so we don't clear the direction
          const existing = pendingBatch.get(sym);
          if (existing && existing.tickDelta) {
            tickDelta = existing.tickDelta;
          }
        }

        pendingBatch.set(sym, { ...tick, tickDelta });
      });

      const now = Date.now();
      if (now - lastUpdate >= throttleMs) {
        setLivePrices(new Map(pendingBatch));
        lastUpdate = now;
      }
    };

    const handleWorkerMessage = (e: MessageEvent) => {
      if (!mountedRef.current) return;
      const { type, payload } = e.data;
      if (type === 'ALERT_TRIGGERED') {
        engine.dispatchEvent(new CustomEvent('worker-alert', { detail: payload }));
      } else if (type === 'PRIORITY_SYNC') {
        engine.dispatchEvent(new CustomEvent('priority-sync', { detail: payload }));
      }
    };

    engine.addEventListener('ticks', handleBatch);
    if ((engine as any).worker) {
        (engine as any).worker.addEventListener('message', handleWorkerMessage);
    }

    return () => {
      mountedRef.current = false;
      engine.removeEventListener('ticks', handleBatch);
      if ((engine as any).worker) {
          (engine as any).worker.removeEventListener('message', handleWorkerMessage);
      }
    };
  }, []);

  useEffect(() => {
    engine.updateSymbols(symbols);
  }, [symbols]);

  return { 
    isConnected, 
    livePrices, 
    syncStates: (d: any) => engine.syncStates(d),
    exchange,
    setExchange: (e: string) => {
      engine.setExchange(e);
      setExchangeState(e);
    },
    updateSymbols: (s: Set<string>) => engine.updateSymbols(s),
    postToWorker: (m: any) => engine.postToWorker(m)
  };
}

/**
 * Hook for individual rows to subscribe to their own updates.
 * ZERO parent-level re-renders.
 * Now supports an 'enabled' flag for viewport-aware optimizations.
 */
export function useSymbolPrice(symbol: string, initialPrice: number = 0, enabled: boolean = true) {
  const [tick, setTick] = useState<LiveTick | null>(() => engine.getLatest(symbol) || null);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTick(detail);
    };

    engine.addEventListener(`tick:${symbol}`, handler);
    // Grab latest once in case it updated during mount or while disabled
    const latest = engine.getLatest(symbol);
    if (latest) setTick(latest);

    return () => engine.removeEventListener(`tick:${symbol}`, handler);
  }, [symbol, enabled]);

  return tick;
}
