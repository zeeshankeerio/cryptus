'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { computeWinRateStats, pruneStaleSymbols, getWinRateSummary, type WinRateStats } from '@/lib/signal-tracker';

/**
 * Win Rate Context Provider
 * 
 * Centralizes win rate data refresh to avoid 500+ separate intervals.
 * Instead of each badge refreshing independently, we refresh all data once
 * every 30 seconds and distribute via context.
 * 
 * Performance Benefits:
 * - Reduces localStorage reads from 500/30s to 1/30s
 * - Reduces computeWinRateStats calls from 500/30s to 1/30s
 * - Automatic stale symbol cleanup
 * - Single source of truth for all win rate displays
 */

export interface GlobalWinRateData {
  total: number;
  win5m: number;
  win15m: number;
  win1h: number;
  evaluated5m: number;
  evaluated15m: number;
  evaluated1h: number;
}

export interface WinRateContextValue {
  stats: Map<string, WinRateStats>;
  globalData: GlobalWinRateData | null;
  lastUpdate: number;
  isRefreshing: boolean;
  refresh: () => void;
  setActiveSymbols: (symbols: Set<string> | null) => void;
}

const WinRateContext = createContext<WinRateContextValue | null>(null);

interface WinRateProviderProps {
  children: ReactNode;
}

export function WinRateProvider({ children }: WinRateProviderProps) {
  const [stats, setStats] = useState<Map<string, WinRateStats>>(() => {
    const all = computeWinRateStats();
    return new Map(all.map(s => [s.symbol, s]));
  });
  const [globalData, setGlobalData] = useState<GlobalWinRateData | null>(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeSymbols, setActiveSymbols] = useState<Set<string> | null>(null);

  const refresh = useCallback(() => {
    setIsRefreshing(true);
    
    // Prune stale symbols if active symbols are registered
    // Expert strategy: Only prune when we have a clear definition of 'Active'
    if (activeSymbols && activeSymbols.size > 0) {
      pruneStaleSymbols(activeSymbols);
    }
    
    const all = computeWinRateStats();
    setStats(new Map(all.map(s => [s.symbol, s])));
    setLastUpdate(Date.now());
    
    // Brief loading state for visual feedback
    setTimeout(() => setIsRefreshing(false), 100);
  }, [activeSymbols]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Refresh when active symbols registration changes
  useEffect(() => {
    if (activeSymbols && activeSymbols.size > 0) {
      refresh();
    }
  }, [activeSymbols, refresh]);

  // ── Intelligence: Global Production Sync ──
  // Ensures win rates work across all devices and sessions
  useEffect(() => {
    const syncGlobal = async () => {
      try {
        // 1. Push local results to aggregate
        const summary = getWinRateSummary();
        if (summary.total >= 3) {
          await fetch('/api/signals/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(summary),
          });
        }

        // 2. Hydrate global truth
        const res = await fetch('/api/signals/sync');
        const data = await res.json();
        if (data && !data.calibrating) {
          setGlobalData(data);
        }
      } catch (e) {
        console.warn('[win-rate-sync] Failed to synchronize global state');
      }
    };

    syncGlobal();
    const id = setInterval(syncGlobal, 60000); // 1-minute global sync
    return () => clearInterval(id);
  }, []);

  const value: WinRateContextValue = {
    stats,
    globalData,
    lastUpdate,
    isRefreshing,
    refresh,
    setActiveSymbols,
  };

  return (
    <WinRateContext.Provider value={value}>
      {children}
    </WinRateContext.Provider>
  );
}

/**
 * Hook to access win rate data from context
 * 
 * Usage:
 * ```tsx
 * const { stats, refresh, setActiveSymbols } = useWinRateContext();
 * ```
 */
export function useWinRateContext() {
  const context = useContext(WinRateContext);
  return context;
}

/**
 * Hook to get win rate stats for a specific symbol
 * 
 * Usage:
 * ```tsx
 * const stats = useSymbolWinRate('BTCUSDT');
 * ```
 */
export function useSymbolWinRate(symbol: string): WinRateStats | null {
  const context = useWinRateContext();
  return context ? (context.stats.get(symbol) || null) : null;
}
