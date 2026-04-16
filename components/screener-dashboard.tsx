'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, BellOff, Settings, Filter, Star, Info, Download,
  RefreshCcw, Zap, BarChart3, TrendingUp, TrendingDown,
  LayoutGrid, LayoutList, ChevronUp, ChevronDown, Clock,
  Flame, ShieldCheck, Activity, BrainCircuit, Gauge,
  LogOut, User as UserIcon, Minus, Plus, AlertTriangle,
  ArrowDownCircle, MinusCircle, ArrowUpCircle
} from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { AUTH_CONFIG } from '@/lib/config';
import { UserProfileDropdown } from './user-profile-dropdown';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { ScreenerEntry, ScreenerResponse, SortKey, SortDir, SignalFilter } from '@/lib/types';
import { useLivePrices, useSymbolPrice } from '@/hooks/use-live-prices';
import { useAlertEngine } from '@/hooks/use-alert-engine';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useDerivativesIntel } from '@/hooks/use-derivatives-intel';
import { DerivativesPanel, OrderFlowBar } from '@/components/derivatives-panel';
import { approximateRsi, approximateEma } from '@/lib/rsi';
import { computeStrategyScore, deriveSignal, calculateRsi, latestEma, detectEmaCross, calculateMacd, calculateBollinger, calculateStochRsi } from '@/lib/indicators';
import { getSymbolAlias, getSymbolTicker } from '@/lib/symbol-utils';
import { generateSignalNarration } from '@/lib/signal-narration';
import type { AssetClass } from '@/lib/asset-classes';
import { useMarketData } from '@/hooks/use-market-data';
import { toast } from 'sonner';

// ─── Formatting helpers ────────────────────────────────────────

function formatPrice(p: number): string {
  if (p >= 100) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.1) return p.toFixed(5);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatRsi(rsi: number | null): string {
  if (rsi === null) return '—';
  return rsi.toFixed(1);
}

function formatNum(n: number | null, decimals = 2): string {
  if (n === null) return '—';
  return n.toFixed(decimals);
}

function formatPct(n: number | null): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatTimeAgo(ts: number): string {
  if (!ts) return '—';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function getRsiColor(rsi: number | null): string {
  if (rsi === null) return 'text-slate-600';
  if (rsi <= 20) return 'text-[#39FF14] font-black';
  if (rsi <= 30) return 'text-[#39FF14] font-bold';
  if (rsi <= 40) return 'text-[#39FF14]/80';
  if (rsi >= 80) return 'text-[#FF4B5C] font-black';
  if (rsi >= 70) return 'text-[#FF4B5C] font-bold';
  if (rsi >= 60) return 'text-[#FF4B5C]/80';
  return 'text-slate-300';
}

function getRsiBg(rsi: number | null): string {
  if (rsi === null) return '';
  if (rsi <= 25) return 'bg-[#39FF14]/[0.05]';
  if (rsi <= 30) return 'bg-[#39FF14]/[0.02]';
  if (rsi >= 75) return 'bg-[#722f37]/[0.08]';
  if (rsi >= 70) return 'bg-[#722f37]/[0.04]';
  return '';
}

function getScoreBarColor(score: number): string {
  if (score >= 40) return 'bg-[#39FF14]';
  if (score >= 15) return 'bg-[#39FF14]/70';
  if (score <= -40) return 'bg-[#FF4B5C]';
  if (score <= -15) return 'bg-[#FF4B5C]/70';
  return 'bg-slate-700';
}

// ─── Signal Badge ──────────────────────────────────────────────

function SignalBadge({ signal }: { signal: ScreenerEntry['signal'] }) {
  const styles: Record<string, string> = {
    oversold: 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20',
    overbought: 'bg-[#722f37]/20 text-[#FF4B5C] border-[#722f37]/30',
    neutral: 'bg-slate-800/50 text-slate-400 border-slate-700/50',
  };
  return (
    <span className={cn("inline-flex items-center px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border shadow-sm transition-all duration-300", styles[signal])}>
      {signal === 'oversold' && <div className="w-1.5 h-1.5 rounded-full bg-current mr-2 animate-pulse" />}
      {signal === 'overbought' && <div className="w-1.5 h-1.5 rounded-full bg-current mr-2 animate-pulse" />}
      {signal}
    </span>
  );
}

function StrategyBadge({ signal, label, reasons, entry }: { signal: ScreenerEntry['strategySignal']; label: string; reasons?: string[]; entry?: ScreenerEntry }) {
  const styles: Record<string, string> = {
    'strong-buy': 'bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/40',
    'buy': 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20',
    'neutral': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    'sell': 'bg-[#722f37]/10 text-[#FF4B5C]/80 border-[#722f37]/20',
    'strong-sell': 'bg-[#722f37]/20 text-[#FF4B5C] border-[#722f37]/40',
  };

  // Signal Narration Engine™ — generate rich explanations for non-neutral signals
  const narration = useMemo(() => {
    if (!entry || signal === 'neutral') return null;
    return generateSignalNarration(entry);
  }, [entry, signal]);

  const title = narration
    ? `${narration.emoji} ${narration.headline} (${narration.conviction}% ${narration.convictionLabel})\n\n${narration.reasons.join('\n')}`
    : reasons?.length ? reasons.join(' \u00B7 ') : undefined;

  return (
    <span className={cn("inline-flex items-center gap-1 px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded border shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-all cursor-help", styles[signal])} title={title}>
      {narration && narration.conviction >= 65 && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}

function MarketBadge({ market }: { market: ScreenerEntry['market'] }) {
  if (!market || market === 'Crypto') return null;
  const styles: Record<string, string> = {
    Metal: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_5px_rgba(245,158,11,0.1)]',
    Forex: 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_5px_rgba(59,130,246,0.1)]',
    Index: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_5px_rgba(99,102,241,0.1)]',
    Stocks: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_5px_rgba(16,185,129,0.1)]',
  };
  return (
    <span className={cn("px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] rounded-sm border shrink-0 shadow-sm transition-colors", styles[market] || styles['Index'])}>
      {market}
    </span>
  );
}


// ─── Screener Row (Memoized) ───────────────────────────────────

