'use client';

/**
 * RSIQ Pro - Multi-Asset Market Data Hook
 *
 * Provides real-time data for non-crypto asset classes (Forex, Metals, Stocks).
 * Uses server-side Yahoo Finance proxy with configurable polling intervals.
 *
 * For Crypto: The existing useLivePrices hook handles WebSocket data.
 * This hook complements it for traditional asset classes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AssetClass } from '@/lib/asset-classes';
import {
  getAssetClassConfig,
  FOREX_SYMBOLS,
  METALS_SYMBOLS,
  STOCKS_SYMBOLS,
} from '@/lib/asset-classes';

export interface MarketDataEntry {
  symbol: string;
  displayName: string;
  price: number;
  open: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  sma50: number | null;
  sma200: number | null;
  marketState: string;
  currency: string;
  updatedAt: number;
  closes?: number[]; // Optional history for technicals
}

interface UseMarketDataResult {
  data: MarketDataEntry[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number;
  source: string;
  refresh: () => void;
}

export function useMarketData(
  assetClass: AssetClass,
  enabled: boolean = true
): UseMarketDataResult {
  const [data, setData] = useState<MarketDataEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [source, setSource] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const dataLenRef = useRef(0);

  const fetchData = useCallback(async () => {
    // Crypto uses WebSocket, not this hook
    if (assetClass === 'crypto' || !enabled) return;

    const config = getAssetClassConfig(assetClass);
    const symbols = config.symbols;

    if (symbols.length === 0) return;

    try {
      // Only show loading spinner on very first fetch (not on subsequent polls)
      if (dataLenRef.current === 0) setIsLoading(true);

      const res = await fetch(
        `/api/market-data?symbols=${encodeURIComponent(symbols.join(','))}&class=${assetClass}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      if (!mountedRef.current) return;

      if (json.data && Array.isArray(json.data)) {
        setData(json.data);
        dataLenRef.current = json.data.length;
        setLastUpdate(json.timestamp || Date.now());
        setSource(json.source || 'unknown');
        setError(null);
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e.message || 'Failed to fetch data');
      console.error(`[useMarketData] ${assetClass} fetch error:`, e);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [assetClass, enabled]);

  // Initial fetch + polling
  useEffect(() => {
    if (assetClass === 'crypto' || !enabled) {
      setData([]);
      dataLenRef.current = 0;
      return;
    }

    mountedRef.current = true;
    const config = getAssetClassConfig(assetClass);

    // Immediate fetch
    fetchData();

    // Start polling
    if (config.pollIntervalMs > 0) {
      pollRef.current = setInterval(fetchData, config.pollIntervalMs);
    }

    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [assetClass, enabled, fetchData]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, lastUpdate, source, refresh };
}

/**
 * Get display name for any symbol across all asset classes
 */
export function getMultiAssetDisplayName(symbol: string, assetClass: AssetClass): string {
  if (assetClass === 'forex') {
    const match = FOREX_SYMBOLS.find(s => s.yahoo === symbol);
    return match?.display || symbol.replace('=X', '');
  }
  if (assetClass === 'metals') {
    const match = METALS_SYMBOLS.find(s => s.yahoo === symbol);
    return match?.display || symbol.replace('=F', '');
  }
  if (assetClass === 'stocks') {
    const match = STOCKS_SYMBOLS.find(s => s.yahoo === symbol);
    return match?.display || symbol;
  }
  return symbol;
}
