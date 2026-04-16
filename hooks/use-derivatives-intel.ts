'use client';

/**
 * RSIQ Pro — Derivatives Intelligence Hook
 * 
 * Connects the derivatives-worker to React components.
 * Provides real-time funding rates, liquidations, whale alerts,
 * order flow, open interest, and the unique Smart Money Pressure Index.
 *
 * Architecture:
 *  - Singleton worker pattern (same as PriceTickEngine)
 *  - Event-driven updates to prevent re-render storms
 *  - Lazy initialization — worker only starts when hook is first called
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { computeAllSmartMoney } from '@/lib/smart-money';
import type {
  FundingRateData,
  LiquidationEvent,
  WhaleTradeEvent,
  OrderFlowData,
  OpenInterestData,
  SmartMoneyPressure,
} from '@/lib/derivatives-types';
import { getSymbolAlias } from '@/lib/symbol-utils';
import { formatPrice } from '@/lib/utils';

// ── Singleton Worker Instance ────────────────────────────────────

let derivativesWorker: Worker | null = null;
let workerStarted = false;

function getOrCreateWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (derivativesWorker) return derivativesWorker;

  try {
    derivativesWorker = new Worker('/derivatives-worker.js');
    console.log('[DerivativesIntel] Worker created');
    return derivativesWorker;
  } catch (e) {
    console.error('[DerivativesIntel] Failed to create worker:', e);
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────

export function useDerivativesIntel(symbols: Set<string>, enabled: boolean = true) {
  const [fundingRates, setFundingRates] = useState<Map<string, FundingRateData>>(new Map());
  const [liquidations, setLiquidations] = useState<LiquidationEvent[]>([]);
  const [whaleAlerts, setWhaleAlerts] = useState<WhaleTradeEvent[]>([]);
  const [orderFlow, setOrderFlow] = useState<Map<string, OrderFlowData>>(new Map());
  const [openInterest, setOpenInterest] = useState<Map<string, OpenInterestData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Smart Money Pressure — computed from all the raw signals
  const smartMoney = useMemo(() => {
    if (!enabled || fundingRates.size === 0) return new Map<string, SmartMoneyPressure>();

    return computeAllSmartMoney(
      Array.from(symbols),
      fundingRates,
      liquidations,
      whaleAlerts,
      orderFlow
    );
  }, [symbols, fundingRates, liquidations, whaleAlerts, orderFlow, enabled]);

  // ── Worker Lifecycle ──────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;

    const worker = getOrCreateWorker();
    if (!worker) return;

    const handleMessage = (e: MessageEvent) => {
      if (!mountedRef.current || !enabledRef.current) return;
      const { type, payload } = e.data;

      switch (type) {
        case 'CONNECTED':
          setIsConnected(true);
          break;

        case 'DISCONNECTED':
          setIsConnected(false);
          break;

        case 'FUNDING_UPDATE': {
          const entries = payload as [string, FundingRateData][];
          setFundingRates(prev => {
            const next = new Map(prev);
            for (const [sym, data] of entries) {
              next.set(sym, data);
            }
            return next;
          });
          break;
        }

        case 'LIQUIDATION': {
          const liq = payload as LiquidationEvent;
          setLiquidations(prev => {
            const next = [...prev, liq];
            return next.length > 100 ? next.slice(-100) : next;
          });

          // Toast for large liquidations ($50K+)
          if (liq.valueUsd >= 50000 && document.visibilityState === 'visible') {
            const sizeStr = liq.valueUsd >= 1000000
              ? `$${(liq.valueUsd / 1000000).toFixed(1)}M`
              : `$${Math.round(liq.valueUsd / 1000)}K`;
            const isLong = liq.side === 'Sell'; // Sell-side = long liquidated
            toast[isLong ? 'error' : 'success'](
              `💀 ${isLong ? 'LONG' : 'SHORT'} Liquidated — ${getSymbolAlias(liq.symbol)}`,
              {
                description: `${sizeStr} @ $${formatPrice(liq.price)} [${liq.exchange}]`,
                duration: 4000,
              }
            );
          }
          break;
        }

        case 'WHALE_TRADE': {
          const whale = payload as WhaleTradeEvent;
          setWhaleAlerts(prev => {
            const next = [...prev, whale];
            return next.length > 50 ? next.slice(-50) : next;
          });

          // Toast for significant whale trades ($250K+)
          if (whale.valueUsd >= 250000 && document.visibilityState === 'visible') {
            const sizeStr = whale.valueUsd >= 1000000
              ? `$${(whale.valueUsd / 1000000).toFixed(1)}M`
              : `$${Math.round(whale.valueUsd / 1000)}K`;
            const isBuy = whale.side === 'buy';
            toast[isBuy ? 'success' : 'error'](
              `🐋 WHALE ${isBuy ? 'BUY' : 'SELL'} — ${getSymbolAlias(whale.symbol)}`,
              {
                description: `${sizeStr} @ $${formatPrice(whale.price)} [${whale.exchange}]`,
                duration: 5000,
              }
            );
          }
          break;
        }

        case 'ORDER_FLOW_UPDATE': {
          const entries = payload as [string, OrderFlowData][];
          setOrderFlow(prev => {
            const next = new Map(prev);
            for (const [sym, data] of entries) {
              next.set(sym, data);
            }
            return next;
          });
          break;
        }

        case 'OI_UPDATE': {
          const entries = payload as [string, OpenInterestData][];
          setOpenInterest(prev => {
            const next = new Map(prev);
            for (const [sym, data] of entries) {
              next.set(sym, data);
            }
            return next;
          });
          break;
        }
      }
    };

    worker.addEventListener('message', handleMessage);

    // Start worker if not already started
    if (!workerStarted) {
      worker.postMessage({
        type: 'START',
        payload: { symbols: Array.from(symbols) }
      });
      workerStarted = true;
    } else {
      // Update symbols if worker is already running
      worker.postMessage({
        type: 'UPDATE_SYMBOLS',
        payload: { symbols: Array.from(symbols) }
      });
    }

    return () => {
      mountedRef.current = false;
      worker.removeEventListener('message', handleMessage);
    };
  }, [enabled]); // Only re-attach on enabled change

  // Update symbols when they change
  useEffect(() => {
    if (!enabled || !derivativesWorker) return;
    derivativesWorker.postMessage({
      type: 'UPDATE_SYMBOLS',
      payload: { symbols: Array.from(symbols) }
    });
  }, [symbols, enabled]);

  return {
    fundingRates,
    liquidations,
    whaleAlerts,
    orderFlow,
    openInterest,
    smartMoney,
    isConnected,
  };
}

// ── Per-Symbol Hook (for ScreenerCard) ───────────────────────────
// Lightweight hook to get derivatives data for a single symbol
// without subscribing to all updates

export function useSymbolDerivatives(symbol: string, enabled: boolean = true) {
  const [funding, setFunding] = useState<FundingRateData | null>(null);
  const [flow, setFlow] = useState<OrderFlowData | null>(null);
  const [pressure, setPressure] = useState<SmartMoneyPressure | null>(null);

  useEffect(() => {
    if (!enabled || !derivativesWorker) return;

    const handleMessage = (e: MessageEvent) => {
      const { type, payload } = e.data;

      if (type === 'FUNDING_UPDATE') {
        const entries = payload as [string, FundingRateData][];
        const match = entries.find(([sym]) => sym === symbol);
        if (match) setFunding(match[1]);
      }

      if (type === 'ORDER_FLOW_UPDATE') {
        const entries = payload as [string, OrderFlowData][];
        const match = entries.find(([sym]) => sym === symbol);
        if (match) setFlow(match[1]);
      }

      // Compute per-symbol Smart Money Pressure from the global SMART_MONEY_UPDATE
      if (type === 'SMART_MONEY_UPDATE') {
        const entries = payload as [string, SmartMoneyPressure][];
        const match = entries.find(([sym]) => sym === symbol);
        if (match) setPressure(match[1]);
      }
    };

    derivativesWorker.addEventListener('message', handleMessage);
    return () => {
      derivativesWorker?.removeEventListener('message', handleMessage);
    };
  }, [symbol, enabled]);

  return { funding, flow, pressure };
}
