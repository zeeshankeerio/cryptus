'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';

export interface LiveTick {
  price: number;
  change24h: number;
  volume24h: number;
  updatedAt: number;
  tickDelta?: number;
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
          // Dispatch a specific event for this symbol (for individual rows)
          this.dispatchEvent(new CustomEvent(`tick:${sym}`, { detail: tick }));
        });
        // Dispatch batch event (for background alert engine)
        this.dispatchEvent(new CustomEvent('ticks', { detail: batch }));
      }
    };

    this.worker.postMessage({
      type: 'START',
      payload: { symbols: Array.from(this.symbols), flushInterval: 800 }
    });
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

  getLatest(symbol: string): LiveTick | undefined {
    return this.prices.get(symbol);
  }

  syncStates(data: { configs?: Record<string, any>, rsiStates?: Record<string, any> }) {
    if (this.worker) {
      this.worker.postMessage({ type: 'SYNC_STATES', payload: data });
    }
  }

  stop() {
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

  return { isConnected, livePrices, syncStates: (d: any) => engine.syncStates(d) };
}

/**
 * Hook for individual rows to subscribe to their own updates.
 * ZERO parent-level re-renders.
 */
export function useSymbolPrice(symbol: string, initialPrice: number = 0) {
  const [tick, setTick] = useState<LiveTick | null>(() => engine.getLatest(symbol) || null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTick(detail);
    };

    engine.addEventListener(`tick:${symbol}`, handler);
    // Grab latest once in case it updated during mount
    const latest = engine.getLatest(symbol);
    if (latest) setTick(latest);

    return () => engine.removeEventListener(`tick:${symbol}`, handler);
  }, [symbol]);

  return tick;
}