const ScreenerRow = memo(function ScreenerRow({
  entry,
  idx,
  watchlist,
  toggleWatchlist,
  visibleCols,
  useAnimations,
  rsiPeriod,
  onOpenSettings,
  coinConfigs,
  onSaveConfig,
  reportVisibility,
  globalShowSignalTags,
  globalSignalThresholdMode,
  globalThresholdsEnabled,
  globalOverbought,
  globalOversold,
  globalUseRsi,
  globalUseMacd,
  globalUseBb,
  globalUseStoch,
  globalUseEma,
  globalUseVwap,
  globalUseConfluence,
  globalUseDivergence,
  globalUseMomentum,
  globalVolatilityEnabled,
  globalLongCandleThreshold,
  globalVolumeSpikeThreshold,
  fundingRate,
  orderFlowData,
  smartMoneyScore,
}: {
  entry: ScreenerEntry;
  idx: number;
  watchlist: Set<string>;
  toggleWatchlist: (s: string) => void;
  visibleCols: Set<ColumnId>;
  useAnimations: boolean;
  rsiPeriod: number;
  onOpenSettings: (symbol: string) => void;
  coinConfigs: Record<string, any>;
  onSaveConfig: (symbol: string, config: any) => Promise<void>;
  reportVisibility: (symbol: string, isVisible: boolean) => void;
  globalShowSignalTags: boolean;
  globalSignalThresholdMode: 'default' | 'custom';
  globalThresholdsEnabled: boolean;
  globalOverbought: number;
  globalOversold: number;
  globalUseRsi: boolean;
  globalUseMacd: boolean;
  globalUseBb: boolean;
  globalUseStoch: boolean;
  globalUseEma: boolean;
  globalUseVwap: boolean;
  globalUseConfluence: boolean;
  globalUseDivergence: boolean;
  globalUseMomentum: boolean;
  globalVolatilityEnabled: boolean;
  globalLongCandleThreshold: number;
  globalVolumeSpikeThreshold: number;
  fundingRate: { rate: number; annualized: number } | null;
  orderFlowData: { ratio: number; pressure: string; buyVolume1m: number; sellVolume1m: number } | null;
  smartMoneyScore: { score: number; label: string } | null;
}) {
  const isStarred = watchlist.has(entry.symbol);
  const [isVisible, setIsVisible] = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        setIsVisible(e.isIntersecting);
        reportVisibility(entry.symbol, e.isIntersecting);
      },
      { threshold: 0.01 }
    );
    if (rowRef.current) observer.observe(rowRef.current);
    return () => {
      observer.disconnect();
      reportVisibility(entry.symbol, false);
    };
  }, [entry.symbol, reportVisibility]);

  // ─── Atomic Real-Time State (Viewport Aware) ───
  const tick = useSymbolPrice(entry.symbol, entry.price, isVisible);

  const liveState = useMemo(() => {
    if (!tick) return null;
    const config = coinConfigs[entry.symbol];
    const r1mP = config?.rsi1mPeriod ?? 14;
    const r5mP = config?.rsi5mPeriod ?? 14;
    const r15mP = config?.rsi15mPeriod ?? 14;
    const r1hP = config?.rsi1hPeriod ?? 14;
    const obT = config?.overboughtThreshold ?? globalOverbought;
    const osT = config?.oversoldThreshold ?? globalOversold;

    let rsi1m = entry.rsi1m;
    let rsi5m = entry.rsi5m;
    let rsi15m = entry.rsi15m;
    let rsi1h = entry.rsi1h;
    let rsiCustom = entry.rsiCustom;
    if (entry.rsiState1m) rsi1m = approximateRsi(entry.rsiState1m, tick.price, r1mP);
    if (entry.rsiState5m) rsi5m = approximateRsi(entry.rsiState5m, tick.price, r5mP);
    if (entry.rsiState15m) rsi15m = approximateRsi(entry.rsiState15m, tick.price, r15mP);
    if (entry.rsiState1h) rsi1h = approximateRsi(entry.rsiState1h, tick.price, r1hP);
    if (entry.rsiStateCustom && entry.rsiPeriodAtCreation === rsiPeriod) {
      rsiCustom = approximateRsi(entry.rsiStateCustom, tick.price, rsiPeriod);
    }
    let ema9 = entry.ema9;
    let ema21 = entry.ema21;
    if (ema9 !== null) ema9 = approximateEma(ema9, tick.price, 9);
    if (ema21 !== null) ema21 = approximateEma(ema21, tick.price, 21);
    let emaCross = entry.emaCross;
    if (ema9 !== null && ema21 !== null) emaCross = ema9 > ema21 ? "bullish" : "bearish";
    let bbPosition = entry.bbPosition;
    if (entry.bbUpper !== null && entry.bbLower !== null) {
      const range = entry.bbUpper - entry.bbLower;
      if (range > 0) bbPosition = (tick.price - entry.bbLower) / range;
    }
    const volumeSpikeThreshold =
      config?.volumeSpikeThreshold != null && config.volumeSpikeThreshold > 0
        ? config.volumeSpikeThreshold
        : globalVolumeSpikeThreshold;

    const liveVolumeSpike =
      tick.curCandleVol != null &&
      tick.avgVolume1m != null &&
      tick.avgVolume1m > 0 &&
      (tick.curCandleVol / tick.avgVolume1m) >= volumeSpikeThreshold;

    // Intelligence: Derive real-time signal tag based on user threshold preferences
    const isCustomMode = globalSignalThresholdMode === 'custom';
    const signal = isCustomMode
      ? deriveSignal(rsi15m ?? rsi1m, obT, osT)
      : deriveSignal(rsi15m ?? rsi1m, globalOverbought, globalOversold);

    const liveStrategy = computeStrategyScore({
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: entry.macdHistogram,
      bbPosition,
      stochK: entry.stochK,
      stochD: entry.stochD,
      emaCross,
      vwapDiff: entry.vwapDiff,
      volumeSpike: liveVolumeSpike || entry.volumeSpike,
      price: tick.price,
      confluence: entry.confluence,
      rsiDivergence: entry.rsiDivergence,
      momentum: entry.momentum,
      enabledIndicators: {
        rsi: globalUseRsi,
        macd: globalUseMacd,
        bb: globalUseBb,
        stoch: globalUseStoch,
        ema: globalUseEma,
        vwap: globalUseVwap,
        confluence: globalUseConfluence,
        divergence: globalUseDivergence,
        momentum: globalUseMomentum
      }
    });
    return {
      price: tick.price,
      change24h: tick.change24h,
      volume24h: tick.volume24h,
      rsi1m: tick.rsi1m ?? rsi1m,
      rsi5m: tick.rsi5m ?? rsi5m,
      rsi15m: tick.rsi15m ?? rsi15m,
      rsi1h: tick.rsi1h ?? rsi1h,
      rsiCustom: tick.rsiCustom ?? rsiCustom,
      ema9: tick.ema9 ?? ema9,
      ema21: tick.ema21 ?? ema21,
      emaCross: (tick.emaCross as any) ?? emaCross,
      bbPosition: tick.bbPosition ?? bbPosition,
      signal,
      rsiDivergence: entry.rsiDivergence,
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
      confluence: entry.confluence,
      rsiDivergenceCustom: entry.rsiDivergenceCustom,
      momentum: entry.momentum,
      atr: entry.atr,
      adx: entry.adx,
      vwapDiff: entry.vwapDiff,
      volumeSpike: liveVolumeSpike || entry.volumeSpike,
      stochK: entry.stochK,
      stochD: entry.stochD,
      bbUpper: entry.bbUpper,
      bbLower: entry.bbLower,
      bbMiddle: entry.bbMiddle,
      vwap: entry.vwap,
      macdLine: entry.macdLine,
      macdSignal: entry.macdSignal,
      confluenceLabel: entry.confluenceLabel,
      strategyScore: tick.strategyScore ?? liveStrategy.score,
      strategySignal: (tick.strategySignal as any) ?? liveStrategy.signal,
      strategyLabel: tick.strategyScore !== undefined
        ? (tick.strategyScore >= 50 ? 'Strong Buy'
          : tick.strategyScore >= 20 ? 'Buy'
            : tick.strategyScore <= -50 ? 'Strong Sell'
              : tick.strategyScore <= -20 ? 'Sell'
                : 'Neutral')
        : liveStrategy.label,
      strategyReasons: liveStrategy.reasons,
      lastPriceChange: tick.tickDelta || 0,
      curCandleSize: tick.curCandleSize ?? entry.curCandleSize,
      curCandleVol: tick.curCandleVol ?? entry.curCandleVol,
      avgBarSize1m: tick.avgBarSize1m ?? entry.avgBarSize1m,
      avgVolume1m: tick.avgVolume1m ?? entry.avgVolume1m,
      candleDirection: tick.candleDirection,
      isLiveRsi: true
    };
  }, [
    tick, coinConfigs, entry, rsiPeriod,
    globalUseRsi, globalUseMacd, globalUseBb, globalUseStoch, globalUseEma,
    globalUseVwap, globalUseConfluence, globalUseDivergence, globalUseMomentum,
    globalShowSignalTags, globalSignalThresholdMode, globalThresholdsEnabled,
    globalOverbought, globalOversold, globalVolatilityEnabled
  ]);

  const display = liveState || {
    price: entry.price,
    change24h: entry.change24h,
    volume24h: entry.volume24h,
    rsi1m: entry.rsi1m,
    rsi5m: entry.rsi5m,
    rsi15m: entry.rsi15m,
    rsi1h: entry.rsi1h,
    rsiCustom: entry.rsiCustom,
    ema9: entry.ema9,
    ema21: entry.ema21,
    emaCross: entry.emaCross,
    bbPosition: entry.bbPosition,
    signal: globalShowSignalTags ? entry.signal : 'neutral',
    strategyScore: entry.strategyScore,
    strategySignal: entry.strategySignal,
    strategyLabel: entry.strategyLabel,
    strategyReasons: entry.strategyReasons,
    rsiDivergence: entry.rsiDivergence,
    rsiDivergenceCustom: entry.rsiDivergenceCustom,
    momentum: entry.momentum,
    atr: entry.atr,
    adx: entry.adx,
    vwapDiff: entry.vwapDiff,
    volumeSpike: entry.volumeSpike,
    macdHistogram: entry.macdHistogram,
    confluence: entry.confluence,
    stochK: entry.stochK,
    stochD: entry.stochD,
    bbUpper: entry.bbUpper,
    bbLower: entry.bbLower,
    bbMiddle: entry.bbMiddle,
    vwap: entry.vwap,
    macdLine: entry.macdLine,
    macdSignal: entry.macdSignal,
    confluenceLabel: entry.confluenceLabel,
    lastPriceChange: 0,
    curCandleSize: entry.curCandleSize,
    curCandleVol: entry.curCandleVol,
    avgBarSize1m: entry.avgBarSize1m,
    avgVolume1m: entry.avgVolume1m,
    candleDirection: entry.candleDirection,
    isLiveRsi: entry.isLiveRsi
  };
  // Intelligence: Signal Pulse state
  const [isFlash, setIsFlash] = useState(false);
  const prevSignal = useRef(display.strategySignal);

  useEffect(() => {
    if (isVisible && prevSignal.current !== display.strategySignal) {
      setIsFlash(true);
      const timer = setTimeout(() => setIsFlash(false), 3000);
      prevSignal.current = display.strategySignal;
      return () => clearTimeout(timer);
    }
    if (prevSignal.current !== display.strategySignal) {
      prevSignal.current = display.strategySignal;
    }
  }, [display.strategySignal, isVisible]);

  return (
    <tr
      ref={rowRef}
      className={cn(
        "group transition-colors duration-300 hover:bg-white/[0.04]",
        !isFlash && getRsiBg(display.rsiCustom ?? display.rsi15m)
      )}
      style={{
        backgroundColor: isFlash
          ? (display.strategySignal.includes('buy') ? 'rgba(57, 255, 20, 0.1)' : display.strategySignal.includes('sell') ? 'rgba(114, 47, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)')
          : 'transparent',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 64px'
      } as any}
    >
      {visibleCols.has('rank') && (
        <td className="px-4 py-4 text-[10px] text-slate-700 font-black tabular-nums">{idx + 1}</td>
      )}
      <td className="px-2 py-4 text-center">
        <button
          onClick={() => toggleWatchlist(entry.symbol)}
          className={cn(
            "transition-all duration-200 transform hover:scale-125 focus:outline-none",
            isStarred ? "text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]" : "text-slate-800 hover:text-slate-600"
          )}
        >
          <Star size={13} fill={isStarred ? "currentColor" : "none"} strokeWidth={isStarred ? 0 : 2} />
        </button>
      </td>
      <td className="px-3 py-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-white text-[13px] tracking-tight hover:text-[#39FF14] transition-colors cursor-pointer" onClick={() => onOpenSettings(entry.symbol)}>{getSymbolAlias(entry.symbol)}</span>
            <MarketBadge market={entry.market} />
            {entry.market !== 'Crypto' && entry.marketState !== 'REGULAR' && (
              <span className="text-[7px] px-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-sm font-black uppercase tracking-tighter shadow-[0_0_8px_rgba(255,75,92,0.1)]">
                {entry.marketState || 'CLOSED'}
              </span>
            )}
          </div>
          {entry.market === 'Crypto' && <span className="text-slate-700 text-[8px] font-black uppercase tracking-wider opacity-60">USDT</span>}
          {entry.market !== 'Crypto' && <span className="text-slate-700 text-[8px] font-black uppercase tracking-wider opacity-60">{getSymbolTicker(entry.symbol)}</span>}
        </div>
      </td>
      <td className="px-3 py-4 text-right tabular-nums font-bold font-mono text-[13px]">
        <span
          className={cn(
            display.lastPriceChange > 0 ? "text-[#39FF14]" : display.lastPriceChange < 0 ? "text-[#FF4B5C]" : "text-slate-100"
          )}
        >
          ${formatPrice(display.price)}
        </span>
      </td>
      <td className={cn(
        "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono",
        display.change24h > 0 ? "text-[#39FF14]" : display.change24h < 0 ? "text-[#FF4B5C]" : "text-slate-600"
      )}>
        <div className="flex items-center justify-end gap-1.5">
          {display.change24h > 0 ? <TrendingUp size={11} className="drop-shadow-[0_0_5px_rgba(57,255,20,0.3)]" /> : display.change24h < 0 ? <TrendingDown size={11} className="drop-shadow-[0_0_5px_rgba(255,75,92,0.3)]" /> : null}
          {display.change24h > 0 ? '+' : ''}{display.change24h.toFixed(2)}%
        </div>
      </td>
      <td className="px-3 py-4 text-right text-[10px] text-slate-600 tabular-nums font-bold">
        {formatVolume(display.volume24h)}
      </td>

      {visibleCols.has('rsi1m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi1m}
          field="rsi1mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
          disabled={!globalUseRsi}
        />
      )}
      {visibleCols.has('rsi5m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi5m}
          field="rsi5mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
          disabled={!globalUseRsi}
        />
      )}
      {visibleCols.has('rsi15m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi15m}
          field="rsi15mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
          disabled={!globalUseRsi}
        />
      )}
      {visibleCols.has('rsi1h') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi1h}
          field="rsi1hPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
          disabled={!globalUseRsi}
        />
      )}

      {visibleCols.has('ema9') && (
        <td className={cn(
          "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono",
          globalUseEma ? "text-slate-300" : "text-slate-700/40"
        )}>
          {globalUseEma && display.ema9 ? `$${formatPrice(display.ema9)}` : '—'}
        </td>
      )}
      {visibleCols.has('ema21') && (
        <td className={cn(
          "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono",
          globalUseEma ? "text-slate-400" : "text-slate-700/40"
        )}>
          {globalUseEma && display.ema21 ? `$${formatPrice(display.ema21)}` : '—'}
        </td>
      )}

      {visibleCols.has('rsiCustom') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono relative transition-all duration-300",
          entry.rsiPeriodAtCreation !== rsiPeriod ? "bg-slate-800/10 opacity-30" : "bg-[#39FF14]/5",
          getRsiColor(display.rsiCustom)
        )}>
          <div className="flex items-center justify-end gap-1.5 flex-wrap max-w-[120px] ml-auto">
            {display.isLiveRsi && entry.rsiPeriodAtCreation === rsiPeriod && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse border border-[#39FF14]/50" title="Real-Time Analysis" />
            )}

            {/* Intelligence: Early Signal Badge - Only show if periods match to ensure formula accuracy */}
            {globalUseRsi && entry.rsiPeriodAtCreation === rsiPeriod && display.rsiCustom !== null && display.rsi15m !== null && (
              <>
                {display.rsiCustom <= 30 && display.rsi15m > 30 && (
                  <span className="text-[7px] px-1 bg-[#39FF14]/30 text-[#39FF14] rounded-full animate-pulse border border-[#39FF14]/30" title="Early Oversold (Custom Period)">EARLY BUY</span>
                )}
                {display.rsiCustom >= 70 && display.rsi15m < 70 && (
                  <span className="text-[7px] px-1 bg-[#722f37]/30 text-[#FF4B5C] rounded-full animate-pulse border border-[#FF4B5C]/30" title="Early Overbought (Custom Period)">EARLY SELL</span>
                )}
              </>
            )}

            {entry.rsiPeriodAtCreation === rsiPeriod && globalUseDivergence && display.rsiDivergenceCustom && display.rsiDivergenceCustom !== 'none' && (
              <span className={cn(
                "text-[8px] px-1 rounded-sm font-black tracking-tighter uppercase",
                display.rsiDivergenceCustom === 'bullish' ? "bg-[#39FF14]/20 text-[#39FF14]" : "bg-[#722f37]/20 text-[#FF4B5C]"
              )}>
                {display.rsiDivergenceCustom === 'bullish' ? 'DIV+' : 'DIV-'}
              </span>
            )}
            <span className="drop-shadow-sm font-black">
              {entry.rsiPeriodAtCreation === rsiPeriod ? formatRsi(display.rsiCustom) : '—'}
            </span>
          </div>
        </td>
      )}
      {visibleCols.has('emaCross') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase transition-opacity duration-300",
          !globalUseEma && "opacity-20 grayscale"
        )}>
          {display.emaCross !== 'none' && (
            <span className={cn(
              "px-2 py-1 rounded border",
              display.emaCross === 'bullish' ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5" :
                display.emaCross === 'bearish' ? "text-[#FF4B5C] border-[#722f37]/20 bg-[#722f37]/5" :
                  "text-slate-700 border-transparent"
            )}>
              {display.emaCross || '—'}
            </span>
          )}
          {display.emaCross === 'none' && <span className="text-slate-700 opacity-40">—</span>}
        </td>
      )}

      {visibleCols.has('macdHistogram') && (
        <td className={cn(
          "px-3 py-4 text-right text-[11px] tabular-nums font-bold font-mono transition-opacity duration-300",
          !globalUseMacd && "opacity-20 grayscale",
          display.macdHistogram === null ? "text-slate-700" : display.macdHistogram > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {formatNum(display.macdHistogram, 4)}
        </td>
      )}

      {visibleCols.has('bbUpper') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono",
          globalUseBb ? "text-[#FF4B5C]/70" : "text-slate-700/40"
        )}>
          {globalUseBb && display.bbUpper ? `$${formatPrice(display.bbUpper)}` : '—'}
        </td>
      )}
      {visibleCols.has('bbLower') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono",
          globalUseBb ? "text-[#39FF14]/70" : "text-slate-700/40"
        )}>
          {globalUseBb && display.bbLower ? `$${formatPrice(display.bbLower)}` : '—'}
        </td>
      )}

      {visibleCols.has('bbPosition') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono transition-opacity duration-300",
          !globalUseBb && "opacity-20 grayscale",
          display.bbPosition === null ? "text-slate-700" : display.bbPosition < 0.2 ? "text-[#39FF14]" : display.bbPosition > 0.8 ? "text-[#FF4B5C]" : "text-slate-400"
        )}>
          {globalUseBb ? formatNum(display.bbPosition) : '—'}
        </td>
      )}

      {visibleCols.has('stochK') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono transition-opacity duration-300",
          !globalUseStoch && "opacity-20 grayscale"
        )}>
          {globalUseStoch ? (
            <>
              <span className={getRsiColor(display.stochK)}>{formatRsi(display.stochK)}</span>
              {display.stochD !== null && <span className="text-slate-600 ml-1">/{display.stochD.toFixed(0)}</span>}
            </>
          ) : <span className="text-slate-700">—</span>}
        </td>
      )}

      {visibleCols.has('confluence') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase tracking-tighter",
          display.confluence >= 15 ? "text-[#39FF14]" : display.confluence <= -15 ? "text-[#FF4B5C]" : "text-slate-600"
        )}>
          {display.confluenceLabel || '—'}
        </td>
      )}

      {visibleCols.has('divergence') && (
        <td className="px-3 py-4 text-right text-[10px] font-black uppercase">
          {display.rsiDivergence === 'bullish' ? <span className="text-[#39FF14]">Bull Div</span> :
            display.rsiDivergence === 'bearish' ? <span className="text-[#FF4B5C]">Bear Div</span> : '—'}
        </td>
      )}

      {visibleCols.has('vwapDiff') && (
        <td className={cn(
          "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono transition-opacity duration-300",
          !globalUseVwap && "opacity-20 grayscale",
          display.vwapDiff === null ? "text-slate-700" : display.vwapDiff > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {globalUseVwap ? formatPct(display.vwapDiff) : '—'}
        </td>
      )}
      {visibleCols.has('longCandle') && (
        <td className={cn(
          "px-3 py-4 text-right text-[11px] tabular-nums font-bold font-mono",
          !globalVolatilityEnabled || display.curCandleSize == null || display.avgBarSize1m == null || display.avgBarSize1m <= 0 || (display.curCandleSize / display.avgBarSize1m) < globalLongCandleThreshold ? "text-slate-600" : "text-amber-400"
        )}>

          {globalVolatilityEnabled && display.curCandleSize != null && display.avgBarSize1m != null && display.avgBarSize1m > 0 ? (
            <div className="flex items-center justify-end gap-1.5">
              {display.isLiveRsi && (
                <div className="w-1 h-1 rounded-full bg-[#39FF14] animate-pulse" title="Real-Time" />
              )}
              {(display.curCandleSize / display.avgBarSize1m) >= (globalLongCandleThreshold * 0.8) && (
                <span className={cn("text-[8px]", display.candleDirection === 'bullish' ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                  {display.candleDirection === 'bullish' ? '🟢' : '🔴'}
                </span>
              )}
              <span>{Number.isFinite(display.curCandleSize / display.avgBarSize1m) ? `${(display.curCandleSize / display.avgBarSize1m).toFixed(1)}x` : '0.0x'}</span>
            </div>
          ) : '—'}
        </td>
      )}
      {visibleCols.has('volumeSpike') && (
        <td className={cn(
          "px-3 py-4 text-right text-[11px] tabular-nums font-bold font-mono",
          !globalVolatilityEnabled || display.curCandleVol == null || display.avgVolume1m == null || display.avgVolume1m <= 0 || (display.curCandleVol / display.avgVolume1m) < globalVolumeSpikeThreshold ? "text-slate-600" : "text-[#39FF14]"
        )}>
          {globalVolatilityEnabled && display.curCandleVol != null && display.avgVolume1m != null && display.avgVolume1m > 0 ? (
            <div className="flex items-center justify-end gap-1.5">
              {display.isLiveRsi && (
                <div className="w-1 h-1 rounded-full bg-[#39FF14] animate-pulse" title="Real-Time" />
              )}
              <span>{Number.isFinite(display.curCandleVol / display.avgVolume1m) ? `${(display.curCandleVol / display.avgVolume1m).toFixed(1)}x` : '0.0x'}</span>
            </div>
          ) : '—'}
        </td>
      )}

      {visibleCols.has('momentum') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono transition-opacity duration-300",
          !globalUseMomentum && "opacity-20 grayscale",
          display.momentum === null ? "text-slate-700" : display.momentum > 0 ? "text-emerald-300" : display.momentum < 0 ? "text-red-300" : "text-slate-500"
        )}>
          {globalUseMomentum ? formatPct(display.momentum) : '—'}
        </td>
      )}

      {visibleCols.has('atr') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono text-amber-300/80">
          {display.atr !== null ? display.atr.toFixed(display.atr < 1 ? 6 : 2) : '—'}
        </td>
      )}
      {visibleCols.has('adx') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono",
          display.adx === null ? "text-slate-700" : display.adx >= 25 ? "text-[#39FF14]" : "text-slate-500"
        )}>
          {display.adx !== null ? display.adx.toFixed(1) : '—'}
        </td>
      )}

      {/* ─── Derivatives Intelligence Cells ─── */}
      {visibleCols.has('fundingRate') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono">
          {fundingRate ? (
            <div className="flex flex-col items-end">
              <span className={fundingRate.rate > 0 ? "text-green-400" : fundingRate.rate < 0 ? "text-red-400" : "text-slate-500"}>
                {fundingRate.rate > 0 ? '+' : ''}{(fundingRate.rate * 100).toFixed(4)}%
              </span>
              <span className="text-[7px] text-slate-600">{fundingRate.annualized.toFixed(0)}% APR</span>
            </div>
          ) : <span className="text-slate-700">—</span>}
        </td>
      )}
      {visibleCols.has('orderFlow') && (
        <td className="px-3 py-4 text-right">
          {orderFlowData ? (
            <div className="flex items-center justify-end gap-1">
              <div className="w-10 h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                <div className="h-full bg-green-500/60" style={{ width: `${orderFlowData.ratio * 100}%` }} />
                <div className="h-full bg-red-500/60" style={{ width: `${(1 - orderFlowData.ratio) * 100}%` }} />
              </div>
              <span className={cn("text-[8px] font-black",
                orderFlowData.pressure === 'strong-buy' ? "text-green-400" :
                orderFlowData.pressure === 'buy' ? "text-green-400/70" :
                orderFlowData.pressure === 'strong-sell' ? "text-red-400" :
                orderFlowData.pressure === 'sell' ? "text-red-400/70" : "text-slate-500"
              )}>
                {(orderFlowData.ratio * 100).toFixed(0)}%
              </span>
            </div>
          ) : <span className="text-slate-700 text-[10px]">—</span>}
        </td>
      )}
      {visibleCols.has('smartMoney') && (
        <td className="px-3 py-4 text-right">
          {smartMoneyScore ? (
            <span className={cn(
              "text-[9px] font-black px-1.5 py-0.5 rounded-md",
              smartMoneyScore.score >= 60 ? "bg-green-500/15 text-green-400" :
              smartMoneyScore.score >= 30 ? "bg-green-500/10 text-green-400/70" :
              smartMoneyScore.score <= -60 ? "bg-red-500/15 text-red-400" :
              smartMoneyScore.score <= -30 ? "bg-red-500/10 text-red-400/70" :
              "bg-slate-800 text-slate-500"
            )}>
              {smartMoneyScore.score > 0 ? '+' : ''}{smartMoneyScore.score}
            </span>
          ) : <span className="text-slate-700 text-[10px]">—</span>}
        </td>
      )}

      <td className="px-3 py-4 text-right">
        {display.signal !== 'neutral' && <SignalBadge signal={display.signal.toLowerCase() as any} />}

      </td>

      {visibleCols.has('strategy') && (
        <td className="px-3 py-4 text-right min-w-[120px]">
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <span suppressHydrationWarning className="text-[9px] font-black text-slate-600 tabular-nums uppercase" title="Time since signal started">
                {formatTimeAgo(entry.signalStartedAt)}
              </span>
              <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, Math.abs(display.strategyScore))}%` }}
                  className={cn("h-full rounded-full transition-colors duration-1000", getScoreBarColor(display.strategyScore))}
                  style={{ marginLeft: display.strategyScore < 0 ? 'auto' : 0 }}
                />
              </div>
              <span className="text-[10px] font-black tabular-nums text-slate-500">{display.strategyScore}</span>
            </div>
            <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} reasons={display.strategyReasons} entry={entry} />
          </div>
        </td>
      )}
      <td className="px-3 py-4 text-right hidden sm:table-cell">
        <button
          onClick={() => onOpenSettings(entry.symbol)}
          className="p-2 text-slate-600 hover:text-[#39FF14] hover:bg-[#39FF14]/10 rounded-lg transition-all active:scale-90"
          title="Customize RSI"
        >
          <Settings size={14} />
        </button>
      </td>
    </tr>
  );
});

// ─── Sortable Column Header ───────────────────────────────────

function SortHeader({
  label,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = currentKey === key;
  return (
    <th
      onClick={() => onSort(key)}
      className={cn(
        "px-3 py-3 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none transition-all duration-200 hover:text-white whitespace-nowrap",
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[#39FF14] bg-[#39FF14]/5' : 'text-slate-500'
      )}
    >
      <span className={cn("flex items-center gap-1.5", align === 'right' ? "justify-end" : "justify-start")}>
        {align === 'right' && active && (
          <motion.span
            initial={{ y: currentDir === 'asc' ? 2 : -2, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-[#39FF14]"
          >
            {currentDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </motion.span>
        )}
        {label}
        {align !== 'right' && active && (
          <motion.span
            initial={{ y: currentDir === 'asc' ? 2 : -2, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-[#39FF14]"
          >
            {currentDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </motion.span>
        )}
      </span>
    </th>
  );
}

// ─── Editable RSI Cell (Inline Editing) ──────────────────────────

function EditableRsiCell({
  symbol,
  rsi,
  field,
  currentConfig,
  onSave,
  disabled
}: {
  symbol: string;
  rsi: number | null;
  field: string;
  currentConfig?: any;
  onSave: (symbol: string, config: any) => Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentConfig?.[field] ?? 14);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const period = Math.min(Math.max(val, 2), 50);
    await onSave(symbol, { ...currentConfig, [field]: period });
    setEditing(false);
  };

  const currentPeriod = currentConfig?.[field] ?? 14;

  if (disabled) {
    return (
      <td className="px-3 py-4 text-right text-sm tabular-nums font-bold font-mono text-slate-700/40">
        —
      </td>
    );
  }

  if (editing) {
    return (
      <td className="px-1 py-4 text-right">
        <input
          ref={inputRef}
          type="number"
          value={val}
          onChange={(e) => setVal(parseInt(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="w-12 bg-slate-950 border border-[#39FF14]/50 rounded px-1 py-0.5 text-xs text-center text-white font-mono font-bold"
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => setEditing(true)}
      className={cn(
        "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono cursor-pointer group/cell relative transition-all",
        currentPeriod !== 14 ? "bg-[#39FF14]/[0.03]" : "hover:bg-white/[0.03]",
        getRsiColor(rsi)
      )}
    >
      <div className="flex flex-col items-end leading-none">
        <span>{formatRsi(rsi)}</span>
        <span className="text-[7px] text-slate-600 font-black opacity-0 group-hover/cell:opacity-100 transition-opacity">P:{currentPeriod}</span>
      </div>
      {currentPeriod !== 14 && (
        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#39FF14]/40" title={`Custom Period: ${currentPeriod}`} />
      )}
    </td>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 15 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-4">
              <div className={cn("skeleton h-4 bg-white/5 animate-pulse rounded", j === 0 ? 'w-6' : j === 1 ? 'w-20' : 'w-14 ml-auto')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Column definitions ───────────────────────────────────────

type ColumnId =
  | 'rank' | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h' | 'rsiCustom'
  | 'ema9' | 'ema21' | 'emaCross' | 'macdHistogram' | 'bbUpper' | 'bbLower' | 'bbPosition' | 'stochK'
  | 'vwapDiff' | 'volumeSpike' | 'longCandle' | 'strategy'
  | 'confluence' | 'divergence' | 'momentum'
  | 'atr' | 'adx'
  | 'fundingRate' | 'orderFlow' | 'smartMoney';

interface ColumnDef {
  id: ColumnId;
  label: string;
  group: string;
  defaultVisible: boolean;
}

const OPTIONAL_COLUMNS: ColumnDef[] = [
  { id: 'rank', label: 'Rank #', group: 'Asset', defaultVisible: true },
  { id: 'rsi1m', label: 'RSI 1m', group: 'RSI Std', defaultVisible: false },
  { id: 'rsi5m', label: 'RSI 5m', group: 'RSI Std', defaultVisible: false },
  { id: 'rsi15m', label: 'RSI 15m', group: 'RSI Std', defaultVisible: true },
  { id: 'rsi1h', label: 'RSI 1h', group: 'RSI Std', defaultVisible: true },
  { id: 'rsiCustom', label: 'RSI Custom', group: 'RSI Active', defaultVisible: true },
  { id: 'ema9', label: 'EMA 9', group: 'Moving Avg', defaultVisible: false },
  { id: 'ema21', label: 'EMA 21', group: 'Moving Avg', defaultVisible: false },
  { id: 'emaCross', label: 'Trend', group: 'Indicators', defaultVisible: true },
  { id: 'macdHistogram', label: 'MACD', group: 'Indicators', defaultVisible: true },
  { id: 'bbUpper', label: 'BB Upper', group: 'Volatility', defaultVisible: false },
  { id: 'bbLower', label: 'BB Lower', group: 'Volatility', defaultVisible: false },
  { id: 'bbPosition', label: 'BB Pos', group: 'Volatility', defaultVisible: false },
  { id: 'stochK', label: 'Stoch RSI', group: 'Momentum', defaultVisible: false },
  { id: 'vwapDiff', label: 'VWAP %', group: 'Volume', defaultVisible: false },
  { id: 'confluence', label: 'Confluence', group: 'Intelligence', defaultVisible: true },
  { id: 'divergence', label: 'Divergence', group: 'Intelligence', defaultVisible: true },
  { id: 'momentum', label: 'Momentum', group: 'Intelligence', defaultVisible: false },
  { id: 'atr', label: 'ATR', group: 'Volatility', defaultVisible: false },
  { id: 'adx', label: 'ADX', group: 'Volatility', defaultVisible: false },
  { id: 'longCandle', label: 'Long Candle', group: 'Volatility', defaultVisible: true },
  { id: 'volumeSpike', label: 'Vol Spike', group: 'Volatility', defaultVisible: true },
  { id: 'fundingRate', label: 'Funding', group: 'Derivatives', defaultVisible: true },
  { id: 'orderFlow', label: 'Flow', group: 'Derivatives', defaultVisible: true },
  { id: 'smartMoney', label: 'Smart $', group: 'Derivatives', defaultVisible: true },
  { id: 'strategy', label: 'Strategy', group: 'Strategy', defaultVisible: true },
];

// ─── Main Dashboard ───────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '15s', value: 15, maxPairs: 300 },
  { label: '30s', value: 30, maxPairs: 600 },
  { label: '60s', value: 60, maxPairs: 1000 },
  { label: '2m', value: 120, maxPairs: 1200 },
  { label: 'Off', value: 0, maxPairs: 1200 },
];

const PAIR_COUNTS = [100, 200, 300, 500];

type DashboardEntitlements = {
  tier: 'owner' | 'subscribed' | 'trial' | 'free' | 'anonymous';
  isOwner: boolean;
  hasPaidAccess: boolean;
  isTrialing: boolean;
  maxRecords: number;
  availableRecordOptions: number[];
  features: {
    enableAlerts: boolean;
    enableAdvancedIndicators: boolean;
    enableCustomSettings: boolean;
  };
};

const DEFAULT_ENTITLEMENTS: DashboardEntitlements = {
  tier: 'trial',
  isOwner: false,
  hasPaidAccess: false,
  isTrialing: true,
  maxRecords: 100,
  availableRecordOptions: [100],
  features: {
    enableAlerts: false,
    enableAdvancedIndicators: false,
    enableCustomSettings: false,
  },
};

const SIGNAL_FILTERS: { label: string; value: SignalFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Str Buy', value: 'strong-buy' },
  { label: 'Buy', value: 'buy' },
  { label: 'Neutral', value: 'neutral' },
  { label: 'Sell', value: 'sell' },
  { label: 'Str Sell', value: 'strong-sell' },
  { label: 'Oversold', value: 'oversold' },
  { label: 'Overbought', value: 'overbought' },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1280);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

const ScreenerCard = memo(function ScreenerCard({
  entry,
  idx,
  watchlist,
  toggleWatchlist,
  rsiPeriod,
  onOpenSettings,
  coinConfigs,
  onSaveConfig,
  visibleCols,
  reportVisibility,
  exchange,
  globalShowSignalTags,
  globalSignalThresholdMode,
  globalThresholdsEnabled,
  globalOverbought,
  globalOversold,
  globalUseRsi,
  globalUseMacd,
  globalUseBb,
  globalUseStoch,
  globalUseEma,
  globalUseVwap,
  globalUseConfluence,
  globalUseDivergence,
  globalUseMomentum,
  globalVolatilityEnabled,
  globalLongCandleThreshold,
  globalVolumeSpikeThreshold,
  fundingRate,
  orderFlowData,
  smartMoneyScore,
}: {
  entry: ScreenerEntry;
  idx: number;
  watchlist: Set<string>;
  toggleWatchlist: (s: string) => void;
  rsiPeriod: number;
  onOpenSettings: (symbol: string) => void;
  coinConfigs: Record<string, any>;
  onSaveConfig: (symbol: string, config: any) => Promise<void>;
  visibleCols: Set<ColumnId>;
  reportVisibility: (symbol: string, isVisible: boolean) => void;
  exchange: string;
  globalShowSignalTags: boolean;
  globalSignalThresholdMode: 'default' | 'custom';
  globalThresholdsEnabled: boolean;
  globalOverbought: number;
  globalOversold: number;
  globalUseRsi: boolean;
  globalUseMacd: boolean;
  globalUseBb: boolean;
  globalUseStoch: boolean;
  globalUseEma: boolean;
  globalUseVwap: boolean;
  globalUseConfluence: boolean;
  globalUseDivergence: boolean;
  globalUseMomentum: boolean;
  globalVolatilityEnabled: boolean;
  globalLongCandleThreshold: number;
  globalVolumeSpikeThreshold: number;
  fundingRate: { rate: number; annualized: number } | null;
  orderFlowData: { ratio: number; pressure: string; buyVolume1m: number; sellVolume1m: number } | null;
  smartMoneyScore: { score: number; label: string } | null;
}) {
  const isStarred = watchlist.has(entry.symbol);

  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        setIsVisible(e.isIntersecting);
        reportVisibility(entry.symbol, e.isIntersecting);
      },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => {
      observer.disconnect();
      reportVisibility(entry.symbol, false);
    };
  }, [entry.symbol, reportVisibility]);

  // ─── Atomic Real-Time State (Viewport Aware) ───
  const tick = useSymbolPrice(entry.symbol, entry.price, isVisible);

  const liveState = useMemo(() => {
    if (!tick) return null;
    const config = coinConfigs[entry.symbol];
    const r1mP = config?.rsi1mPeriod ?? 14;
    const r5mP = config?.rsi5mPeriod ?? 14;
    const r15mP = config?.rsi15mPeriod ?? 14;
    const r1hP = config?.rsi1hPeriod ?? 14;
    const obT = config?.overboughtThreshold ?? 70;
    const osT = config?.oversoldThreshold ?? 30;
    let rsi1m = entry.rsi1m;
    let rsi5m = entry.rsi5m;
    let rsi15m = entry.rsi15m;
    let rsi1h = entry.rsi1h;
    let rsiCustom = entry.rsiCustom;
    if (entry.rsiState1m) rsi1m = approximateRsi(entry.rsiState1m, tick.price, r1mP);
    if (entry.rsiState5m) rsi5m = approximateRsi(entry.rsiState5m, tick.price, r5mP);
    if (entry.rsiState15m) rsi15m = approximateRsi(entry.rsiState15m, tick.price, r15mP);
    if (entry.rsiState1h) rsi1h = approximateRsi(entry.rsiState1h, tick.price, r1hP);
    if (entry.rsiStateCustom && entry.rsiPeriodAtCreation === rsiPeriod) {
      rsiCustom = approximateRsi(entry.rsiStateCustom, tick.price, rsiPeriod);
    }
    let ema9 = entry.ema9;
    let ema21 = entry.ema21;
    if (ema9 !== null) ema9 = approximateEma(ema9, tick.price, 9);
    if (ema21 !== null) ema21 = approximateEma(ema21, tick.price, 21);
    let emaCross = entry.emaCross;
    if (ema9 !== null && ema21 !== null) emaCross = ema9 > ema21 ? "bullish" : "bearish";
    let bbPosition = entry.bbPosition;
    if (entry.bbUpper !== null && entry.bbLower !== null) {
      const range = entry.bbUpper - entry.bbLower;
      if (range > 0) bbPosition = (tick.price - entry.bbLower) / range;
    }

    const volumeSpikeThreshold =
      config?.volumeSpikeThreshold != null && config.volumeSpikeThreshold > 0
        ? config.volumeSpikeThreshold
        : globalVolumeSpikeThreshold;
    const liveVolumeSpike =
      tick.curCandleVol != null &&
      tick.avgVolume1m != null &&
      tick.avgVolume1m > 0 &&
      (tick.curCandleVol / tick.avgVolume1m) >= volumeSpikeThreshold;

    const liveStrategy = computeStrategyScore({

      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: entry.macdHistogram,
      bbPosition,
      stochK: entry.stochK,
      stochD: entry.stochD,
      emaCross: (tick.emaCross as any) ?? emaCross,
      vwapDiff: entry.vwapDiff,
      volumeSpike: (tick.volumeSpike ?? liveVolumeSpike) || entry.volumeSpike,
      price: tick.price,
      confluence: entry.confluence,
      rsiDivergence: entry.rsiDivergence,
      momentum: entry.momentum,
      enabledIndicators: {
        rsi: globalUseRsi,
        macd: globalUseMacd,
        bb: globalUseBb,
        stoch: globalUseStoch,
        ema: globalUseEma,
        vwap: globalUseVwap,
        confluence: globalUseConfluence,
        divergence: globalUseDivergence,
        momentum: globalUseMomentum
      }
    });

    // Intelligence: Derive real-time signal tag based on user threshold preferences
    const isCustomMode = globalSignalThresholdMode === 'custom';
    const signal = isCustomMode
      ? deriveSignal(rsi15m ?? rsi1m, obT, osT)
      : deriveSignal(rsi15m ?? rsi1m, globalOverbought, globalOversold);




    return {
      price: tick.price,
      change24h: tick.change24h,

      volume24h: tick.volume24h,
      rsi1m: tick.rsi1m ?? rsi1m,
      rsi5m: tick.rsi5m ?? rsi5m,
      rsi15m: tick.rsi15m ?? rsi15m,
      rsi1h: tick.rsi1h ?? rsi1h,
      rsiCustom: tick.rsiCustom ?? rsiCustom,
      ema9: tick.ema9 ?? ema9,
      ema21: tick.ema21 ?? ema21,
      emaCross: (tick.emaCross as any) ?? emaCross,
      bbPosition: tick.bbPosition ?? bbPosition,
      signal,
      rsiDivergence: entry.rsiDivergence,
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
      confluence: entry.confluence,
      rsiDivergenceCustom: entry.rsiDivergenceCustom,
      momentum: entry.momentum,
      atr: entry.atr,
      adx: entry.adx,
      vwapDiff: entry.vwapDiff,
      volumeSpike: (tick.volumeSpike ?? liveVolumeSpike) || entry.volumeSpike,
      stochK: entry.stochK,
      stochD: entry.stochD,
      bbUpper: entry.bbUpper,
      bbLower: entry.bbLower,
      bbMiddle: entry.bbMiddle,
      vwap: entry.vwap,
      macdLine: entry.macdLine,
      macdSignal: entry.macdSignal,
      confluenceLabel: entry.confluenceLabel,
      strategyScore: tick.strategyScore ?? liveStrategy.score,
      strategySignal: (tick.strategySignal as any) ?? liveStrategy.signal,
      strategyLabel: tick.strategyScore !== undefined
        ? (tick.strategyScore >= 50 ? 'Strong Buy'
          : tick.strategyScore >= 20 ? 'Buy'
            : tick.strategyScore <= -50 ? 'Strong Sell'
              : tick.strategyScore <= -20 ? 'Sell'
                : 'Neutral')
        : liveStrategy.label,
      strategyReasons: liveStrategy.reasons,
      lastPriceChange: tick.tickDelta || 0,
      curCandleSize: tick.curCandleSize ?? entry.curCandleSize,
      curCandleVol: tick.curCandleVol ?? entry.curCandleVol,
      avgBarSize1m: tick.avgBarSize1m ?? entry.avgBarSize1m,
      avgVolume1m: tick.avgVolume1m ?? entry.avgVolume1m,
      candleDirection: tick.candleDirection,
      isLiveRsi: true
    };
  }, [
    tick, coinConfigs, entry, rsiPeriod,
    globalUseRsi, globalUseMacd, globalUseBb, globalUseStoch, globalUseEma,
    globalUseVwap, globalUseConfluence, globalUseDivergence, globalUseMomentum,
    globalShowSignalTags, globalSignalThresholdMode, globalThresholdsEnabled,
    globalOverbought, globalOversold, globalVolatilityEnabled, globalVolumeSpikeThreshold
  ]);

  const display = liveState || {
    price: entry.price,
    change24h: entry.change24h,
    volume24h: entry.volume24h,
    rsi1m: entry.rsi1m,
    rsi5m: entry.rsi5m,
    rsi15m: entry.rsi15m,
    rsi1h: entry.rsi1h,
    rsiCustom: entry.rsiCustom,
    ema9: entry.ema9,
    ema21: entry.ema21,
    emaCross: entry.emaCross,
    bbPosition: entry.bbPosition,
    signal: globalShowSignalTags ? entry.signal : 'neutral',
    strategyScore: entry.strategyScore,
    strategySignal: entry.strategySignal,
    strategyLabel: entry.strategyLabel,
    strategyReasons: entry.strategyReasons,
    rsiDivergence: entry.rsiDivergence,
    rsiDivergenceCustom: entry.rsiDivergenceCustom,
    momentum: entry.momentum,
    atr: entry.atr,
    adx: entry.adx,
    vwapDiff: entry.vwapDiff,
    volumeSpike: entry.volumeSpike,
    macdHistogram: entry.macdHistogram,
    confluence: entry.confluence,
    stochK: entry.stochK,
    stochD: entry.stochD,
    bbUpper: entry.bbUpper,
    bbLower: entry.bbLower,
    bbMiddle: entry.bbMiddle,
    vwap: entry.vwap,
    macdLine: entry.macdLine,
    macdSignal: entry.macdSignal,
    confluenceLabel: entry.confluenceLabel,
    lastPriceChange: 0,
    curCandleSize: entry.curCandleSize,
    curCandleVol: entry.curCandleVol,
    avgBarSize1m: entry.avgBarSize1m,
    avgVolume1m: entry.avgVolume1m,
    candleDirection: entry.candleDirection,
    isLiveRsi: entry.isLiveRsi
  };
  // Intelligence: Signal Pulse state
  const [isFlash, setIsFlash] = useState(false);
  const prevSignal = useRef(display.strategySignal);

  useEffect(() => {
    if (isVisible && prevSignal.current !== display.strategySignal) {
      setIsFlash(true);
      const timer = setTimeout(() => setIsFlash(false), 3000);
      prevSignal.current = display.strategySignal;
      return () => clearTimeout(timer);
    }
    if (prevSignal.current !== display.strategySignal) {
      prevSignal.current = display.strategySignal;
    }
  }, [display.strategySignal, isVisible]);

  // Dynamic columns to show in the small indicator area
  const activeIndicators = OPTIONAL_COLUMNS.filter(c => visibleCols?.has(c.id));

  return (
    <div
      ref={cardRef}
      onClick={() => onOpenSettings(entry.symbol)}
      className={cn(
        "relative flex items-center justify-between p-2 sm:p-3 border-b border-white/[0.03] active:bg-slate-800/40 transition-colors duration-500 cursor-pointer group",
        !isFlash && getRsiBg(display.rsiCustom ?? display.rsi15m)
      )}
      style={{
        backgroundColor: isFlash
          ? (display.strategySignal.includes('buy') ? 'rgba(57, 255, 20, 0.1)' : display.strategySignal.includes('sell') ? 'rgba(114, 47, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)')
          : 'transparent',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 64px'
      } as any}
    >
      {/* 1. Asset & Meta */}
      <div className="flex items-center gap-2 w-[110px] shrink-0">
        {visibleCols?.has('rank') && (
          <span className="text-[9px] font-black text-slate-700 w-4 tabular-nums">#{idx + 1}</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWatchlist(entry.symbol);
          }}
          className={cn("transition-all shrink-0", isStarred ? "text-yellow-400" : "text-slate-800")}
        >
          <Star size={12} fill={isStarred ? "currentColor" : "none"} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-black text-white text-sm tracking-tight">{getSymbolAlias(entry.symbol)}</span>
            <MarketBadge market={entry.market} />
            {entry.market !== 'Crypto' && entry.marketState !== 'REGULAR' && (
              <span className="text-[6px] px-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-sm font-black uppercase tracking-tighter">
                {entry.marketState || 'CLOSED'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="text-[7px] font-black text-slate-700 uppercase leading-none">
              {entry.market === 'Crypto' ? `${exchange.startsWith('bybit') ? 'Bybit' : 'Binance'}` : getSymbolTicker(entry.symbol)}
            </div>
            {display.signal !== 'neutral' && (
              <div className="scale-[0.65] origin-left -ml-1 -my-1">
                <SignalBadge signal={display.signal.toLowerCase() as any} />

              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Scalable Indicators Area */}
      <div
        className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 px-3 mx-2"
      >
        {activeIndicators.length === 0 ? (
          <div className="flex-1 flex justify-center italic text-[8px] text-slate-700 uppercase font-black tracking-widest">No Indicators Selected</div>
        ) : (
          activeIndicators.map(col => {
            const val = display[col.id as keyof typeof display];
            const isRsi = col.id.startsWith('rsi');

            return (
              <div key={col.id} className="flex flex-col items-center shrink-0 min-w-[32px]">
                <span className="text-[6px] font-black text-slate-600 uppercase mb-0.5">{col.label.replace('RSI ', '')}</span>
                {isRsi ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseRsi ? getRsiColor(val as number) : "text-slate-700/40")}>
                    {globalUseRsi ? formatRsi(val as number) : '—'}
                  </span>
                ) : col.id === 'strategy' ? (
                  <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} entry={entry} />
                ) : col.id === 'divergence' ? (
                  <span className={cn("text-[8px] font-black uppercase", display.rsiDivergence === 'bullish' ? "text-[#39FF14]" : display.rsiDivergence === 'bearish' ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.rsiDivergence === 'bullish' ? 'DIV+' : display.rsiDivergence === 'bearish' ? 'DIV-' : '—'}
                  </span>
                ) : col.id === 'vwapDiff' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseVwap && (val as number) > 0 ? "text-[#39FF14]" : globalUseVwap && (val as number) < 0 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {globalUseVwap ? formatPct(val as number) : '—'}
                  </span>
                ) : col.id === 'longCandle' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono flex items-center justify-center gap-1", (globalVolatilityEnabled && display.curCandleSize != null && display.avgBarSize1m != null && display.avgBarSize1m > 0 && (display.curCandleSize / display.avgBarSize1m) >= globalLongCandleThreshold) ? "text-amber-400" : "text-slate-700")}>
                    {globalVolatilityEnabled && display.curCandleSize != null && display.avgBarSize1m != null && display.avgBarSize1m > 0 ? (
                      <div className="flex items-center gap-1">
                        {display.isLiveRsi && (
                          <div className="w-1 h-1 rounded-full bg-[#39FF14] animate-pulse" title="Real-Time" />
                        )}
                        {(display.curCandleSize / display.avgBarSize1m) >= (globalLongCandleThreshold * 0.8) && (
                          <span className="text-[8px]">{display.candleDirection === 'bullish' ? '🟢' : '🔴'}</span>
                        )}
                        {Number.isFinite(display.curCandleSize / display.avgBarSize1m) ? `${(display.curCandleSize / display.avgBarSize1m).toFixed(1)}x` : '0.0x'}
                      </div>
                    ) : '—'}
                  </span>
                ) : col.id === 'volumeSpike' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono flex items-center justify-center gap-1", (globalVolatilityEnabled && display.curCandleVol != null && display.avgVolume1m != null && display.avgVolume1m > 0 && (display.curCandleVol / display.avgVolume1m) >= globalVolumeSpikeThreshold) ? "text-[#39FF14]" : "text-slate-700")}>
                    {globalVolatilityEnabled && display.curCandleVol != null && display.avgVolume1m != null && display.avgVolume1m > 0 ? (
                      <div className="flex items-center gap-1">
                        {display.isLiveRsi && (
                          <div className="w-1 h-1 rounded-full bg-[#39FF14] animate-pulse" title="Real-Time" />
                        )}
                        {Number.isFinite(display.curCandleVol / display.avgVolume1m) ? `${(display.curCandleVol / display.avgVolume1m).toFixed(1)}x` : '0.0x'}
                      </div>
                    ) : '—'}
                  </span>
                ) : col.id === 'momentum' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", globalUseMomentum && (val as number) > 0 ? "text-emerald-300" : globalUseMomentum && (val as number) < 0 ? "text-red-300" : "text-slate-500")}>
                    {globalUseMomentum ? formatPct(val as number) : '—'}
                  </span>
                ) : col.id === 'ema9' || col.id === 'ema21' ? (
                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                    {globalUseEma && typeof val === 'number' ? `$${formatPrice(val)}` : '—'}
                  </span>
                ) : col.id === 'bbUpper' || col.id === 'bbLower' ? (
                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                    {globalUseBb && typeof val === 'number' ? `$${formatPrice(val)}` : '—'}
                  </span>
                ) : col.id === 'macdHistogram' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", (val as number) > 0 ? "text-[#39FF14]" : (val as number) < 0 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {typeof val === 'number' ? val.toFixed(4) : '—'}
                  </span>
                ) : col.id === 'confluence' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", display.confluence >= 15 ? "text-[#39FF14]" : display.confluence <= -15 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.confluenceLabel || '—'}
                  </span>
                ) : col.id === 'emaCross' ? (
                  <span className={cn("text-[9px] font-bold uppercase", display.emaCross === 'bullish' ? "text-[#39FF14]" : display.emaCross === 'bearish' ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.emaCross !== 'none' ? (display.emaCross === 'bullish' ? 'BULL' : 'BEAR') : '—'}
                  </span>
                ) : col.id === 'stochK' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseStoch && (val as number) > 80 ? "text-[#FF4B5C]" : globalUseStoch && (val as number) < 20 ? "text-[#39FF14]" : "text-slate-300")}>
                    {globalUseStoch && typeof val === 'number' ? val.toFixed(1) : '—'}
                  </span>
                ) : col.id === 'bbPosition' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseBb && (val as number) >= 0.9 ? "text-[#FF4B5C]" : globalUseBb && (val as number) <= 0.1 ? "text-[#39FF14]" : "text-slate-300")}>
                    {globalUseBb && typeof val === 'number' ? val.toFixed(2) : '—'}
                  </span>
                ) : col.id === 'atr' || col.id === 'adx' ? (
                  <span className="text-[10px] font-black tabular-nums font-mono text-slate-300">
                    {globalVolatilityEnabled && typeof val === 'number' ? val.toFixed(col.id === 'atr' ? 4 : 1) : '—'}
                  </span>
                ) : col.id === 'fundingRate' ? (
                  <span className={cn("text-[9px] font-black tabular-nums",
                    fundingRate ? (fundingRate.rate > 0 ? "text-green-400" : fundingRate.rate < 0 ? "text-red-400" : "text-slate-500") : "text-slate-700"
                  )}>
                    {fundingRate ? `${fundingRate.rate > 0 ? '+' : ''}${(fundingRate.rate * 100).toFixed(3)}%` : '—'}
                  </span>
                ) : col.id === 'orderFlow' ? (
                  orderFlowData ? (
                    <div className="flex items-center gap-0.5">
                      <div className="w-6 h-1 rounded-full bg-slate-800 overflow-hidden flex">
                        <div className="h-full bg-green-500/60" style={{ width: `${orderFlowData.ratio * 100}%` }} />
                        <div className="h-full bg-red-500/60" style={{ width: `${(1 - orderFlowData.ratio) * 100}%` }} />
                      </div>
                    </div>
                  ) : <span className="text-slate-700 text-[9px]">—</span>
                ) : col.id === 'smartMoney' ? (
                  <span className={cn("text-[8px] font-black",
                    smartMoneyScore ? (
                      smartMoneyScore.score >= 30 ? "text-green-400" :
                      smartMoneyScore.score <= -30 ? "text-red-400" : "text-slate-500"
                    ) : "text-slate-700"
                  )}>
                    {smartMoneyScore ? `${smartMoneyScore.score > 0 ? '+' : ''}${smartMoneyScore.score}` : '—'}
                  </span>
                ) : (
                  <span className={cn(
                    "text-[9px] font-bold tabular-nums transition-colors duration-300",
                    display.isLiveRsi ? "text-[#39FF14]" : "text-slate-300"
                  )}>
                    {typeof val === 'number'
                      ? val.toFixed(2)
                      : typeof val === 'string'
                        ? val
                        : '—'}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. Market Info (Right) */}
      <div className="flex items-center gap-3 text-right shrink-0">
        <div className="flex flex-col items-end min-w-[65px]">
          <div className="flex items-center gap-1">
            {/* Data Freshness Indicator */}
            {tick && (
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500",
                  tick.updatedAt && (Date.now() - tick.updatedAt) < 5000
                    ? "bg-[#39FF14] animate-pulse shadow-[0_0_4px_rgba(57,255,20,0.6)]"
                    : tick.updatedAt && (Date.now() - tick.updatedAt) < 30000
                      ? "bg-amber-400"
                      : "bg-red-500/60"
                )}
                title={tick.updatedAt ? `Last tick: ${Math.round((Date.now() - tick.updatedAt) / 1000)}s ago` : 'No data'}
              />
            )}
            <span
              className={cn(
                "text-sm font-black font-mono tracking-tighter inline-block transition-opacity duration-500",
                tick && tick.updatedAt && (Date.now() - tick.updatedAt) > 30000 ? "opacity-40" : "opacity-100"
              )}
              style={{ color: display.lastPriceChange && display.lastPriceChange > 0 ? '#39FF14' : display.lastPriceChange && display.lastPriceChange < 0 ? '#FF4B5C' : '#ffffff' }}
            >
              ${formatPrice(display.price)}
            </span>
          </div>
          <div className={cn("text-[9px] font-black font-mono flex items-center gap-0.5", display.change24h >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
            {display.change24h > 0 ? '+' : ''}{display.change24h.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Animated Pulse for Signal */}
      {display.signal !== 'neutral' && (
        <div className={cn(
          "absolute inset-y-0 right-0 w-0.5",
          display.signal === 'oversold' ? "bg-[#39FF14]/40" : "bg-[#FF4B5C]/40"
        )} />
      )}
    </div>
  );
});

function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('crypto-rsi-watchlist') ?? '[]');
  } catch {
    return [];
  }
}

const BottomDock = memo(function BottomDock({
  onOpenAlerts,
  onOpenWatchlist,
  onOpenSettings,
  onGoHome,
  activeTab = 'home',
  alertCount,
}: {
  onOpenAlerts: () => void;
  onOpenWatchlist: () => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
  activeTab?: 'home' | 'alerts' | 'watchlist' | 'settings';
  alertCount: number;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] lg:hidden px-4 mb-8">
      <div className="rounded-3xl border border-white/10 bg-[#080F1B]/95 backdrop-blur-2xl shadow-[0_-12px_40px_rgba(0,0,0,1)] p-2 flex items-center justify-between pointer-events-auto">
        {[
          { id: 'home', icon: LayoutGrid, label: 'Home', onClick: onGoHome },
          { id: 'watchlist', icon: Star, label: 'Watchlist', onClick: onOpenWatchlist },
          { id: 'alerts', icon: Bell, label: 'Alerts', onClick: onOpenAlerts, count: alertCount },
          { id: 'settings', icon: Settings, label: 'Settings', onClick: onOpenSettings },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={cn(
                "relative flex flex-col items-center justify-center py-2 px-5 rounded-2xl transition-all active:scale-90",
                isActive ? "text-[#39FF14] bg-[#39FF14]/10" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <div className="relative">
                <Icon size={18} fill={isActive && (item.id === 'watchlist' || item.id === 'alerts') ? "currentColor" : "none"} />
                {item.count ? (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#FF4B5C] rounded-full border-2 border-[#090F1A] text-[7px] font-black text-white flex items-center justify-center shadow-lg">
                    {item.count > 9 ? '9+' : item.count}
                  </span>
                ) : null}
              </div>
              <span className="text-[8px] font-black uppercase mt-1 tracking-widest">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="activeDockDot"
                  className="absolute -bottom-0.5 w-1 h-1 bg-[#39FF14] rounded-full shadow-[0_0_8px_rgba(57,255,20,0.8)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default function ScreenerDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // ── Theme State ──
  const smartModeDefault = process.env.NEXT_PUBLIC_SMART_MODE_DEFAULT !== '0';
  // ── Asset Class State ──
  const [activeAssetClass, setActiveAssetClass] = useState<AssetClass>('crypto');
  // ── State ──
  const [data, setData] = useState<ScreenerEntry[]>([]);
  const isMobile = useIsMobile();
  const [meta, setMeta] = useState<ScreenerResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('strategyScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [pairCount, setPairCount] = useState(100);
  const [entitlements, setEntitlements] = useState<DashboardEntitlements>(DEFAULT_ENTITLEMENTS);
  const [smartMode, setSmartMode] = useState(smartModeDefault);
  const [showHeader, setShowHeader] = useState(true);
  const useAnimations = pairCount <= 600; // Disable heavy layout animations for large lists
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [countdown, setCountdown] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<number | null>(null);
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const [backoffUntil, setBackoffUntil] = useState<number | null>(null);
  const [consecutiveFetchFailures, setConsecutiveFetchFailures] = useState(0);
  const [latencyStats, setLatencyStats] = useState<{ lastMs: number | null; p50Ms: number | null; p95Ms: number | null }>({
    lastMs: null,
    p50Ms: null,
    p95Ms: null,
  });
  const [autoLoadShedding, setAutoLoadShedding] = useState<{ active: boolean; fromCount: number | null; toCount: number | null }>({
    active: false,
    fromCount: null,
    toCount: null,
  });
  const [globalThresholdsEnabled, setGlobalThresholdsEnabled] = useState(false);
  const [globalOverbought, setGlobalOverbought] = useState(90);
  const [globalOversold, setGlobalOversold] = useState(15);
  const [globalThresholdTimeframes, setGlobalThresholdTimeframes] = useState<string[]>(['1m', '5m', '15m', '1h']);
  const [globalLongCandleThreshold, setGlobalLongCandleThreshold] = useState(3.0);
  const [globalVolumeSpikeThreshold, setGlobalVolumeSpikeThreshold] = useState(5.0);
  const [globalVolatilityEnabled, setGlobalVolatilityEnabled] = useState(true);
  // ── Signal Tag Display Controls ──
  const [globalShowSignalTags, setGlobalShowSignalTags] = useState(false);
  const [globalSignalThresholdMode, setGlobalSignalThresholdMode] = useState<'default' | 'custom'>('custom');

  // ── Indicator Feature Flags ──
  const [globalUseRsi, setGlobalUseRsi] = useState(true);
  const [globalUseMacd, setGlobalUseMacd] = useState(true);
  const [globalUseBb, setGlobalUseBb] = useState(true);
  const [globalUseStoch, setGlobalUseStoch] = useState(true);
  const [globalUseEma, setGlobalUseEma] = useState(true);
  const [globalUseVwap, setGlobalUseVwap] = useState(true);
  const [globalUseConfluence, setGlobalUseConfluence] = useState(true);
  const [globalUseDivergence, setGlobalUseDivergence] = useState(true);
  const [globalUseMomentum, setGlobalUseMomentum] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'watchlist' | 'settings'>('home');
  const [coinConfigs, setCoinConfigs] = useState<Record<string, any>>({});
  const coinConfigsRef = useRef<Record<string, any>>({});
  const [selectedCoinForConfig, setSelectedCoinForConfig] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const fetchTokenRef = useRef(0);
  const dataLenRef = useRef(0);
  const visibleSymbolsRef = useRef<Set<string>>(new Set());
  const failureCountRef = useRef(0);
  const backoffUntilRef = useRef<number | null>(null);
  const circuitRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleSinceRef = useRef<number | null>(null);
  const latencyHistoryRef = useRef<number[]>([]);
  const adaptiveDownshiftRef = useRef<{ active: boolean; original: number | null }>({ active: false, original: null });
  const stableSuccessCountRef = useRef(0);

  // Use a refined mount-aware hydration strategy for client-only defaults
  const [hasMounted, setHasMounted] = useState(false);
  
  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push('/login');
            // Hard reload safety for institutional lag
            if (typeof window !== 'undefined') {
              setTimeout(() => { window.location.href = '/login'; }, 500);
            }
          }
        }
      });
    } catch (e) {
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  };

  const isOwner = session?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL || (session?.user as any)?.role === 'owner' || (session?.user as any)?.role === 'admin';

  useEffect(() => {
    setHasMounted(true);
    
    // User Profile Click-Outside Orchestration
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  useEffect(() => {
    setHasMounted(true);

    // Defer localStorage reads to after mount to prevent hydration mismatch
    const alerts = localStorage.getItem('crypto-rsi-alerts-enabled');
    if (alerts !== null) setAlertsEnabled(alerts === '1');

    const sound = localStorage.getItem('crypto-rsi-sound-enabled');
    if (sound !== null) setSoundEnabled(sound === '1');

    const refresh = localStorage.getItem('crypto-rsi-refresh');
    if (refresh) setRefreshInterval(Number(refresh));

    const pairs = localStorage.getItem('crypto-rsi-pairs');
    if (pairs) {
      const p = Number(pairs);
      setPairCount(Math.min(Math.max(p, 100), 500));
    }

    const smart = localStorage.getItem('crypto-rsi-smart-mode');
    if (smart !== null) setSmartMode(smart === '1');

    const header = localStorage.getItem('crypto-rsi-show-header');
    if (header !== null) setShowHeader(header !== '0');

    const rsi = localStorage.getItem('crypto-rsi-period');
    if (rsi) setRsiPeriod(Math.min(Math.max(Number(rsi), 2), 50));

    const cols = localStorage.getItem('crypto-rsi-visible-cols');
    if (cols) {
      try {
        setVisibleCols(new Set(JSON.parse(cols)));
      } catch { }
    } else {
      // If no saved prefs, check if we're on a mobile-ish screen and hide rank by default
      if (window.innerWidth < 1280) {
        setVisibleCols(prev => {
          const next = new Set(prev);
          next.delete('rank');
          return next;
        });
      }
    }

    const globalEnabled = localStorage.getItem('crypto-rsi-global-thresholds-enabled');
    if (globalEnabled !== null) setGlobalThresholdsEnabled(globalEnabled === '1');

    const globalOB = localStorage.getItem('crypto-rsi-global-overbought');
    if (globalOB) setGlobalOverbought(Number(globalOB));

    const globalOS = localStorage.getItem('crypto-rsi-global-oversold');
    if (globalOS) setGlobalOversold(Number(globalOS));

    const globalTFs = localStorage.getItem('crypto-rsi-global-timeframes');
    if (globalTFs) {
      try {
        setGlobalThresholdTimeframes(JSON.parse(globalTFs));
      } catch { }
    }

    const gLCT = localStorage.getItem('crypto-rsi-global-long-candle-threshold');
    if (gLCT) setGlobalLongCandleThreshold(Number(gLCT));

    const gVST = localStorage.getItem('crypto-rsi-global-volume-spike-threshold');
    if (gVST) setGlobalVolumeSpikeThreshold(Number(gVST));

    const gVE = localStorage.getItem('crypto-rsi-global-volatility-enabled');
    if (gVE !== null) setGlobalVolatilityEnabled(gVE === '1');

    // Signal tag control settings
    const gSTM = localStorage.getItem('crypto-rsi-global-signal-threshold-mode');
    if (gSTM === 'custom' || gSTM === 'default') setGlobalSignalThresholdMode(gSTM);

    // Indicator feature flags
    const loadFlag = (key: string, setter: (v: boolean) => void) => {
      const val = localStorage.getItem(key);
      if (val !== null) setter(val === '1');
    };
    loadFlag('crypto-rsi-global-use-rsi', setGlobalUseRsi);
    loadFlag('crypto-rsi-global-use-macd', setGlobalUseMacd);
    loadFlag('crypto-rsi-global-use-bb', setGlobalUseBb);
    loadFlag('crypto-rsi-global-use-stoch', setGlobalUseStoch);
    loadFlag('crypto-rsi-global-use-ema', setGlobalUseEma);
    loadFlag('crypto-rsi-global-use-vwap', setGlobalUseVwap);
    loadFlag('crypto-rsi-global-use-confluence', setGlobalUseConfluence);
    loadFlag('crypto-rsi-global-use-divergence', setGlobalUseDivergence);
    loadFlag('crypto-rsi-global-use-momentum', setGlobalUseMomentum);
  }, []);

  const reportVisibility = useCallback((symbol: string, isVisible: boolean) => {
    if (isVisible) {
      visibleSymbolsRef.current.add(symbol);
    } else {
      visibleSymbolsRef.current.delete(symbol);
    }
  }, []);

  const handleUpgradeRequired = useCallback((requestedCount: number) => {
    toast.error(`Upgrade required for ${requestedCount} records. Your current limit is ${entitlements.maxRecords}.`, {
      description: 'Visit subscription to unlock 200 / 300 / 500 record modes.',
    });
    router.push('/subscription?required=1');
  }, [entitlements.maxRecords, router]);

  const handlePairCountChange = useCallback((nextCount: number) => {
    if (nextCount > entitlements.maxRecords) {
      handleUpgradeRequired(nextCount);
      return;
    }
    setPairCount(nextCount);
  }, [entitlements.maxRecords, handleUpgradeRequired]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const loadEntitlements = async () => {
      try {
        const res = await fetch('/api/entitlements', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (json?.entitlements) {
          setEntitlements(json.entitlements);
        }
      } catch (error) {
        console.warn('[screener] failed to load entitlements', error);
      }
    };

    loadEntitlements();
  }, [session?.user?.id]);

  useEffect(() => {
    if (pairCount > entitlements.maxRecords) {
      setPairCount(entitlements.maxRecords);
    }
  }, [pairCount, entitlements.maxRecords]);

  useEffect(() => {
    if (!entitlements.features.enableAlerts && alertsEnabled) {
      setAlertsEnabled(false);
    }

    if (!entitlements.features.enableAdvancedIndicators) {
      setGlobalUseMacd(false);
      setGlobalUseBb(false);
      setGlobalUseStoch(false);
      setGlobalUseEma(false);
      setGlobalUseVwap(false);
      setGlobalUseConfluence(false);
      setGlobalUseDivergence(false);
      setGlobalUseMomentum(false);
    }

    if (!entitlements.features.enableCustomSettings && globalThresholdsEnabled) {
      setGlobalThresholdsEnabled(false);
    }
  }, [
    entitlements.features.enableAlerts,
    entitlements.features.enableAdvancedIndicators,
    entitlements.features.enableCustomSettings,
    alertsEnabled,
    globalThresholdsEnabled,
  ]);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(
    new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // Watchlist (hydrate from localStorage after mount to avoid SSR/CSR mismatch)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // Live WebSocket prices
  const symbolSet = useMemo(() => {
    if (data.length > 0) return new Set(data.map((e) => e.symbol));
    // Pre-flight sharding: warm up sockets with majors while waiting for API
    return new Set(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT']);
  }, [data]);
  const liveThrottleMs = pairCount <= 100 ? 120 : pairCount <= 300 ? 220 : 320;
  const {
    livePrices,
    isConnected,
    isMaster,
    syncStates: baseSyncStates,
    exchange,
    setExchange,
    updateSymbols,
    postToWorker
  } = useLivePrices(symbolSet, liveThrottleMs);

  const syncStates = useCallback((p: any) => {
    baseSyncStates({
      ...p,
      globalVolatilityEnabled,
      globalThresholdsEnabled,
      globalOverbought,
      globalOversold,
      globalThresholdTimeframes,
      globalSignalThresholdMode
    });
  }, [
    baseSyncStates, globalVolatilityEnabled, globalThresholdsEnabled,
    globalOverbought, globalOversold, globalThresholdTimeframes, globalSignalThresholdMode
  ]);

  // ─── Derivatives Intelligence Engine ───
  const {
    fundingRates,
    liquidations,
    whaleAlerts,
    orderFlow,
    openInterest,
    smartMoney,
    isConnected: derivativesConnected,
  } = useDerivativesIntel(symbolSet, activeAssetClass === 'crypto');

  // ─── Multi-Asset Market Data (Forex, Metals, Stocks) ───
  const {
    data: marketData,
    isLoading: marketDataLoading,
    source: marketDataSource,
    refresh: refreshMarketData,
  } = useMarketData(activeAssetClass, activeAssetClass !== 'crypto');

  // ─── Hybrid Atomic Data ───
  // ProcessedData is the "base" data with non-live additions (like custom RSI values from the last API fetch).
  // It merges the SWR data (from API) with the Live WebSocket prices (from useLivePrices).
  const processedData = useMemo<ScreenerEntry[]>(() => {
    // ─── BRANCH A: Tradify (Forex, Metals, Stocks) ───
    if (activeAssetClass !== 'crypto') {
      if (marketData.length === 0) return [];

      // ── Asset class → market type mapping ──
      const MARKET_TYPE_MAP: Record<string, ScreenerEntry['market']> = {
        forex: 'Forex',
        metals: 'Metal',
        stocks: 'Stocks',
      };
      const resolvedMarket = MARKET_TYPE_MAP[activeAssetClass] || 'Index';

      return marketData.map(md => {
        // ── Full Technical Analysis from Historical Closes ──
        const closes = md.closes || [];
        const rsi14 = calculateRsi(closes, 14);
        const rsi1m = closes.length >= 20 ? calculateRsi(closes.slice(-20), 14) : rsi14;
        const ema9 = latestEma(closes, 9);
        const ema21 = latestEma(closes, 21);
        const emaCross = detectEmaCross(closes, 9, 21);

        // MACD (12/26/9) from full closes
        const macdResult = calculateMacd(closes, 12, 26, 9);

        // Bollinger Bands (20, 2σ)
        const bbResult = calculateBollinger(closes, 20, 2);

        // Stochastic RSI (14/14/3/3)
        const stochResult = calculateStochRsi(closes, 14, 14, 3, 3);

        const entry: ScreenerEntry = {
          symbol: md.symbol,
          price: md.price,
          change24h: md.changePercent,
          volume24h: md.volume,
          rsi1m: rsi1m,
          rsi5m: null,
          rsi15m: rsi14,
          rsi1h: null,
          rsiCustom: rsi14,
          ema9: ema9,
          ema21: ema21,
          emaCross,
          macdHistogram: macdResult?.histogram ?? null,
          macdLine: macdResult?.macdLine ?? null,
          macdSignal: macdResult?.signalLine ?? null,
          bbUpper: bbResult?.upper ?? null,
          bbMiddle: bbResult?.middle ?? null,
          bbLower: bbResult?.lower ?? null,
          bbPosition: bbResult?.position ?? (md.price && md.sma50 ? (md.price > md.sma50 ? 0.7 : 0.3) : 0.5),
          stochK: stochResult?.k ?? null,
          stochD: stochResult?.d ?? null,
          strategyScore: 0,
          strategySignal: 'neutral',
          strategyLabel: 'Neutral',
          strategyReasons: [],
          signal: 'neutral',
          market: resolvedMarket,
          marketState: md.marketState || 'REGULAR',
          curCandleSize: 0,
          curCandleVol: 0,
          avgBarSize1m: 1,
          avgVolume1m: 1,
          candleDirection: null,
          isLiveRsi: true,
          rsiDivergence: 'none',
          momentum: 0,
          atr: 0,
          adx: 0,
          vwapDiff: ema9 && md.price ? ((md.price - ema9) / ema9) * 100 : 0,
          volumeSpike: false,
          vwap: ema21 ?? 0,
          confluence: 0,
          confluenceLabel: 'Mixed',
          rsiPeriodAtCreation: rsiPeriod,
          rsiStateCustom: null,
          rsiDivergenceCustom: 'none',
          rsiState1m: null,
          rsiState5m: null,
          rsiState15m: null,
          rsiState1h: null,
          ema9State: null,
          ema21State: null,
          macdFastState: null,
          macdSlowState: null,
          macdSignalState: null,
          signalStartedAt: Date.now(),
          updatedAt: md.updatedAt,
          open1m: md.open,
          volStart1m: 0,
        };

        // Re-run global strategy logic for tradify
        const strategy = computeStrategyScore({
          rsi1m: entry.rsi1m,
          rsi5m: entry.rsi5m,
          rsi15m: entry.rsi15m,
          rsi1h: entry.rsi1h,
          macdHistogram: entry.macdHistogram,
          bbPosition: entry.bbPosition,
          stochK: entry.stochK,
          stochD: entry.stochD,
          emaCross: entry.emaCross,
          vwapDiff: entry.vwapDiff,
          volumeSpike: entry.volumeSpike,
          price: entry.price,
          enabledIndicators: {
            rsi: globalUseRsi,
            macd: globalUseMacd,
            bb: globalUseBb,
            stoch: globalUseStoch,
            ema: globalUseEma,
            vwap: globalUseVwap,
            confluence: globalUseConfluence,
            divergence: globalUseDivergence,
            momentum: globalUseMomentum,
          }
        });

        entry.strategyScore = strategy.score;
        entry.strategySignal = strategy.signal;
        entry.strategyLabel = strategy.label;
        entry.strategyReasons = strategy.reasons;

        // Apply RSI threshold signals
        if (globalShowSignalTags && globalUseRsi && entry.rsiCustom !== null) {
          if (entry.rsiCustom <= globalOversold) entry.signal = 'oversold';
          else if (entry.rsiCustom >= globalOverbought) entry.signal = 'overbought';
        }

        return entry;
      });
    }

    // ─── BRANCH B: Crypto (Existing WebSocket Engine) ───
    if (data.length === 0) return [];

    return data.map(entry => {
      // 1. Get live price data
      const live = livePrices.get(entry.symbol);

      // 2. Base merged entry
      let merged: ScreenerEntry = live ? {
        ...entry,
        price: live.price,
        change24h: live.change24h,
        volume24h: live.volume24h,
        rsi1m: live.rsi1m ?? entry.rsi1m,
        rsi5m: live.rsi5m ?? entry.rsi5m,
        rsi15m: live.rsi15m ?? entry.rsi15m,
        rsi1h: live.rsi1h ?? entry.rsi1h,
        rsiCustom: live.rsiCustom ?? entry.rsiCustom,
        ema9: live.ema9 ?? entry.ema9,
        ema21: live.ema21 ?? entry.ema21,
        emaCross: (live.emaCross ?? entry.emaCross) as any,
        macdHistogram: live.macdHistogram ?? entry.macdHistogram,
        bbPosition: live.bbPosition ?? entry.bbPosition,
        strategyScore: live.strategyScore ?? entry.strategyScore,
        strategySignal: (live.strategySignal ?? entry.strategySignal) as any,
        curCandleSize: live.curCandleSize ?? entry.curCandleSize,
        curCandleVol: live.curCandleVol ?? entry.curCandleVol,
        avgBarSize1m: live.avgBarSize1m ?? entry.avgBarSize1m,
        avgVolume1m: live.avgVolume1m ?? entry.avgVolume1m,
        candleDirection: (live.candleDirection ?? entry.candleDirection) as any,
        marketState: 'OPEN',
      } : entry;

      // Type safety enforcement for the unions
      if (live) {
        if (live.emaCross) merged.emaCross = live.emaCross;
        if (live.strategySignal) merged.strategySignal = live.strategySignal;
      }

      // 3. Apply custom RSI approximation if period changed
      if (merged.rsiStateCustom && (merged.rsiPeriodAtCreation !== rsiPeriod)) {
        const approx = approximateRsi(merged.rsiStateCustom, merged.price, rsiPeriod);
        merged = { ...merged, rsiCustom: approx };
      }

      // 4. Final Signal Logic (Strict Gating)
      // This ensures filtering, sorting, and display all use the same authoritative logic.
      let customSignal = 'neutral' as 'oversold' | 'overbought' | 'neutral';
      if (globalShowSignalTags && globalUseRsi) {
        let obT = 70;
        let osT = 30;
        let hasThresholds = true;

        if (globalSignalThresholdMode === 'custom') {
          const cfg = coinConfigs[entry.symbol];
          const hasPerCoin = cfg && (cfg.overboughtThreshold !== undefined || cfg.oversoldThreshold !== undefined);
          if (hasPerCoin) {
            obT = cfg.overboughtThreshold ?? 70;
            osT = cfg.oversoldThreshold ?? 30;
          } else if (globalThresholdsEnabled) {
            obT = globalOverbought;
            osT = globalOversold;
          } else {
            hasThresholds = false;
          }
        }

        if (hasThresholds) {
          const rsiVal = merged.rsi15m ?? merged.rsi1m ?? merged.rsiCustom;
          if (rsiVal !== null) {
            const isInverted = obT < osT;
            if (isInverted) {
              if (rsiVal >= osT) customSignal = 'oversold';
              else if (rsiVal <= obT) customSignal = 'overbought';
            } else {
              if (rsiVal <= osT) customSignal = 'oversold';
              else if (rsiVal >= obT) customSignal = 'overbought';
            }
          }
        }
      }
      merged.signal = customSignal;

      return merged;
    });
  }, [
    data, livePrices, rsiPeriod, marketData, activeAssetClass,
    globalShowSignalTags, globalUseRsi, globalSignalThresholdMode,
    coinConfigs, globalThresholdsEnabled, globalOverbought, globalOversold,
    globalUseMacd, globalUseBb, globalUseStoch, globalUseEma, globalUseVwap,
    globalUseConfluence, globalUseDivergence, globalUseMomentum
  ]);

  // Sync state to Background Worker for Instant Alerts (Debounced)
  useEffect(() => {
    if (processedData.length === 0 && watchlist.size === 0) return;

    const timer = setTimeout(() => {
      const states: Record<string, any> = {};

      // 1. Collect all alertable symbols from configs
      const alertSymbols = new Set<string>();
      Object.entries(coinConfigs).forEach(([sym, cfg]) => {
        if (cfg.alertOn1m || cfg.alertOn5m || cfg.alertOn15m || cfg.alertOn1h || cfg.alertOnCustom || cfg.alertOnStrategyShift || cfg.alertOnLongCandle || cfg.alertOnVolumeSpike) {
          alertSymbols.add(sym);
        }
      });

      // 2. Union of all symbols the worker should track
      const allTrackedSymbols = new Set([
        ...processedData.map(e => e.symbol),
        ...Array.from(watchlist),
        ...Array.from(alertSymbols)
      ]);

      // 3. Update worker with full symbol set
      updateSymbols(allTrackedSymbols);

      // 4. Sync intelligence states
      processedData.forEach(entry => {
        states[entry.symbol] = {
          rsiState1m: entry.rsiState1m,
          rsiState5m: entry.rsiState5m,
          rsiState15m: entry.rsiState15m,
          rsiState1h: entry.rsiState1h,
          rsiStateCustom: entry.rsiStateCustom,
          rsiPeriodAtCreation: entry.rsiPeriodAtCreation,
          avgBarSize1m: entry.avgBarSize1m,
          avgVolume1m: entry.avgVolume1m,
          lastPrice: entry.price,
          macdHistogram: entry.macdHistogram,
          ema9State: entry.ema9State,
          ema21State: entry.ema21State,
          macdFastState: entry.macdFastState,
          macdSlowState: entry.macdSlowState,
          macdSignalState: entry.macdSignalState,
          bbUpper: entry.bbUpper,
          bbLower: entry.bbLower,
          bbPosition: entry.bbPosition,
          stochK: entry.stochK,
          stochD: entry.stochD,
          vwapDiff: entry.vwapDiff,
          volumeSpike: entry.volumeSpike,
          rsiDivergence: entry.rsiDivergence,
          momentum: entry.momentum,
          confluence: entry.confluence,
          open1m: entry.open1m,
          volStart1m: entry.volStart1m
        };
      });
      syncStates({
        configs: coinConfigs,
        rsiStates: states,
        alertsEnabled,
        globalThresholdsEnabled,
        globalLongCandleThreshold,
        globalVolumeSpikeThreshold,
        globalVolatilityEnabled,
        enabledIndicators: {
          rsi: globalUseRsi,
          macd: globalUseMacd,
          bb: globalUseBb,
          stoch: globalUseStoch,
          ema: globalUseEma,
          vwap: globalUseVwap,
          confluence: globalUseConfluence,
          divergence: globalUseDivergence,
          momentum: globalUseMomentum
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [
    processedData, coinConfigs, watchlist, syncStates, updateSymbols, postToWorker,
    globalUseRsi, globalUseMacd, globalUseBb, globalUseStoch, globalUseEma,
    globalUseVwap, globalUseConfluence, globalUseDivergence, globalUseMomentum,
    alertsEnabled, globalThresholdsEnabled, globalLongCandleThreshold,
    globalVolumeSpikeThreshold, globalVolatilityEnabled, globalShowSignalTags,
    globalSignalThresholdMode, globalOverbought, globalOversold
  ]);

  // Removed old duplicate processedData block

  const { alerts, clearAlertHistory, resumeAudioContext } = useAlertEngine(
    processedData,
    coinConfigs,
    alertsEnabled,
    soundEnabled,
    globalThresholdsEnabled,
    globalOverbought,
    globalOversold,
    globalThresholdTimeframes,
    globalLongCandleThreshold,
    globalVolumeSpikeThreshold,
    globalVolatilityEnabled,
    {
      rsi: globalUseRsi,
      macd: globalUseMacd,
      bb: globalUseBb,
      stoch: globalUseStoch,
      ema: globalUseEma,
      vwap: globalUseVwap,
      confluence: globalUseConfluence,
      divergence: globalUseDivergence,
      momentum: globalUseMomentum
    },
    globalSignalThresholdMode
  );


  // Keep coinConfigsRef in sync for stable callbacks (fetchData)
  useEffect(() => { coinConfigsRef.current = coinConfigs; }, [coinConfigs]);

  // Persist alert settings
  useEffect(() => {
    localStorage.setItem('crypto-rsi-alerts-enabled', alertsEnabled ? '1' : '0');
  }, [alertsEnabled]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-sound-enabled', soundEnabled ? '1' : '0');
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-thresholds-enabled', globalThresholdsEnabled ? '1' : '0');
  }, [globalThresholdsEnabled]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-overbought', globalOverbought.toString());
  }, [globalOverbought]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-oversold', globalOversold.toString());
  }, [globalOversold]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-timeframes', JSON.stringify(globalThresholdTimeframes));
  }, [globalThresholdTimeframes]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-long-candle-threshold', globalLongCandleThreshold.toString());
  }, [globalLongCandleThreshold]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-volume-spike-threshold', globalVolumeSpikeThreshold.toString());
  }, [globalVolumeSpikeThreshold]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-pairs', pairCount.toString());
  }, [pairCount]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-show-signal-tags', globalShowSignalTags ? '1' : '0');
  }, [globalShowSignalTags]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-signal-threshold-mode', globalSignalThresholdMode);
  }, [globalSignalThresholdMode]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-rsi', globalUseRsi ? '1' : '0');
  }, [globalUseRsi]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-macd', globalUseMacd ? '1' : '0');
  }, [globalUseMacd]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-bb', globalUseBb ? '1' : '0');
  }, [globalUseBb]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-stoch', globalUseStoch ? '1' : '0');
  }, [globalUseStoch]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-ema', globalUseEma ? '1' : '0');
  }, [globalUseEma]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-vwap', globalUseVwap ? '1' : '0');
  }, [globalUseVwap]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-confluence', globalUseConfluence ? '1' : '0');
  }, [globalUseConfluence]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-divergence', globalUseDivergence ? '1' : '0');
  }, [globalUseDivergence]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-momentum', globalUseMomentum ? '1' : '0');
  }, [globalUseMomentum]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-volatility-enabled', globalVolatilityEnabled ? '1' : '0');
  }, [globalVolatilityEnabled]);

  // ─── Real-time Stats Engine ──────────────────────────────────
  const stats = useMemo(() => {
    const total = processedData.length;
    let oversold = 0;
    let overbought = 0;
    let strongBuy = 0;
    let buy = 0;
    let neutral = 0;
    let sell = 0;
    let strongSell = 0;

    for (const entry of processedData) {
      if (entry.signal === 'oversold') oversold++;
      else if (entry.signal === 'overbought') overbought++;

      switch (entry.strategySignal) {
        case 'strong-buy': strongBuy++; break;
        case 'buy': buy++; break;
        case 'neutral': neutral++; break;
        case 'sell': sell++; break;
        case 'strong-sell': strongSell++; break;
      }
    }

    const bullish = strongBuy + buy;
    const bearish = strongSell + sell;
    const totalSignals = bullish + bearish + neutral || 1;
    const bias = Math.round(((bullish - bearish) / totalSignals) * 100);

    return { total, oversold, overbought, strongBuy, buy, neutral, sell, strongSell, bias };
  }, [processedData]);

  // ─── Feed Health Aggregation ─────────────────────────────────
  const feedHealth = useMemo(() => {
    const now = Date.now();
    let activeFeeds = 0;
    let staleFeeds = 0;
    let totalFeeds = 0;
    let oldestTickAge = 0;

    livePrices.forEach((tick) => {
      if (!tick.updatedAt) return;
      totalFeeds++;
      const age = now - tick.updatedAt;
      if (age < 5000) activeFeeds++;
      else if (age > 30000) staleFeeds++;
      if (age > oldestTickAge) oldestTickAge = age;
    });

    const activePercent = totalFeeds > 0 ? (activeFeeds / totalFeeds) * 100 : 0;
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (activePercent < 50 || staleFeeds > totalFeeds * 0.3) status = 'critical';
    else if (activePercent < 80 || staleFeeds > 5) status = 'degraded';

    return { activeFeeds, staleFeeds, totalFeeds, activePercent, status, oldestTickAge };
  }, [livePrices]);

  const indicatorReadyCount = useMemo(() => (
    processedData.filter((e) => e.rsi1m !== null || e.rsi5m !== null || e.rsi15m !== null || e.macdHistogram !== null).length
  ), [processedData]);

  const handleSaveConfig = async (symbol: string, newConfig: any) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ symbol, exchange, ...newConfig }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCoinConfigs(prev => ({ ...prev, [symbol]: updated }));

        // Gap 3: Immediately push new thresholds/periods to the worker without
        // waiting for the 800ms debounced syncStates — ensures no stale-threshold alerts
        if (typeof window !== 'undefined') {
          const eng = (window as any).__priceEngine;
          if (eng?.postToWorker) {
            eng.postToWorker({
              type: 'SYNC_CONFIG_FAST',
              payload: { symbol, config: updated },
            });
          }
        }

        fetchData(true);
      }
    } catch (err) {
      console.error('[screener] Failed to save config:', err);
    }
  };

  // Close column picker on click outside
  useEffect(() => {
    if (!showColPicker) return;
    function handleClick(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showColPicker]);

  // Hydrate watchlist after mount (prevents hydration mismatch from localStorage values)
  useEffect(() => {
    setWatchlist(new Set(loadWatchlist()));
    setWatchlistReady(true);
  }, []);

  // Persist watchlist
  useEffect(() => {
    if (!watchlistReady) return;
    localStorage.setItem('crypto-rsi-watchlist', JSON.stringify([...watchlist]));
  }, [watchlist, watchlistReady]);

  // Persist column visibility
  useEffect(() => {
    localStorage.setItem('crypto-rsi-visible-cols', JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  // Persist last-known data for "Warm Start" hydration (keyed by exchange)
  useEffect(() => {
    if (data.length > 0) {
      try {
        localStorage.setItem('crypto-rsi-last-data', JSON.stringify({
          data,
          meta,
          exchange,
          ts: Date.now()
        }));
      } catch (e) {
        console.warn('[screener] Failed to save hydration data to localStorage', e);
      }
    }
  }, [data, meta, exchange]);

  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  const toggleCol = useCallback((id: ColumnId) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Persist user preferences
  useEffect(() => {
    localStorage.setItem('crypto-rsi-refresh', String(refreshInterval));
  }, [refreshInterval]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-pairs', String(pairCount));
  }, [pairCount]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-smart-mode', smartMode ? '1' : '0');
  }, [smartMode]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-show-header', showHeader ? '1' : '0');
  }, [showHeader]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-period', String(rsiPeriod));
  }, [rsiPeriod]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-visible-cols', JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  // Auto-adjust refresh interval when pair count changes (500 pairs needs more time)
  useEffect(() => {
    if (pairCount >= 300 && refreshInterval > 0 && refreshInterval < 30) {
      setRefreshInterval(60);
    }
  }, [pairCount, refreshInterval]);

  // ── Fetch data ──
  const fetchData = useCallback(async (background = false) => {
    if (background && backoffUntilRef.current && Date.now() < backoffUntilRef.current) {
      return;
    }

    const fetchToken = ++fetchTokenRef.current;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;

    fetchingRef.current = true;

    // Show spinner for all fetches except initial load
    const isInitial = !background && dataLenRef.current === 0;
    if (!isInitial) setRefreshing(true);

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const requestStartedAt = Date.now();
    try {
      if (!background) setError(null);
      const timeoutMs = pairCount >= 800 ? 60_000 : pairCount >= 500 ? 55_000 : pairCount >= 300 ? 40_000 : 25_000;
      timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      const prioritySymbols = Array.from(visibleSymbolsRef.current).join(',');
      const url = `/api/screener?count=${pairCount}&smart=${smartMode ? '1' : '0'}&rsiPeriod=${rsiPeriod}&search=${encodeURIComponent(search)}&prioritySymbols=${encodeURIComponent(prioritySymbols)}&exchange=${exchange}&ts=${Date.now()}`;

      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
          pragma: 'no-cache',
        },
      });

      if (fetchToken !== fetchTokenRef.current) return;

      const retryAfterRaw = res.headers.get('retry-after');
      const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : null;

      const json: ScreenerResponse = await res.json().catch(() => ({ data: [], meta: null } as any));

      if (res.status === 429) {
        const waitMs = retryAfterMs ?? 10_000;
        const until = Date.now() + waitMs;
        backoffUntilRef.current = until;
        setBackoffUntil(until);
        throw new Error(`Rate limited (429). Retrying in ${Math.ceil(waitMs / 1000)}s.`);
      }

      if (!res.ok && res.status === 403 && (json as any).errorCode === 'UPGRADE_REQUIRED') {
        const limit = (json as any)?.entitlements?.maxRecords;
        if (typeof limit === 'number') setPairCount(limit);
        handleUpgradeRequired((json as any)?.requestedCount ?? pairCount);

        // Recover immediately after limit clamp so UI is repopulated without waiting
        // for the next auto-refresh cycle.
        if (typeof limit === 'number' && limit !== pairCount) {
          setTimeout(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchDataRef.current(true);
          }, 120);
        }
        return;
      }

      // 503 with data means partial result — still usable
      if (!res.ok && !(res.status === 503 && json.data?.length > 0)) {
        throw new Error(`API error ${res.status}`);
      }

      setData(json.data);
      dataLenRef.current = json.data.length;
      setMeta(json.meta);
      setError(null);
      setLoading(false);
      const now = Date.now();
      setLastSuccessfulFetchAt(now);
      setStaleSince(null);
      staleSinceRef.current = null;
      setBackoffUntil(null);
      setConsecutiveFetchFailures(0);
      failureCountRef.current = 0;
      backoffUntilRef.current = null;
      stableSuccessCountRef.current += 1;
      if (circuitRetryTimerRef.current) {
        clearTimeout(circuitRetryTimerRef.current);
        circuitRetryTimerRef.current = null;
      }

      const tookMs = Math.max(1, now - requestStartedAt);
      const nextHistory = [...latencyHistoryRef.current, tookMs].slice(-25);
      latencyHistoryRef.current = nextHistory;
      const sorted = [...nextHistory].sort((a, b) => a - b);
      const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? null;
      const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? null;
      setLatencyStats({ lastMs: tookMs, p50Ms: p50, p95Ms: p95 });

      // Automatically restore user-selected row count after feed stabilizes.
      if (adaptiveDownshiftRef.current.active && stableSuccessCountRef.current >= 3) {
        const original = adaptiveDownshiftRef.current.original;
        if (typeof original === 'number' && original <= entitlements.maxRecords) {
          setPairCount(original);
        }
        adaptiveDownshiftRef.current = { active: false, original: null };
        setAutoLoadShedding({ active: false, fromCount: null, toCount: null });
        stableSuccessCountRef.current = 0;
      }

      // PERFECT COUPLING: Sync all indicator baselines for the shadowing engine so
      // the worker can compute accurate real-time strategy scores immediately after fetch.
      const rsiStates: Record<string, any> = {};
      json.data.forEach((e: any) => {
        if (e.rsi1m !== null) {
          rsiStates[e.symbol] = {
            rsiState1m: e.rsiState1m,
            rsiState5m: e.rsiState5m,
            rsiState15m: e.rsiState15m,
            rsiState1h: e.rsiState1h,
            rsiStateCustom: e.rsiStateCustom,
            ema9State: e.ema9State,
            ema21State: e.ema21State,
            macdFastState: e.macdFastState,
            macdSlowState: e.macdSlowState,
            macdSignalState: e.macdSignalState,
            bbUpper: e.bbUpper,
            bbLower: e.bbLower,
            bbPosition: e.bbPosition,
            avgBarSize1m: e.avgBarSize1m,
            avgVolume1m: e.avgVolume1m,
            confluence: e.confluence,
            stochK: e.stochK,
            stochD: e.stochD,
            vwapDiff: e.vwapDiff,
            volumeSpike: e.volumeSpike,
            rsiDivergence: e.rsiDivergence,
            momentum: e.momentum,
            lastClose: e.price,
            open1m: e.open1m,
            volStart1m: e.volStart1m
          };
        }
      });
      syncStates({ rsiStates, configs: coinConfigsRef.current });
    } catch (err) {
      // If a newer fetch started, this one was intentionally cancelled — discard silently.
      if (fetchToken !== fetchTokenRef.current) return;
      if (controller.signal.aborted) {
        // Client-side timeout (not an intentional cancel, since token still matches).
        // Show an error so the user knows why the table is empty.
        if (dataLenRef.current === 0) {
          setError('Connection timed out — server is slow or unreachable. Tap to retry.');
        }
        return;
      }
      if (dataLenRef.current === 0) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      }

      const now = Date.now();
      if (!staleSinceRef.current) {
        staleSinceRef.current = now;
        setStaleSince(now);
      }
      failureCountRef.current += 1;
      setConsecutiveFetchFailures(failureCountRef.current);
      stableSuccessCountRef.current = 0;

      // Backoff background retries to avoid API storm during degraded upstream/network periods.
      if (background) {
        const delayMs = Math.min(30_000, 1000 * (2 ** Math.max(0, failureCountRef.current - 1)));
        const until = now + delayMs;
        backoffUntilRef.current = until;
        setBackoffUntil(until);

        if (circuitRetryTimerRef.current) clearTimeout(circuitRetryTimerRef.current);
        circuitRetryTimerRef.current = setTimeout(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          fetchDataRef.current(true);
        }, delayMs);

        // Adaptive load shedding: step down row count during sustained failures
        // to reduce API and processing pressure, then auto-restore on stability.
        if (failureCountRef.current >= 4 && !adaptiveDownshiftRef.current.active && pairCount > 100) {
          const options = (entitlements.availableRecordOptions?.length
            ? entitlements.availableRecordOptions
            : PAIR_COUNTS).filter((v) => v <= entitlements.maxRecords).sort((a, b) => a - b);
          const lower = [...options].reverse().find((v) => v < pairCount) ?? null;
          if (lower && lower >= 100) {
            adaptiveDownshiftRef.current = { active: true, original: pairCount };
            setAutoLoadShedding({ active: true, fromCount: pairCount, toCount: lower });
            setPairCount(lower);
          }
        }
      }
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (fetchToken === fetchTokenRef.current) {
        fetchingRef.current = false;
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [pairCount, smartMode, rsiPeriod, search, exchange, handleUpgradeRequired, entitlements.maxRecords, entitlements.availableRecordOptions]);

  // ── Stable ref so all async effects always call the latest fetchData
  // without adding `fetchData` to their dependency arrays (which causes race conditions).
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => {
    return () => {
      activeFetchControllerRef.current?.abort();
      if (circuitRetryTimerRef.current) {
        clearTimeout(circuitRetryTimerRef.current);
        circuitRetryTimerRef.current = null;
      }
    };
  }, []);

  // Handle priority syncs from worker for fast-moving coins
  useEffect(() => {
    const handlePrioritySync = (e: Event) => {
      const symbol = (e as CustomEvent).detail;
      visibleSymbolsRef.current.add(symbol);

      if (typeof document !== 'undefined' && document.hidden) return;

      const now = Date.now();
      const cooldownMs = pairCount >= 300 ? 3500 : 2200;

      if (!fetchingRef.current && now - lastPrioritySyncRef.current >= cooldownMs) {
        lastPrioritySyncRef.current = now;
        fetchDataRef.current(true);
        return;
      }

      if (prioritySyncTimerRef.current) {
        clearTimeout(prioritySyncTimerRef.current);
      }
      prioritySyncTimerRef.current = setTimeout(() => {
        if (!fetchingRef.current) {
          lastPrioritySyncRef.current = Date.now();
          fetchDataRef.current(true);
        }
      }, cooldownMs);
    };

    if (typeof window !== 'undefined') {
      const engine = (window as any).__priceEngine;
      if (engine) engine.addEventListener('priority-sync', handlePrioritySync);
      return () => {
        if (engine) engine.removeEventListener('priority-sync', handlePrioritySync);
        if (prioritySyncTimerRef.current) {
          clearTimeout(prioritySyncTimerRef.current);
          prioritySyncTimerRef.current = null;
        }
      };
    }
  }, [pairCount]);

  // ── Initial fetch with auto-retry and Hydration ──
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prioritySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPrioritySyncRef = useRef(0);

  // Load coin configurations on mount
  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then(res => res.json())
      .then(json => setCoinConfigs(json))
      .catch(err => console.error('[screener] Failed to load configs:', err));
  }, []);

  // Request notification permissions if enabled by default
  useEffect(() => {
    if (alertsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { });
      }
    }
  }, [alertsEnabled]);

  useEffect(() => {
    // Stale-first hydration: load any cached data immediately so the table is
    // visible while the live fetch runs. Exchange mismatch is fine here —
    // the live fetch will overwrite with correct exchange data within seconds.
    const saved = localStorage.getItem('crypto-rsi-last-data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.ts < 3600_000 && Array.isArray(parsed.data) && parsed.data.length > 0) {
          setData(parsed.data);
          if (parsed.meta) setMeta(parsed.meta);
          setLoading(false);
          dataLenRef.current = parsed.data.length;
        }
      } catch (e) {
        console.error('[screener] Hydration failed:', e);
      }
    }

    retryCountRef.current = 0;
    const doFetch = async () => {
      await fetchDataRef.current();
      try {
        const configRes = await fetch('/api/config', { cache: 'no-store' });
        if (configRes.ok) {
          const cfg = await configRes.json();
          setCoinConfigs(cfg);
        }
      } catch (e) {
        console.error('[screener] Config fetch failed:', e);
      }
      if (dataLenRef.current === 0 && retryCountRef.current < 3) {
        retryCountRef.current++;
        const delay = retryCountRef.current * 3000;
        retryTimerRef.current = setTimeout(doFetch, delay);
      }
    };
    doFetch();
    return () => clearTimeout(retryTimerRef.current);
  }, []); // mount-only: fetchDataRef always points to latest fetchData

  // ── Auto-refresh (skips when tab is hidden) ──
  useEffect(() => {
    if (refreshInterval <= 0) return;

    setCountdown(refreshInterval);
    const refetchTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchDataRef.current(true);
      setCountdown(refreshInterval);
    }, refreshInterval * 1000);

    const tickTimer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => {
      clearInterval(refetchTimer);
      clearInterval(tickTimer);
    };
  }, [refreshInterval]); // fetchDataRef is stable so no dep needed

  // ── Trigger refetch on RSI Period change (debounced) ──
  useEffect(() => {
    // Immediately push the new period to the worker so custom RSI
    // alert evaluations use the correct period without waiting for a data refresh
    if (typeof window !== 'undefined') {
      const eng = (window as any).__priceEngine;
      if (eng?.postToWorker) {
        eng.postToWorker({ type: 'UPDATE_PERIOD', payload: { period: rsiPeriod } });
      }
    }

    const timer = setTimeout(() => {
      fetchDataRef.current();
    }, 400); // 400ms debounce to avoid spamming while dragging slider
    return () => clearTimeout(timer);
  }, [rsiPeriod]); // fetchDataRef is stable so no dep needed

  // ── Trigger refetch on Exchange change ──
  // Uses prevExchangeRef to fire ONLY on real exchange changes, not on every
  // fetchData reference change (which happens whenever any fetchData dep changes).
  const prevExchangeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasMounted) return;
    if (prevExchangeRef.current === null) {
      // First time after mount: record current exchange but don't re-fetch
      // (initial-fetch effect already handles the first load).
      prevExchangeRef.current = exchange;
      return;
    }
    if (prevExchangeRef.current === exchange) return;
    prevExchangeRef.current = exchange;
    // Real exchange switch: clear stale data and reload
    setData([]);
    dataLenRef.current = 0;
    setLoading(true);
    fetchingRef.current = false;
    fetchDataRef.current();
  }, [exchange, hasMounted]); // removed fetchData dep — use fetchDataRef instead

  // ── Debounced Server-side Search ──
  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => {
      fetchDataRef.current();
    }, 600); // 600ms debounce for typing
    return () => clearTimeout(timer);
  }, [search]); // fetchDataRef is stable so no dep needed

  // ── Sorting ──
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'symbol' ? 'asc' : 'desc');
      }
    },
    [sortKey],
  );

  // ── Filtered & sorted data ──
  const filtered = useMemo(() => {
    let items = processedData;

    // Watchlist filter
    if (showWatchlistOnly) {
      items = items.filter((e) => watchlist.has(e.symbol));
    }

    // Signal filter
    if (signalFilter === 'oversold' || signalFilter === 'overbought') {
      items = items.filter((e) => e.signal === signalFilter);
    } else if (signalFilter !== 'all') {
      items = items.filter((e) => e.strategySignal === signalFilter);
    }

    // Search filter
    if (search) {
      const q = search.toUpperCase();
      items = items.filter((e) => {
        const alias = getSymbolAlias(e.symbol).toUpperCase();
        return e.symbol.includes(q) || alias.includes(q);
      });
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
      // 0. Market Priority (Keep Metals & Indices at top by default)
      const marketPriority: Record<string, number> = { Metal: 3, Index: 2, Forex: 1, Crypto: 0 };
      const pA = marketPriority[a.market] || 0;
      const pB = marketPriority[b.market] || 0;
      if (pA !== pB) return pB - pA;

      if (sortKey === 'strategyScore') {
        const aMissing = a.strategyLabel === 'N/A';
        const bMissing = b.strategyLabel === 'N/A';
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
      }

      let av = a[sortKey as keyof ScreenerEntry] as any;
      let bv = b[sortKey as keyof ScreenerEntry] as any;

      if (sortKey === 'longCandle') {
        av = (a.curCandleSize && a.avgBarSize1m) ? a.curCandleSize / a.avgBarSize1m : 0;
        bv = (b.curCandleSize && b.avgBarSize1m) ? b.curCandleSize / b.avgBarSize1m : 0;
      }

      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av === bv) return 0;

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });

    return items;
  }, [processedData, signalFilter, search, sortKey, sortDir, showWatchlistOnly, watchlist]);

  // ── Presets ──
  const showMostOversold = () => {
    setSignalFilter('oversold');
    setSortKey('rsi15m');
    setSortDir('asc');
  };
  const showMostOverbought = () => {
    setSignalFilter('overbought');
    setSortKey('rsi15m');
    setSortDir('desc');
  };
  const showStrongBuys = () => {
    setSignalFilter('strong-buy');
    setSortKey('strategyScore');
    setSortDir('desc');
  };
  const showBuys = () => {
    setSignalFilter('buy');
    setSortKey('strategyScore');
    setSortDir('desc');
  };
  const showSells = () => {
    setSignalFilter('sell');
    setSortKey('strategyScore');
    setSortDir('desc');
  };
  const showStrongSells = () => {
    setSignalFilter('strong-sell');
    setSortKey('strategyScore');
    setSortDir('desc');
  };
  const showNeutrals = () => {
    setSignalFilter('neutral');
    setSortKey('strategyScore');
    setSortDir('desc');
  };
  const resetFilters = () => {
    setSearch('');
    setSignalFilter('all');
    setSortKey('strategyScore');
    setSortDir('desc');
    setShowWatchlistOnly(false);
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        fetchDataRef.current();
      } else if (e.key === 'Escape') {
        setSelectedCoinForConfig(null);
        setShowAlertPanel(false);
        setShowGlobalSettings(false);
        setShowColPicker(false);
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder="Search symbols..."]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          // Small delay for focus adjustment
          setTimeout(() => searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // mount-only: fetchDataRef always points to latest fetchData

  // ── CSV export ──
  const handleExportCsv = useCallback(() => {
    if (filtered.length === 0) return;
    const headers = ['Symbol', 'Price', '24h%', 'Volume', 'RSI15m', 'RSI1h', 'RSI Custom', 'Strategy', 'Score', 'Signal', 'EMA Cross', 'ATR', 'ADX'];
    const rows = filtered.map(e => [
      e.symbol,
      e.price,
      e.change24h.toFixed(2),
      e.volume24h.toFixed(0),
      formatRsi(e.rsi15m),
      formatRsi(e.rsi1h),
      formatRsi(e.rsiCustom),
      e.strategyLabel,
      e.strategyScore,
      e.signal,
      e.emaCross,
      e.atr !== null ? e.atr.toFixed(4) : '',
      e.adx !== null ? e.adx.toFixed(1) : '',
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rsiq-export-${new Date().toISOString().slice(0, 16).replace(/[:-]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  }, [filtered]);

  // ── Top movers ──
  const topMovers = useMemo(() => {
    if (processedData.length < 6) return { gainers: [], losers: [] };
    const sorted = [...processedData].sort((a, b) => b.change24h - a.change24h);
    return {
      gainers: sorted.slice(0, 3),
      losers: sorted.slice(-3).reverse(),
    };
  }, [processedData]);

  // ── Fear/Greed gauge ──
  const fearGreedScore = useMemo(() => {
    if (processedData.length === 0) return 50;
    const { strongBuy, buy, sell, strongSell, neutral: n } = stats;
    const total = strongBuy + buy + sell + strongSell + n || 1;
    // 0 = Extreme Fear, 100 = Extreme Greed
    return Math.round(((strongBuy * 2 + buy) / total) * 100);
  }, [processedData.length, stats]);

  const fearGreedLabel = fearGreedScore >= 75 ? 'Extreme Greed' : fearGreedScore >= 55 ? 'Greed' : fearGreedScore >= 45 ? 'Neutral' : fearGreedScore >= 25 ? 'Fear' : 'Extreme Fear';
  const fearGreedColor = fearGreedScore >= 65 ? 'text-[#39FF14]' : fearGreedScore >= 45 ? 'text-yellow-400' : 'text-[#FF4B5C]';

  const colCount = 7 + OPTIONAL_COLUMNS.filter((c) => visibleCols.has(c.id)).length;

  return (
    <div className="max-w-[1800px] mx-auto px-4 pt-4 pb-32 lg:py-8">
      {/* ── Header ── */}
      {showHeader && (
        <header className="mb-5 rounded-3xl border border-white/5 bg-[#080F1B] p-5 sm:p-6 shadow-lg relative group z-[100]">
          {/* Background Glow - Wrapped to allow dropdowns to overflow while keeping glow contained */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#39FF14]/[0.02] rounded-full -mr-20 -mt-20 group-hover:bg-[#39FF14]/[0.04] transition-colors duration-1000" />
          </div>

          {/* Desktop Header Layout */}
          <div className="hidden lg:flex flex-col gap-6 relative z-10 w-full">
            {/* ─── NEW INSTITUTIONAL HEADER ─── */}
            <div className="flex items-center justify-between gap-6 w-full">
              {/* Left Side: Brand & Market Bias */}
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-4 group">
                  <div className="relative w-36 h-10 transition-transform group-hover:scale-105">
                    <Image
                      src="/logo/rsiq-mindscapeanalytics.png"
                      alt="RSIQ Pro"
                      fill
                      priority
                      className="object-contain"
                    />
                  </div>
                </Link>

                <div className="flex flex-col gap-1 min-w-[140px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Market Bias</span>
                    <span className={cn("text-[10px] font-black tabular-nums", stats.bias >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                      {stats.bias > 0 ? `+${stats.bias}%` : `${stats.bias}%`}
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden border border-white/5 p-[1px]">
                    <div
                      className={cn("h-full rounded-full shadow-[0_0_8px_rgba(57,255,20,0.3)] transition-all duration-700", stats.bias >= 0 ? "bg-gradient-to-r from-emerald-500 to-[#39FF14]" : "bg-gradient-to-r from-rose-500 to-[#FF4B5C]")}
                      style={{ width: `${Math.abs(stats.bias)}%`, marginLeft: stats.bias >= 0 ? '50%' : `${50 - Math.abs(stats.bias)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Center Group: Combined Operations & Sentiment */}
              <div className="flex items-center bg-slate-900/40 border border-white/10 rounded-2xl p-1 gap-1 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md">
                {/* System Controls */}
                <div className="flex items-center gap-1 px-1">
                  <motion.button
                    onClick={async () => {
                      const next = !alertsEnabled;
                      setAlertsEnabled(next);
                      if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                        try { await Notification.requestPermission(); } catch (e) { }
                      }
                    }}
                    whileTap={{ scale: 0.95 }}
                    className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all", alertsEnabled ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-600 hover:text-slate-400")}
                    title="Alerts Toggle"
                  >
                    <Bell size={14} fill={alertsEnabled ? "currentColor" : "none"} />
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      if (next) resumeAudioContext();
                    }}
                    whileTap={{ scale: 0.95 }}
                    className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all", soundEnabled ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-600 hover:text-slate-400")}
                    title="Sound Toggle"
                  >
                    <Zap size={14} fill={soundEnabled ? "currentColor" : "none"} />
                  </motion.button>
                  <motion.button
                    onClick={() => setShowAlertPanel(!showAlertPanel)}
                    whileTap={{ scale: 0.95 }}
                    className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all", showAlertPanel ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-600 hover:text-slate-400")}
                    title="History"
                  >
                    <Clock size={14} />
                  </motion.button>
                  <motion.button
                    onClick={() => setShowGlobalSettings(true)}
                    whileTap={{ scale: 0.95 }}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:text-[#39FF14] transition-all"
                    title="Settings"
                  >
                    <Settings size={14} />
                  </motion.button>
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Sentiment */}
                <div className="flex flex-col items-center justify-center px-4 min-w-[100px]">
                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-600 mb-0.5">Sentiment</span>
                  <div className="flex items-center gap-1.5">
                    <Gauge size={10} className={fearGreedColor} />
                    <span className={cn("text-[9px] font-black uppercase tracking-tighter", fearGreedColor)}>{fearGreedLabel}</span>
                  </div>
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Asset Class Selector (Primary) + Exchange Sub-selector */}
                <div className="flex items-center gap-1">
                  {/* Asset Class Tabs */}
                  <div className="flex items-center bg-slate-900/60 border border-white/5 rounded-2xl p-0.5 gap-0.5">
                    {[
                      { id: 'crypto' as const, label: 'Crypto', icon: '₿' },
                      { id: 'forex' as const, label: 'Forex', icon: '💱' },
                      { id: 'metals' as const, label: 'Metals', icon: '🥇' },
                      { id: 'stocks' as const, label: 'Stocks', icon: '📈' },
                    ].map((ac) => (
                      <button
                        key={ac.id}
                        onClick={() => setActiveAssetClass(ac.id)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all rounded-xl",
                          activeAssetClass === ac.id
                            ? "bg-[#39FF14]/15 text-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.08)]"
                            : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                        )}
                      >
                        <span className="text-[10px]">{ac.icon}</span>
                        {ac.label}
                      </button>
                    ))}
                  </div>

                  {/* Exchange Sub-selector (only for Crypto) */}
                  {activeAssetClass === 'crypto' && (
                    <div className="flex items-center bg-slate-900/40 border border-white/5 rounded-xl p-0.5 gap-0.5 ml-1">
                      {[
                        { id: 'binance', label: 'BIN' },
                        { id: 'bybit', label: 'SPOT' },
                        { id: 'bybit-linear', label: 'PERP' }
                      ].map((ex) => (
                        <button
                          key={ex.id}
                          onClick={() => setExchange(ex.id)}
                          className={cn(
                            "px-2 py-1 text-[7px] font-black uppercase tracking-widest transition-all rounded-lg",
                            exchange === ex.id ? "bg-white/10 text-white" : "text-slate-600 hover:text-slate-400"
                          )}
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Health & Maintenance Cluster */}
              <div className="flex items-center gap-4">
                {/* System Health */}
                <div className="flex items-center bg-slate-900/40 border border-white/10 rounded-2xl p-1 shadow-sm backdrop-blur-md">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 transition-all text-sm",
                    isConnected
                      ? feedHealth.status === 'healthy' ? 'text-[#39FF14]'
                        : feedHealth.status === 'degraded' ? 'text-amber-400'
                        : 'text-red-400'
                      : 'text-slate-600'
                  )}>
                    <motion.div
                      animate={{ opacity: isConnected ? [0.4, 1, 0.4] : 1 }}
                      transition={{ duration: feedHealth.status === 'critical' ? 0.5 : 2, repeat: Infinity }}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isConnected
                          ? feedHealth.status === 'healthy' ? 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.6)]'
                            : feedHealth.status === 'degraded' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                            : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                          : 'bg-slate-600'
                      )}
                    />
                    <span className="font-black tracking-[0.2em] uppercase text-[8px]">
                      {isConnected ? (feedHealth.status === 'healthy' ? 'Live' : feedHealth.status === 'degraded' ? 'Lagging' : 'Stale') : 'Offline'}
                    </span>
                    {isConnected && feedHealth.totalFeeds > 0 && (
                      <span className="text-[7px] font-mono text-slate-500 tabular-nums">
                        {feedHealth.activeFeeds}/{feedHealth.totalFeeds}
                      </span>
                    )}
                  </div>
                  {isMaster && (
                    <div className="flex items-center gap-2 border-l border-white/10 px-3 py-1.5 bg-gradient-to-r from-[#39FF14]/10 to-transparent">
                      <ShieldCheck size={12} className="text-[#39FF14]" />
                      <span className="font-black tracking-[0.2em] uppercase text-[8px] text-white">Master</span>
                    </div>
                  )}
                  {feedHealth.staleFeeds > 0 && (
                    <div className="flex items-center gap-1.5 border-l border-white/10 px-3 py-1.5 text-red-400/80">
                      <AlertTriangle size={10} />
                      <span className="font-black text-[8px] tabular-nums">{feedHealth.staleFeeds} stale</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 border-l border-white/10 px-3 py-1.5 text-slate-500">
                    <LayoutGrid size={11} />
                    <span className="font-black text-[9px] tabular-nums">{data.length}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchData()}
                    className="group relative flex items-center justify-center w-10 h-10 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-[#39FF14] hover:bg-white/10 transition-all active:scale-95 shadow-lg"
                    title="Manual Refresh"
                  >
                    <RefreshCcw size={14} className={cn("transition-transform duration-700", refreshing && "animate-spin")} />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black text-slate-600 bg-black/40 px-1 rounded">
                      {countdown}S
                    </div>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-10 h-10 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 shadow-lg flex items-center justify-center"
                    title="Export CSV"
                  >
                    <Download size={14} />
                  </button>
                  
                  <div className="relative" ref={profileRef}>
                    <button
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                      className={cn(
                        "w-10 h-10 rounded-2xl border flex items-center justify-center transition-all bg-slate-900 shadow-xl",
                        isProfileOpen ? "border-[#39FF14] text-[#39FF14]" : "border-white/10 text-slate-400 hover:text-white hover:border-white/20"
                      )}
                    >
                      <UserIcon size={18} />
                    </button>
                    <AnimatePresence>
                      {isProfileOpen && (
                        <UserProfileDropdown
                          session={session}
                          isOwner={isOwner}
                          onLogout={handleSignOut}
                          isLoggingOut={isLoggingOut}
                          onClose={() => setIsProfileOpen(false)}
                          onShowGlobalSettings={() => setShowGlobalSettings(true)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 7-STATE SIGNAL ANALYTICS BAR ─── */}
            <div className="flex items-center justify-between bg-slate-900/60 border border-white/5 rounded-2xl p-1 shadow-inner backdrop-blur-xl">
              <div className="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
                {[
                  { label: "Oversold", value: stats.oversold, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/10", icon: ArrowDownCircle, onClick: showMostOversold },
                  { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/10", icon: Zap, onClick: showStrongBuys },
                  { label: "Buy", value: stats.buy, color: "text-emerald-400/80", bg: "bg-emerald-500/5", border: "border-emerald-500/10", icon: TrendingUp, onClick: showBuys },
                  { label: "Neutral", value: stats.neutral, color: "text-slate-400", bg: "bg-slate-500/5", border: "border-slate-500/10", icon: MinusCircle, onClick: showNeutrals },
                  { label: "Sell", value: stats.sell, color: "text-rose-400/80", bg: "bg-rose-500/5", border: "border-rose-500/10", icon: TrendingDown, onClick: showSells },
                  { label: "Strong Sell", value: stats.strongSell, color: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/10", icon: Zap, onClick: showStrongSells },
                  { label: "Overbought", value: stats.overbought, color: "text-rose-400", bg: "bg-rose-500/5", border: "border-rose-500/10", icon: ArrowUpCircle, onClick: showMostOverbought },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={s.onClick}
                      className={cn(
                        "flex-1 min-w-[100px] flex items-center justify-between px-4 py-2 rounded-xl border transition-all hover:scale-[1.02] active:scale-95 group/stat",
                        s.bg, s.border, "hover:bg-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon size={12} className={cn("transition-transform group-hover/stat:rotate-12", s.color)} />
                        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 group-hover/stat:text-slate-300">{s.label}</span>
                      </div>
                      <span className={cn("text-sm font-black tabular-nums tracking-tighter", s.color)}>
                        <Counter value={s.value} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile App Bar */}
          <div className="lg:hidden flex flex-col gap-4 relative z-10">
            {/* Top Row: Logo & Profile */}
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3 active:scale-95 transition-transform">
                <div className="relative w-24 h-6">
                  <Image
                    src="/logo/rsiq-mindscapeanalytics.png"
                    alt="RSIQ Pro"
                    fill
                    className="object-contain"
                  />
                </div>
                <div>
                  <div className="flex items-center bg-slate-900/40 border border-white/10 rounded-xl px-2 py-1 gap-2">
                    <div className="flex items-center gap-1.5">
                      <motion.div
                        animate={{ opacity: isConnected ? [0.4, 1, 0.4] : 1 }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.5)]" : "bg-slate-700")}
                      />
                      <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">{isConnected ? "Live" : "Off"}</span>
                    </div>
                    <div className="h-3 w-px bg-white/10" />
                    <span className="text-[7px] font-black text-[#39FF14] tabular-nums whitespace-nowrap">{data.length} QTPS</span>
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-2 relative" ref={profileRef}>
                {session && (
                  <>
                    <button
                      onClick={() => setIsProfileOpen(!isProfileOpen)}
                      className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg active:scale-90 transition-all text-slate-400"
                    >
                      <UserIcon size={18} />
                    </button>
                    
                    <AnimatePresence>
                      {isProfileOpen && (
                        <UserProfileDropdown 
                          session={session} 
                          isOwner={isOwner} 
                          onLogout={handleSignOut} 
                          isLoggingOut={isLoggingOut}
                          onClose={() => setIsProfileOpen(false)}
                          onShowGlobalSettings={() => setShowGlobalSettings(true)}
                          isMobile
                        />
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </div>

            {/* Controls Row: Alerts, Toggles, Actions */}
            <div className="flex items-center justify-between bg-slate-900/40 border border-white/10 rounded-2xl p-1 shadow-inner backdrop-blur-md">
              <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-0.5">
                {/* Asset Class Tabs (Mobile) */}
                {[
                  { id: 'crypto' as const, icon: '₿' },
                  { id: 'forex' as const, icon: '💱' },
                  { id: 'metals' as const, icon: '🥇' },
                  { id: 'stocks' as const, icon: '📈' },
                ].map((ac) => (
                  <button
                    key={ac.id}
                    onClick={() => setActiveAssetClass(ac.id)}
                    className={cn(
                      "px-2 py-1.5 text-[9px] rounded-lg transition-all",
                      activeAssetClass === ac.id ? "bg-[#39FF14]/20 text-[#39FF14] shadow-sm" : "text-slate-600"
                    )}
                  >
                    {ac.icon}
                  </button>
                ))}
                {activeAssetClass === 'crypto' && (
                  <>
                    <div className="w-px h-3 bg-white/10" />
                    {[
                      { id: 'binance', label: 'BIN' },
                      { id: 'bybit', label: 'BYB' },
                      { id: 'bybit-linear', label: 'PERP' }
                    ].map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => setExchange(ex.id)}
                        className={cn(
                          "px-2 py-1.5 text-[7px] font-black uppercase rounded-lg transition-all",
                          exchange === ex.id ? "bg-white/10 text-white" : "text-slate-600"
                        )}
                      >
                        {ex.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 pr-1">
                <button
                  onClick={() => fetchData()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#39FF14]/20 bg-[#39FF14]/5 text-[#39FF14] text-[8px] font-black tracking-widest active:scale-95 transition-all"
                >
                  <RefreshCcw size={10} className={refreshing ? "animate-spin" : ""} />
                  {countdown}S
                </button>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <button
                  onClick={async () => {
                    const next = !alertsEnabled;
                    setAlertsEnabled(next);
                    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                      try { await Notification.requestPermission(); } catch (e) { }
                    }
                  }}
                  className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all", alertsEnabled ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-600")}
                >
                  <Bell size={14} fill={alertsEnabled ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => setShowAlertPanel(!showAlertPanel)}
                  className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all", showAlertPanel ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-600")}
                >
                  <Clock size={14} />
                </button>
                <button
                  onClick={handleExportCsv}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all bg-white/[0.04] text-slate-600 active:bg-white/10"
                >
                  <Download size={14} />
                </button>
              </div>
            </div>

            {/* Signal Stats (Mobile Scrollable) */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {[
                { label: "Oversold", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold },
                { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys },
                { label: "Buy", value: stats.buy, color: "text-emerald-400/80", onClick: showBuys },
                { label: "Neutral", value: stats.neutral, color: "text-slate-400", onClick: showNeutrals },
                { label: "Sell", value: stats.sell, color: "text-rose-400/80", onClick: showSells },
                { label: "Strong Sell", value: stats.strongSell, color: "text-red-400", onClick: showStrongSells },
                { label: "Overbought", value: stats.overbought, color: "text-rose-400", onClick: showMostOverbought },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={s.onClick}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 border border-white/5 rounded-xl shrink-0 active:scale-95 transition-all hover:bg-white/5"
                >
                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-500">{s.label}</span>
                  <span className={cn("text-xs font-black tabular-nums", s.color)}>{s.value}</span>
                </button>
              ))}
            </div>

            {/* Micro-Stats Grid */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3 bg-white/[0.03] border border-white/5 rounded-2xl p-3 flex flex-col gap-2.5 shadow-inner">
                <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Market Bias</span>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-[#39FF14]" style={{ width: `${Math.max(0, 50 + stats.bias / 2)}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${Math.max(0, 50 - stats.bias / 2)}%` }} />
                  </div>
                  <span className={cn("text-[10px] font-black tabular-nums font-mono leading-none", stats.bias >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                    {stats.bias > 0 ? '+' : ''}{stats.bias}%
                  </span>
                </div>
              </div>

              <div className="col-span-2 bg-white/[0.03] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center shadow-inner">
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-1 leading-none">Sentiment</span>
                <div className="flex items-center gap-1.5">
                  <Gauge size={12} className={fearGreedColor} />
                  <span className={cn("text-[10px] font-black tabular-nums leading-none", fearGreedColor)}>{fearGreedScore}</span>
                </div>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-3">
              {[
                { label: "Oversold", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold },
                { label: "Overbought", value: stats.overbought, color: "text-red-400", onClick: showMostOverbought },
                { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys }
              ].map((s) => (
                <button key={s.label} onClick={s.onClick} className="flex flex-col items-center group/stat">
                  <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500 mb-1 leading-none">{s.label}</span>
                  <span className={cn("text-[13px] font-black tabular-nums tracking-tight leading-none", s.color)}><Counter value={s.value} /></span>
                </button>
              ))}
            </div>
          </div>
        </header>
      )}

      {/* ─── DERIVATIVES INTELLIGENCE PANEL ─── */}
      <div className="mb-4">
        <DerivativesPanel
          fundingRates={fundingRates}
          liquidations={liquidations}
          whaleAlerts={whaleAlerts}
          orderFlow={orderFlow}
          openInterest={openInterest}
          smartMoney={smartMoney}
          isConnected={derivativesConnected}
        />
      </div>

      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-6">
        <div className="relative flex-1 rounded-2xl border border-white/5 bg-slate-900/40 focus-within:border-[#39FF14]/20 transition-all lg:max-w-xs shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-transparent text-white placeholder:text-slate-600 focus:outline-none font-medium rounded-2xl"
          />
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
        </div>

        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 w-full lg:w-auto">
          <div className="flex shrink-0 bg-slate-900/40 rounded-2xl border border-white/5 p-1">
            {['all', 'strong-buy', 'buy', 'neutral', 'sell', 'strong-sell'].map((v) => (
              <button
                key={v}
                onClick={() => setSignalFilter(v as SignalFilter)}
                className={cn(
                  "px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-xl whitespace-nowrap",
                  signalFilter === v ? "bg-white/10 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {v === 'all' ? 'All' : v.replace('strong-', 'S-')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowWatchlistOnly((v) => !v)}
            className={cn(
              "shrink-0 px-3 py-2 text-[9px] font-bold uppercase tracking-widest rounded-2xl border transition-all whitespace-nowrap",
              showWatchlistOnly
                ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                : "bg-slate-900/40 text-slate-500 border-white/5 hover:bg-slate-800/60"
            )}
          >
            <Star size={12} className={cn("inline mr-1.5 mb-0.5", showWatchlistOnly && "fill-current")} />
            Watchlist
          </button>

          <button
            onClick={() => setShowHeader((v) => !v)}
            className={cn(
              "shrink-0 px-3 py-2 text-[9px] font-bold uppercase tracking-widest rounded-2xl border transition-all whitespace-nowrap",
              showHeader
                ? "bg-[#39FF14]/5 text-[#39FF14] border-[#39FF14]/20"
                : "bg-slate-900/40 text-slate-500 border-white/5 hover:bg-slate-800/60"
            )}
          >
            <LayoutList size={12} className="inline mr-1.5 mb-0.5" />
            Header
          </button>

          <div className="flex items-center gap-1.5 rounded-2xl border border-white/5 bg-slate-900/40 p-1 shrink-0">
            <span className="px-2 text-[8px] font-black uppercase tracking-widest text-slate-600">Rows</span>
            {PAIR_COUNTS.map((cnt) => {
              const locked = cnt > entitlements.maxRecords;
              return (
                <button
                  key={cnt}
                  onClick={() => {
                    if (locked) {
                      handleUpgradeRequired(cnt);
                      return;
                    }
                    handlePairCountChange(cnt);
                  }}
                  className={cn(
                    "px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl border transition-all whitespace-nowrap",
                    pairCount === cnt
                      ? "bg-white text-black border-white"
                      : "bg-white/[0.02] text-slate-500 border-white/10 hover:text-slate-300",
                    locked && "opacity-50 text-rose-300 border-rose-500/30"
                  )}
                  title={locked ? `Upgrade required for ${cnt} rows` : `Show ${cnt} rows`}
                >
                  {cnt}
                </button>
              );
            })}
          </div>

          <div className="relative group shrink-0" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest rounded-2xl border border-white/5 bg-slate-900/40 text-slate-500 hover:bg-slate-800/60 transition-all whitespace-nowrap"
            >
              <LayoutGrid size={12} className="inline mr-1.5 mb-0.5" />
              Cols
            </button>
            <AnimatePresence>
              {showColPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-4 z-[100] bg-[#0A0F1B]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 min-w-[300px] sm:min-w-[480px] overflow-hidden"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Screener Columns</span>
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => setVisibleCols(new Set(OPTIONAL_COLUMNS.map(c => c.id)))}
                          className="px-2 py-1 text-[9px] font-black text-[#39FF14] hover:bg-[#39FF14]/10 rounded-md transition-all uppercase"
                        >
                          All
                        </button>
                        <button
                          onClick={() => setVisibleCols(new Set())}
                          className="px-2 py-1 text-[9px] font-black text-[#FF4B5C] hover:bg-[#FF4B5C]/10 rounded-md transition-all uppercase"
                        >
                          None
                        </button>
                        <button
                          onClick={() => setVisibleCols(new Set(OPTIONAL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)))}
                          className="px-2 py-1 text-[9px] font-black text-slate-400 hover:bg-white/5 rounded-md transition-all uppercase"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[450px] overflow-y-auto no-scrollbar pr-1 flex flex-col gap-5">
                      {Array.from(new Set(OPTIONAL_COLUMNS.map(c => c.group))).map(group => (
                        <div key={group} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{group}</span>
                            <div className="h-[1px] flex-1 bg-white/5" />
                            <button
                              onClick={() => {
                                const groupIds = OPTIONAL_COLUMNS.filter(c => c.group === group).map(c => c.id);
                                setVisibleCols(prev => {
                                  const next = new Set(prev);
                                  const allInGroupSelected = groupIds.every(id => next.has(id));
                                  if (allInGroupSelected) groupIds.forEach(id => next.delete(id));
                                  else groupIds.forEach(id => next.add(id));
                                  return next;
                                });
                              }}
                              className="text-[8px] font-bold text-slate-600 hover:text-slate-400 uppercase transition-colors"
                            >
                              {OPTIONAL_COLUMNS.filter(c => c.group === group).every(c => visibleCols.has(c.id)) ? 'Deselect' : 'Select'}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {OPTIONAL_COLUMNS.filter(c => c.group === group).map((col) => (
                              <button
                                key={col.id}
                                onClick={() => toggleCol(col.id)}
                                className={cn(
                                  "flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left",
                                  visibleCols.has(col.id)
                                    ? "bg-[#39FF14]/[0.08] text-[#39FF14] border-[#39FF14]/20 shadow-[0_0_15px_-5px_#39FF1433]"
                                    : "text-slate-500 border-white/5 hover:bg-white/5 hover:border-white/10"
                                )}
                              >
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-all shrink-0",
                                  visibleCols.has(col.id) ? "bg-[#39FF14] border-[#39FF14]" : "border-slate-700"
                                )}>
                                  {visibleCols.has(col.id) && <ShieldCheck size={10} className="text-[#0A0F1B]" strokeWidth={3} />}
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-tight truncate leading-none">{col.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="hidden lg:flex items-center gap-3 bg-slate-900/40 border border-white/5 rounded-2xl px-5 py-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">RSI Period</span>
            <input
              type="range"
              min="2"
              max="50"
              value={rsiPeriod}
              onChange={(e) => setRsiPeriod(Number(e.target.value))}
              className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39FF14]"
            />
            <span className="text-xs font-black tabular-nums text-[#39FF14] w-6 text-center">{rsiPeriod}</span>
          </div>
        </div>
      </div>

      {(error || staleSince || (backoffUntil && backoffUntil > Date.now())) && (
        <div className={cn(
          "mb-4 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
          error ? "border-rose-500/30 bg-rose-500/10" : "border-amber-500/30 bg-amber-500/10"
        )}>
          <div className="flex flex-col gap-1">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-[0.18em]",
              error ? "text-rose-300" : "text-amber-300"
            )}>
              {error ? 'Feed Degraded' : 'Using Last Good Snapshot'}
            </span>
            <span className="text-[11px] text-slate-200">
              {error || 'Live updates are delayed. Displaying last successfully fetched dataset.'}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {lastSuccessfulFetchAt ? `Last success ${formatTimeAgo(lastSuccessfulFetchAt)} ago` : 'No successful fetch yet'}
              {staleSince ? ` • stale ${formatTimeAgo(staleSince)} ago` : ''}
              {consecutiveFetchFailures > 0 ? ` • failures ${consecutiveFetchFailures}` : ''}
              {latencyStats.lastMs ? ` • last ${latencyStats.lastMs}ms` : ''}
              {latencyStats.p50Ms ? ` • p50 ${latencyStats.p50Ms}ms` : ''}
              {latencyStats.p95Ms ? ` • p95 ${latencyStats.p95Ms}ms` : ''}
            </span>
            {autoLoadShedding.active && autoLoadShedding.fromCount && autoLoadShedding.toCount && (
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                Auto load shedding: rows {autoLoadShedding.fromCount} to {autoLoadShedding.toCount} until feed stabilizes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {backoffUntil && backoffUntil > Date.now() && (
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                Retry in {Math.max(1, Math.ceil((backoffUntil - Date.now()) / 1000))}s
              </span>
            )}
            <button
              onClick={() => {
                backoffUntilRef.current = null;
                setBackoffUntil(null);
                fetchData();
              }}
              className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-200 hover:bg-white/10 transition-all"
            >
              Retry Now
            </button>
          </div>
        </div>
      )}

      {/* ── Top Movers ── */}
      {!loading && topMovers.gainers.length > 0 && (
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-6 gap-3">
          {topMovers.gainers.map((e) => (
            <motion.div
              key={`g-${e.symbol}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-3 rounded-2xl border border-[#39FF14]/10 bg-[#39FF14]/[0.03] cursor-pointer hover:bg-[#39FF14]/[0.06] transition-all"
              onClick={() => setSelectedCoinForConfig(e.symbol)}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-white">{getSymbolAlias(e.symbol)}</span>
                <span className="text-[8px] font-bold text-slate-500">${formatPrice(e.price)}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp size={10} className="text-[#39FF14]" />
                <span className="text-[10px] font-black text-[#39FF14] tabular-nums">+{e.change24h.toFixed(1)}%</span>
              </div>
            </motion.div>
          ))}
          {topMovers.losers.map((e) => (
            <motion.div
              key={`l-${e.symbol}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-3 rounded-2xl border border-[#FF4B5C]/10 bg-[#FF4B5C]/[0.03] cursor-pointer hover:bg-[#FF4B5C]/[0.06] transition-all"
              onClick={() => setSelectedCoinForConfig(e.symbol)}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-white">{getSymbolAlias(e.symbol)}</span>
                <span className="text-[8px] font-bold text-slate-500">${formatPrice(e.price)}</span>
              </div>
              <div className="flex items-center gap-1">
                <TrendingDown size={10} className="text-[#FF4B5C]" />
                <span className="text-[10px] font-black text-[#FF4B5C] tabular-nums">{e.change24h.toFixed(1)}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Main List (Table or Cards) ── */}
      {isMobile ? (
        <div className="flex flex-col pb-32">
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-44 rounded-3xl skeleton border border-white/5 opacity-40" />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full py-24 text-center opacity-50 flex flex-col items-center gap-4">
              <Search size={48} className="text-slate-700" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No matches found</p>
            </div>
          ) : (
            <>
              {filtered.map((entry, idx) => (
                <ScreenerCard
                  key={entry.symbol}
                  entry={entry}
                  idx={idx}
                  watchlist={watchlist}
                  toggleWatchlist={toggleWatchlist}
                  rsiPeriod={rsiPeriod}
                  onOpenSettings={(s) => setSelectedCoinForConfig(s)}
                  coinConfigs={coinConfigs}
                  onSaveConfig={handleSaveConfig}
                  visibleCols={visibleCols}
                  reportVisibility={reportVisibility}
                  exchange={exchange}
                  globalShowSignalTags={globalShowSignalTags}
                  globalSignalThresholdMode={globalSignalThresholdMode}
                  globalThresholdsEnabled={globalThresholdsEnabled}
                  globalOverbought={globalOverbought}
                  globalOversold={globalOversold}
                  globalUseRsi={globalUseRsi}
                  globalUseMacd={globalUseMacd}
                  globalUseBb={globalUseBb}
                  globalUseStoch={globalUseStoch}
                  globalUseEma={globalUseEma}
                  globalUseVwap={globalUseVwap}
                  globalUseConfluence={globalUseConfluence}
                  globalUseDivergence={globalUseDivergence}
                  globalUseMomentum={globalUseMomentum}
                  globalVolatilityEnabled={globalVolatilityEnabled}
                  globalLongCandleThreshold={globalLongCandleThreshold}
                  globalVolumeSpikeThreshold={globalVolumeSpikeThreshold}
                  fundingRate={fundingRates.get(entry.symbol) ? { rate: fundingRates.get(entry.symbol)!.rate, annualized: fundingRates.get(entry.symbol)!.annualized } : null}
                  orderFlowData={orderFlow.get(entry.symbol) ? { ratio: orderFlow.get(entry.symbol)!.ratio, pressure: orderFlow.get(entry.symbol)!.pressure, buyVolume1m: orderFlow.get(entry.symbol)!.buyVolume1m, sellVolume1m: orderFlow.get(entry.symbol)!.sellVolume1m } : null}
                  smartMoneyScore={smartMoney.get(entry.symbol) ? { score: smartMoney.get(entry.symbol)!.score, label: smartMoney.get(entry.symbol)!.label } : null}
                />
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/5 bg-slate-900/40 overflow-hidden shadow-lg mb-8">
          <div className="overflow-x-auto overflow-y-auto max-h-[800px] custom-scrollbar">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20 bg-[#0A0F1B]/95 border-b border-white/5">
                <tr>
                  {visibleCols.has('rank') && (
                    <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-600 text-left w-12 tracking-widest">#</th>
                  )}
                  <th className="px-2 py-4 text-[10px] font-black text-slate-600 text-center w-8 uppercase tracking-widest">★</th>
                  <SortHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="24h Change" sortKey="change24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Volume" sortKey="volume24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />

                  {visibleCols.has('rsi1m') && <SortHeader label="RSI 1m" sortKey="rsi1m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('rsi5m') && <SortHeader label="RSI 5m" sortKey="rsi5m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('rsi15m') && <SortHeader label="RSI 15m" sortKey="rsi15m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('rsi1h') && <SortHeader label="RSI 1h" sortKey="rsi1h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('rsiCustom') && <SortHeader label={`RSI (${rsiPeriod})`} sortKey="rsiCustom" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('ema9') && <SortHeader label="EMA 9" sortKey="ema9" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('ema21') && <SortHeader label="EMA 21" sortKey="ema21" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('emaCross') && <SortHeader label="Trend" sortKey="emaCross" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('macdHistogram') && <SortHeader label="MACD" sortKey="macdHistogram" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('bbUpper') && <SortHeader label="BB Up" sortKey="bbUpper" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('bbLower') && <SortHeader label="BB Low" sortKey="bbLower" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('bbPosition') && <SortHeader label="BB Pos" sortKey="bbPosition" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('stochK') && <SortHeader label="Stoch" sortKey="stochK" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('confluence') && <SortHeader label="Confluence" sortKey="confluence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('divergence') && <SortHeader label="Diverg" sortKey="rsiDivergence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('momentum') && <SortHeader label="Momentum" sortKey="momentum" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('atr') && <SortHeader label="ATR" sortKey="atr" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('adx') && <SortHeader label="ADX" sortKey="adx" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('vwapDiff') && <SortHeader label="VWAP %" sortKey="vwapDiff" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('longCandle') && <SortHeader label="Long Candle" sortKey="longCandle" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  {visibleCols.has('volumeSpike') && <SortHeader label="Vol Spike" sortKey="volumeSpike" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}

                  {visibleCols.has('fundingRate') && <th className="px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500 tracking-wider">Funding</th>}
                  {visibleCols.has('orderFlow') && <th className="px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500 tracking-wider">Flow</th>}
                  {visibleCols.has('smartMoney') && <th className="px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500 tracking-wider">Smart $</th>}

                  <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  {visibleCols.has('strategy') && <SortHeader label="Strategy" sortKey="strategyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500 hidden sm:table-cell">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(loading || (activeAssetClass !== 'crypto' && marketDataLoading && processedData.length === 0)) ? (
                  <SkeletonRows cols={colCount} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-50">
                        <Search size={48} className="text-slate-700" />
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No matches found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.map((entry, idx) => (
                      <ScreenerRow
                        key={entry.symbol}
                        entry={entry}
                        idx={idx}
                        watchlist={watchlist}
                        toggleWatchlist={toggleWatchlist}
                        visibleCols={visibleCols}
                        useAnimations={useAnimations}
                        rsiPeriod={rsiPeriod}
                        onOpenSettings={(s) => setSelectedCoinForConfig(s)}
                        coinConfigs={coinConfigs}
                        onSaveConfig={handleSaveConfig}
                        reportVisibility={reportVisibility}
                        globalShowSignalTags={globalShowSignalTags}
                        globalSignalThresholdMode={globalSignalThresholdMode}
                        globalThresholdsEnabled={globalThresholdsEnabled}
                        globalOverbought={globalOverbought}
                        globalOversold={globalOversold}
                        globalUseRsi={globalUseRsi}
                        globalUseMacd={globalUseMacd}
                        globalUseBb={globalUseBb}
                        globalUseStoch={globalUseStoch}
                        globalUseEma={globalUseEma}
                        globalUseVwap={globalUseVwap}
                        globalUseConfluence={globalUseConfluence}
                        globalUseDivergence={globalUseDivergence}
                        globalUseMomentum={globalUseMomentum}
                        globalVolatilityEnabled={globalVolatilityEnabled}
                        globalLongCandleThreshold={globalLongCandleThreshold}
                        globalVolumeSpikeThreshold={globalVolumeSpikeThreshold}
                        fundingRate={fundingRates.get(entry.symbol) ? { rate: fundingRates.get(entry.symbol)!.rate, annualized: fundingRates.get(entry.symbol)!.annualized } : null}
                        orderFlowData={orderFlow.get(entry.symbol) ? { ratio: orderFlow.get(entry.symbol)!.ratio, pressure: orderFlow.get(entry.symbol)!.pressure, buyVolume1m: orderFlow.get(entry.symbol)!.buyVolume1m, sellVolume1m: orderFlow.get(entry.symbol)!.sellVolume1m } : null}
                        smartMoneyScore={smartMoney.get(entry.symbol) ? { score: smartMoney.get(entry.symbol)!.score, label: smartMoney.get(entry.symbol)!.label } : null}
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!isMobile && (
        <footer className="mt-16 py-10 border-t border-white/10 relative z-10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 px-4 opacity-60 hover:opacity-100 transition-opacity duration-500">
            {/* Left side: Brand + Critical Stats */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-10 gap-y-4">
              <Link href="/" className="group flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[7px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-[#39FF14] transition-colors leading-none mb-1">Developed By</span>
                  <span className="text-[13px] font-black text-white tracking-tighter leading-none">
                    Mindscape Analytics <span className="text-[#39FF14]">LLC</span>
                  </span>
                </div>
              </Link>

              <div className="h-6 w-px bg-white/10 hidden xl:block" />

              <div className="flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-600 leading-none mb-1">Universe</span>
                  <span className="text-[10px] font-bold text-slate-300 tabular-nums leading-none tracking-tight">{data.length} STABLE PAIRS</span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-600 leading-none mb-1">Engine Status</span>
                  <div className="flex items-center gap-1.5 leading-none">
                    <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-[#39FF14] animate-pulse shadow-[0_0_8px_rgba(57,255,20,0.5)]" : "bg-slate-700")} />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">{isConnected ? "Live Network" : "Polling Mode"}</span>
                  </div>
                </div>

                <Link
                  href="/guide"
                  className="flex flex-col group/doc"
                >
                  <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-600 leading-none mb-1 group-hover/doc:text-[#39FF14] transition-colors">Resources</span>
                  <span className="text-[10px] font-bold text-slate-400 group-hover/doc:text-white transition-colors tracking-tight">DOCUMENTATION</span>
                </Link>
              </div>
            </div>

            {/* Right side: Copyright & Legal */}
            <div className="flex flex-col items-center md:items-end">
              <span className="text-[7px] font-black uppercase tracking-[0.4em] text-slate-700 mb-1 leading-none">Global Terminal v1.0</span>
              <div suppressHydrationWarning className="text-[10px] font-bold text-slate-500 uppercase tracking-widest tabular-nums leading-none">
                &copy; {new Date().getFullYear()} ALL RIGHTS RESERVED
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* ── Coin Settings Modal ── */}
      <AnimatePresence>
        {selectedCoinForConfig && (
          <CoinSettingsModal
            symbol={selectedCoinForConfig}
            currentConfig={coinConfigs[selectedCoinForConfig]}
            onClose={() => setSelectedCoinForConfig(null)}
            onSave={async (newConfig) => {
              try {
                const res = await fetch('/api/config', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
                    pragma: 'no-cache',
                  },
                  cache: 'no-store',
                  body: JSON.stringify({ symbol: selectedCoinForConfig, exchange, ...newConfig }),
                });
                if (res.ok) {
                  const updated = await res.json();
                  setCoinConfigs(prev => ({ ...prev, [selectedCoinForConfig]: updated }));

                  // Instant worker sync to ensure new thresholds/periods take effect immediately
                  if (typeof window !== 'undefined') {
                    const eng = (window as any).__priceEngine;
                    if (eng?.postToWorker) {
                      eng.postToWorker({
                        type: 'SYNC_CONFIG_FAST',
                        payload: { symbol: selectedCoinForConfig, config: updated },
                      });
                    }
                  }

                  toast.success(`${getSymbolAlias(selectedCoinForConfig)} Configuration applied.`, {
                    description: "Filters and alerts have been updated in real-time.",
                    duration: 3000
                  });

                  setSelectedCoinForConfig(null);
                  fetchData(true);
                } else {
                  toast.error(`Failed to apply configuration for ${getSymbolAlias(selectedCoinForConfig)}`, {
                    description: "The server encountered an error while saving your settings."
                  });
                  throw new Error("Failed to save config");
                }
              } catch (err) {
                console.error('Failed to save config:', err);
                if (!(err instanceof Error && err.message === "Failed to save config")) {
                  toast.error("Network error: Could not connect to settings service.");
                }
                throw err; // Propagate to handleSave so it stops loading and keeps modal open
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAlertPanel && (
          <AlertHistoryPanel
            alerts={alerts}
            onClose={() => setShowAlertPanel(false)}
            onClear={clearAlertHistory}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGlobalSettings && (
          <GlobalSettingsModal
            onClose={() => setShowGlobalSettings(false)}
            visibleCols={visibleCols}
            toggleCol={toggleCol}
            rsiPeriod={rsiPeriod}
            setRsiPeriod={setRsiPeriod}
            refreshInterval={refreshInterval}
            setRefreshInterval={setRefreshInterval}
            pairCount={pairCount}
            setPairCount={handlePairCountChange}
            maxRecords={entitlements.maxRecords}
            canUseAlerts={entitlements.features.enableAlerts}
            canUseAdvancedIndicators={entitlements.features.enableAdvancedIndicators}
            canUseCustomSettings={entitlements.features.enableCustomSettings}
            onUpgrade={() => handleUpgradeRequired(200)}
            alertsEnabled={alertsEnabled}
            setAlertsEnabled={setAlertsEnabled}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
            resumeAudioContext={resumeAudioContext}
            globalThresholdsEnabled={globalThresholdsEnabled}
            setGlobalThresholdsEnabled={setGlobalThresholdsEnabled}
            globalOverbought={globalOverbought}
            setGlobalOverbought={setGlobalOverbought}
            globalOversold={globalOversold}
            setGlobalOversold={setGlobalOversold}
            globalThresholdTimeframes={globalThresholdTimeframes}
            setGlobalThresholdTimeframes={setGlobalThresholdTimeframes}
            globalLongCandleThreshold={globalLongCandleThreshold}
            setGlobalLongCandleThreshold={setGlobalLongCandleThreshold}
            globalVolumeSpikeThreshold={globalVolumeSpikeThreshold}
            setGlobalVolumeSpikeThreshold={setGlobalVolumeSpikeThreshold}
            globalVolatilityEnabled={globalVolatilityEnabled}
            setGlobalVolatilityEnabled={setGlobalVolatilityEnabled}
            globalShowSignalTags={globalShowSignalTags}
            setGlobalShowSignalTags={setGlobalShowSignalTags}
            globalSignalThresholdMode={globalSignalThresholdMode}
            setGlobalSignalThresholdMode={setGlobalSignalThresholdMode}
            globalUseRsi={globalUseRsi}
            setGlobalUseRsi={setGlobalUseRsi}
            globalUseMacd={globalUseMacd}
            setGlobalUseMacd={setGlobalUseMacd}
            globalUseBb={globalUseBb}
            setGlobalUseBb={setGlobalUseBb}
            globalUseStoch={globalUseStoch}
            setGlobalUseStoch={setGlobalUseStoch}
            globalUseEma={globalUseEma}
            setGlobalUseEma={setGlobalUseEma}
            globalUseVwap={globalUseVwap}
            setGlobalUseVwap={setGlobalUseVwap}
            globalUseConfluence={globalUseConfluence}
            setGlobalUseConfluence={setGlobalUseConfluence}
            globalUseDivergence={globalUseDivergence}
            setGlobalUseDivergence={setGlobalUseDivergence}
            globalUseMomentum={globalUseMomentum}
            setGlobalUseMomentum={setGlobalUseMomentum}
          />
        )}
      </AnimatePresence>

      {/* Mobile-only Bottom Navigation Dock */}
      <BottomDock
        onOpenAlerts={() => {
          setActiveTab('alerts');
          setShowAlertPanel(!showAlertPanel);
        }}
        onOpenWatchlist={() => {
          setActiveTab('watchlist');
          setShowWatchlistOnly(true);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenSettings={() => {
          setActiveTab('settings');
          setShowGlobalSettings(true);
        }}
        onGoHome={() => {
          setActiveTab('home');
          setShowWatchlistOnly(false);
          setSignalFilter('all');
          setSearch('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        activeTab={activeTab}
        alertCount={alerts.length}
      />
    </div>
  );
}

// ─── Coin Settings Modal Component ─────────────────────────────

function CoinSettingsModal({
  symbol,
  currentConfig,
  onClose,
  onSave
}: {
  symbol: string;
  currentConfig: any;
  onClose: () => void;
  onSave: (config: any) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    rsi1mPeriod: currentConfig?.rsi1mPeriod ?? 14,
    rsi5mPeriod: currentConfig?.rsi5mPeriod ?? 14,
    rsi15mPeriod: currentConfig?.rsi15mPeriod ?? 14,
    rsi1hPeriod: currentConfig?.rsi1hPeriod ?? 14,
    overboughtThreshold: currentConfig?.overboughtThreshold ?? 70,
    oversoldThreshold: currentConfig?.oversoldThreshold ?? 30,
    alertOn1m: currentConfig?.alertOn1m ?? false,
    alertOn5m: currentConfig?.alertOn5m ?? false,
    alertOn15m: currentConfig?.alertOn15m ?? false,
    alertOn1h: currentConfig?.alertOn1h ?? false,
    alertOnCustom: currentConfig?.alertOnCustom ?? false,
    alertConfluence: currentConfig?.alertConfluence ?? false,
    alertOnStrategyShift: currentConfig?.alertOnStrategyShift ?? false,
    alertPush247: currentConfig?.alertPush247 ?? false,
    alertOnLongCandle: currentConfig?.alertOnLongCandle ?? false,
    alertOnVolumeSpike: currentConfig?.alertOnVolumeSpike ?? false,
    longCandleThreshold: currentConfig?.longCandleThreshold ?? 10.0,
    volumeSpikeThreshold: currentConfig?.volumeSpikeThreshold ?? 10.0,
    // Task 15.1: Priority and sound selection
    priority: currentConfig?.priority ?? 'medium',
    sound: currentConfig?.sound ?? 'default',
    // Task 15.2: Quiet hours
    quietHoursEnabled: currentConfig?.quietHoursEnabled ?? false,
    quietHoursStart: currentConfig?.quietHoursStart ?? 22,
    quietHoursEnd: currentConfig?.quietHoursEnd ?? 8,
  });

  const { status: pushStatus, toggle: togglePush, isLoading: pushLoading } = usePushNotifications();

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(config);
      onClose(); // Perfect coupling: close window immediately after successful parent save
    } catch (err) {
      toast.error("Failed to save configuration.");
    } finally {
      if (typeof window !== 'undefined') setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md bg-slate-900 border-t sm:border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 sm:p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <Settings size={18} className="text-[#39FF14]" />
              {getSymbolAlias(symbol)} <span className="text-slate-500 font-bold text-sm">Settings</span>
            </h2>
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Customize RSI periods and thresholds</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <LogOut size={18} className="rotate-180" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
            {/* RSI Periods Grid - Consolidated for Vertical Efficiency */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-4">
              <NumericAdjuster
                label="RSI 1m Period"
                value={config.rsi1mPeriod}
                onChange={(v: number) => setConfig({ ...config, rsi1mPeriod: v })}
                min={2} max={50}
                loading={loading}
              />
              <NumericAdjuster
                label="RSI 5m Period"
                value={config.rsi5mPeriod}
                onChange={(v: number) => setConfig({ ...config, rsi5mPeriod: v })}
                min={2} max={50}
                loading={loading}
              />
              <NumericAdjuster
                label="RSI 15m Period"
                value={config.rsi15mPeriod}
                onChange={(v: number) => setConfig({ ...config, rsi15mPeriod: v })}
                min={2} max={50}
                loading={loading}
              />
              <NumericAdjuster
                label="RSI 1h Period"
                value={config.rsi1hPeriod}
                onChange={(v: number) => setConfig({ ...config, rsi1hPeriod: v })}
                min={2} max={50}
                loading={loading}
              />
            </div>

            <div className="h-px bg-white/5" />

            {/* Thresholds Grid */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-4">
              <NumericAdjuster
                label="Overbought"
                value={config.overboughtThreshold}
                onChange={(v: number) => setConfig({ ...config, overboughtThreshold: v })}
                colorClass="text-[#FF4B5C]"
                bgClass="bg-[#722f37]/10"
                borderClass="border-[#722f37]/30"
                description="Sell Zone"
                loading={loading}
              />
              <NumericAdjuster
                label="Oversold"
                value={config.oversoldThreshold}
                onChange={(v: number) => setConfig({ ...config, oversoldThreshold: v })}
                colorClass="text-[#39FF14]"
                bgClass="bg-[#39FF14]/10"
                borderClass="border-[#39FF14]/30"
                description="Buy Zone"
                loading={loading}
              />
            </div>

            {Math.abs(config.overboughtThreshold - config.oversoldThreshold) <= 5 && (
              <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-[9px] text-amber-400 font-bold leading-tight flex items-center gap-2">
                  <Info size={12} className="shrink-0" />
                  <span>Tight thresholds may cause frequent alert transitions.</span>
                </p>
              </div>
            )}
            {config.overboughtThreshold < config.oversoldThreshold && (
              <div className="p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="text-[9px] text-blue-400 font-bold leading-tight flex items-center gap-2">
                  <Info size={12} className="shrink-0" />
                  <span>Contrarian: alert fires on crossovers of inverted levels.</span>
                </p>
              </div>
            )}

            <div className="h-px bg-white/5" />

            {/* Volatility Thresholds */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-4">
              <NumericAdjuster
                label="Long Candle"
                value={config.longCandleThreshold}
                onChange={(v: number) => setConfig({ ...config, longCandleThreshold: v })}
                colorClass="text-amber-400"
                bgClass="bg-amber-400/10"
                borderClass="border-amber-400/30"
                description="Size Multiplier"
                min={2} max={50}
                loading={loading}
              />
              <NumericAdjuster
                label="Vol Spike"
                value={config.volumeSpikeThreshold}
                onChange={(v: number) => setConfig({ ...config, volumeSpikeThreshold: v })}
                colorClass="text-[#39FF14]"
                bgClass="bg-[#39FF14]/10"
                borderClass="border-[#39FF14]/30"
                description="Vol Multiplier"
                min={2} max={50}
                loading={loading}
              />
            </div>

            <div className="h-px bg-white/5" />

            {/* Task 15.1: Priority and Sound Selection */}
            <div className="space-y-2">
              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400 ml-0.5 flex items-center gap-1.5">
                <Flame size={10} className="text-orange-400" /> Alert Priority & Sound
              </label>

              <div className="grid grid-cols-2 gap-2">
                {/* Priority Selection */}
                <div className="space-y-1.5">
                  <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Priority</span>
                  <select
                    value={config.priority}
                    onChange={(e) => setConfig({ ...config, priority: e.target.value })}
                    disabled={loading}
                    className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {/* Sound Selection */}
                <div className="space-y-1.5">
                  <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Sound</span>
                  <select
                    value={config.sound}
                    onChange={(e) => setConfig({ ...config, sound: e.target.value })}
                    disabled={loading}
                    className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
                  >
                    <option value="default">Default</option>
                    <option value="soft">Soft</option>
                    <option value="urgent">Urgent</option>
                    <option value="bell">Bell</option>
                    <option value="ping">Ping</option>
                  </select>
                </div>
              </div>

              {/* Priority Info */}
              <div className="p-2 rounded-xl bg-slate-950/30 border border-white/5">
                <p className="text-[8px] text-slate-500 font-bold leading-tight">
                  {config.priority === 'low' && '🔵 Low: Soft sound, 5s toast'}
                  {config.priority === 'medium' && '🟢 Medium: Default sound, 8s toast'}
                  {config.priority === 'high' && '🟠 High: Bell sound, 12s persistent'}
                  {config.priority === 'critical' && '🔴 Critical: Urgent sound, requires interaction'}
                </p>
              </div>
            </div>

            {/* Task 15.2: Quiet Hours Configuration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20 group">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={11} />
                    Quiet Hours
                  </span>
                  <span className="text-[7px] text-slate-500 font-bold uppercase mt-0.5 leading-tight pr-4">
                    Suppress low/medium priority alerts
                  </span>
                </div>
                <button
                  onClick={() => setConfig({ ...config, quietHoursEnabled: !config.quietHoursEnabled })}
                  disabled={loading}
                  className={cn(
                    "w-9 h-4.5 rounded-full p-0.5 transition-all flex items-center",
                    config.quietHoursEnabled ? "bg-purple-500" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                    config.quietHoursEnabled ? "translate-x-4.5" : "translate-x-0"
                  )} />
                </button>
              </div>

              {config.quietHoursEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 gap-2"
                >
                  <div className="space-y-1.5">
                    <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">Start (24h)</span>
                    <select
                      value={config.quietHoursStart}
                      onChange={(e) => setConfig({ ...config, quietHoursStart: parseInt(e.target.value) })}
                      disabled={loading}
                      className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500/30 transition-all disabled:opacity-50"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[7px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">End (24h)</span>
                    <select
                      value={config.quietHoursEnd}
                      onChange={(e) => setConfig({ ...config, quietHoursEnd: parseInt(e.target.value) })}
                      disabled={loading}
                      className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-purple-500/30 transition-all disabled:opacity-50"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="h-px bg-white/5" />

            {/* 2026 Intelligent 24/7 Background Push - HIGH VISIBILITY POSITION */}
            <div className={cn(
              "p-3 rounded-2xl border transition-all relative overflow-hidden group/push",
              pushStatus === 'active'
                ? "bg-[#39FF14]/[0.08] border-[#39FF14]/30 shadow-[0_0_25px_-5px_#39FF1444]"
                : "bg-white/[0.02] border-white/5 shadow-inner"
            )}>
              <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover/push:opacity-[0.1] transition-opacity duration-500">
                <Zap size={32} className="text-[#39FF14]" />
              </div>

              <div className="flex flex-col mb-2">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                  pushStatus === 'active' ? "text-[#39FF14]" : "text-slate-400"
                )}>
                  <Zap size={11} className={cn(pushStatus === 'active' && "animate-pulse")} />
                  24/7 Persistent Alerts
                </span>
                <span className="text-[7px] text-slate-500 font-bold uppercase mt-1 leading-tight pr-10">
                  Smart Wake: Alerts arrive via Web Push even if app is closed.
                </span>
              </div>

              <button
                onClick={togglePush}
                disabled={pushLoading}
                className={cn(
                  "absolute top-3.5 right-3.5 w-10 h-5 rounded-full p-0.5 transition-all flex items-center shrink-0 shadow-sm",
                  pushStatus === 'active' ? "bg-[#39FF14]" : "bg-slate-800"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white transition-all shadow-md",
                  pushStatus === 'active' ? "translate-x-5" : "translate-x-0"
                )} />
              </button>

              <div className="mt-1 flex items-center gap-2">
                <div className={cn("h-1 w-1 rounded-full", pushStatus === 'active' ? "bg-[#39FF14] animate-pulse" : "bg-slate-700")} />
                <span className="text-[7px] font-black uppercase tracking-widest text-slate-600">
                  {pushStatus === 'active' ? "24/7 Cloud Monitoring Active" : "Background Mode: Standby"}
                </span>
              </div>
            </div>

            {/* Active Alerts Section */}
            <div className="space-y-2">
              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400 ml-0.5 flex items-center gap-1.5"><Bell size={10} className="text-[#39FF14]" /> Standard Alerts</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'alertOn1m', label: '1m' },
                  { key: 'alertOn5m', label: '5m' },
                  { key: 'alertOn15m', label: '15M' },
                  { key: 'alertOn1h', label: '1H' },
                  { key: 'alertOnCustom', label: 'CUST' },
                  { key: 'alertOnLongCandle', label: 'VOLA' },
                  { key: 'alertOnVolumeSpike', label: 'SPIKE' }
                ].map(tf => (
                  <button
                    key={tf.key}
                    disabled={loading}
                    onClick={() => setConfig({ ...config, [tf.key]: !(config as any)[tf.key] })}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[8px] font-black uppercase transition-all tracking-wider border shrink-0",
                      (config as any)[tf.key]
                        ? "bg-[#39FF14]/20 border-[#39FF14]/50 text-[#39FF14]"
                        : "bg-slate-950/50 border-white/5 text-slate-500 hover:text-white"
                    )}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/20 group">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                    <ShieldCheck size={11} />
                    Confluence
                  </span>
                  <span className="text-[7px] text-slate-500 font-bold uppercase mt-0.5 leading-tight pr-4">
                    Requires dual-timeframe extremes.
                  </span>
                </div>
                <button
                  onClick={() => setConfig({ ...config, alertConfluence: !config.alertConfluence })}
                  className={cn(
                    "w-9 h-4.5 rounded-full p-0.5 transition-all flex items-center",
                    config.alertConfluence ? "bg-orange-500" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                    config.alertConfluence ? "translate-x-4.5" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Strategy Shift Alert Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/5 border border-blue-500/20 group">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                    <BrainCircuit size={11} />
                    Strategy Shift
                  </span>
                  <span className="text-[7px] text-slate-500 font-bold uppercase mt-0.5 leading-tight pr-4">
                    Alert on Strong Buy/Sell shifts.
                  </span>
                </div>
                <button
                  onClick={() => setConfig({ ...config, alertOnStrategyShift: !config.alertOnStrategyShift })}
                  className={cn(
                    "w-9 h-4.5 rounded-full p-0.5 transition-all flex items-center",
                    config.alertOnStrategyShift ? "bg-blue-500" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                    config.alertOnStrategyShift ? "translate-x-4.5" : "translate-x-0"
                  )} />
                </button>
              </div>
            </div>

            <div className="h-px bg-white/5" />
          </div>
        </div>

        <div className="p-3 sm:p-5 border-t border-white/5 bg-white/[0.02] shrink-0">
          <button
            disabled={loading}
            onClick={handleSave}
            className="w-full bg-[#39FF14] text-black font-black uppercase tracking-widest py-3 sm:py-3.5 rounded-xl hover:bg-[#39FF14]/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#39FF14]/10 text-sm"
          >
            {loading ? 'SAVING...' : 'APPLY CONFIGURATION'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────

const NumericAdjuster = memo(({
  label, value, onChange, min = 1, max = 99,
  colorClass = "text-white", bgClass = "bg-slate-950/50", borderClass = "border-white/5",
  description = "", loading = false
}: any) => {
  const [localValue, setLocalValue] = useState(value.toString());

  useEffect(() => {
    // Sync local state if parent value changes (e.g. from buttons or initial load)
    if (value.toString() !== localValue && document.activeElement !== document.getElementById(`input-${label}`)) {
      setLocalValue(value.toString());
    }
  }, [value, label]);

  const handleManualChange = (val: string) => {
    // Only allow digits
    const cleaned = val.replace(/[^0-9]/g, '');
    setLocalValue(cleaned);

    // Auto-commit if it's a valid number within bounds
    const parsed = parseInt(cleaned);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  const commitValue = () => {
    let parsed = parseInt(localValue);
    if (isNaN(parsed)) parsed = min;
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
    setLocalValue(clamped.toString());
  };

  return (
    <div className="space-y-1.5 pointer-events-auto">
      <div className="flex items-center justify-between px-0.5">
        <label className={cn("text-[8px] font-black uppercase tracking-[0.15em]", colorClass)}>{label}</label>
        {description && <span className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter">{description}</span>}
      </div>
      <div className={cn(
        "flex items-center gap-1 p-0.5 sm:p-1 rounded-2xl border transition-all duration-300 group/adjuster",
        bgClass, borderClass,
        "hover:border-white/10 shadow-sm"
      )}>
        <button
          type="button"
          disabled={loading || value <= min}
          onClick={() => {
            const next = Math.max(min, value - 1);
            onChange(next);
            setLocalValue(next.toString());
          }}
          className="p-1.5 sm:p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white disabled:opacity-10 transition-all focus:outline-none flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <input
          id={`input-${label}`}
          type="text"
          inputMode="numeric"
          value={localValue}
          onChange={(e) => handleManualChange(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => e.key === 'Enter' && commitValue()}
          className={cn(
            "w-full bg-transparent text-center font-black focus:outline-none transition-all text-sm appearance-none tabular-nums",
            colorClass
          )}
        />
        <button
          type="button"
          disabled={loading || value >= max}
          onClick={() => {
            const next = Math.min(max, value + 1);
            onChange(next);
            setLocalValue(next.toString());
          }}
          className="p-1.5 sm:p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white disabled:opacity-10 transition-all focus:outline-none flex items-center justify-center"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
});

NumericAdjuster.displayName = 'NumericAdjuster';

// ─── Stat Card ─────────────────────────────────────────────────

function Counter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.5, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-block"
    >
      {displayValue}
    </motion.span>
  );
}

function StatCard({ label, value, color, onClick, helper }: { label: string; value: number; color: string; onClick?: () => void; helper?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={cn(
        "p-6 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-md transition-all shadow-xl group relative overflow-hidden",
        onClick && "cursor-pointer hover:border-[#39FF14]/30 hover:bg-slate-800/60"
      )}
    >
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Gauge size={48} className={color} />
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 flex items-center gap-2">
        <div className={cn("w-1 h-1 rounded-full", color.replace('text-', 'bg-'))} />
        {label}
      </div>
      <div className={cn("text-4xl font-black tabular-nums tracking-tighter", color)}>
        <Counter value={value} />
      </div>
      <div className="mt-2 text-[10px] font-bold text-slate-600 group-hover:text-slate-400 transition-colors">{helper}</div>
    </motion.div>
  );
}

function MiniStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-3 text-center group">
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1 group-hover:text-slate-500 transition-colors uppercase">{label}</div>
      <div className={cn("text-xl font-black tabular-nums tracking-tight", color)}>
        <Counter value={value} />
      </div>
    </div>
  );
}

// ─── Alert History Panel ───────────────────────────────────────

// Gap 6: Human-readable labels for alert types
function formatAlertType(type: string): { label: string; isBullish: boolean } {
  switch (type) {
    case 'OVERSOLD': return { label: 'Oversold', isBullish: true };
    case 'OVERBOUGHT': return { label: 'Overbought', isBullish: false };
    case 'STRATEGY_STRONG_BUY': return { label: 'Strong Buy', isBullish: true };
    case 'STRATEGY_STRONG_SELL': return { label: 'Strong Sell', isBullish: false };
    default: return { label: type, isBullish: true };
  }
}

function formatAlertDetail(timeframe: string, value: number, type: string, exchange?: string): string {
  const exchangeLabel = exchange ? `[${exchange.charAt(0).toUpperCase() + exchange.slice(1)}] ` : '';
  if (timeframe === 'STRATEGY') return `${exchangeLabel}Strategy score: ${value.toFixed(0)}`;
  return `${exchangeLabel}${timeframe} RSI: ${value.toFixed(1)}`;
}

function AlertHistoryPanel({ alerts, onClose, onClear }: { alerts: any[]; onClose: () => void; onClear: () => void }) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <motion.div
      initial={{ x: isMobile ? 0 : '100%', y: isMobile ? '100%' : 0 }}
      animate={{ x: 0, y: 0 }}
      exit={{ x: isMobile ? 0 : '100%', y: isMobile ? '100%' : 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={cn(
        "fixed z-[200] bg-slate-900/90 backdrop-blur-2xl border-white/10 shadow-2xl overflow-hidden flex flex-col",
        "bottom-0 left-0 right-0 top-0 sm:top-0 sm:left-auto sm:right-0 sm:h-screen sm:w-[22rem] sm:border-l",
        isMobile ? "rounded-t-[2.5rem]" : ""
      )}
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02] sticky top-0 z-10">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <Bell size={16} className="text-[#39FF14]" />
            Alert History
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{alerts.length} signals tracked</p>
        </div>
        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <button
              onClick={onClear}
              className="px-3 py-1.5 rounded-xl bg-[#FF4B5C]/10 text-[#FF4B5C] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF4B5C]/20 transition-all border border-[#FF4B5C]/20"
            >
              Flush
            </button>
          )}
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all hover:bg-white/10">
            {isMobile ? <ChevronDown size={20} /> : <LogOut size={16} className="rotate-180" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-gradient-to-b from-transparent to-slate-950/20">
        <AnimatePresence initial={false} mode="popLayout">
          {alerts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center border border-white/5">
                <BellOff size={24} className="text-slate-600" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">No signals detected</p>
                <p className="text-[10px] font-bold text-slate-700 uppercase mt-1">Watching markets real-time...</p>
              </div>
            </motion.div>
          ) : (
            alerts.map((alert, idx) => {
              const { label, isBullish } = formatAlertType(alert.type);
              const createdAt = typeof alert.createdAt === 'string' ? new Date(alert.createdAt).getTime() : alert.createdAt;
              const isNew = Date.now() - createdAt < 30000;

              return (
                <motion.div
                  key={alert.id || idx}
                  layout
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={cn(
                    "p-5 rounded-2xl border transition-all relative overflow-hidden group min-h-[5.5rem] flex flex-col justify-center",
                    "bg-slate-800/30 backdrop-blur-sm border-white/5",
                    isBullish ? "hover:border-[#39FF14]/30 hover:bg-[#39FF14]/5" : "hover:border-[#FF4B5C]/30 hover:bg-[#FF4B5C]/5"
                  )}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white tracking-widest">{getSymbolAlias(alert.symbol)}</span>
                        {alert.exchange && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500 text-[8px] font-black uppercase tracking-tighter">
                            {alert.exchange}
                          </span>
                        )}
                        {isNew && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-[#39FF14] animate-ping" />
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase opacity-60 mt-1">{alert.timeframe} Signal</span>
                    </div>
                    <span suppressHydrationWarning className="text-[8px] font-bold text-slate-500 uppercase tabular-nums">{formatTimeAgo(createdAt)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className={cn(
                      "flex items-center gap-2 px-2.5 py-1 rounded-lg border",
                      isBullish
                        ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                        : "bg-[#FF4B5C]/10 border-[#FF4B5C]/30 text-[#FF4B5C]"
                    )}>
                      {isBullish ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      <span className="text-[9px] font-black uppercase tracking-[0.1em]">{label}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-white/90 tabular-nums">
                        {alert.value.toFixed(2)}
                      </div>
                      <div className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">Reading</div>
                    </div>
                  </div>

                  {/* High-fidelity glowing edge */}
                  <div className={cn(
                    "absolute top-0 right-0 bottom-0 w-[3px]",
                    isBullish ? "bg-[#39FF14]/40 shadow-[0_0_10px_rgba(57,255,20,0.3)]" : "bg-[#FF4B5C]/40 shadow-[0_0_10px_rgba(255,75,92,0.3)]"
                  )} />
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      <div className="p-6 border-t border-white/5 bg-slate-900/50">
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#39FF14]/10 flex items-center justify-center shrink-0 border border-[#39FF14]/20">
            <Zap size={20} className="text-[#39FF14]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Real-time Stream</span>
            <span className="text-[8px] font-bold text-slate-500 uppercase mt-0.5 leading-tight">Monitoring all configured exchanges for optimal entry points</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function GlobalSettingsModal({
  onClose,
  visibleCols,
  toggleCol,
  rsiPeriod,
  setRsiPeriod,
  refreshInterval,
  setRefreshInterval,
  pairCount,
  setPairCount,
  maxRecords,
  canUseAlerts,
  canUseAdvancedIndicators,
  canUseCustomSettings,
  onUpgrade,
  alertsEnabled,
  setAlertsEnabled,
  soundEnabled,
  setSoundEnabled,
  resumeAudioContext,
  globalThresholdsEnabled,
  setGlobalThresholdsEnabled,
  globalOverbought,
  setGlobalOverbought,
  globalOversold,
  setGlobalOversold,
  globalThresholdTimeframes,
  setGlobalThresholdTimeframes,
  globalLongCandleThreshold,
  setGlobalLongCandleThreshold,
  globalVolumeSpikeThreshold,
  setGlobalVolumeSpikeThreshold,
  globalVolatilityEnabled,
  setGlobalVolatilityEnabled,
  globalShowSignalTags,
  setGlobalShowSignalTags,
  globalSignalThresholdMode,
  setGlobalSignalThresholdMode,
  globalUseRsi,
  setGlobalUseRsi,
  globalUseMacd,
  setGlobalUseMacd,
  globalUseBb,
  setGlobalUseBb,
  globalUseStoch,
  setGlobalUseStoch,
  globalUseEma,
  setGlobalUseEma,
  globalUseVwap,
  setGlobalUseVwap,
  globalUseConfluence,
  setGlobalUseConfluence,
  globalUseDivergence,
  setGlobalUseDivergence,
  globalUseMomentum,
  setGlobalUseMomentum
}: {
  onClose: () => void;
  visibleCols: Set<string>;
  toggleCol: (id: ColumnId) => void;
  rsiPeriod: number;
  setRsiPeriod: (p: number) => void;
  refreshInterval: number;
  setRefreshInterval: (v: number) => void;
  pairCount: number;
  setPairCount: (v: number) => void;
  maxRecords: number;
  canUseAlerts: boolean;
  canUseAdvancedIndicators: boolean;
  canUseCustomSettings: boolean;
  onUpgrade: () => void;
  alertsEnabled: boolean;
  setAlertsEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  resumeAudioContext: () => Promise<void>;
  globalThresholdsEnabled: boolean;
  setGlobalThresholdsEnabled: (v: boolean) => void;
  globalOverbought: number;
  setGlobalOverbought: (v: number) => void;
  globalOversold: number;
  setGlobalOversold: (v: number) => void;
  globalThresholdTimeframes: string[];
  setGlobalThresholdTimeframes: (v: string[]) => void;
  globalLongCandleThreshold: number;
  setGlobalLongCandleThreshold: (v: number) => void;
  globalVolumeSpikeThreshold: number;
  setGlobalVolumeSpikeThreshold: (v: number) => void;
  globalVolatilityEnabled: boolean;
  setGlobalVolatilityEnabled: (v: boolean) => void;
  globalShowSignalTags: boolean;
  setGlobalShowSignalTags: (v: boolean) => void;
  globalSignalThresholdMode: 'default' | 'custom';
  setGlobalSignalThresholdMode: (v: 'default' | 'custom') => void;
  globalUseRsi: boolean;
  setGlobalUseRsi: (v: boolean) => void;
  globalUseMacd: boolean;
  setGlobalUseMacd: (v: boolean) => void;
  globalUseBb: boolean;
  setGlobalUseBb: (v: boolean) => void;
  globalUseStoch: boolean;
  setGlobalUseStoch: (v: boolean) => void;
  globalUseEma: boolean;
  setGlobalUseEma: (v: boolean) => void;
  globalUseVwap: boolean;
  setGlobalUseVwap: (v: boolean) => void;
  globalUseConfluence: boolean;
  setGlobalUseConfluence: (v: boolean) => void;
  globalUseDivergence: boolean;
  setGlobalUseDivergence: (v: boolean) => void;
  globalUseMomentum: boolean;
  setGlobalUseMomentum: (v: boolean) => void;
}) {
  const { status: pushStatus, toggle: togglePush, isLoading: pushLoading } = usePushNotifications();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-lg bg-[#080F1B] border-t sm:border border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#080F1B]/95 backdrop-blur-md z-10">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Settings size={20} className="text-[#39FF14]" />
              System <span className="text-[#39FF14]">Settings</span>
            </h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ChevronDown size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 custom-scrollbar pb-12">
          {/* Column Picker */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Visible Columns</h3>
            <div className="grid grid-cols-2 gap-2">
              {OPTIONAL_COLUMNS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => toggleCol(col.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-3 rounded-2xl border transition-all text-left",
                    visibleCols.has(col.id) ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]" : "bg-white/[0.02] border-white/5 text-slate-500"
                  )}
                >
                  <div className={cn("w-4 h-4 rounded-md border flex items-center justify-center shrink-0", visibleCols.has(col.id) ? "bg-[#39FF14] border-[#39FF14]" : "border-slate-800")}>
                    {visibleCols.has(col.id) && <ShieldCheck size={12} className="text-black" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-tight leading-none">{col.label}</span>
                    <span className="text-[7px] font-bold text-slate-700 uppercase mt-0.5">{col.group}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <div className="h-px bg-white/5" />

          {/* Alert Global Settings */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Alerts & Notifications</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Bell size={12} className="text-[#39FF14]" />
                    Global RSI Alerts
                  </span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Master switch for all real-time alerts</span>
                </div>
                <button
                  onClick={async () => {
                    if (!canUseAlerts) {
                      onUpgrade();
                      return;
                    }
                    const next = !alertsEnabled;
                    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                      await Notification.requestPermission();
                    }
                    setAlertsEnabled(next);
                  }}
                  disabled={!canUseAlerts}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                    alertsEnabled ? "bg-[#39FF14]" : "bg-slate-800",
                    !canUseAlerts && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    alertsEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Zap size={12} className="text-[#39FF14]" />
                    Chime Notifications
                  </span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Play high-fidelity sound on alert</span>
                </div>
                <button
                  onClick={() => {
                    if (!canUseAlerts) {
                      onUpgrade();
                      return;
                    }
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) resumeAudioContext();
                  }}
                  disabled={!canUseAlerts}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                    soundEnabled ? "bg-[#39FF14]" : "bg-slate-800",
                    !canUseAlerts && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    soundEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* 2026 Intelligent 24/7 Background Push (Global Access) */}
              <div className={cn(
                "p-4 rounded-2xl border transition-all relative overflow-hidden group/push",
                pushStatus === 'active'
                  ? "bg-[#39FF14]/[0.08] border-[#39FF14]/30 shadow-[0_0_25px_-5px_#39FF1444]"
                  : "bg-white/[0.02] border-white/5 shadow-inner"
              )}>
                <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover/push:opacity-[0.1] transition-opacity duration-500">
                  <Zap size={32} className="text-[#39FF14]" />
                </div>

                <div className="flex flex-col mb-2">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                    pushStatus === 'active' ? "text-[#39FF14]" : "text-slate-400"
                  )}>
                    <Zap size={12} className={cn(pushStatus === 'active' && "animate-pulse")} />
                    24/7 Persistent Alerts
                  </span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase mt-1 leading-tight pr-12">
                    System-wide Background Support. Alerts arrive even if the app or browser is closed.
                  </span>
                </div>

                <button
                  onClick={togglePush}
                  disabled={pushLoading || !canUseAlerts}
                  className={cn(
                    "absolute top-4 right-4 w-12 h-6 rounded-full p-1 transition-all flex items-center shrink-0 shadow-sm",
                    pushStatus === 'active' ? "bg-[#39FF14]" : "bg-slate-800",
                    !canUseAlerts && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    pushStatus === 'active' ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>

                <div className="mt-1 flex items-center gap-2">
                  <div className={cn("h-1.5 w-1.5 rounded-full", pushStatus === 'active' ? "bg-[#39FF14] animate-pulse" : "bg-slate-700")} />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                    {pushStatus === 'active' ? "24/7 Cloud Engine Active" : "Background Mode: Standby"}
                  </span>
                </div>
              </div>



              <div className="flex flex-col gap-4 mt-6">
                <div className="flex items-center justify-between ml-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <BrainCircuit size={12} className="text-[#39FF14]" />
                      Strategy Indicators
                    </span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Toggle indicators used in scoring logic</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'rsi', label: 'RSI (Full)', state: globalUseRsi, setter: setGlobalUseRsi, icon: <Gauge size={10} /> },
                    { id: 'macd', label: 'MACD Hist', state: globalUseMacd, setter: setGlobalUseMacd, icon: <BarChart3 size={10} /> },
                    { id: 'bb', label: 'Bollinger', state: globalUseBb, setter: setGlobalUseBb, icon: <Activity size={10} /> },
                    { id: 'stoch', label: 'Stoch RSI', state: globalUseStoch, setter: setGlobalUseStoch, icon: <RefreshCcw size={10} /> },
                    { id: 'ema', label: 'EMA Cross', state: globalUseEma, setter: setGlobalUseEma, icon: <TrendingUp size={10} /> },
                    { id: 'vwap', label: 'VWAP %', state: globalUseVwap, setter: setGlobalUseVwap, icon: <ShieldCheck size={10} /> },
                    { id: 'conf', label: 'Confluence', state: globalUseConfluence, setter: setGlobalUseConfluence, icon: <BrainCircuit size={10} /> },
                    { id: 'div', label: 'Divergence', state: globalUseDivergence, setter: setGlobalUseDivergence, icon: <Zap size={10} /> },
                    { id: 'mom', label: 'Momentum', state: globalUseMomentum, setter: setGlobalUseMomentum, icon: <TrendingUp size={10} /> }
                  ].map(ind => (
                    <button
                      key={ind.id}
                      onClick={() => {
                        if (!canUseAdvancedIndicators && ind.id !== 'rsi') {
                          onUpgrade();
                          return;
                        }
                        ind.setter(!ind.state);
                      }}
                      disabled={!canUseAdvancedIndicators && ind.id !== 'rsi'}
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-2.5 rounded-xl border transition-all text-left",
                        ind.state ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]" : "bg-white/[0.02] border-white/5 text-slate-600 opacity-60",
                        !canUseAdvancedIndicators && ind.id !== 'rsi' && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg border", ind.state ? "bg-[#39FF14] border-[#39FF14] text-black" : "bg-slate-900 border-slate-800 text-slate-700")}>
                        {ind.icon}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-tight leading-none">{ind.label}</span>
                        <span className="text-[7px] font-bold uppercase mt-0.5 opacity-60">{ind.state ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Signal Tag Display Controls */}
              <div className="p-5 rounded-3xl border border-white/5 bg-white/[0.02] space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <ShieldCheck size={12} className="text-[#39FF14]" />
                      Signal Tag Display
                    </span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5">Show Overbought/Oversold tags</span>
                  </div>
                  <button
                    onClick={() => setGlobalShowSignalTags(!globalShowSignalTags)}
                    className={cn(
                      "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                      globalShowSignalTags ? "bg-[#39FF14]" : "bg-slate-800"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                      globalShowSignalTags ? "translate-x-6" : "translate-x-0"
                    )} />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="text-[7px] font-black uppercase tracking-widest text-slate-500 ml-0.5">Threshold Source</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'default', label: 'Default (70/30)' },
                      { id: 'custom', label: 'Custom Logic' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        disabled={!globalShowSignalTags || !canUseCustomSettings}
                        onClick={() => {
                          if (!canUseCustomSettings) {
                            onUpgrade();
                            return;
                          }
                          setGlobalSignalThresholdMode(opt.id as any);
                        }}
                        className={cn(
                          "px-3 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all tracking-wider",
                          globalSignalThresholdMode === opt.id
                            ? "bg-[#39FF14]/10 border-[#39FF14]/40 text-[#39FF14]"
                            : "bg-black/20 border-white/5 text-slate-600 hover:text-slate-400"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[7px] text-slate-600 font-bold uppercase leading-relaxed px-1">
                    {globalSignalThresholdMode === 'default'
                      ? "Tags always use industry standard 70/30 levels."
                      : "Tags respect per-coin custom thresholds or global extreme settings."}
                  </p>
                </div>
              </div>

              {/* Global Extreme RSI Activation */}
              <div className={cn(
                "p-5 rounded-3xl border transition-all relative overflow-hidden group/extreme",
                globalThresholdsEnabled
                  ? "bg-purple-500/[0.08] border-purple-500/30 shadow-[0_0_40px_-10px_#A855F733]"
                  : "bg-white/[0.02] border-white/5"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover/extreme:opacity-[0.1] transition-opacity duration-700">
                  <Activity size={48} className="text-purple-500" />
                </div>

                <div className="flex flex-col mb-5">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2",
                    globalThresholdsEnabled ? "text-purple-400" : "text-slate-500"
                  )}>
                    <Activity size={14} className={cn(globalThresholdsEnabled && "animate-pulse")} />
                    Extreme RSI Mode (Alerts)
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 leading-relaxed pr-16">
                    Global thresholds for RSI alerts on all pairs. Used as fallback for signal tags in Custom Logic mode.
                  </span>
                </div>

                <button
                  onClick={() => {
                    if (!canUseCustomSettings) {
                      onUpgrade();
                      return;
                    }
                    setGlobalThresholdsEnabled(!globalThresholdsEnabled);
                  }}
                  disabled={!canUseCustomSettings}
                  className={cn(
                    "absolute top-5 right-5 w-12 h-6 rounded-full p-1 transition-all flex items-center shrink-0 shadow-lg",
                    globalThresholdsEnabled ? "bg-purple-500" : "bg-slate-800",
                    !canUseCustomSettings && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-md",
                    globalThresholdsEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <NumericAdjuster
                    label="Global Overbought"
                    value={globalOverbought}
                    onChange={setGlobalOverbought}
                    min={51} max={99}
                    colorClass={globalThresholdsEnabled ? "text-purple-300" : "text-slate-500"}
                    bgClass="bg-black/20"
                    borderClass="border-white/5"
                    description="Trigger @ Higher"
                    loading={!globalThresholdsEnabled}
                  />
                  <NumericAdjuster
                    label="Global Oversold"
                    value={globalOversold}
                    onChange={setGlobalOversold}
                    min={1} max={49}
                    colorClass={globalThresholdsEnabled ? "text-purple-300" : "text-slate-500"}
                    bgClass="bg-black/20"
                    borderClass="border-white/5"
                    description="Trigger @ Lower"
                    loading={!globalThresholdsEnabled}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 mt-5">
                  <label className="text-[7px] font-black uppercase tracking-widest text-slate-500 w-full mb-1 ml-0.5">Active Timeframes</label>
                  {[
                    { key: '1m', label: '1m' },
                    { key: '5m', label: '5m' },
                    { key: '15m', label: '15M' },
                    { key: '1h', label: '1H' },
                    { key: 'Custom', label: 'CUST' }
                  ].map(tf => (
                    <button
                      key={tf.key}
                      disabled={!globalThresholdsEnabled}
                      onClick={() => {
                        const next = globalThresholdTimeframes.includes(tf.key)
                          ? globalThresholdTimeframes.filter(t => t !== tf.key)
                          : [...globalThresholdTimeframes, tf.key];
                        setGlobalThresholdTimeframes(next);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[8px] font-black uppercase transition-all tracking-wider border shrink-0",
                        globalThresholdTimeframes.includes(tf.key)
                          ? "bg-purple-500/20 border-purple-500/50 text-purple-400"
                          : "bg-slate-950/50 border-white/5 text-slate-600 hover:text-slate-400"
                      )}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Global Volatility Activation */}
              <div className={cn(
                "p-5 rounded-3xl border transition-all relative overflow-hidden group/vol",
                globalVolatilityEnabled
                  ? "bg-amber-500/[0.08] border-amber-500/30 shadow-[0_0_40px_-10px_#F59E0B33]"
                  : "bg-white/[0.02] border-white/5"
              )}>
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover/vol:opacity-[0.1] transition-opacity duration-700">
                  <Zap size={48} className="text-amber-500" />
                </div>

                <div className="flex flex-col mb-5">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2",
                    globalVolatilityEnabled ? "text-amber-400" : "text-slate-500"
                  )}>
                    <Zap size={14} className={cn(globalVolatilityEnabled && "animate-pulse")} />
                    Volatility Surge Mode
                  </span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase mt-1.5 leading-relaxed pr-16">
                    Real-time alerts when current 1m candle exceeds the 20-bar average size.
                  </span>
                </div>

                <button
                  onClick={() => {
                    setGlobalVolatilityEnabled(!globalVolatilityEnabled);
                  }}

                  className={cn(
                    "absolute top-5 right-5 w-12 h-6 rounded-full p-1 transition-all flex items-center shrink-0 shadow-lg",
                    globalVolatilityEnabled ? "bg-amber-500" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-md",
                    globalVolatilityEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>

                <div className="grid grid-cols-2 gap-4">
                  <NumericAdjuster
                    label="Long Candle Multi"
                    value={globalLongCandleThreshold}
                    onChange={(v: number) => {
                      setGlobalLongCandleThreshold(v);

                    }}
                    min={2} max={50}
                    colorClass={globalVolatilityEnabled ? "text-amber-400" : "text-slate-500"}
                    bgClass="bg-black/20"
                    borderClass="border-white/5"
                    description="Volatility Surge"
                    loading={!globalVolatilityEnabled}
                  />
                  <NumericAdjuster
                    label="Vol Spike Multi"
                    value={globalVolumeSpikeThreshold}
                    onChange={(v: number) => {
                      setGlobalVolumeSpikeThreshold(v);

                    }}
                    min={2} max={50}
                    colorClass={globalVolatilityEnabled ? "text-[#39FF14]" : "text-slate-500"}
                    bgClass="bg-black/20"
                    borderClass="border-white/5"
                    description="Volume Surge"
                    loading={!globalVolatilityEnabled}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="h-px bg-white/5" />

          {/* RSI Selection */}
          <section className="space-y-4">
            <div className="flex items-center justify-between ml-1">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Global RSI Period</h3>
              <span className="px-3 py-1 rounded-lg bg-[#39FF14]/10 text-[#39FF14] text-xs font-black tabular-nums">{rsiPeriod}</span>
            </div>
            <div className="flex items-center gap-4 px-2">
              <input
                type="range"
                min="2"
                max="50"
                step="1"
                value={rsiPeriod}
                onChange={(e) => setRsiPeriod(Number(e.target.value))}
                className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39FF14]"
              />
            </div>
          </section>

          <div className="h-px bg-white/5" />

          {/* Performance Settings */}
          <section className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Refresh</h3>
              <div className="grid grid-cols-1 gap-1.5">
                {REFRESH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRefreshInterval(opt.value)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest",
                      refreshInterval === opt.value ? "bg-white text-black border-white" : "bg-white/5 border-white/5 text-slate-500"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Pairs</h3>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-600 ml-1">Plan limit: {maxRecords} records</p>
              <div className="grid grid-cols-1 gap-1.5">
                {PAIR_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => {
                      if (cnt > maxRecords) {
                        onUpgrade();
                        return;
                      }
                      setPairCount(cnt);
                    }}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest",
                      pairCount === cnt ? "bg-white text-black border-white" : "bg-white/5 border-white/5 text-slate-500",
                      cnt > maxRecords && "opacity-40 border-rose-500/30 text-rose-300"
                    )}
                  >
                    {cnt > maxRecords ? `${cnt} Records (Upgrade)` : `${cnt} Records`}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="w-full bg-[#39FF14] text-black font-black uppercase tracking-[0.2em] py-5 rounded-3xl shadow-xl shadow-[#39FF14]/10 active:scale-95 transition-all text-xs"
          >
            Save & Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
