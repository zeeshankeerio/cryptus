'use client';

import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { getGlobalWinRate } from '@/lib/signal-tracker';
import { useWinRateContext } from './win-rate-context';
import { cn } from '@/lib/utils';

/**
 * Global Win Rate Badge — system-wide signal accuracy display.
 *
 * Design decisions:
 * - Uses centralized context for efficient data refresh
 * - Uses native `title` tooltip to avoid z-index / overflow issues.
 * - Shows "Calibrating" when < 10 signals evaluated (not just recorded).
 * - No hover:scale-105 to avoid layout shift / overlap.
 * 
 * Performance: No individual refresh interval - data comes from WinRateContext
 */

export function GlobalWinRateBadge() {
  const { lastUpdate } = useWinRateContext();
  const stats = getGlobalWinRate();

  // Calibrating state: need at least 10 evaluated signals (not just recorded)
  const totalEvaluated = stats.evaluated5m + stats.evaluated15m + stats.evaluated1h;
  if (totalEvaluated < 10) {
    return (
      <div
        title={`Signal Accuracy Tracker\n\nCalibrating system...\n${stats.total} signals recorded\n${totalEvaluated} evaluated\n\nWin rates will appear after 10+ signals are evaluated (5m/15m/1h).`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700/40 bg-slate-800/30 text-slate-500 cursor-default"
      >
        <Activity size={13} className="opacity-60" />
        <div className="flex flex-col items-start">
          <span className="text-[7px] font-bold uppercase tracking-wider opacity-70">
            Win Rate
          </span>
          <span className="text-[9px] font-black">
            Calibrating
          </span>
        </div>
      </div>
    );
  }

  // Use 15m as the primary metric
  const winRate = stats.winRate15m;
  const color = winRate >= 60 ? 'text-[#39FF14]' : winRate >= 45 ? 'text-amber-400' : 'text-[#FF4B5C]';
  const bgColor = winRate >= 60 ? 'bg-[#39FF14]/10' : winRate >= 45 ? 'bg-amber-400/10' : 'bg-[#FF4B5C]/10';
  const borderColor = winRate >= 60 ? 'border-[#39FF14]/30' : winRate >= 45 ? 'border-amber-400/30' : 'border-[#FF4B5C]/30';
  const Icon = winRate >= 60 ? TrendingUp : winRate >= 45 ? Activity : TrendingDown;

  const tooltipText = [
    `Signal Accuracy Tracker`,
    ``,
    `5m:  ${stats.winRate5m.toFixed(1)}%  (${stats.evaluated5m} evaluated)`,
    `15m: ${stats.winRate15m.toFixed(1)}%  (${stats.evaluated15m} evaluated)`,
    `1h:  ${stats.winRate1h.toFixed(1)}%  (${stats.evaluated1h} evaluated)`,
    ``,
    `Total signals: ${stats.total}`,
    ``,
    `Win rates show signal accuracy across timeframes.`,
    `Higher is better. ≥60% = excellent, 45-60% = good, <45% = needs tuning.`,
  ].join('\n');

  return (
    <div
      title={tooltipText}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors duration-200 cursor-default",
        bgColor,
        borderColor,
        color
      )}
    >
      <Icon size={13} className={color} />
      <div className="flex flex-col items-start">
        <span className="text-[7px] font-bold uppercase tracking-wider opacity-70">
          Win Rate
        </span>
        <span className="text-[10px] font-black tabular-nums">
          {winRate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
