'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { computeWinRateStats, type WinRateStats } from '@/lib/signal-tracker';
import { cn } from '@/lib/utils';

/**
 * Win Rate Badge - Displays win rate statistics for a specific symbol
 * Requirements: Requirement 1
 * Design: WinRateBadge, WinRateTooltip components
 * 
 * Features:
 * - Shows 5m, 15m, 1h win rates inline
 * - "Tracking..." state when data unavailable
 * - Tooltip with wins/losses/avg return on hover
 * - Color coded based on performance
 */

interface WinRateBadgeProps {
  symbol: string;
  className?: string;
}

export function WinRateBadge({ symbol, className }: WinRateBadgeProps) {
  // Compute win rate stats for this symbol
  const stats = useMemo(() => {
    const allStats = computeWinRateStats(symbol);
    return allStats.length > 0 ? allStats[0] : null;
  }, [symbol]);

  // If no data, show tracking state
  if (!stats || stats.totalSignals === 0) {
    return (
      <div className={cn("flex items-center gap-1.5 px-2 py-1 bg-slate-800/30 border border-slate-700/40 rounded text-slate-500", className)}>
        <Loader2 size={10} className="animate-spin" />
        <span className="text-[9px] font-medium">Tracking...</span>
      </div>
    );
  }

  // Determine primary win rate (15m) for color coding
  const primaryWinRate = stats.winRate15m;
  const isPositive = primaryWinRate >= 50;

  return (
    <div className={cn("group relative", className)}>
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded border transition-all duration-200",
        isPositive 
          ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
          : "bg-[#FF4B5C]/10 border-[#FF4B5C]/30 text-[#FF4B5C]"
      )}>
        {isPositive ? (
          <TrendingUp size={10} />
        ) : (
          <TrendingDown size={10} />
        )}
        <div className="flex items-center gap-1 text-[9px] font-black tabular-nums">
          <span title="5m win rate">{stats.winRate5m.toFixed(0)}%</span>
          <span className="opacity-40">|</span>
          <span title="15m win rate">{stats.winRate15m.toFixed(0)}%</span>
          <span className="opacity-40">|</span>
          <span title="1h win rate">{stats.winRate1h.toFixed(0)}%</span>
        </div>
      </div>

      {/* Detailed Tooltip */}
      <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-[#0A0F1B] border border-white/10 rounded-lg shadow-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Win Rate Stats
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              {stats.totalSignals} signals
            </span>
          </div>

          {/* 5m Stats */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-slate-400">5m Timeframe</span>
              <span className={cn(
                "text-[10px] font-black tabular-nums",
                stats.winRate5m >= 50 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.winRate5m.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-slate-500">
                {stats.wins5m}W / {stats.losses5m}L
              </span>
              <span className={cn(
                "font-bold tabular-nums",
                stats.avgReturn5m >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.avgReturn5m >= 0 ? '+' : ''}{stats.avgReturn5m.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 15m Stats */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-slate-400">15m Timeframe</span>
              <span className={cn(
                "text-[10px] font-black tabular-nums",
                stats.winRate15m >= 50 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.winRate15m.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-slate-500">
                {stats.wins15m}W / {stats.losses15m}L
              </span>
              <span className={cn(
                "font-bold tabular-nums",
                stats.avgReturn15m >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.avgReturn15m >= 0 ? '+' : ''}{stats.avgReturn15m.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* 1h Stats */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-medium text-slate-400">1h Timeframe</span>
              <span className={cn(
                "text-[10px] font-black tabular-nums",
                stats.winRate1h >= 50 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.winRate1h.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-slate-500">
                {stats.wins1h}W / {stats.losses1h}L
              </span>
              <span className={cn(
                "font-bold tabular-nums",
                stats.avgReturn1h >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
              )}>
                {stats.avgReturn1h >= 0 ? '+' : ''}{stats.avgReturn1h.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="text-[8px] text-slate-500 leading-relaxed">
              Win rate shows signal accuracy. Avg return shows profit/loss per signal.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
