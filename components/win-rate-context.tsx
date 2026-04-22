'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { computeWinRateStats, pruneStaleSymbols, type WinRateStats } from '@/lib/signal-tracker';

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

interface WinRateContextValue {
  stats: Map<string, WinRateStats>;
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

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Refresh when active symbols registration changes
  useEffect(() => {
    if (activeSymbols && activeSymbols.size > 0) {
      refresh();
    }
  }, [activeSymbols, refresh]);

  const value: WinRateContextValue = {
    stats,
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
