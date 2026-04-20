'use client';

import { useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { FOREX_SYMBOLS, METALS_SYMBOLS, STOCKS_SYMBOLS } from '@/lib/asset-classes';

export interface LiveTick {
  price: number;
  change24h: number;
  volume24h: number;
  updatedAt: number;
  tickDelta?: number;
  isStale?: boolean;
  latencyMs?: number;
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
  stochK?: number;
  stochD?: number;
  vwapDiff?: number;
  bbPosition?: number;
  bbUpper?: number;
  bbLower?: number;
  bbMiddle?: number;
  vwap?: number;
  momentum?: number;
  rsiDivergence?: 'bullish' | 'bearish' | 'none';
  confluence?: number;
  confluenceLabel?: string;
  rsiDivergenceCustom?: 'bullish' | 'bearish' | 'none';
  rsiCrossover?: 'bullish_reversal' | 'bearish_reversal' | 'none';
  atr?: number;
  adx?: number;
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
  private heartbeatInterval: any = null;
  // Stored so they can be removed on stop() — prevents listener accumulation
  private handleVisibility: (() => void) | null = null;
  private handleOnline: (() => void) | null = null;

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
        // If we lose the lock, wait a bit and try to re-acquire (faster handover)
        await new Promise(r => setTimeout(r, 100));
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
        this.port = null;
        console.log('[PriceEngine] Connected via Dedicated Worker (PWA Fallback)');
      }
    } catch (e) {
      console.error('[PriceEngine] Worker initialization failed', e);
      return;
    }

    const messagingEndpoint = this.port || this.worker;
    if (!messagingEndpoint) return;

    (messagingEndpoint as any).onmessage = (e: any) => {
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
        if (this.isMasterTab) {
          this.dispatchEvent(new CustomEvent('alert', { detail: payload }));
        }
      } else if (type === 'PRIORITY_SYNC') {
        this.dispatchEvent(new CustomEvent('priority-sync', { detail: payload }));
      } else if (type === 'RECALIBRATE_REQUEST') {
        console.log('[PriceEngine] Worker requested recalibration. Refreshing seeds...');
        this.triggerRecalibration();
      }
    };

    this.postToWorker({
      type: 'START',
      payload: {
        symbols: Array.from(this.symbols),
        flushInterval: 50, // Fixed 50ms for consistent rhythm
        exchange: this.exchange
      }
    });

    // ── Visibility Wake-up Logic ──
    // Store handlers so they can be removed on stop()
    if (typeof document !== 'undefined') {
      this.handleVisibility = () => {
        const visible = document.visibilityState === 'visible';
        if (visible) {
          console.log('[PriceEngine] App visible, signaling worker to resume...');
          this.postToWorker({ type: 'RESUME' });
          const warmBatch = new Map<string, LiveTick>();
          this.prices.forEach((tick, sym) => {
            warmBatch.set(sym, tick);
            this.dispatchEvent(new CustomEvent(`tick:${sym}`, { detail: tick }));
          });
          if (warmBatch.size > 0) {
            this.dispatchEvent(new CustomEvent('ticks', { detail: warmBatch }));
          }
        }
        this.postToWorker({ type: 'VISIBILITY_CHANGE', payload: { visible } });
      };
      document.addEventListener('visibilitychange', this.handleVisibility);
      this.handleVisibility();
    }

    // ── Network Recovery Logic (PWA Critical) ──
    if (typeof window !== 'undefined') {
      this.handleOnline = () => {
        console.log('[PriceEngine] Network restored, force-resuming worker...');
        this.postToWorker({ type: 'RESUME' });
      };
      window.addEventListener('online', this.handleOnline);
    }

    this.startVirtualPolling();
    this.startSessionHeartbeat();
  }

  private startVirtualPolling() {
    if (this.virtualPollInterval) return;

    this.virtualPollInterval = setInterval(async () => {
      // PERFORMANCE: Skip polling when document is hidden to save CPU/network
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      // Yahoo symbols: poll for indices that don't have a WebSocket source (Binance only)
      if (this.exchange === 'binance') {
        const knownYahoo = new Set([
          'SPX', 'NDAQ', 'DOW', 'SILVER', 'FTSE', 'DAX', 'NKY',
          ...FOREX_SYMBOLS.map(s => s.yahoo),
          ...METALS_SYMBOLS.map(s => s.yahoo),
          ...STOCKS_SYMBOLS.map(s => s.yahoo),
        ]);
        const yahooSymbols = Array.from(this.symbols).filter(s => knownYahoo.has(s));
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

  private async triggerRecalibration() {
    try {
      // Trigger SWR mutation to fetch fresh indicators from the server
      const searchParams = new URLSearchParams({
        count: Math.max(100, this.symbols.size).toString(),
        exchange: this.exchange,
        smartMode: '1'
      });
      const url = `/api/screener?${searchParams.toString()}`;
      
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      
      // Extract fresh seeds and sync them to the worker
      const rsiStates: Record<string, any> = {};
      const configs: Record<string, any> = {};
      
      json.data.forEach((entry: any) => {
        if (entry.rsiState1m) {
          rsiStates[entry.symbol] = {
            rsiState1m: entry.rsiState1m,
            rsiState5m: entry.rsiState5m,
            rsiState15m: entry.rsiState15m,
            rsiState1h: entry.rsiState1h,
            rsiStateCustom: entry.rsiStateCustom,
            ema9State: entry.ema9State,
            ema21State: entry.ema21State,
            macdFastState: entry.macdFastState,
            macdSlowState: entry.macdSlowState,
            macdSignalState: entry.macdSignalState,
            avgBarSize1m: entry.avgBarSize1m,
            avgVolume1m: entry.avgVolume1m,
            open1m: entry.open1m,
            volStart1m: entry.volStart1m,
            bbUpper: entry.bbUpper,
            bbLower: entry.bbLower,
            vwapPriceBaseline: entry.vwapPriceBaseline,
            momentumPriceBaseline: entry.momentumPriceBaseline,
            stochK: entry.stochK,
            stochD: entry.stochD,
            confluence: entry.confluence,
            rsiDivergence: entry.rsiDivergence,
          };
        }
      });

      this.syncStates({ rsiStates });
      console.log(`[PriceEngine] Recalibrated ${Object.keys(rsiStates).length} symbols.`);
    } catch (e) {
      console.warn('[PriceEngine] Recalibration failed', e);
    }
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
              o: entry.price / (1 + (entry.change24h / 100)),
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

  // ── Session Heartbeat (Smart Tech: No Break Feed) ──
  private startSessionHeartbeat() {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Use authClient to ping status silently. This keeps the session cookie fresh.
        const { authClient } = await import("@/lib/auth-client");
        await authClient.getSession();
        console.log('[PriceEngine] Session heartbeat successful');
      } catch (e) {
        console.warn('[PriceEngine] Session heartbeat failed');
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private stopSessionHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
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
    // this.port is always set for SharedWorker (MessagePort), null for DedicatedWorker
    // this.worker for DedicatedWorker is a Worker (has postMessage)
    // We never call postMessage on a raw SharedWorker — only on its .port
    const endpoint: MessagePort | Worker | null = this.port || (this.worker instanceof Worker ? this.worker : null);
    if (endpoint) {
      endpoint.postMessage(message);
    }
  }

  stop() {
    if (this.virtualPollInterval) {
      clearInterval(this.virtualPollInterval);
      this.virtualPollInterval = null;
    }
    // Remove global event listeners to prevent accumulation
    if (this.handleVisibility && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
      this.handleVisibility = null;
    }
    if (this.handleOnline && typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      this.handleOnline = null;
    }
    if (this.worker) {
      this.postToWorker({ type: 'STOP' });
      if (this.worker instanceof Worker) {
        this.worker.terminate();
      } else if (this.port) {
        this.port.close();
      }
      this.stopSessionHeartbeat();
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

export function useLivePrices(symbols: Set<string>, throttleMs: number = 300) {
  const [isConnected, setIsConnected] = useState(false);
  const [livePrices, setLivePrices] = useState<Map<string, LiveTick>>(() => engine.getLatestBatch(symbols));
  const [exchange, setExchangeState] = useState<string>(() => {
    if (typeof window === 'undefined') return 'binance';
    return engine.hydrate();
  });
  const mountedRef = useRef(true);
  const throttleRef = useRef(Math.max(50, throttleMs)); // Fixed at 50ms to match worker flush interval

  useEffect(() => {
    throttleRef.current = Math.max(50, throttleMs); // Fixed at 50ms to match worker flush interval
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
        pendingBatch.clear();
      }
    };

    // Periodic flush: ensures accumulated ticks reach React state even when
    // the WebSocket goes quiet between batches (e.g. low-volatility periods).
    // CRITICAL: Synchronized with worker's flush interval (50ms) for consistent rhythm
    // This alignment eliminates stuttering and perceived freezes
    const flushTimer = setInterval(() => {
      if (!mountedRef.current || pendingBatch.size === 0) return;
      const now = Date.now();
      const throttle = throttleRef.current;
      if (now - lastUpdate >= throttle) {
        setLivePrices(new Map(pendingBatch));
        lastUpdate = now;
        pendingBatch.clear();
      }
    }, 50); // Aligned with worker's 50ms flush interval for consistent rhythm

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

    // Attach message listener for alerts/sync regardless of SharedWorker status
    const messaging = (engine as any).port || (engine as any).worker;
    if (messaging) {
      messaging.addEventListener('message', handleWorkerMessage);
    }

    return () => {
      mountedRef.current = false;
      clearInterval(flushTimer);
      engine.removeEventListener('ticks', handleBatch);
      if (messaging) {
        messaging.removeEventListener('message', handleWorkerMessage);
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
