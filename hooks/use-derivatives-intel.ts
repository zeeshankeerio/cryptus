'use client';

/**
 * RSIQ Pro - Derivatives Intelligence Hook
 * 
 * Connects the derivatives-worker to React components.
 * Provides real-time funding rates, liquidations, whale alerts,
 * order flow, open interest, and the unique Smart Money Pressure Index.
 *
 * Architecture:
 *  - Singleton worker pattern (same as PriceTickEngine)
 *  - Event-driven updates to prevent re-render storms
 *  - Lazy initialization - worker only starts when hook is first called
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { computeAllSmartMoney } from '@/lib/smart-money';
import { notificationEngine } from '@/lib/notification-engine';
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
  const [lastHealthPulse, setLastHealthPulse] = useState<number>(Date.now());
  
  // Stale detection: true if we haven't received data in 12 seconds
  const isStale = isConnected && (Date.now() - lastHealthPulse > 12000);

  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Smart Money Pressure - computed from all the raw signals
  // Debounced: only recompute at most once per 2 seconds to avoid CPU spikes
  // from rapid liquidation/whale events
  const smartMoneyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [smartMoney, setSmartMoney] = useState<Map<string, SmartMoneyPressure>>(new Map());

  useEffect(() => {
    if (!enabled || fundingRates.size === 0) {
      setSmartMoney(new Map());
      return;
    }
    if (smartMoneyTimerRef.current) clearTimeout(smartMoneyTimerRef.current);
    smartMoneyTimerRef.current = setTimeout(() => {
      const result = computeAllSmartMoney(
        Array.from(symbols),
        fundingRates,
        liquidations,
        whaleAlerts,
        orderFlow
      );
      console.log('[DEBUG] Smart Money Computed:', {
        symbolsCount: symbols.size,
        fundingRatesSize: fundingRates.size,
        liquidationsCount: liquidations.length,
        whaleAlertsCount: whaleAlerts.length,
        orderFlowSize: orderFlow.size,
        resultSize: result.size,
        sampleEntries: Array.from(result.entries()).slice(0, 3)
      });
      setSmartMoney(result);
    }, 2000); // Recompute at most every 2s
    return () => {
      if (smartMoneyTimerRef.current) clearTimeout(smartMoneyTimerRef.current);
    };
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

        case 'HEALTH_STATUS': {
          setLastHealthPulse(payload.lastDataReceived);
          break;
        }

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
          // Guard: skip invalid events
          if (!liq.symbol || !liq.valueUsd || liq.valueUsd <= 0 || !liq.price || liq.price <= 0) break;
          setLiquidations(prev => {
            const next = [...prev, liq];
            return next.length > 200 ? next.slice(-200) : next;
          });

          // Institutional Notification for large liquidations ($50K+)
          if (liq.valueUsd >= 50000) {
            const sizeStr = liq.valueUsd >= 1000000
              ? `$${(liq.valueUsd / 1000000).toFixed(1)}M`
              : `$${Math.round(liq.valueUsd / 1000)}K`;
            const isLong = liq.side === 'Sell';
            
            notificationEngine.notify({
              title: `💀 ${isLong ? 'LONG' : 'SHORT'} Liquidated - ${getSymbolAlias(liq.symbol)}`,
              body: `${sizeStr} @ $${formatPrice(liq.price)} [${liq.exchange}]`,
              symbol: liq.symbol,
              exchange: liq.exchange,
              priority: liq.valueUsd >= 500000 ? 'critical' : 'high',
              type: 'liquidation',
              price: liq.price,
              value: liq.valueUsd
            });
          }
          break;
        }

        case 'WHALE_TRADE': {
          const whale = payload as WhaleTradeEvent;
          // Guard: skip invalid events
          if (!whale.symbol || !whale.valueUsd || whale.valueUsd <= 0 || !whale.price || whale.price <= 0) break;
          setWhaleAlerts(prev => {
            const next = [...prev, whale];
            return next.length > 50 ? next.slice(-50) : next;
          });

          // Institutional Notification for significant whale trades ($250K+)
          if (whale.valueUsd >= 250000) {
            const sizeStr = whale.valueUsd >= 1000000
              ? `$${(whale.valueUsd / 1000000).toFixed(1)}M`
              : `$${Math.round(whale.valueUsd / 1000)}K`;
            const isBuy = whale.side === 'buy';
            
            notificationEngine.notify({
              title: `🐋 WHALE ${isBuy ? 'BUY' : 'SELL'} - ${getSymbolAlias(whale.symbol)}`,
              body: `${sizeStr} @ $${formatPrice(whale.price)} [${whale.exchange}]`,
              symbol: whale.symbol,
              exchange: whale.exchange,
              priority: whale.valueUsd >= 1000000 ? 'critical' : 'high',
              type: 'whale',
              price: whale.price,
              value: whale.valueUsd
            });
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

    // Visibility-Aware Resumption:
    // If user returns to tab, signal worker to check connection health immediately
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && workerStarted) {
        console.log('[DerivativesIntel] Tab focused, triggering RESUME sync...');
        derivativesWorker?.postMessage({ type: 'RESUME' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

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
      document.removeEventListener('visibilitychange', handleVisibility);
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

  // Update worker configuration (e.g. liquidation threshold)
  const updateConfig = useCallback((config: { liquidationThreshold?: number }) => {
    if (!derivativesWorker) return;
    derivativesWorker.postMessage({
      type: 'UPDATE_CONFIG',
      payload: config
    });
  }, []);

  return {
    fundingRates,
    liquidations,
    whaleAlerts,
    orderFlow,
    openInterest,
    smartMoney,
    isConnected,
    isStale,
    updateConfig,
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
