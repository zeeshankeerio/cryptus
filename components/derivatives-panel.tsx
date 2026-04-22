'use client';

/**
 * RSIQ Pro - Derivatives Intelligence Panel
 * 
 * Premium institutional-grade panel showing:
 * 1. Live Liquidation Feed (scrolling real-time events)
 * 2. Funding Rate Heatmap (color-coded grid)
 * 3. Whale Trade Radar (large trade detection)
 * 4. Smart Money Pressure Gauge
 * 5. Order Flow Summary
 */

import { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, TrendingUp, TrendingDown, Activity, Eye, EyeOff,
  ChevronDown, ChevronUp, Zap, BarChart3, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSymbolAlias } from '@/lib/symbol-utils';
import { formatPrice } from '@/lib/utils';
import type {
  FundingRateData,
  LiquidationEvent,
  WhaleTradeEvent,
  OrderFlowData,
  OpenInterestData,
  SmartMoneyPressure,
} from '@/lib/derivatives-types';

// ── Sub-Components ───────────────────────────────────────────────

/** Smart Money Pressure Gauge - the unique RSIQ indicator */
const SmartMoneyGauge = memo(function SmartMoneyGauge({
  data,
  compact = false,
}: {
  data: SmartMoneyPressure;
  compact?: boolean;
}) {
  const getColor = (score: number) => {
    if (score >= 60) return '#39FF14';
    if (score >= 30) return '#84cc16';
    if (score <= -60) return '#FF4B5C';
    if (score <= -30) return '#f97316';
    return '#94a3b8';
  };

  const color = getColor(data.score);
  // Normalize score to 0-100 for gauge width
  const gaugePercent = (data.score + 100) / 2;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5" title={`Smart Money: ${data.score} (${data.label})`}>
        <div className="w-8 h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${gaugePercent}%`,
              background: `linear-gradient(90deg, #FF4B5C, #f97316, #94a3b8, #84cc16, #39FF14)`,
            }}
          />
        </div>
        <span className="text-[8px] font-black tabular-nums" style={{ color }}>
          {data.score > 0 ? '+' : ''}{data.score}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">
          Institutional Gravity
        </span>
        <span className="text-[9px] font-black tracking-tight" style={{ color }}>
          {data.label}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-900 border border-white/[0.03] overflow-hidden relative">
        {/* Gradient background */}
        <div
          className="absolute inset-0 rounded-full opacity-20"
          style={{
            background: 'linear-gradient(90deg, #FF4B5C 0%, #f97316 25%, #94a3b8 50%, #84cc16 75%, #39FF14 100%)',
          }}
        />
        {/* Score indicator */}
        <div
          className="absolute top-0 bottom-0 w-1 rounded-full transition-all duration-700 shadow-lg"
          style={{
            left: `${gaugePercent}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}80`,
          }}
        />
      </div>
      <div className="flex justify-between text-[6.5px] font-black text-slate-600 uppercase tracking-widest opacity-80">
        <span>Fear</span>
        <span className="tabular-nums" style={{ color }}>
          {data.score > 0 ? '+' : ''}{data.score}
        </span>
        <span>Greed</span>
      </div>
    </div>
  );
});

