'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, BellOff, Settings, Filter, Star, Info, Download,
  RefreshCcw, Zap, BarChart3, TrendingUp, TrendingDown,
  LayoutGrid, LayoutList, ChevronUp, ChevronDown, Clock,
  Flame, ShieldCheck, Activity, BrainCircuit, Gauge,
  LogOut, User as UserIcon
} from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { ScreenerEntry, ScreenerResponse, SortKey, SortDir, SignalFilter } from '@/lib/types';
import { useLivePrices, useSymbolPrice } from '@/hooks/use-live-prices';
import { useAlertEngine } from '@/hooks/use-alert-engine';
import { approximateRsi, approximateEma } from '@/lib/rsi';
import { computeStrategyScore } from '@/lib/indicators';
import { getSymbolAlias } from '@/lib/symbol-utils';
import { toast } from 'sonner';

// ─── Formatting helpers ────────────────────────────────────────

function formatPrice(p: number): string {
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
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

function StrategyBadge({ signal, label, reasons }: { signal: ScreenerEntry['strategySignal']; label: string; reasons?: string[] }) {
  const styles: Record<string, string> = {
    'strong-buy': 'bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/40',
    'buy': 'bg-[#39FF14]/10 text-[#39FF14] border-[#39FF14]/20',
    'neutral': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    'sell': 'bg-[#722f37]/10 text-[#FF4B5C]/80 border-[#722f37]/20',
    'strong-sell': 'bg-[#722f37]/20 text-[#FF4B5C] border-[#722f37]/40',
  };
  const title = reasons?.length ? reasons.join(' \u00B7 ') : undefined;
  return (
    <span className={cn("inline-flex items-center px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded border shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-all", styles[signal])} title={title}>
      {label}
    </span>
  );
}

function MarketBadge({ market }: { market: ScreenerEntry['market'] }) {
  if (!market || market === 'Crypto') return null;
  const styles: Record<string, string> = {
    Metal: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Forex: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    Index: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };
  return (
    <span className={cn("px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.2em] rounded-sm border shrink-0 shadow-sm", styles[market])}>
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
  reportVisibility
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
    let signal = entry.signal;
    const leadRsi = rsi15m ?? rsi1m;
    if (leadRsi !== null) {
      if (leadRsi <= osT) signal = "oversold";
      else if (leadRsi >= obT) signal = "overbought";
      else signal = "neutral";
    }
    const liveStrategy = computeStrategyScore({
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: entry.macdHistogram,
      bbPosition,
      stochK: entry.stochK,
      stochD: entry.stochD,
      emaCross,
      vwapDiff: entry.vwapDiff,
      volumeSpike: entry.volumeSpike,
      price: tick.price,
      confluence: entry.confluence,
      rsiDivergence: entry.rsiDivergence,
      momentum: entry.momentum,
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
      volumeSpike: entry.volumeSpike,
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
      strategyLabel: tick.strategyScore !== undefined ? (tick.strategyScore >= 70 ? "Strong Buy" : tick.strategyScore <= -70 ? "Strong Sell" : liveStrategy.label) : liveStrategy.label,
      strategyReasons: liveStrategy.reasons,
      lastPriceChange: tick.tickDelta || 0,
      isLiveRsi: true
    };
  }, [tick, coinConfigs, entry, rsiPeriod]);

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
    signal: entry.signal,
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
    <motion.tr
      layout={useAnimations}
      initial={useAnimations ? { opacity: 0 } : undefined}
      animate={{
        opacity: 1,
        backgroundColor: isFlash
          ? (display.strategySignal.includes('buy') ? 'rgba(57, 255, 20, 0.1)' : display.strategySignal.includes('sell') ? 'rgba(114, 47, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)')
          : 'transparent'
      }}
      exit={useAnimations ? { opacity: 0, scale: 0.98 } : undefined}
      transition={{ duration: 0.3 }}
      ref={rowRef}
      className={cn(
        "group transition-colors duration-300 hover:bg-white/[0.04]",
        !isFlash && getRsiBg(display.rsiCustom ?? display.rsi15m)
      )}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 64px'
      } as any}
    >
      <td className="px-4 py-4 text-[10px] text-slate-700 font-black tabular-nums">{idx + 1}</td>
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
          </div>
          {entry.market === 'Crypto' && <span className="text-slate-700 text-[8px] font-black uppercase tracking-wider opacity-60">USDT</span>}
        </div>
      </td>
      <td className="px-3 py-4 text-right tabular-nums font-bold font-mono text-[13px] relative overflow-hidden">
        <motion.span
          key={`${entry.symbol}-price-${display.price}`}
          initial={{ y: display.lastPriceChange > 0 ? 4 : -4, opacity: 0.5 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "inline-block transition-colors duration-700",
            display.lastPriceChange > 0 ? "text-[#39FF14]" : display.lastPriceChange < 0 ? "text-[#FF4B5C]" : "text-slate-100"
          )}
        >
          ${formatPrice(display.price)}
        </motion.span>
        {display.lastPriceChange !== 0 && (
          <motion.div
            initial={{ opacity: 0.6, scaleX: 0 }}
            animate={{ opacity: 0, scaleX: 1 }}
            transition={{ duration: 0.4 }}
            className={cn(
              "absolute inset-x-0 bottom-0 h-[1px]",
              display.lastPriceChange > 0 ? "bg-[#39FF14]" : "bg-[#FF4B5C]"
            )}
          />
        )}
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
        />
      )}
      {visibleCols.has('rsi5m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi5m}
          field="rsi5mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
        />
      )}
      {visibleCols.has('rsi15m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi15m}
          field="rsi15mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
        />
      )}
      {visibleCols.has('rsi1h') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi1h}
          field="rsi1hPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
        />
      )}

      {visibleCols.has('ema9') && (
        <td className="px-3 py-4 text-right text-xs tabular-nums font-bold font-mono text-slate-300">
          ${display.ema9 ? formatPrice(display.ema9) : '—'}
        </td>
      )}
      {visibleCols.has('ema21') && (
        <td className="px-3 py-4 text-right text-xs tabular-nums font-bold font-mono text-slate-400">
          ${display.ema21 ? formatPrice(display.ema21) : '—'}
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
            {entry.rsiPeriodAtCreation === rsiPeriod && display.rsiCustom !== null && display.rsi15m !== null && (
              <>
                {display.rsiCustom <= 30 && display.rsi15m > 30 && (
                  <span className="text-[7px] px-1 bg-[#39FF14]/30 text-[#39FF14] rounded-full animate-pulse border border-[#39FF14]/30" title="Early Oversold (Custom Period)">EARLY BUY</span>
                )}
                {display.rsiCustom >= 70 && display.rsi15m < 70 && (
                  <span className="text-[7px] px-1 bg-[#722f37]/30 text-[#FF4B5C] rounded-full animate-pulse border border-[#FF4B5C]/30" title="Early Overbought (Custom Period)">EARLY SELL</span>
                )}
              </>
            )}

            {entry.rsiPeriodAtCreation === rsiPeriod && display.rsiDivergenceCustom && display.rsiDivergenceCustom !== 'none' && (
              <span className={cn(
                "text-[8px] px-1 rounded-sm font-black tracking-tighter uppercase",
                display.rsiDivergenceCustom === 'bullish' ? "bg-[#39FF14]/20 text-[#39FF14]" : "bg-[#722f37]/20 text-[#FF4B5C]"
              )}>
                {display.rsiDivergenceCustom === 'bullish' ? 'DIV+' : 'DIV-'}
              </span>
            )}
            <motion.span
              key={`${entry.symbol}-rsi-${display.rsiCustom}`}
              initial={display.isLiveRsi ? { scale: 1.1, filter: 'brightness(1.5)' } : {}}
              animate={{ scale: 1, filter: 'brightness(1)' }}
              className="drop-shadow-sm"
            >
              {entry.rsiPeriodAtCreation === rsiPeriod ? formatRsi(display.rsiCustom) : '—'}
            </motion.span>
          </div>
        </td>
      )}
      {visibleCols.has('emaCross') && (
        <td className="px-3 py-4 text-right text-[10px] font-black uppercase">
          <span className={cn(
            "px-2 py-1 rounded border",
            display.emaCross === 'bullish' ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5" :
              display.emaCross === 'bearish' ? "text-[#FF4B5C] border-[#722f37]/20 bg-[#722f37]/5" :
                "text-slate-700 border-transparent"
          )}>
            {display.emaCross || '—'}
          </span>
        </td>
      )}

      {visibleCols.has('macdHistogram') && (
        <td className={cn(
          "px-3 py-4 text-right text-[11px] tabular-nums font-bold font-mono",
          display.macdHistogram === null ? "text-slate-700" : display.macdHistogram > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {formatNum(display.macdHistogram, 4)}
        </td>
      )}

      {visibleCols.has('bbUpper') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono text-[#FF4B5C]/70">
          ${display.bbUpper ? formatPrice(display.bbUpper) : '—'}
        </td>
      )}
      {visibleCols.has('bbLower') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono text-[#39FF14]/70">
          ${display.bbLower ? formatPrice(display.bbLower) : '—'}
        </td>
      )}

      {visibleCols.has('bbPosition') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono",
          display.bbPosition === null ? "text-slate-700" : display.bbPosition < 0.2 ? "text-[#39FF14]" : display.bbPosition > 0.8 ? "text-[#FF4B5C]" : "text-slate-400"
        )}>
          {formatNum(display.bbPosition)}
        </td>
      )}

      {visibleCols.has('stochK') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono">
          <span className={getRsiColor(display.stochK)}>{formatRsi(display.stochK)}</span>
          {display.stochD !== null && <span className="text-slate-600 ml-1">/{display.stochD.toFixed(0)}</span>}
        </td>
      )}

      {visibleCols.has('confluence') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase tracking-tighter",
          display.confluence >= 15 ? "text-[#39FF14]" : display.confluence <= -15 ? "text-[#FF4B5C]" : "text-slate-600"
        )}>
          {display.confluenceLabel}
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
          "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono",
          display.vwapDiff === null ? "text-slate-700" : display.vwapDiff > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {formatPct(display.vwapDiff)}
        </td>
      )}
      {visibleCols.has('volumeSpike') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase",
          display.volumeSpike === true ? "text-[#39FF14]" : "text-slate-600"
        )}>
          {display.volumeSpike ? 'SPIKE' : 'Normal'}
        </td>
      )}

      {visibleCols.has('momentum') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono",
          display.momentum === null ? "text-slate-700" : display.momentum > 0 ? "text-emerald-300" : display.momentum < 0 ? "text-red-300" : "text-slate-500"
        )}>
          {formatPct(display.momentum)}
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

      <td className="px-3 py-4 text-right">
        <SignalBadge signal={display.signal} />
      </td>

      {visibleCols.has('strategy') && (
        <td className="px-3 py-4 text-right min-w-[120px]">
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-600 tabular-nums uppercase" title="Time since signal started">
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
            <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} reasons={display.strategyReasons} />
          </div>
        </td>
      )}
      <td className="px-3 py-4 text-right">
        <button
          onClick={() => onOpenSettings(entry.symbol)}
          className="p-2 text-slate-600 hover:text-[#39FF14] hover:bg-[#39FF14]/10 rounded-lg transition-all active:scale-90"
          title="Customize RSI"
        >
          <Settings size={14} />
        </button>
      </td>
    </motion.tr>
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
  onSave
}: {
  symbol: string;
  rsi: number | null;
  field: string;
  currentConfig?: any;
  onSave: (symbol: string, config: any) => Promise<void>;
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
  | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h' | 'rsiCustom'
  | 'ema9' | 'ema21' | 'emaCross' | 'macdHistogram' | 'bbUpper' | 'bbLower' | 'bbPosition' | 'stochK'
  | 'vwapDiff' | 'volumeSpike' | 'strategy'
  | 'confluence' | 'divergence' | 'momentum'
  | 'atr' | 'adx';

interface ColumnDef {
  id: ColumnId;
  label: string;
  group: string;
  defaultVisible: boolean;
}

const OPTIONAL_COLUMNS: ColumnDef[] = [
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
  { id: 'volumeSpike', label: 'Vol Spike', group: 'Volume', defaultVisible: false },
  { id: 'confluence', label: 'Confluence', group: 'Intelligence', defaultVisible: true },
  { id: 'divergence', label: 'Divergence', group: 'Intelligence', defaultVisible: true },
  { id: 'momentum', label: 'Momentum', group: 'Intelligence', defaultVisible: false },
  { id: 'atr', label: 'ATR', group: 'Volatility', defaultVisible: false },
  { id: 'adx', label: 'ADX', group: 'Volatility', defaultVisible: false },
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

const PAIR_COUNTS = [50, 100, 200, 300, 500, 600];

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
    let signal = entry.signal;
    const leadRsi = rsi15m ?? rsi1m;
    if (leadRsi !== null) {
      if (leadRsi <= osT) signal = "oversold";
      else if (leadRsi >= obT) signal = "overbought";
      else signal = "neutral";
    }
    const liveStrategy = computeStrategyScore({
      rsi1m, rsi5m, rsi15m, rsi1h,
      macdHistogram: entry.macdHistogram,
      bbPosition,
      stochK: entry.stochK,
      stochD: entry.stochD,
      emaCross,
      vwapDiff: entry.vwapDiff,
      volumeSpike: entry.volumeSpike,
      price: tick.price,
      confluence: entry.confluence,
      rsiDivergence: entry.rsiDivergence,
      momentum: entry.momentum,
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
      volumeSpike: entry.volumeSpike,
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
      strategyLabel: tick.strategyScore !== undefined ? (tick.strategyScore >= 70 ? "Strong Buy" : tick.strategyScore <= -70 ? "Strong Sell" : liveStrategy.label) : liveStrategy.label,
      strategyReasons: liveStrategy.reasons,
      lastPriceChange: tick.tickDelta || 0,
      isLiveRsi: true
    };
  }, [tick, coinConfigs, entry, rsiPeriod]);

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
    signal: entry.signal,
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
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        backgroundColor: isFlash
          ? (display.strategySignal.includes('buy') ? 'rgba(57, 255, 20, 0.1)' : display.strategySignal.includes('sell') ? 'rgba(114, 47, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)')
          : 'transparent'
      }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative flex items-center justify-between p-3 border-b border-white/[0.03] active:bg-slate-800/40 transition-colors duration-500",
        !isFlash && getRsiBg(display.rsiCustom ?? display.rsi15m)
      )}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 64px'
      } as any}
    >
      {/* 1. Asset & Meta */}
      <div className="flex items-center gap-2 w-[110px] shrink-0">
        <span className="text-[9px] font-black text-slate-700 w-4 tabular-nums">#{idx + 1}</span>
        <button
          onClick={() => toggleWatchlist(entry.symbol)}
          className={cn("transition-all shrink-0", isStarred ? "text-yellow-400" : "text-slate-800")}
        >
          <Star size={12} fill={isStarred ? "currentColor" : "none"} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-black text-white text-sm tracking-tight">{getSymbolAlias(entry.symbol)}</span>
            <MarketBadge market={entry.market} />
          </div>
          <div className="text-[7px] font-black text-slate-700 uppercase leading-none mt-0.5">
            {entry.market === 'Crypto' ? `USDT • ${exchange.startsWith('bybit') ? 'Bybit' : 'Binance'}` : 'Global Market'}
          </div>
        </div>
      </div>

      {/* 2. Scalable Indicators Area */}
      <div
        onClick={() => onOpenSettings(entry.symbol)}
        className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-4 px-3 mx-2 cursor-pointer active:scale-95 transition-transform"
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
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", getRsiColor(val as number))}>{formatRsi(val as number)}</span>
                ) : col.id === 'strategy' ? (
                  <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} />
                ) : col.id === 'divergence' ? (
                  <span className={cn("text-[8px] font-black uppercase", display.rsiDivergence === 'bullish' ? "text-[#39FF14]" : display.rsiDivergence === 'bearish' ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.rsiDivergence === 'bullish' ? 'DIV+' : display.rsiDivergence === 'bearish' ? 'DIV-' : '—'}
                  </span>
                ) : col.id === 'vwapDiff' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", (val as number) > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                    {formatPct(val as number)}
                  </span>
                ) : col.id === 'volumeSpike' ? (
                  <span className={cn("text-[10px] font-black uppercase", val === true ? "text-[#39FF14]" : "text-slate-700")}>
                    {val === true ? 'SPIKE' : 'NORM'}
                  </span>
                ) : col.id === 'ema9' || col.id === 'ema21' || col.id === 'bbUpper' || col.id === 'bbLower' ? (
                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                    ${typeof val === 'number' ? formatPrice(val) : '—'}
                  </span>
                ) : (
                  <span className={cn(
                    "text-[9px] font-bold tabular-nums transition-colors duration-300",
                    display.isLiveRsi ? "text-[#39FF14]" : "text-slate-300"
                  )}>
                    {typeof val === 'number'
                      ? val.toFixed(col.id === 'macdHistogram' ? 4 : 1)
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
          <motion.span
            key={`${entry.symbol}-price-${display.price}`}
            initial={{
              opacity: display.lastPriceChange ? 0.4 : 1,
              scale: display.lastPriceChange ? 0.95 : 1,
              color: display.lastPriceChange && display.lastPriceChange > 0 ? '#39FF14' : display.lastPriceChange && display.lastPriceChange < 0 ? '#FF4B5C' : '#ffffff'
            }}
            animate={{ opacity: 1, scale: 1, color: '#ffffff' }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-sm font-black font-mono tracking-tighter inline-block"
          >
            ${formatPrice(display.price)}
          </motion.span>
          <div className={cn("text-[9px] font-black font-mono flex items-center gap-0.5", display.change24h >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
            {display.change24h > 0 ? '+' : ''}{display.change24h.toFixed(2)}%
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenSettings(entry.symbol);
          }}
          className="p-1.5 bg-white/5 rounded-xl text-slate-600 hover:text-[#39FF14] transition-colors"
        >
          <Settings size={12} />
        </button>
      </div>

      {/* Animated Pulse for Signal */}
      {display.signal !== 'neutral' && (
        <div className={cn(
          "absolute inset-y-0 right-0 w-0.5",
          display.signal === 'oversold' ? "bg-[#39FF14]/40" : "bg-[#FF4B5C]/40"
        )} />
      )}
    </motion.div>
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

  // ── Theme State ──
  const smartModeDefault = process.env.NEXT_PUBLIC_SMART_MODE_DEFAULT !== '0';
  // ── State ──
  const [data, setData] = useState<ScreenerEntry[]>([]);
  const isMobile = useIsMobile();
  const [meta, setMeta] = useState<ScreenerResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('crypto-rsi-alerts-enabled');
    if (saved === null) return true; // Default to ENABLED
    return saved === '1';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('crypto-rsi-sound-enabled');
    if (saved === null) return true; // Default to ENABLED
    return saved === '1';
  });
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('strategyScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshInterval, setRefreshInterval] = useState(() => {
    if (typeof window === 'undefined') return 30;
    const saved = localStorage.getItem('crypto-rsi-refresh');
    return saved ? Number(saved) : 30;
  });
  const [pairCount, setPairCount] = useState(() => {
    if (typeof window === 'undefined') return 500;
    const saved = localStorage.getItem('crypto-rsi-pairs');
    return saved ? Math.min(Math.max(Number(saved), 10), 600) : 500;
  });
  const [smartMode, setSmartMode] = useState(smartModeDefault);
  const [showHeader, setShowHeader] = useState(true);
  const useAnimations = pairCount <= 600; // Disable heavy layout animations for large lists
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [countdown, setCountdown] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'watchlist' | 'settings'>('home');
  const [coinConfigs, setCoinConfigs] = useState<Record<string, any>>({});
  const [selectedCoinForConfig, setSelectedCoinForConfig] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const dataLenRef = useRef(0);
  const visibleSymbolsRef = useRef<Set<string>>(new Set());

  // Use a refined mount-aware hydration strategy for client-only defaults
  const [hasMounted, setHasMounted] = useState(false);

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
    if (pairs) setPairCount(Math.min(Math.max(Number(pairs), 10), 600));

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
    }
  }, []);

  const reportVisibility = useCallback((symbol: string, isVisible: boolean) => {
    if (isVisible) {
      visibleSymbolsRef.current.add(symbol);
    } else {
      visibleSymbolsRef.current.delete(symbol);
    }
  }, []);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => {
    if (typeof window === 'undefined') return new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id));
    const saved = localStorage.getItem('crypto-rsi-visible-cols');
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        // Fallback
      }
    }
    return new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id));
  });
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
  const { livePrices, isConnected, syncStates, exchange, setExchange, updateSymbols, postToWorker } = useLivePrices(symbolSet, 300);

  // ─── Hybrid Atomic Data ───
  // ProcessedData is the "base" data with non-live additions (like custom RSI values from the last API fetch).
  // It merges the SWR data (from API) with the Live WebSocket prices (from useLivePrices).
  const processedData = useMemo<ScreenerEntry[]>(() => {
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
        emaCross: (live.emaCross ?? entry.emaCross) as any, // Cast to any then back if needed, or just satisfy the type
        strategyScore: live.strategyScore ?? entry.strategyScore,
        strategySignal: (live.strategySignal ?? entry.strategySignal) as any,
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

      return merged;
    });
  }, [data, livePrices, rsiPeriod]);

  // Sync state to Background Worker for Instant Alerts (Debounced)
  useEffect(() => {
    if (processedData.length === 0 && watchlist.size === 0) return;

    const timer = setTimeout(() => {
      const states: Record<string, any> = {};
      
      // 1. Collect all alertable symbols from configs
      const alertSymbols = new Set<string>();
      Object.entries(coinConfigs).forEach(([sym, cfg]) => {
        if (cfg.alertOn1m || cfg.alertOn5m || cfg.alertOn15m || cfg.alertOn1h || cfg.alertOnCustom || cfg.alertOnStrategyShift) {
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
          confluence: entry.confluence
        };
      });
      syncStates({ configs: coinConfigs, rsiStates: states });

      // 5. Ensure worker is connected to both if alerts are active
      if (alertSymbols.size > 0) {
        // We ensure both are connected to facilitate background alerts
        // The worker is now concurrent, so this is safe and expected.
        postToWorker({ type: 'SET_EXCHANGE', payload: { exchange: 'binance' } });
        postToWorker({ type: 'SET_EXCHANGE', payload: { exchange: 'bybit' } });
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [processedData, coinConfigs, watchlist, syncStates, updateSymbols, postToWorker]);

  // Removed old duplicate processedData block

  const { alerts, setAlerts, triggerTestAlert, clearAlertHistory, resumeAudioContext } = useAlertEngine(processedData, coinConfigs, alertsEnabled, soundEnabled);

  // Persist alert settings
  useEffect(() => {
    localStorage.setItem('crypto-rsi-alerts-enabled', alertsEnabled ? '1' : '0');
  }, [alertsEnabled]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-sound-enabled', soundEnabled ? '1' : '0');
  }, [soundEnabled]);

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
        body: JSON.stringify({ symbol, ...newConfig }),
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

  // Persist last-known data for "Warm Start" hydration
  useEffect(() => {
    if (data.length > 0) {
      try {
        localStorage.setItem('crypto-rsi-last-data', JSON.stringify({
          data,
          meta,
          ts: Date.now()
        }));
      } catch (e) {
        console.warn('[screener] Failed to save hydration data to localStorage', e);
      }
    }
  }, [data, meta]);

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
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // Show spinner for all fetches except initial load
    const isInitial = !background && dataLenRef.current === 0;
    if (!isInitial) setRefreshing(true);

    try {
      if (!background) setError(null);
      const timeoutMs = pairCount >= 800 ? 60_000 : pairCount >= 500 ? 55_000 : pairCount >= 300 ? 40_000 : 25_000;

      const prioritySymbols = Array.from(visibleSymbolsRef.current).join(',');
      const url = `/api/screener?count=${pairCount}&smart=${smartMode ? '1' : '0'}&rsiPeriod=${rsiPeriod}&search=${encodeURIComponent(search)}&prioritySymbols=${encodeURIComponent(prioritySymbols)}&exchange=${exchange}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      const json: ScreenerResponse = await res.json();

      // 503 with data means partial result — still usable
      if (!res.ok && !(res.status === 503 && json.data?.length > 0)) {
        throw new Error(`API error ${res.status}`);
      }

      setData(json.data);
      dataLenRef.current = json.data.length;
      setMeta(json.meta);
      setError(null);
      setLoading(false);

      // PERFECT COUPLING: Sync indicator baselines for shadowing engine
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
            confluence: e.confluence,
            lastClose: e.price
          };
        }
      });
      syncStates({ rsiStates, configs: coinConfigs });
    } catch (err) {
      if (dataLenRef.current === 0) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      }
    } finally {
      fetchingRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [pairCount, smartMode, rsiPeriod, search, exchange]);

  // Handle priority syncs from worker for fast-moving coins
  useEffect(() => {
    const handlePrioritySync = (e: Event) => {
      const symbol = (e as CustomEvent).detail;
      console.log(`[screener] Priority sync triggered for mover: ${symbol}`);
      // Add immediately to visible to force precision data fetch
      visibleSymbolsRef.current.add(symbol);
      fetchData(true);
    };

    if (typeof window !== 'undefined') {
      const engine = (window as any).__priceEngine;
      if (engine) engine.addEventListener('priority-sync', handlePrioritySync);
      return () => {
        if (engine) engine.removeEventListener('priority-sync', handlePrioritySync);
      };
    }
  }, [fetchData]);

  // ── Initial fetch with auto-retry and Hydration ──
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load coin configurations on mount
  useEffect(() => {
    fetch('/api/config')
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
    // Attempt hydration from localStorage
    const saved = localStorage.getItem('crypto-rsi-last-data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only hydrate if data is relatively fresh (less than 1 hour old) and correctly formatted
        if (Date.now() - parsed.ts < 3600_000 && Array.isArray(parsed.data)) {
          setData(parsed.data);
          setMeta(parsed.meta);
          setLoading(false);
          dataLenRef.current = parsed.data.length;
        }
      } catch (e) {
        console.error('[screener] Hydration failed:', e);
      }
    }

    retryCountRef.current = 0;
    const doFetch = async () => {
      await fetchData();
      try {
        const configRes = await fetch('/api/config');
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
  }, [fetchData]);

  // ── Auto-refresh (skips when tab is hidden) ──
  useEffect(() => {
    if (refreshInterval <= 0) return;

    setCountdown(refreshInterval);
    const refetchTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchData(true);
      setCountdown(refreshInterval);
    }, refreshInterval * 1000);

    const tickTimer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    return () => {
      clearInterval(refetchTimer);
      clearInterval(tickTimer);
    };
  }, [refreshInterval, fetchData]);

  // ── Trigger refetch on RSI Period change (debounced) ──
  useEffect(() => {
    // Gap 4b: Immediately push the new period to the worker so custom RSI
    // alert evaluations use the correct period without waiting for a data refresh
    if (typeof window !== 'undefined') {
      const eng = (window as any).__priceEngine;
      if (eng?.postToWorker) {
        eng.postToWorker({ type: 'UPDATE_PERIOD', payload: { period: rsiPeriod } });
      }
    }

    const timer = setTimeout(() => {
      fetchData();
    }, 400); // 400ms debounce to avoid spamming while dragging slider
    return () => clearTimeout(timer);
  }, [rsiPeriod, fetchData]);

  // ── Trigger refetch on Exchange change ──
  useEffect(() => {
    if (hasMounted && dataLenRef.current > 0) {
      // Clear data for visual feedback that a full reload is happening
      setData([]);
      dataLenRef.current = 0;
      setLoading(true);
      fetchData();
    }
  }, [exchange, fetchData, hasMounted]);

  // ── Debounced Server-side Search ──
  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => {
      fetchData();
    }, 600); // 600ms debounce for typing
    return () => clearTimeout(timer);
  }, [search, fetchData]);

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

      const av = a[sortKey as keyof ScreenerEntry];
      const bv = b[sortKey as keyof ScreenerEntry];

      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

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
        fetchData();
      } else if (e.key === 'Escape') {
        setSelectedCoinForConfig(null);
        setShowAlertPanel(false);
        setShowGlobalSettings(false);
        setShowColPicker(false);
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder="Search symbols..."]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchData]);

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
        <header className="mb-5 rounded-3xl border border-white/5 bg-[#080F1B] p-5 sm:p-6 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#39FF14]/[0.02] rounded-full -mr-20 -mt-20 group-hover:bg-[#39FF14]/[0.04] transition-colors duration-1000" />

          {/* Desktop Header Layout */}
          <div className="hidden lg:flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 relative z-10">
            <div>
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/20 bg-gradient-to-r from-[#39FF14]/10 to-transparent px-3 py-1.2 shadow-[0_0_20px_rgba(57,255,20,0.05)] text-[9px] font-black tracking-widest text-[#39FF14] uppercase backdrop-blur-md transition-all hover:bg-[#39FF14]/20 group/llc">
                    <Activity size={10} className="text-[#39FF14] animate-pulse" />
                    <span>Mindscape Analytics LLC</span>
                  </div>
                  {session && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-1 group/auth transition-all hover:bg-white/10">
                      <div className="w-4 h-4 rounded-full bg-[#39FF14]/20 flex items-center justify-center">
                        <UserIcon size={10} className="text-[#39FF14] group-hover/auth:text-[#32e012] transition-colors" />
                      </div>
                      <span className="text-[9px] font-bold text-slate-300 pr-1 truncate">
                        {session.user.name || session.user.email}
                      </span>
                      <button
                        onClick={async () => {
                          setIsLoggingOut(true);
                          await signOut({
                            fetchOptions: {
                              onSuccess: () => { router.push('/login'); }
                            }
                          });
                        }}
                        disabled={isLoggingOut}
                        className="p-1 rounded-full hover:bg-[#FF4B5C]/20 text-slate-400 hover:text-[#FF4B5C] transition-colors"
                      >
                        <LogOut size={10} />
                      </button>
                    </div>
                  )}
                </div>

              </div>

              <h1 className="mt-3 text-4xl font-black text-white tracking-tighter">
                RSIQ <span className="text-[#39FF14]">Pro</span>
              </h1>
              <div className="flex flex-wrap items-center gap-5 mt-5">
                <div className="flex flex-col flex-1 min-w-[120px]">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 leading-none">Market Bias</div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden flex max-w-[120px]">
                      <div className="h-full bg-[#39FF14]" style={{ width: `${Math.max(0, 50 + stats.bias / 2)}%` }} />
                      <div className="h-full bg-red-500" style={{ width: `${Math.max(0, 50 - stats.bias / 2)}%` }} />
                    </div>
                    <span className={cn("text-[11px] font-black tabular-nums tracking-tighter", stats.bias >= 0 ? "text-[#39FF14]" : "text-red-500")}>
                      {stats.bias > 0 ? '+' : ''}{stats.bias}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <motion.button
                    onClick={async () => {
                      const next = !alertsEnabled;
                      setAlertsEnabled(next);
                      if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                        try { await Notification.requestPermission(); } catch (e) { }
                      }
                    }}
                    whileTap={{ scale: 0.9 }}
                    className={cn("w-9 h-9 rounded-xl border flex items-center justify-center relative shadow-sm", alertsEnabled ? "bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]" : "bg-white/[0.02] border-white/10 text-slate-600")}
                  >
                    <Bell size={14} fill={alertsEnabled ? "currentColor" : "none"} />
                    {alerts.length > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#FF4B5C] rounded-full" />}
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabled(next);
                      if (next) resumeAudioContext();
                    }}
                    whileTap={{ scale: 0.9 }}
                    className={cn("w-9 h-9 rounded-xl border flex items-center justify-center relative shadow-sm", soundEnabled ? "bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]" : "bg-white/[0.02] border-white/10 text-slate-600")}
                  >
                    <Zap size={14} fill={soundEnabled ? "currentColor" : "none"} />
                  </motion.button>
                  <motion.button onClick={() => setShowAlertPanel(true)} whileTap={{ scale: 0.9 }} className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.02] text-slate-400 flex items-center justify-center shadow-sm hover:bg-white/5">
                    <Clock size={14} />
                  </motion.button>
                </div>

                <div className="h-4 w-px bg-white/5 mx-1" />

                {/* Fear/Greed Gauge */}
                <div className="flex flex-col items-center min-w-[80px]">
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 mb-0.5">Sentiment</span>
                  <div className="flex items-center gap-1.5">
                    <Gauge size={12} className={fearGreedColor} />
                    <span className={cn("text-[10px] font-black tabular-nums", fearGreedColor)}>{fearGreedScore}</span>
                    <span className={cn("text-[8px] font-bold uppercase", fearGreedColor)}>{fearGreedLabel}</span>
                  </div>
                </div>

                <div className="h-4 w-px bg-white/5 mx-1" />
                <div className="flex items-center bg-slate-900/40 rounded-2xl border border-white/5 p-1 shrink-0">
                  <button
                    onClick={() => setExchange('binance')}
                    className={cn(
                      "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all rounded-xl whitespace-nowrap",
                      exchange === 'binance' ? "bg-[#39FF14]/20 text-[#39FF14] shadow-sm" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    Binance
                  </button>
                  <button
                    onClick={() => setExchange('bybit')}
                    className={cn(
                      "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all rounded-xl whitespace-nowrap",
                      exchange === 'bybit' ? "bg-[#39FF14]/20 text-[#39FF14] shadow-sm" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    Bybit Spot
                  </button>
                  <button
                    onClick={() => setExchange('bybit-linear')}
                    className={cn(
                      "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all rounded-xl whitespace-nowrap",
                      exchange === 'bybit-linear' ? "bg-[#39FF14]/20 text-[#39FF14] shadow-sm" : "text-slate-600 hover:text-slate-400"
                    )}
                  >
                    Bybit Perp
                  </button>
                </div>
                <div className="h-4 w-px bg-white/5 mx-1" />
                <div className={cn("inline-flex items-center gap-2 rounded-2xl border px-3 py-2 transition-all shadow-sm backdrop-blur-md", isConnected ? 'border-[#39FF14]/20 bg-[#39FF14]/5 text-[#39FF14]' : 'border-white/5 bg-white/[0.02] text-slate-600')}>
                  <motion.div 
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className={cn("h-1.5 w-1.5 rounded-full", isConnected ? 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.6)]' : 'bg-slate-600')} 
                  />
                  <span className="font-black tracking-widest uppercase text-[9px]">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2 text-slate-400">
                  <LayoutGrid size={12} className="text-slate-600" />
                  <span className="font-black tracking-tight text-[9px] tabular-nums">{data.length}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-4 self-center lg:self-end">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fetchData()}
                  className="group inline-flex items-center gap-2 rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/10 px-4 py-2 text-[10px] font-black tracking-widest text-[#39FF14] hover:bg-[#39FF14]/20 transition-all active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.1)]"
                >
                  <RefreshCcw size={12} className={cn("transition-transform duration-700", refreshing && "animate-spin")} />
                  <span>{refreshing ? 'UPDATING' : `${countdown}S`}</span>
                </button>
                <button 
                  onClick={handleExportCsv} 
                  className="p-2.5 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 shadow-sm" 
                  title="Export CSV (Ctrl+E)"
                >
                  <Download size={14} />
                </button>
              </div>

              <div className="flex items-center justify-between lg:justify-end gap-6 bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-3 shadow-inner">
                {[
                  { label: "Oversold", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold },
                  { label: "Overbought", value: stats.overbought, color: "text-red-400", onClick: showMostOverbought },
                  { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys }
                ].map((s) => (
                  <button key={s.label} onClick={s.onClick} className="flex flex-col items-end group/stat min-w-[70px]">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 mb-1 leading-none transition-colors group-hover/stat:text-slate-300">{s.label}</span>
                    <span className={cn("text-lg font-black tabular-nums tracking-tighter leading-none", s.color)}><Counter value={s.value} /></span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile App Bar */}
          <div className="lg:hidden flex flex-col gap-4 relative z-10">
            {/* Top Row: Logo & Profile */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border border-[#39FF14]/30 flex items-center justify-center shadow-[0_0_30px_rgba(57,255,20,0.15)] ring-1 ring-[#39FF14]/20">
                  <Activity size={20} className="text-[#39FF14]" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-white tracking-widest leading-none">RSIQ <span className="text-[#39FF14]">PRO</span></h1>
                  <div className="flex items-center gap-1.5 mt-1">
                    <motion.div 
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(57,255,20,0.5)]", isConnected ? "bg-[#39FF14]" : "bg-slate-700")} 
                    />
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{isConnected ? "LIVE" : "OFFLINE"}</span>
                    <div className="w-1 h-1 rounded-full bg-slate-800" />
                    <span className="text-[8px] font-black text-[#39FF14] tabular-nums">{data.length} PAIRS</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session && (
                  <button
                    onClick={async () => {
                      setIsLoggingOut(true);
                      await signOut({ fetchOptions: { onSuccess: () => router.push('/login') } });
                    }}
                    disabled={isLoggingOut}
                    className="w-10 h-10 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center shadow-lg active:scale-90 transition-all"
                  >
                    {isLoggingOut ? <LogOut size={18} className="text-slate-400 animate-pulse" /> : <UserIcon size={18} className="text-[#39FF14]" />}
                  </button>
                )}
              </div>
            </div>

            {/* Controls Row: Alerts, Toggles, Actions */}
            <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-2xl p-2 shadow-inner">
              <div className="w-px h-5 bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-xl border border-white/10 p-1">
                <button
                  onClick={() => setExchange('binance')}
                  className={cn("px-2 py-1 text-[8px] font-black uppercase rounded-lg transition-all", exchange === 'binance' ? "bg-[#39FF14]/20 text-[#39FF14]" : "text-slate-600")}
                >BIN</button>
                <button
                  onClick={() => setExchange('bybit')}
                  className={cn("px-2 py-1 text-[8px] font-black uppercase rounded-lg transition-all", exchange === 'bybit' ? "bg-[#39FF14]/20 text-[#39FF14]" : "text-slate-600")}
                >BYB</button>
                <button
                  onClick={() => setExchange('bybit-linear')}
                  className={cn("px-2 py-1 text-[8px] font-black uppercase rounded-lg transition-all", exchange === 'bybit-linear' ? "bg-[#39FF14]/20 text-[#39FF14]" : "text-slate-600")}
                >PRP</button>
              </div>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5">
                <motion.button
                  onClick={async () => {
                    const next = !alertsEnabled;
                    setAlertsEnabled(next);
                    if (next && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                      try { await Notification.requestPermission(); } catch (e) { }
                    }
                  }}
                  whileTap={{ scale: 0.9 }}
                  className={cn("w-9 h-9 rounded-xl border flex items-center justify-center relative", alertsEnabled ? "bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]" : "bg-transparent border-transparent text-slate-500")}
                >
                  <Bell size={14} fill={alertsEnabled ? "currentColor" : "none"} />
                  {alerts.length > 0 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#FF4B5C] rounded-full" />}
                </motion.button>
                <motion.button
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) resumeAudioContext();
                  }}
                  whileTap={{ scale: 0.9 }}
                  className={cn("w-9 h-9 rounded-xl border flex items-center justify-center relative", soundEnabled ? "bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]" : "bg-transparent border-transparent text-slate-500")}
                >
                  <Zap size={14} fill={soundEnabled ? "currentColor" : "none"} />
                </motion.button>
                <motion.button onClick={() => setShowAlertPanel(true)} whileTap={{ scale: 0.9 }} className="w-9 h-9 rounded-xl border border-transparent bg-transparent text-slate-500 flex items-center justify-center hover:bg-white/5">
                  <Clock size={14} />
                </motion.button>
              </div>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5">
                <button onClick={() => fetchData()} className={cn("w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 active:scale-90 transition-all", refreshing && "animate-spin text-[#39FF14]")}>
                  <RefreshCcw size={14} />
                </button>
                <button onClick={handleExportCsv} className="w-9 h-9 group inline-flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.04] text-slate-400 active:scale-90 transition-all">
                  <Download size={14} />
                </button>
              </div>
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
            <AnimatePresence mode="popLayout">
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
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/5 bg-slate-900/40 overflow-hidden shadow-lg mb-8">
          <div className="overflow-x-auto overflow-y-auto max-h-[800px] custom-scrollbar">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20 bg-[#0A0F1B]/95 border-b border-white/5">
                <tr>
                  <th className="px-4 py-4 text-[10px] font-black uppercase text-slate-600 text-left w-12 tracking-widest">#</th>
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
                  {visibleCols.has('volumeSpike') && <SortHeader label="Vol Spike" sortKey="volumeSpike" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}

                  <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  {visibleCols.has('strategy') && <SortHeader label="Strategy" sortKey="strategyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
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
                  <AnimatePresence mode="popLayout" initial={false}>
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
                      />
                    ))}
                  </AnimatePresence>
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
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest tabular-nums leading-none">
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
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ symbol: selectedCoinForConfig, ...newConfig }),
                });
                if (res.ok) {
                  const updated = await res.json();
                  setCoinConfigs(prev => ({ ...prev, [selectedCoinForConfig]: updated }));

                  toast.success(`${getSymbolAlias(selectedCoinForConfig)} Configuration applied.`, {
                    description: "Filters and alerts have been updated in real-time.",
                    duration: 3000
                  });

                  setSelectedCoinForConfig(null);
                  // Refresh data to reflect changes immediately
                  fetchData(true);
                }
              } catch (err) {
                console.error('Failed to save config:', err);
                toast.error("Failed to apply configuration.");
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
            setPairCount={setPairCount}
            alertsEnabled={alertsEnabled}
            setAlertsEnabled={setAlertsEnabled}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
            triggerTestAlert={triggerTestAlert}
            resumeAudioContext={resumeAudioContext}
          />
        )}
      </AnimatePresence>

      {/* Mobile-only Bottom Navigation Dock */}
      <BottomDock
        onOpenAlerts={() => {
          setActiveTab('alerts');
          setShowAlertPanel(true);
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
  });

  const handleSave = async () => {
    setLoading(true);
    await onSave(config);
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Settings size={18} className="text-[#39FF14]" />
              {getSymbolAlias(symbol)} <span className="text-slate-500 font-bold text-sm">Settings</span>
            </h2>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Customize RSI periods and thresholds</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white transition-colors">
            <LogOut size={18} className="rotate-180" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto max-h-[72vh] custom-scrollbar">
          <div className="p-4 sm:p-6 space-y-4">
            {/* RSI Periods Grid - Consolidated for Vertical Efficiency */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-0.5">RSI 1m Period</label>
                <input
                  type="number"
                  min={2} max={50}
                  value={config.rsi1mPeriod}
                  onChange={(e) => setConfig({ ...config, rsi1mPeriod: parseInt(e.target.value) || 14 })}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-2.5 py-2 text-white font-bold focus:outline-none focus:ring-1 focus:ring-[#39FF14]/30 transition-all text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-0.5">RSI 5m Period</label>
                <input
                  type="number"
                  min={2} max={50}
                  value={config.rsi5mPeriod}
                  onChange={(e) => setConfig({ ...config, rsi5mPeriod: parseInt(e.target.value) || 14 })}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-2.5 py-2 text-white font-bold focus:outline-none focus:ring-1 focus:ring-[#39FF14]/30 transition-all text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-0.5">RSI 15m Period</label>
                <input
                  type="number"
                  min={2} max={50}
                  value={config.rsi15mPeriod}
                  onChange={(e) => setConfig({ ...config, rsi15mPeriod: parseInt(e.target.value) || 14 })}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-2.5 py-2 text-white font-bold focus:outline-none focus:ring-1 focus:ring-[#39FF14]/30 transition-all text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 ml-0.5">RSI 1h Period</label>
                <input
                  type="number"
                  min={2} max={50}
                  value={config.rsi1hPeriod}
                  onChange={(e) => setConfig({ ...config, rsi1hPeriod: parseInt(e.target.value) || 14 })}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-2.5 py-2 text-white font-bold focus:outline-none focus:ring-1 focus:ring-[#39FF14]/30 transition-all text-sm"
                />
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Thresholds Grid */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-[#FF4B5C] ml-0.5">Overbought</label>
                <input
                  type="number"
                  min={1} max={99}
                  value={config.overboughtThreshold}
                  onChange={(e) => setConfig({ ...config, overboughtThreshold: parseInt(e.target.value) || 70 })}
                  className="w-full bg-[#722f37]/5 border border-[#722f37]/20 rounded-xl px-2.5 py-2 text-[#FF4B5C] font-bold focus:outline-none focus:ring-1 focus:ring-[#FF4B5C]/30 transition-all text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black uppercase tracking-widest text-[#39FF14] ml-0.5">Oversold</label>
                <input
                  type="number"
                  min={1} max={99}
                  value={config.oversoldThreshold}
                  onChange={(e) => setConfig({ ...config, oversoldThreshold: parseInt(e.target.value) || 30 })}
                  className="w-full bg-[#39FF14]/5 border border-[#39FF14]/20 rounded-xl px-2.5 py-2 text-[#39FF14] font-bold focus:outline-none focus:ring-1 focus:ring-[#39FF14]/30 transition-all text-sm"
                />
              </div>
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

            {/* Alert Toggles */}
            <div className="space-y-2.5">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 ml-0.5 flex items-center gap-1.5"><Bell size={10} className="text-[#39FF14]" /> Active Alerts</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'alertOn1m', label: '1m' },
                  { key: 'alertOn5m', label: '5m' },
                  { key: 'alertOn15m', label: '15M' },
                  { key: 'alertOn1h', label: '1H' },
                  { key: 'alertOnCustom', label: 'CUST' }
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

              <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 group">
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
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 group">
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
          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-white/5 bg-white/[0.02]">
          <button
            disabled={loading}
            onClick={handleSave}
            className="w-full bg-[#39FF14] text-black font-black uppercase tracking-widest py-3.5 rounded-xl hover:bg-[#39FF14]/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#39FF14]/10 text-sm"
          >
            {loading ? 'SAVING...' : 'APPLY CONFIGURATION'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

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
                    <span className="text-[8px] font-bold text-slate-500 uppercase tabular-nums">{formatTimeAgo(createdAt)}</span>
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

// ─── Global Settings Modal (Mobile) ───────────────────────────

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
  alertsEnabled,
  setAlertsEnabled,
  soundEnabled,
  setSoundEnabled,
  triggerTestAlert,
  resumeAudioContext
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
  alertsEnabled: boolean;
  setAlertsEnabled: (v: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  triggerTestAlert: () => void;
  resumeAudioContext: () => Promise<void>;
}) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };
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
                  onClick={() => {
                    const next = !alertsEnabled;
                    setAlertsEnabled(next);
                    if (next) requestPermission();
                  }}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                    alertsEnabled ? "bg-[#39FF14]" : "bg-slate-800"
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
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) resumeAudioContext();
                  }}
                  className={cn(
                    "w-12 h-6 rounded-full p-1 transition-all flex items-center",
                    soundEnabled ? "bg-[#39FF14]" : "bg-slate-800"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    soundEnabled ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={triggerTestAlert}
                  className="px-4 py-3 rounded-2xl bg-slate-800 border border-white/5 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:bg-slate-700 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Activity size={12} />
                  Test Flow
                </button>

                {notificationPermission !== 'granted' ? (
                  <button
                    onClick={requestPermission}
                    className="px-4 py-3 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[10px] font-black text-[#39FF14] uppercase tracking-widest hover:bg-[#39FF14]/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck size={12} />
                    Enable Native
                  </button>
                ) : (
                  <div className="px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-[8px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-2 opacity-60">
                    <ShieldCheck size={12} />
                    OS Granted
                  </div>
                )}
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
              <div className="grid grid-cols-1 gap-1.5">
                {PAIR_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    onClick={() => setPairCount(cnt)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-[10px] font-black border transition-all uppercase tracking-widest",
                      pairCount === cnt ? "bg-white text-black border-white" : "bg-white/5 border-white/5 text-slate-500"
                    )}
                  >
                    {cnt} Units
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
