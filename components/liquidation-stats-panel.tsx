'use client';

/**
 * RSIQ Pro - Enhanced Liquidation Stats Panel
 * 
 * Provides institutional-grade liquidation analysis with:
 * - Real-time stats (volume, imbalance, momentum)
 * - Decision indicators (buy/sell signals with confidence)
 * - Risk metrics (cascade risk, volatility, price impact)
 * - Actionable insights
 */

import { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Zap, Target, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { analyzeLiquidations, generateLiquidationInsights, type LiquidationStats, type LiquidationInsight } from '@/lib/liquidation-analyzer';
import type { LiquidationEvent } from '@/lib/derivatives-types';

interface LiquidationStatsPanelProps {
  symbol: string;
  liquidations: LiquidationEvent[];
  currentPrice?: number;
  volume24h?: number;
  compact?: boolean;
}

export const LiquidationStatsPanel = memo(function LiquidationStatsPanel({
  symbol,
  liquidations,
  currentPrice,
  volume24h,
  compact = false,
}: LiquidationStatsPanelProps) {
  // Analyze liquidations
  const stats = useMemo(
    () => analyzeLiquidations(symbol, liquidations, currentPrice, volume24h),
    [symbol, liquidations, currentPrice, volume24h]
  );

  const insights = useMemo(
    () => generateLiquidationInsights(stats, currentPrice),
    [stats, currentPrice]
  );

  if (stats.count === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-slate-600 text-[9px]">
        <Activity size={12} className="opacity-40" />
        <span>No recent liquidations</span>
      </div>
    );
  }

  if (compact) {
    return <CompactView stats={stats} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Decision Signal */}
      <DecisionSignal stats={stats} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <VolumeStats stats={stats} />
        <ImbalanceStats stats={stats} />
        <MomentumStats stats={stats} />
        <RiskMetrics stats={stats} />
      </div>

      {/* Insights */}
      {insights.length > 0 && <InsightsSection insights={insights} />}

      {/* Reasoning */}
      <ReasoningSection stats={stats} />
    </div>
  );
});

// ── Sub-Components ───────────────────────────────────────────────