/** Liquidation Feed Item */
const LiquidationItem = memo(function LiquidationItem({ liq }: { liq: LiquidationEvent }) {
  const isLong = liq.side === 'Sell';
  const sizeStr = liq.valueUsd >= 1000000
    ? `$${(liq.valueUsd / 1000000).toFixed(1)}M`
    : `$${Math.round(liq.valueUsd / 1000)}K`;
  const timeAgo = Math.round((Date.now() - liq.timestamp) / 1000);
  const timeStr = timeAgo < 60 ? `${timeAgo}s` : `${Math.round(timeAgo / 60)}m`;

  return (
    <div className={cn(
      "flex items-center justify-between px-1.5 py-0.5 rounded border border-white/5 transition-colors",
      isLong
        ? "bg-[#FF4B5C]/5 border-l-[#FF4B5C]/40"
        : "bg-[#39FF14]/5 border-l-[#39FF14]/40"
    )}>
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="text-[7px] shrink-0">💀</span>
        <span className="font-black text-white/90 text-[10px] tracking-tighter shrink-0">{getSymbolAlias(liq.symbol)}</span>
        <span className={cn(
          "text-[8px] font-black px-1 rounded shrink-0",
          isLong ? "bg-[#FF4B5C]/15 text-[#FF4B5C]/90" : "bg-[#39FF14]/15 text-[#39FF14]/90"
        )}>
          {isLong ? 'LONG' : 'SHORT'}
        </span>
        <span className="text-[6px] font-mono text-slate-500 bg-white/5 px-1 rounded border border-white/5 uppercase shrink-0">
          {liq.exchange?.slice(0, 3)}
        </span>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        <span className={cn(
          "font-black text-[10px]",
          liq.valueUsd >= 500000 ? (isLong ? "text-[#FF4B5C]" : "text-[#39FF14]") : "text-white/80"
        )}>{sizeStr}</span>
        <span className="text-slate-600 text-[9px] font-mono shrink-0">@ ${formatPrice(Number(liq.price))}</span>
        <span className="text-slate-700 text-[8px] font-mono shrink-0">{timeStr}</span>
      </div>
    </div>
  );
});

/** Whale Trade Item */
const WhaleItem = memo(function WhaleItem({ whale }: { whale: WhaleTradeEvent }) {
  const sizeStr = whale.valueUsd >= 1000000
    ? `$${(whale.valueUsd / 1000000).toFixed(1)}M`
    : `$${Math.round(whale.valueUsd / 1000)}K`;
  const isBuy = whale.side === 'buy';
  const timeAgo = Math.round((Date.now() - whale.timestamp) / 1000);
  const timeStr = timeAgo < 60 ? `${timeAgo}s` : `${Math.round(timeAgo / 60)}m`;
  const isMega = whale.valueUsd >= 500000;

  return (
    <div className={cn(
      "flex items-center justify-between px-1.5 py-0.5 rounded border border-white/5 transition-colors",
      isBuy
        ? "bg-[#39FF14]/5 border-l-[#39FF14]/40"
        : "bg-[#FF4B5C]/5 border-l-[#FF4B5C]/40"
    )}>
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="text-[7px] shrink-0">{isMega ? '🐋' : '🐳'}</span>
        <span className="font-black text-white/90 text-[10px] tracking-tighter shrink-0">{getSymbolAlias(whale.symbol)}</span>
        <span className={cn(
          "text-[8px] font-black px-1 rounded shrink-0",
          isBuy ? "bg-[#39FF14]/15 text-[#39FF14]/90" : "bg-[#FF4B5C]/15 text-[#FF4B5C]/90"
        )}>
          {isBuy ? 'BUY' : 'SELL'}
        </span>
      </div>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="font-black text-[10px] text-white/90">{sizeStr}</span>
        <span className="text-slate-600 text-[9px] font-mono shrink-0">@ ${formatPrice(Number(whale.price))}</span>
        <span className="text-slate-700 text-[8px] font-mono shrink-0">{timeStr}</span>
      </div>
    </div>
  );
});

/** Funding Rate Cell */
const FundingCell = memo(function FundingCell({ data }: { data: FundingRateData }) {
  const ratePercent = (data.rate * 100).toFixed(4);
  const annualized = data.annualized.toFixed(1);
  const isPositive = data.rate > 0;
  const isExtreme = Math.abs(data.rate) > 0.0005; // >0.05%

  return (
    <div className={cn(
      "flex flex-col items-center justify-center px-1.5 py-1 rounded transition-all",
      "border border-white/5 text-center min-w-[64px]",
      isExtreme
        ? isPositive ? "bg-[#39FF14]/10 border-[#39FF14]/20" : "bg-[#FF4B5C]/10 border-[#FF4B5C]/20"
        : "bg-slate-900 overflow-hidden"
    )}>
      <span className="text-[7.5px] font-black text-slate-500 truncate max-w-[55px] uppercase tracking-tighter">
        {getSymbolAlias(data.symbol)}
      </span>
      <span className={cn(
        "text-[9px] font-black tabular-nums leading-none my-0.5",
        isPositive ? "text-[#39FF14]" : "text-[#FF4B5C]"
      )}>
        {isPositive ? '+' : ''}{ratePercent}%
      </span>
      <span className="text-[6.5px] text-slate-600 tabular-nums font-bold">
        {annualized}% APR
      </span>
    </div>
  );
});

