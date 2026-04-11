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
  volumeSpike?: boolean;
  curCandleSize?: number;
  curCandleVol?: number;
  avgBarSize1m?: number;
  avgVolume1m?: number;
  candleDirection?: 'bullish' | 'bearish';
}

/**
 * RSIQ PRO Event-Based Price Engine
 * This allows individual components to subscribe to ticker updates for a specific symbol.
 * This is the ONLY way to handle 600+ live coins in React without parent-level re-render storms.
 */
class PriceTickEngine extends EventTarget {
  private prices = new Map<string, LiveTick>();
  private worker: Worker | SharedWorker | null = null;
  private port: MessagePort | null = null;
  private symbols = new Set<string>();
  private virtualPollInterval: any = null;
  private exchange: string = 'binance';
  private isMasterTab: boolean = false;

  constructor() {
    super();
    this.electMaster();
  }

  // ── Master Election (Web Locks API) ──────────────────────────
  // Ensures only one tab handles "UI side effects" like sounds/toasts.
  private async electMaster() {
    if (typeof navigator === 'undefined' || !navigator.locks) {
      this.isMasterTab = true; // Fallback
      return;
    }

    try {
      while (true) {
        await navigator.locks.request('rsiq_ui_master', async (lock) => {
          this.isMasterTab = true;
          console.log('[PriceEngine] Elected as UI MASTER');
          this.dispatchEvent(new CustomEvent('master-status', { detail: true }));
          
          // Keep the lock as long as the tab is alive
          await new Promise((resolve) => {
             window.addEventListener('unload', resolve, { once: true });
          });
          this.isMasterTab = false;
        });
        // If we lose the lock, wait a bit and try to re-acquire
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      this.isMasterTab = true; // Safe fallback
    }
  }

  // Hydrate from localStorage on client side only
  hydrate() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crypto-rsi-exchange');
      if (saved) {
        console.log(`[PriceEngine] Restored exchange: ${saved}`);
        this.exchange = saved;
      }
    }
    return this.exchange;
  }

  start(initialSymbols: Set<string>) {
    if (typeof window === 'undefined' || this.worker) return;
    this.symbols = initialSymbols;

    // ── SharedWorker Migration ──
    const workerUrl = '/ticker-worker.js';
    try {
      if (typeof SharedWorker !== 'undefined') {
        const sw = new SharedWorker(workerUrl, 'rsiq-ticker-v4');
        this.worker = sw;
        this.port = sw.port;
        this.port.start();
        console.log('[PriceEngine] Connected via SharedWorker');
      } else {
        const w = new Worker(workerUrl);
        this.worker = w;
        this.port = w as unknown as MessagePort; // Polyfill-like behavior for dedicated worker
        console.log('[PriceEngine] Connected via Dedicated Worker (SharedWorker not supported)');
      }
    } catch (e) {
      console.error('[PriceEngine] Worker initialization failed', e);
      return;
    }

    if (!this.port) return;

    this.port.onmessage = (e) => {
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
        // Only broadcast to UI if we are the Master Tab to avoid double sounds
        if (this.isMasterTab) {
          this.dispatchEvent(new CustomEvent('alert', { detail: payload }));
        }
      } else if (type === 'PRIORITY_SYNC') {
        this.dispatchEvent(new CustomEvent('priority-sync', { detail: payload }));
      }
    };

    this.postToWorker({
      type: 'START',
      payload: { 
        symbols: Array.from(this.symbols), 
        flushInterval: 300,
        exchange: this.exchange
      }
    });

    // ── Visibility Wake-up Logic ──
    if (typeof document !== 'undefined') {
      const handleVisibility = () => {
        const visible = document.visibilityState === 'visible';
        if (visible) {
          console.log('[PriceEngine] App visible, signaling worker to resume...');
          this.postToWorker({ type: 'RESUME' });
        }
        this.postToWorker({ type: 'VISIBILITY_CHANGE', payload: { visible } });
      };

      document.addEventListener('visibilitychange', handleVisibility);
      // Send initial state
      handleVisibility();
    }

    this.startVirtualPolling();
  }

  private startVirtualPolling() {
    if (this.virtualPollInterval) return;
    
    this.virtualPollInterval = setInterval(async () => {
      // Yahoo symbols: poll for indices that don't have a WebSocket source (Binance only)
      if (this.exchange === 'binance') {
        const yahooSymbols = Array.from(this.symbols).filter(s => 
          ['SPX', 'NDAQ', 'DOW', 'SILVER', 'FTSE', 'DAX', 'NKY'].includes(s)
        );
        if (yahooSymbols.length > 0) {
          await this.pollSymbolsViaRest(yahooSymbols, 'binance');
        }
      }

      // Bybit Spot: WS is limited to ~30 subscriptions, so poll REST for remaining visible symbols
      if (this.exchange === 'bybit') {
        try {
          const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot`, {
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
          });
          if (!res.ok) return;
          const payload = await res.json();
          const rows = payload.result?.list ?? [];
          
          for (const row of rows) {
            if (!row.symbol.endsWith('USDT')) continue;
            if (!this.symbols.has(row.symbol)) continue;
            
            const price = parseFloat(row.lastPrice);
            if (!Number.isFinite(price) || price <= 0) continue;
            
            // Only inject for symbols NOT already covered by WebSocket
            const existing = this.prices.get(row.symbol);
            const staleMs = existing ? Date.now() - existing.updatedAt : Infinity;
            if (staleMs < 3000) continue; // Skip if WS data is fresh
            
            this.postToWorker({
              type: 'VIRTUAL_TICKET',
              payload: {
                s: row.symbol,
                c: price,
                o: parseFloat(row.prevPrice24h) || price,
                q: parseFloat(row.turnover24h) || 0,
                exchange: 'bybit'
              }
            });
          }
        } catch (e) {
          console.warn('[price-engine] Bybit Spot REST poll failed', e);
        }
      }
    }, 5000); // 5s poll cycle
  }
  
  private async pollSymbolsViaRest(symbols: string[], exchange: string) {
    try {
      const count = Math.max(100, this.symbols.size);
      const freshnessTs = Date.now();
      const res = await fetch(`/api/screener?count=${count}&exchange=${exchange}&ts=${freshnessTs}`, {
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
          pragma: 'no-cache',
        },
      }); 
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data as any[];

      symbols.forEach(sym => {
        const entry = data.find((e: any) => e.symbol === sym);
        if (entry) {
          this.postToWorker({
            type: 'VIRTUAL_TICKET',
            payload: {
              s: sym,
              c: entry.price,
              o: entry.price,
              q: entry.volume24h,
              exchange
            }
          });
        }
      });
    } catch (e) {
      console.warn('[price-engine] REST poll failed', e);
    }
  }

  updateSymbols(newSymbols: Set<string>) {
    this.symbols = newSymbols;
    this.postToWorker({
      type: 'UPDATE_SYMBOLS',
      payload: { symbols: Array.from(this.symbols) }
    });
  }

  setExchange(exchange: string) {
    if (this.exchange === exchange) return;
    const prevExchange = this.exchange;
    this.exchange = exchange;
    
    // Clear UI-side price cache to avoid "flash" of previous exchange data
    this.prices.clear();
    
    localStorage.setItem('crypto-rsi-exchange', exchange);
    this.postToWorker({
      type: 'SET_EXCHANGE',
      payload: { exchange }
    });

    // Notify alert engine to reset zone states for clean exchange isolation
    this.dispatchEvent(new CustomEvent('exchange-changed', {
      detail: { from: prevExchange, to: exchange }
    }));
  }

  getExchange() {
    return this.exchange;
  }

  getIsMaster() {
    return this.isMasterTab;
  }

  getLatest(symbol: string): LiveTick | undefined {
    return this.prices.get(symbol);
  }

  getLatestBatch(symbols?: Set<string>): Map<string, LiveTick> {
    if (!symbols || symbols.size === 0) return new Map(this.prices);
    const next = new Map<string, LiveTick>();
    symbols.forEach((sym) => {
      const tick = this.prices.get(sym);
      if (tick) next.set(sym, tick);
    });
    return next;
  }

  syncStates(data: { 
    configs?: Record<string, any>, 
    rsiStates?: Record<string, any>, 
    alertsEnabled?: boolean,
    globalLongCandleThreshold?: number,
    globalVolumeSpikeThreshold?: number,
    globalVolatilityEnabled?: boolean,
    enabledIndicators?: Record<string, boolean>
  }) {
    this.postToWorker({ type: 'SYNC_STATES', payload: data });
  }

  /** Post any typed message directly to the worker (for fast-path updates like SYNC_CONFIG_FAST, UPDATE_PERIOD) */
  postToWorker(message: { type: string; payload?: any }) {
    if (this.port) {
      this.port.postMessage(message);
    }
  }

  stop() {
    if (this.virtualPollInterval) {
      clearInterval(this.virtualPollInterval);
      this.virtualPollInterval = null;
    }
    if (this.worker) {
      this.postToWorker({ type: 'STOP' });
      if (this.worker instanceof Worker) {
        this.worker.terminate();
      } else if (this.port) {
        this.port.close();
      }
      this.worker = null;
      this.port = null;
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
  const [livePrices, setLivePrices] = useState<Map<string, LiveTick>>(() => engine.getLatestBatch(symbols));
  const [exchange, setExchangeState] = useState<string>(() => {
    if (typeof window === 'undefined') return 'binance';
    return engine.hydrate();
  });
  const mountedRef = useRef(true);
  const throttleRef = useRef(Math.max(80, throttleMs));

  useEffect(() => {
    throttleRef.current = Math.max(80, throttleMs);
  }, [throttleMs]);

  useEffect(() => {
    mountedRef.current = true;

    // 1. Start engine
    engine.start(symbols);
    setIsConnected(true);

    // 2. Warm React state immediately from worker cache for instant first paint
    const warm = engine.getLatestBatch(symbols);
    if (warm.size > 0) {
      setLivePrices(warm);
    }

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
      const throttle = throttleRef.current;
      if (now - lastUpdate >= throttle) {
        setLivePrices(new Map(pendingBatch));
        lastUpdate = now;
      }
    };

    // Periodic flush: ensures accumulated ticks reach React state even when
    // the WebSocket goes quiet between batches (e.g. low-volatility periods).
    const flushTimer = setInterval(() => {
      if (!mountedRef.current || pendingBatch.size === 0) return;
      const now = Date.now();
      const throttle = throttleRef.current;
      if (now - lastUpdate >= throttle) {
        setLivePrices(new Map(pendingBatch));
        lastUpdate = now;
      }
    }, 80);

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
      clearInterval(flushTimer);
      engine.removeEventListener('ticks', handleBatch);
      if ((engine as any).worker) {
          (engine as any).worker.removeEventListener('message', handleWorkerMessage);
      }
    };
  }, []);

  useEffect(() => {
    engine.updateSymbols(symbols);
    const warm = engine.getLatestBatch(symbols);
    if (warm.size > 0) setLivePrices(warm);
  }, [symbols]);

  const [isMaster, setIsMaster] = useState(engine.getIsMaster());

  useEffect(() => {
    const handleMaster = (e: Event) => setIsMaster((e as CustomEvent).detail);
    engine.addEventListener('master-status', handleMaster);
    return () => engine.removeEventListener('master-status', handleMaster);
  }, []);

  return { 
    isConnected, 
    isMaster,
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