const CompactView = memo(function CompactView({ stats }: { stats: LiquidationStats }) {
  const signalColor = getSignalColor(stats.signal);
  
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg border border-white/5 bg-white/[0.01]">
      <div className="flex items-center gap-2">
        <div className={cn(
          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase",
          signalColor.bg, signalColor.text, signalColor.border, "border"
        )}>
          {stats.signal}
        </div>
        <span className="text-[8px] text-slate-500">
          {stats.confidence}% conf
        </span>
      </div>
      <div className="flex items-center gap-2 text-[8px]">
        <span className="text-slate-500">Vol:</span>
        <span className="font-black text-white/80">
          ${stats.totalValue >= 1000000 
            ? `${(stats.totalValue / 1000000).toFixed(1)}M`
            : `${Math.round(stats.totalValue / 1000)}K`}
        </span>
        <span className="text-slate-600">|</span>
        <span className={cn(
          "font-black",
          stats.imbalance > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {stats.imbalance > 0 ? '+' : ''}{stats.imbalance}%
        </span>
      </div>
    </div>
  );
});

const DecisionSignal = memo(function DecisionSignal({ stats }: { stats: LiquidationStats }) {
  const signalColor = getSignalColor(stats.signal);
  const Icon = stats.signal.includes('Buy') ? TrendingUp : stats.signal.includes('Sell') ? TrendingDown : Activity;

  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-xl border",
      signalColor.bg, signalColor.border
    )}>
      <div className="flex items-center gap-2">
        <Icon size={16} className={signalColor.text} />
        <div className="flex flex-col">
          <span className={cn("text-[11px] font-black uppercase tracking-wider", signalColor.text)}>
            {stats.signal}
          </span>
          <span className="text-[8px] text-slate-500 font-bold">
            {stats.confidence}% Confidence
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-16 h-1.5 rounded-full bg-slate-900 overflow-hidden">
          <div
            className={cn("h-full transition-all duration-500", signalColor.text.replace('text-', 'bg-'))}
            style={{ width: `${stats.confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
});

const VolumeStats = memo(function VolumeStats({ stats }: { stats: LiquidationStats }) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg border border-white/5 bg-white/[0.01]">
      <div className="flex items-center gap-1">
        <Zap size={10} className="text-[#39FF14]" />
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Volume</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className="text-[13px] font-black text-white/90 tabular-nums">
            ${stats.totalValue >= 1000000 
              ? `${(stats.totalValue / 1000000).toFixed(1)}M`
              : `${Math.round(stats.totalValue / 1000)}K`}
          </span>
          <span className="text-[7px] text-slate-600">total</span>
        </div>
        <div className="flex items-center justify-between text-[7px] font-mono">
          <span className="text-[#FF4B5C]">
            L: ${stats.longValue >= 1000000 
              ? `${(stats.longValue / 1000000).toFixed(1)}M`
              : `${Math.round(stats.longValue / 1000)}K`}
          </span>
          <span className="text-[#39FF14]">
            S: ${stats.shortValue >= 1000000 
              ? `${(stats.shortValue / 1000000).toFixed(1)}M`
              : `${Math.round(stats.shortValue / 1000)}K`}
          </span>
        </div>
        <div className="text-[7px] text-slate-600">
          {stats.count} events • {stats.frequency.toFixed(1)}/min
        </div>
      </div>
    </div>
  );
});

const ImbalanceStats = memo(function ImbalanceStats({ stats }: { stats: LiquidationStats }) {
  const isPositive = stats.imbalance > 0;
  
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg border border-white/5 bg-white/[0.01]">
      <div className="flex items-center gap-1">
        <Target size={10} className={isPositive ? "text-[#39FF14]" : "text-[#FF4B5C]"} />
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Imbalance</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className={cn(
            "text-[13px] font-black tabular-nums",
            isPositive ? "text-[#39FF14]" : "text-[#FF4B5C]"
          )}>
            {isPositive ? '+' : ''}{stats.imbalance}%
          </span>
        </div>
        <div className="text-[7px] font-bold text-slate-400 leading-tight">
          {stats.imbalanceLabel}
        </div>
        <div className="w-full h-1 rounded-full bg-slate-900 overflow-hidden mt-0.5">
          <div
            className={cn(
              "h-full transition-all duration-500",
              isPositive ? "bg-[#39FF14]" : "bg-[#FF4B5C]"
            )}
            style={{ width: `${Math.abs(stats.imbalance)}%` }}
          />
        </div>
      </div>
    </div>
  );
});

const MomentumStats = memo(function MomentumStats({ stats }: { stats: LiquidationStats }) {
  const momentumColor = getMomentumColor(stats.momentum);
  
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg border border-white/5 bg-white/[0.01]">
      <div className="flex items-center gap-1">
        <Activity size={10} className={momentumColor} />
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Momentum</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className={cn("text-[11px] font-black", momentumColor)}>
            {stats.momentum}
          </span>
        </div>
        <div className="text-[7px] text-slate-600">
          Score: {stats.momentumScore}
        </div>
        {stats.megaLiqCount > 0 && (
          <div className="text-[7px] font-black text-orange-400">
            {stats.megaLiqCount} mega liq{stats.megaLiqCount > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
});

const RiskMetrics = memo(function RiskMetrics({ stats }: { stats: LiquidationStats }) {
  const cascadeColor = getRiskColor(stats.cascadeRisk);
  
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg border border-white/5 bg-white/[0.01]">
      <div className="flex items-center gap-1">
        <AlertTriangle size={10} className={cascadeColor} />
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Risk</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1">
          <span className={cn("text-[11px] font-black", cascadeColor)}>
            {stats.cascadeRisk}
          </span>
          <span className="text-[7px] text-slate-600">cascade</span>
        </div>
        <div className="text-[7px] text-slate-600">
          Impact: ~{stats.priceImpact.toFixed(2)}%
        </div>
        <div className="text-[7px] text-slate-600">
          Vol: {stats.volatilityRisk}
        </div>
      </div>
    </div>
  );
});

const InsightsSection = memo(function InsightsSection({ insights }: { insights: LiquidationInsight[] }) {
  return (
    <div className="flex flex-col gap-1">
      {insights.map((insight, i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-2 px-2 py-1.5 rounded-lg border text-[8px]",
            insight.type === 'opportunity' ? "bg-[#39FF14]/5 border-[#39FF14]/20" :
            insight.type === 'warning' ? "bg-orange-500/5 border-orange-500/20" :
            "bg-blue-500/5 border-blue-500/20"
          )}
        >
          <div className="shrink-0 mt-0.5">
            {insight.type === 'opportunity' && <TrendingUp size={10} className="text-[#39FF14]" />}
            {insight.type === 'warning' && <AlertTriangle size={10} className="text-orange-400" />}
            {insight.type === 'info' && <Info size={10} className="text-blue-400" />}
          </div>
          <div className="flex-1 flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <span className={cn(
                "font-black uppercase tracking-wider",
                insight.type === 'opportunity' ? "text-[#39FF14]" :
                insight.type === 'warning' ? "text-orange-400" :
                "text-blue-400"
              )}>
                {insight.title}
              </span>
              {insight.actionable && (
                <span className="text-[7px] px-1 py-0.5 rounded bg-white/10 text-white/60 font-bold uppercase">
                  Actionable
                </span>
              )}
            </div>
            <span className="text-slate-400 leading-tight">
              {insight.message}
            </span>
            <span className="text-[7px] text-slate-600">
              Confidence: {insight.confidence}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
});

const ReasoningSection = memo(function ReasoningSection({ stats }: { stats: LiquidationStats }) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg border border-white/5 bg-white/[0.01]">
      <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">Analysis</span>
      <div className="flex flex-col gap-0.5">
        {stats.reasoning.map((reason, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[8px] text-slate-400">
            <span className="text-[#39FF14] shrink-0">•</span>
            <span className="leading-tight">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Helper Functions ─────────────────────────────────────────────

function getSignalColor(signal: LiquidationStats['signal']) {
  switch (signal) {
    case 'Strong Buy':
      return {
        bg: 'bg-[#39FF14]/10',
        text: 'text-[#39FF14]',
        border: 'border-[#39FF14]/30',
      };
    case 'Buy':
      return {
        bg: 'bg-[#39FF14]/5',
        text: 'text-[#39FF14]',
        border: 'border-[#39FF14]/20',
      };
    case 'Strong Sell':
      return {
        bg: 'bg-[#FF4B5C]/10',
        text: 'text-[#FF4B5C]',
        border: 'border-[#FF4B5C]/30',
      };
    case 'Sell':
      return {
        bg: 'bg-[#FF4B5C]/5',
        text: 'text-[#FF4B5C]',
        border: 'border-[#FF4B5C]/20',
      };
    default:
      return {
        bg: 'bg-slate-800/30',
        text: 'text-slate-400',
        border: 'border-slate-700/30',
      };
  }
}

function getMomentumColor(momentum: LiquidationStats['momentum']) {
  switch (momentum) {
    case 'Accelerating':
      return 'text-orange-400';
    case 'Steady':
      return 'text-blue-400';
    case 'Decelerating':
      return 'text-yellow-400';
    case 'Stopped':
      return 'text-slate-500';
  }
}

function getRiskColor(risk: LiquidationStats['cascadeRisk']) {
  switch (risk) {
    case 'Extreme':
      return 'text-[#FF4B5C]';
    case 'High':
      return 'text-orange-400';
    case 'Medium':
      return 'text-yellow-400';
    case 'Low':
      return 'text-slate-500';
  }
}

export default LiquidationStatsPanel;