/** Order Flow Pressure Bar */
export const OrderFlowBar = memo(function OrderFlowBar({
  data,
  compact = false,
}: {
  data: OrderFlowData;
  compact?: boolean;
}) {
  const buyPercent = data.ratio * 100;
  const sellPercent = 100 - buyPercent;

  if (compact) {
    return (
      <div className="flex items-center gap-1" title={`Buy: ${buyPercent.toFixed(0)}% | Sell: ${sellPercent.toFixed(0)}%`}>
        <div className="w-8 h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
          <div
            className="h-full bg-green-500/60 transition-all duration-500"
            style={{ width: `${buyPercent}%` }}
          />
          <div
            className="h-full bg-red-500/60 transition-all duration-500"
            style={{ width: `${sellPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[8px] font-mono">
        <span className="text-green-400">{buyPercent.toFixed(0)}% Buy</span>
        <span className="text-red-400">{sellPercent.toFixed(0)}% Sell</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
        <div className="h-full bg-gradient-to-r from-[#39FF14]/80 to-[#39FF14]/60 transition-all duration-500"
          style={{ width: `${buyPercent}%` }}
        />
        <div className="h-full bg-gradient-to-l from-[#FF4B5C]/80 to-[#FF4B5C]/60 transition-all duration-500"
          style={{ width: `${sellPercent}%` }}
        />
      </div>
    </div>
  );
});

// ── Main Panel Component ─────────────────────────────────────────

interface DerivativesPanelProps {
  fundingRates: Map<string, FundingRateData>;
  liquidations: LiquidationEvent[];
  whaleAlerts: WhaleTradeEvent[];
  orderFlow: Map<string, OrderFlowData>;
  openInterest: Map<string, OpenInterestData>;
  smartMoney: Map<string, SmartMoneyPressure>;
  isConnected: boolean;
  onUpdateConfig?: (config: { liquidationThreshold?: number }) => void;
}

type ActiveTab = 'liquidations' | 'whales' | 'funding' | 'flow';

export const DerivativesPanel = memo(function DerivativesPanel({
  fundingRates,
  liquidations,
  whaleAlerts,
  orderFlow,
  openInterest,
  smartMoney,
  isConnected,
  onUpdateConfig,
}: DerivativesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('liquidations');
  const [liqThreshold, setLiqThreshold] = useState<5000 | 10000>(10000);

  const handleToggleThreshold = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = liqThreshold === 10000 ? 5000 : 10000;
    setLiqThreshold(next);
    onUpdateConfig?.({ liquidationThreshold: next });
  };

  // Sort liquidations/whales by timestamp (newest first)
  const sortedLiquidations = useMemo(
    () => [...liquidations].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    [liquidations]
  );
  const sortedWhales = useMemo(
    () => [...whaleAlerts].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20),
    [whaleAlerts]
  );

  // Sort funding rates by absolute value (most extreme first)
  const sortedFunding = useMemo(
    () => Array.from(fundingRates.values())
      .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
      .slice(0, 30),
    [fundingRates]
  );

  // Aggregate smart money for overall market gauge
  const marketPressure = useMemo(() => {
    if (smartMoney.size === 0) return null;
    let totalScore = 0;
    let count = 0;
    smartMoney.forEach(p => {
      totalScore += p.score;
      count++;
    });
    const avgScore = count > 0 ? Math.round(totalScore / count) : 0;
    let label: SmartMoneyPressure['label'] = 'Neutral';
    if (avgScore >= 80) label = 'Extreme Greed';
    else if (avgScore >= 30) label = 'Greed';
    else if (avgScore <= -80) label = 'Extreme Fear';
    else if (avgScore <= -30) label = 'Fear';

    return {
      symbol: 'MARKET',
      score: avgScore,
      label,
      components: {
        fundingSignal: 0,
        liquidationImbalance: 0,
        whaleDirection: 0,
        orderFlowPressure: 0,
      },
      updatedAt: Date.now(),
    } as SmartMoneyPressure;
  }, [smartMoney]);

  // Stats
  const liqStats = useMemo(() => {
    const recent = liquidations.filter(l => (Date.now() - l.timestamp) < 300000); // 5 min
    let longVal = 0, shortVal = 0;
    recent.forEach(l => {
      if (l.side === 'Sell') longVal += l.valueUsd;
      else shortVal += l.valueUsd;
    });
    return {
      totalCount: recent.length,
      longValue: longVal,
      shortValue: shortVal,
      totalValue: longVal + shortVal,
    };
  }, [liquidations]);

  const tabs: { id: ActiveTab; label: string; mobileLabel: string; icon: any; count?: number }[] = [
    { id: 'liquidations', label: 'Liquidations', mobileLabel: 'Liqs', icon: Flame, count: sortedLiquidations.length },
    { id: 'whales', label: 'Whales', mobileLabel: 'Whales', icon: Zap, count: sortedWhales.length },
    { id: 'funding', label: 'Funding', mobileLabel: 'Rates', icon: BarChart3, count: sortedFunding.length },
    { id: 'flow', label: 'Flow', mobileLabel: 'Flow', icon: Activity },
  ];

  return (
    <div className="border border-white/10 rounded-2xl bg-black/40 backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-[#39FF14] animate-pulse shadow-[0_0_8px_rgba(57,255,20,0.5)]" : "bg-slate-600"
            )} />
            <span className="text-[11px] font-black text-white uppercase tracking-widest">
              Derivatives Intelligence
            </span>
          </div>
          {isConnected && (
            <span className="flex text-[7px] xs:text-[8px] font-mono text-slate-500 bg-slate-800/60 px-1.5 xs:px-2 py-0.5 rounded-full items-center gap-1">
              <span>{fundingRates.size}<span className="hidden xs:inline"> feeds</span></span>
              <span className="opacity-30">•</span>
              <span>{liquidations.length}<span className="hidden xs:inline"> liqs</span></span>
              <span className="opacity-30">•</span>
              <span>{whaleAlerts.length}<span className="hidden xs:inline"> whales</span></span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Liquidation Threshold Toggle - Hidden on Mobile */}
          {isConnected && (
            <div 
              onClick={handleToggleThreshold}
              className="hidden sm:flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 cursor-pointer hover:border-white/20 transition-all shrink-0"
              title="Toggle Discovery Threshold ($5K vs $10K)"
            >
              <div className={cn(
                "px-1.5 py-0.5 text-[7px] font-black rounded transition-all",
                liqThreshold === 10000 ? "bg-white text-black" : "text-slate-500"
              )}>$10K</div>
              <div className={cn(
                "px-1.5 py-0.5 text-[7px] font-black rounded transition-all",
                liqThreshold === 5000 ? "bg-white text-black" : "text-slate-500"
              )}>$5K</div>
            </div>
          )}

          {/* Market Pressure Gauge - Hidden on Mobile Header */}
          {marketPressure && (
            <div className="hidden md:block">
              <SmartMoneyGauge data={marketPressure} compact />
            </div>
          )}

          {/* 5-min Liquidation Summary - Hidden on Mobile */}
          {liqStats.totalValue > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 text-[8px] font-mono shrink-0">
              <span className="text-red-400">${Math.round(liqStats.longValue / 1000)}K 📉</span>
              <span className="text-slate-600">|</span>
              <span className="text-green-400">${Math.round(liqStats.shortValue / 1000)}K 📈</span>
            </div>
          )}

          {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </button>

      {/* Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Tabs */}
            <div className="flex border-t border-white/5 bg-slate-900/60">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 py-1.5 text-[8.5px] font-black uppercase tracking-wider transition-all",
                    activeTab === tab.id
                      ? "text-[#39FF14] border-b border-[#39FF14] bg-[#39FF14]/5"
                      : "text-slate-500 hover:text-slate-300 border-b border-transparent"
                  )}
                >
                  <tab.icon size={9} />
                  <span className="hidden sm:inline-block">{tab.label}</span>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[6.5px] bg-white/10 rounded-full px-1 tabular-nums ml-0.5">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
              {activeTab === 'liquidations' && (
                <div className="flex flex-col gap-1">
                  {sortedLiquidations.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-slate-600 text-[9px]">
                      <Flame size={12} className="opacity-40 animate-pulse" />
                      <span>Monitoring live liquidation events...</span>
                    </div>
                  ) : (
                    sortedLiquidations.map(liq => (
                      <LiquidationItem key={liq.id} liq={liq} />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'whales' && (
                <div className="flex flex-col gap-1">
                  {sortedWhales.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-slate-600 text-[9px]">
                      <Zap size={12} className="opacity-40 animate-pulse" />
                      <span>Scanning for whale trades ($100K+)...</span>
                    </div>
                  ) : (
                    sortedWhales.map(whale => (
                      <WhaleItem key={whale.id} whale={whale} />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'funding' && (
                <div className="flex flex-wrap gap-1.5">
                  {sortedFunding.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-slate-600 text-[9px] w-full">
                      <BarChart3 size={12} className="opacity-40 animate-pulse" />
                      <span>Loading funding rates...</span>
                    </div>
                  ) : (
                    sortedFunding.map(f => (
                      <FundingCell key={f.symbol} data={f} />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'flow' && (
                <div className="flex flex-col gap-2">
                  {orderFlow.size === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-slate-600 text-[9px]">
                      <Activity size={12} className="opacity-40 animate-pulse" />
                      <span>Accumulating order flow data...</span>
                    </div>
                  ) : (
                    Array.from(orderFlow.entries())
                      .sort((a, b) => (b[1].buyVolume1m + b[1].sellVolume1m) - (a[1].buyVolume1m + a[1].sellVolume1m))
                      .slice(0, 15)
                      .map(([symbol, data]) => (
                        <div key={symbol} className="flex flex-col gap-1 p-1.5 rounded border border-white/[0.04] bg-white/[0.01]">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-white/90 tracking-tight">
                              {getSymbolAlias(symbol)}
                            </span>
                            <div className="flex items-center gap-3">
                              {openInterest.has(symbol) && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter">OI:</span>
                                  <span className="text-[9px] font-black tabular-nums text-slate-300">
                                    ${(openInterest.get(symbol)!.value / 1000000).toFixed(1)}M
                                  </span>
                                  <span className={cn(
                                    "text-[8px] font-bold tabular-nums",
                                    openInterest.get(symbol)!.change1h >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
                                  )}>
                                    {openInterest.get(symbol)!.change1h >= 0 ? '↑' : '↓'}{Math.abs(openInterest.get(symbol)!.change1h).toFixed(1)}%
                                  </span>
                                </div>
                              )}
                              <span className="text-[8px] font-mono text-slate-500 tabular-nums uppercase">
                                {data.tradeCount1m} Trades/min
                              </span>
                            </div>
                          </div>
                          <OrderFlowBar data={data} />
                        </div>
                      ))
                  )}

                  {/* Market-wide Smart Money Pressure */}
                  {marketPressure && (
                    <div className="mt-2 pt-2 border-t border-white/5">
                      <SmartMoneyGauge data={marketPressure} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default DerivativesPanel;
