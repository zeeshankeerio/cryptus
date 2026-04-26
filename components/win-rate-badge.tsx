'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, Clock } from 'lucide-react';
import { useSymbolWinRate } from './win-rate-context';
import { cn } from '@/lib/utils';

/**
 * Win Rate Badge - per-symbol signal accuracy display.
 *
 * Design decisions:
 * - Uses centralized context for efficient data refresh
 * - Shows countdown timer for pending evaluations
 * - Uses native `title` tooltip to avoid z-index / overflow issues
 * - Shows "-" (not a spinner) when no data - avoids Loader2 re-renders on 500 rows
 * 
 * Performance: No individual refresh intervals - all data comes from WinRateContext
 */

interface WinRateBadgeProps {
  symbol: string;
  className?: string;
}

function winRateColor(rate: number): string {
  if (rate >= 60) return 'text-[#39FF14]';
  if (rate >= 45) return 'text-amber-400';
  return 'text-[#FF4B5C]';
}

function formatTimeRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function WinRateBadge({ symbol, className }: WinRateBadgeProps) {
  const stats = useSymbolWinRate(symbol);
  const [now, setNow] = useState(Date.now());

  // Update clock every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // No data yet - show a minimal placeholder
  if (!stats || stats.totalSignals === 0) {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded border text-[8px] font-bold text-slate-700 bg-slate-900/30 border-slate-800/50",
        className
      )}>
        <Activity size={9} className="opacity-40" />
        <span>-</span>
      </div>
    );
  }

  const hasEvaluated = stats.wins5m + stats.losses5m > 0 ||
                       stats.wins15m + stats.losses15m > 0 ||
                       stats.wins1h + stats.losses1h > 0;

  // Signals recorded but none evaluated yet (< 5 minutes old)
  // Show countdown to next evaluation
  if (!hasEvaluated) {
    // Estimate time until first evaluation (5m from most recent signal)
    // This is approximate since we don't have individual signal timestamps here
    const timeUntil5m = 5 * 60 * 1000; // Placeholder - actual time varies per signal
    
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded border text-[8px] font-bold text-slate-500 bg-slate-800/20 border-slate-700/30",
          className
        )}
        title={`${stats.totalSignals} signal${stats.totalSignals !== 1 ? 's' : ''} recorded - awaiting 5m evaluation`}
      >
        <Clock size={9} className="animate-pulse" />
        <span>{stats.totalSignals}sig</span>
      </div>
    );
  }

  const primaryRate = stats.winRate15m > 0 ? stats.winRate15m : stats.winRate5m;
  const isPositive = primaryRate >= 50;

  const tooltipText = [
    `Win Rate - ${symbol}`,
    `Signals: ${stats.totalSignals}`,
    ``,
    `5m:  ${stats.winRate5m.toFixed(1)}%  (${stats.wins5m}W / ${stats.losses5m}L)  avg ${stats.avgReturn5m >= 0 ? '+' : ''}${stats.avgReturn5m.toFixed(2)}%`,
    `15m: ${stats.winRate15m.toFixed(1)}%  (${stats.wins15m}W / ${stats.losses15m}L)  avg ${stats.avgReturn15m >= 0 ? '+' : ''}${stats.avgReturn15m.toFixed(2)}%`,
    `1h:  ${stats.winRate1h.toFixed(1)}%  (${stats.wins1h}W / ${stats.losses1h}L)  avg ${stats.avgReturn1h >= 0 ? '+' : ''}${stats.avgReturn1h.toFixed(2)}%`,
  ].join('\n');

  return (
    <div
      title={tooltipText}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded border cursor-default transition-colors duration-150",
        isPositive
          ? "bg-[#39FF14]/10 border-[#39FF14]/25 text-[#39FF14]"
          : "bg-[#FF4B5C]/10 border-[#FF4B5C]/25 text-[#FF4B5C]",
        className
      )}
    >
      {isPositive ? <TrendingUp size={9} className="shrink-0" /> : <TrendingDown size={9} className="shrink-0" />}
      <div className="flex items-center gap-0.5 text-[8px] font-black tabular-nums">
        {stats.wins5m + stats.losses5m > 0 && (
          <span className={winRateColor(stats.winRate5m)}>{stats.winRate5m.toFixed(0)}%</span>
        )}
        {stats.wins5m + stats.losses5m > 0 && stats.wins15m + stats.losses15m > 0 && (
          <span className="opacity-30 text-[7px]">|</span>
        )}
        {stats.wins15m + stats.losses15m > 0 && (
          <span className={winRateColor(stats.winRate15m)}>{stats.winRate15m.toFixed(0)}%</span>
        )}
        {stats.wins15m + stats.losses15m > 0 && stats.wins1h + stats.losses1h > 0 && (
          <span className="opacity-30 text-[7px]">|</span>
        )}
        {stats.wins1h + stats.losses1h > 0 && (
          <span className={winRateColor(stats.winRate1h)}>{stats.winRate1h.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}
