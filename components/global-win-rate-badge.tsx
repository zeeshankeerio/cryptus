'use client';

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { getGlobalWinRate } from '@/lib/signal-tracker';
import { cn } from '@/lib/utils';

/**
 * Global Win Rate Badge - Displays overall system signal accuracy
 * Requirements: Requirement 9
 * Design: GlobalWinRateBadge component
 * 
 * Features:
 * - Shows 15m win rate prominently
 * - Color coded: green >60%, yellow 40-60%, red <40%
 * - Tooltip with all timeframes (5m, 15m, 1h)
 * - "Calibrating..." state when signals < 10
 * - Updates every 30s
 */

interface GlobalWinRateState {
  winRate5m: number;
  winRate15m: number;
  winRate1h: number;
  totalSignals: number;
}

export function GlobalWinRateBadge() {
  const [stats, setStats] = useState<GlobalWinRateState | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Update win rate every 30 seconds
  useEffect(() => {
    const updateStats = () => {
      const globalStats = getGlobalWinRate();
      setStats(globalStats);
    };

    // Initial load
    updateStats();

    // Set up interval
    const interval = setInterval(updateStats, 30000); // 30s

    return () => clearInterval(interval);
  }, []);

  // Compute color and icon based on win rate
  const { color, bgColor, borderColor, icon, label } = useMemo(() => {
    if (!stats || stats.totalSignals < 10) {
      return {
        color: 'text-slate-500',
        bgColor: 'bg-slate-800/30',
        borderColor: 'border-slate-700/40',
        icon: Activity,
        label: 'Calibrating...'
      };
    }

    const winRate = stats.winRate15m;

    if (winRate >= 60) {
      return {
        color: 'text-[#39FF14]',
        bgColor: 'bg-[#39FF14]/10',
        borderColor: 'border-[#39FF14]/30',
        icon: TrendingUp,
        label: `${winRate.toFixed(1)}%`
      };
    } else if (winRate >= 40) {
      return {
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-400/10',
        borderColor: 'border-yellow-400/30',
        icon: Activity,
        label: `${winRate.toFixed(1)}%`
      };
    } else {
      return {
        color: 'text-[#FF4B5C]',
        bgColor: 'bg-[#FF4B5C]/10',
        borderColor: 'border-[#FF4B5C]/30',
        icon: TrendingDown,
        label: `${winRate.toFixed(1)}%`
      };
    }
  }, [stats]);

  const Icon = icon;

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200",
          "hover:scale-105 active:scale-95 cursor-help",
          bgColor,
          borderColor,
          color
        )}
      >
        <Icon size={14} className={color} />
        <div className="flex flex-col items-start">
          <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">
            Win Rate
          </span>
          <span className="text-[11px] font-black tabular-nums">
            {label}
          </span>
        </div>
      </button>

      {/* Tooltip */}
      {showTooltip && stats && stats.totalSignals >= 10 && (
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-[#0A0F1B] border border-white/10 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                System Accuracy
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {stats.totalSignals} signals
              </span>
            </div>

            {/* 5m Win Rate */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-400">
                5m Win Rate
              </span>
              <span className={cn(
                "text-[11px] font-black tabular-nums",
                stats.winRate5m >= 60 ? "text-[#39FF14]" :
                stats.winRate5m >= 40 ? "text-yellow-400" :
                "text-[#FF4B5C]"
              )}>
                {stats.winRate5m.toFixed(1)}%
              </span>
            </div>

            {/* 15m Win Rate */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-400">
                15m Win Rate
              </span>
              <span className={cn(
                "text-[11px] font-black tabular-nums",
                stats.winRate15m >= 60 ? "text-[#39FF14]" :
                stats.winRate15m >= 40 ? "text-yellow-400" :
                "text-[#FF4B5C]"
              )}>
                {stats.winRate15m.toFixed(1)}%
              </span>
            </div>

            {/* 1h Win Rate */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-400">
                1h Win Rate
              </span>
              <span className={cn(
                "text-[11px] font-black tabular-nums",
                stats.winRate1h >= 60 ? "text-[#39FF14]" :
                stats.winRate1h >= 40 ? "text-yellow-400" :
                "text-[#FF4B5C]"
              )}>
                {stats.winRate1h.toFixed(1)}%
              </span>
            </div>

            <div className="pt-2 border-t border-white/10">
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Win rates show signal accuracy across different timeframes. Higher is better.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Calibrating Tooltip */}
      {showTooltip && (!stats || stats.totalSignals < 10) && (
        <div className="absolute top-full right-0 mt-2 w-56 p-3 bg-[#0A0F1B] border border-white/10 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Calibrating System
              </span>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Win rate tracking requires at least 10 signals. Keep using the screener to build accuracy metrics.
            </p>
            {stats && (
              <p className="text-[9px] text-slate-500 font-bold">
                Current: {stats.totalSignals} / 10 signals
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
