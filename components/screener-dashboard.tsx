'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, Settings, Filter, Star, Info,
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
import { useLivePrices } from '@/hooks/use-live-prices';
import { approximateRsi } from '@/lib/rsi';

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
    <span className={cn("inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tight rounded-full border", styles[signal])}>
      {signal === 'oversold' && <ChevronDown size={10} className="mr-1" />}
      {signal === 'overbought' && <ChevronUp size={10} className="mr-1" />}
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
    <span className={cn("inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border", styles[signal])} title={title}>
      {label}
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
  rsiPeriod
}: {
  entry: ScreenerEntry;
  idx: number;
  watchlist: Set<string>;
  toggleWatchlist: (s: string) => void;
  visibleCols: Set<ColumnId>;
  useAnimations: boolean;
  rsiPeriod: number;
}) {
  const isStarred = watchlist.has(entry.symbol);

  // Intelligence: Signal Pulse state
  const [isFlash, setIsFlash] = useState(false);
  const prevSignal = useRef(entry.strategySignal);

  useEffect(() => {
    if (prevSignal.current !== entry.strategySignal) {
      setIsFlash(true);
      const timer = setTimeout(() => setIsFlash(false), 3000); // 3s visibility
      prevSignal.current = entry.strategySignal;
      return () => clearTimeout(timer);
    }
  }, [entry.strategySignal, entry.symbol]);

  return (
    <motion.tr
      layout={useAnimations}
      initial={useAnimations ? { opacity: 0 } : undefined}
      animate={{
        opacity: 1,
        backgroundColor: isFlash
          ? (entry.strategySignal.includes('buy') ? 'rgba(57, 255, 20, 0.1)' : entry.strategySignal.includes('sell') ? 'rgba(114, 47, 55, 0.2)' : 'rgba(255, 255, 255, 0.05)')
          : 'transparent'
      }}
      exit={useAnimations ? { opacity: 0, scale: 0.98 } : undefined}
      transition={{ duration: 0.3 }}
      className={cn(
        "group transition-colors duration-500 hover:bg-white/[0.02]",
        !isFlash && getRsiBg(entry.rsiCustom ?? entry.rsi15m)
      )}
    >
      <td className="px-4 py-4 text-[10px] text-slate-700 font-black tabular-nums">{idx + 1}</td>
      <td className="px-2 py-4 text-center">
        <button
          onClick={() => toggleWatchlist(entry.symbol)}
          className={cn(
            "transition-all duration-200 transform group-hover:scale-110",
            isStarred ? "text-yellow-400" : "text-slate-800 hover:text-slate-600"
          )}
        >
          <Star size={14} fill={isStarred ? "currentColor" : "none"} />
        </button>
      </td>
      <td className="px-3 py-4">
        <span className="font-black text-white text-sm tracking-tight">{entry.symbol.replace('USDT', '')}</span>
        <span className="text-slate-700 text-[10px] font-black uppercase ml-1 opacity-50">USDT</span>
      </td>
      <td className="px-3 py-4 text-right text-sm text-slate-200 tabular-nums font-bold font-mono">
        ${formatPrice(entry.price)}
      </td>
      <td className={cn(
        "px-3 py-4 text-right text-xs tabular-nums font-bold font-mono",
        entry.change24h > 0 ? "text-[#39FF14]" : entry.change24h < 0 ? "text-[#FF4B5C]" : "text-slate-600"
      )}>
        <div className="flex items-center justify-end gap-1.5">
          {entry.change24h > 0 ? <TrendingUp size={12} /> : entry.change24h < 0 ? <TrendingDown size={12} /> : null}
          {entry.change24h > 0 ? '+' : ''}{entry.change24h.toFixed(2)}%
        </div>
      </td>
      <td className="px-3 py-4 text-right text-[10px] text-slate-600 tabular-nums font-bold">
        {formatVolume(entry.volume24h)}
      </td>

      {visibleCols.has('rsi1m') && <td className={cn("px-3 py-4 text-right text-sm tabular-nums font-bold font-mono", getRsiColor(entry.rsi1m))}>{formatRsi(entry.rsi1m)}</td>}
      {visibleCols.has('rsi5m') && <td className={cn("px-3 py-4 text-right text-sm tabular-nums font-bold font-mono", getRsiColor(entry.rsi5m))}>{formatRsi(entry.rsi5m)}</td>}
      {visibleCols.has('rsi15m') && <td className={cn("px-3 py-4 text-right text-sm tabular-nums font-bold font-mono", getRsiColor(entry.rsi15m))}>{formatRsi(entry.rsi15m)}</td>}
      {visibleCols.has('rsi1h') && <td className={cn("px-3 py-4 text-right text-sm tabular-nums font-bold font-mono", getRsiColor(entry.rsi1h))}>{formatRsi(entry.rsi1h)}</td>}

      {visibleCols.has('rsiCustom') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono relative transition-all duration-300",
          entry.rsiPeriodAtCreation !== rsiPeriod ? "bg-slate-800/10 opacity-30" : "bg-[#39FF14]/5",
          getRsiColor(entry.rsiCustom)
        )}>
          <div className="flex items-center justify-end gap-1.5 flex-wrap max-w-[120px] ml-auto">
            {entry.isLiveRsi && entry.rsiPeriodAtCreation === rsiPeriod && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse border border-[#39FF14]/50" title="Real-Time Analysis" />
            )}

            {/* Intelligence: Early Signal Badge - Only show if periods match to ensure formula accuracy */}
            {entry.rsiPeriodAtCreation === rsiPeriod && entry.rsiCustom !== null && entry.rsi15m !== null && (
              <>
                {entry.rsiCustom <= 30 && entry.rsi15m > 30 && (
                  <span className="text-[7px] px-1 bg-[#39FF14]/30 text-[#39FF14] rounded-full animate-pulse border border-[#39FF14]/30" title="Early Oversold (Custom Period)">EARLY BUY</span>
                )}
                {entry.rsiCustom >= 70 && entry.rsi15m < 70 && (
                  <span className="text-[7px] px-1 bg-[#722f37]/30 text-[#FF4B5C] rounded-full animate-pulse border border-[#FF4B5C]/30" title="Early Overbought (Custom Period)">EARLY SELL</span>
                )}
              </>
            )}

            {entry.rsiPeriodAtCreation === rsiPeriod && entry.rsiDivergenceCustom && entry.rsiDivergenceCustom !== 'none' && (
              <span className={cn(
                "text-[8px] px-1 rounded-sm font-black tracking-tighter uppercase",
                entry.rsiDivergenceCustom === 'bullish' ? "bg-[#39FF14]/20 text-[#39FF14]" : "bg-[#722f37]/20 text-[#FF4B5C]"
              )}>
                {entry.rsiDivergenceCustom === 'bullish' ? 'DIV+' : 'DIV-'}
              </span>
            )}
            <span className="drop-shadow-sm">
              {entry.rsiPeriodAtCreation === rsiPeriod ? formatRsi(entry.rsiCustom) : '—'}
            </span>
          </div>
        </td>
      )}

      {visibleCols.has('emaCross') && (
        <td className="px-3 py-4 text-right text-[10px] font-black uppercase">
          <span className={cn(
            "px-2 py-1 rounded border",
            entry.emaCross === 'bullish' ? "text-[#39FF14] border-[#39FF14]/20 bg-[#39FF14]/5" :
              entry.emaCross === 'bearish' ? "text-[#FF4B5C] border-[#722f37]/20 bg-[#722f37]/5" :
                "text-slate-700 border-transparent"
          )}>
            {entry.emaCross || '—'}
          </span>
        </td>
      )}

      {visibleCols.has('macdHistogram') && (
        <td className={cn(
          "px-3 py-4 text-right text-[11px] tabular-nums font-bold font-mono",
          entry.macdHistogram === null ? "text-slate-700" : entry.macdHistogram > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]"
        )}>
          {formatNum(entry.macdHistogram, 4)}
        </td>
      )}

      {visibleCols.has('bbPosition') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono",
          entry.bbPosition === null ? "text-slate-700" : entry.bbPosition < 0.2 ? "text-[#39FF14]" : entry.bbPosition > 0.8 ? "text-[#FF4B5C]" : "text-slate-400"
        )}>
          {formatNum(entry.bbPosition)}
        </td>
      )}

      {visibleCols.has('stochK') && (
        <td className="px-3 py-4 text-right text-[10px] tabular-nums font-bold font-mono">
          <span className={getRsiColor(entry.stochK)}>{formatRsi(entry.stochK)}</span>
          {entry.stochD !== null && <span className="text-slate-600 ml-1">/{entry.stochD.toFixed(0)}</span>}
        </td>
      )}

      {visibleCols.has('confluence') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase tracking-tighter",
          entry.confluence >= 15 ? "text-[#39FF14]" : entry.confluence <= -15 ? "text-[#FF4B5C]" : "text-slate-600"
        )}>
          {entry.confluenceLabel}
        </td>
      )}

      {visibleCols.has('divergence') && (
        <td className="px-3 py-4 text-right text-[10px] font-black uppercase">
          {entry.rsiDivergence === 'bullish' ? <span className="text-[#39FF14]">Bull Div</span> :
            entry.rsiDivergence === 'bearish' ? <span className="text-[#FF4B5C]">Bear Div</span> : '—'}
        </td>
      )}

      {visibleCols.has('momentum') && (
        <td className={cn(
          "px-3 py-4 text-right text-sm tabular-nums font-bold font-mono",
          entry.momentum === null ? "text-slate-700" : entry.momentum > 0 ? "text-emerald-300" : entry.momentum < 0 ? "text-red-300" : "text-slate-500"
        )}>
          {formatPct(entry.momentum)}
        </td>
      )}

      <td className="px-3 py-4 text-right">
        <SignalBadge signal={entry.signal} />
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
                  animate={{ width: `${Math.min(100, Math.abs(entry.strategyScore))}%` }}
                  className={cn("h-full rounded-full transition-colors duration-1000", getScoreBarColor(entry.strategyScore))}
                  style={{ marginLeft: entry.strategyScore < 0 ? 'auto' : 0 }}
                />
              </div>
              <span className="text-[10px] font-black tabular-nums text-slate-500">{entry.strategyScore}</span>
            </div>
            <StrategyBadge signal={entry.strategySignal} label={entry.strategyLabel} reasons={entry.strategyReasons} />
          </div>
        </td>
      )}
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
  | 'emaCross' | 'macdHistogram' | 'bbPosition' | 'stochK'
  | 'vwapDiff' | 'volumeSpike' | 'strategy'
  | 'confluence' | 'divergence' | 'momentum';

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
  { id: 'emaCross', label: 'Trend', group: 'Indicators', defaultVisible: true },
  { id: 'macdHistogram', label: 'MACD', group: 'Indicators', defaultVisible: true },
  { id: 'bbPosition', label: 'BB Pos', group: 'Volatility', defaultVisible: false },
  { id: 'stochK', label: 'Stoch RSI', group: 'Momentum', defaultVisible: false },
  { id: 'vwapDiff', label: 'VWAP %', group: 'Volume', defaultVisible: false },
  { id: 'volumeSpike', label: 'Vol Spike', group: 'Volume', defaultVisible: false },
  { id: 'confluence', label: 'Confluence', group: 'Intelligence', defaultVisible: true },
  { id: 'divergence', label: 'Divergence', group: 'Intelligence', defaultVisible: true },
  { id: 'momentum', label: 'Momentum', group: 'Intelligence', defaultVisible: false },
  { id: 'strategy', label: 'Strategy', group: 'Strategy', defaultVisible: true },
];

// ─── Main Dashboard ───────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '15s', value: 15, maxPairs: 200 },
  { label: '30s', value: 30, maxPairs: 500 },
  { label: '60s', value: 60, maxPairs: 500 },
  { label: '2m', value: 120, maxPairs: 500 },
  { label: 'Off', value: 0, maxPairs: 500 },
];

const PAIR_COUNTS = [50, 100, 200, 300, 500];

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

function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('crypto-rsi-watchlist') ?? '[]');
  } catch {
    return [];
  }
}

export default function ScreenerDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ── Theme State ──
  const [useAnimations] = useState(true);
  const smartModeDefault = process.env.NEXT_PUBLIC_SMART_MODE_DEFAULT !== '0';
  // ── State ──
  const [data, setData] = useState<ScreenerEntry[]>([]);
  const [meta, setMeta] = useState<ScreenerResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('strategyScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshInterval, setRefreshInterval] = useState(() => {
    if (typeof window === 'undefined') return 30;
    const saved = localStorage.getItem('crypto-rsi-refresh');
    return saved ? Number(saved) : 30;
  });
  const [pairCount, setPairCount] = useState(() => {
    return 500;
  });
  const [smartMode, setSmartMode] = useState(() => {
    if (typeof window === 'undefined') return smartModeDefault;
    const saved = localStorage.getItem('crypto-rsi-smart-mode');
    if (saved === null) return smartModeDefault;
    return saved === '1';
  });
  const [showHeader, setShowHeader] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('crypto-rsi-show-header') !== '0';
  });
  const [rsiPeriod, setRsiPeriod] = useState(() => {
    if (typeof window === 'undefined') return 14;
    const saved = localStorage.getItem('crypto-rsi-period');
    return saved ? Math.min(Math.max(Number(saved), 7), 30) : 14;
  });
  const [countdown, setCountdown] = useState(30);
  const [refreshing, setRefreshing] = useState(false);
  const fetchingRef = useRef(false);
  const dataLenRef = useRef(0);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() =>
    new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)),
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
  const { livePrices, isConnected } = useLivePrices(symbolSet);

  // Merge live prices with server data
  const mergedData = useMemo(() => {
    if (livePrices.size === 0) return data;
    return data.map((entry) => {
      const live = livePrices.get(entry.symbol);
      if (!live || live.updatedAt <= entry.updatedAt) return entry;

      // Multi-TF Live RSI approximation
      let rsi1m = entry.rsi1m;
      let rsi5m = entry.rsi5m;
      let rsi15m = entry.rsi15m;
      let rsi1h = entry.rsi1h;
      let rsiCustom = entry.rsiCustom;
      let signal = entry.signal;
      let isLiveRsi = false;

      if (live.price > 0) {
        // Standard timeframes
        if (entry.rsiState1m) rsi1m = approximateRsi(entry.rsiState1m, live.price, 14);
        if (entry.rsiState5m) rsi5m = approximateRsi(entry.rsiState5m, live.price, 14);
        if (entry.rsiState15m) rsi15m = approximateRsi(entry.rsiState15m, live.price, 14);
        if (entry.rsiState1h) rsi1h = approximateRsi(entry.rsiState1h, live.price, 14);

        // Custom period accuracy guard
        if (entry.rsiStateCustom && entry.rsiPeriodAtCreation === rsiPeriod) {
          rsiCustom = approximateRsi(entry.rsiStateCustom, live.price, rsiPeriod);
          isLiveRsi = true;
        }

        // Instant Signal Hijack: Update signal instantly based on 15m (primary) or 1m (fallback)
        const leadRsi = rsi15m ?? rsi1m;
        if (leadRsi !== null) {
          if (leadRsi <= 30) signal = 'oversold';
          else if (leadRsi >= 70) signal = 'overbought';
          else signal = 'neutral';
        }
      }

      return {
        ...entry,
        price: live.price,
        change24h: live.change24h,
        volume24h: live.volume24h,
        rsi1m, rsi5m, rsi15m, rsi1h, rsiCustom,
        signal,
        isLiveRsi
      };
    });
  }, [data, livePrices, rsiPeriod]);

  // ─── Real-time Stats Engine ──────────────────────────────────
  const stats = useMemo(() => {
    const total = mergedData.length;
    let oversold = 0;
    let overbought = 0;
    let strongBuy = 0;
    let buy = 0;
    let neutral = 0;
    let sell = 0;
    let strongSell = 0;

    for (const entry of mergedData) {
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
  }, [mergedData]);

  const indicatorReadyCount = useMemo(() => (
    mergedData.filter((e) => e.rsi1m !== null || e.rsi5m !== null || e.rsi15m !== null || e.macdHistogram !== null).length
  ), [mergedData]);

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
      const timeoutMs = pairCount >= 500 ? 55_000 : pairCount >= 300 ? 40_000 : 25_000;
      const res = await fetch(`/api/screener?count=${pairCount}&smart=${smartMode ? '1' : '0'}&rsiPeriod=${rsiPeriod}`, {
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
    } catch (err) {
      if (dataLenRef.current === 0) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      }
    } finally {
      fetchingRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [pairCount, smartMode, rsiPeriod]);

  // ── Initial fetch with auto-retry and Hydration ──
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    const timer = setTimeout(() => {
      fetchData();
    }, 400); // 400ms debounce to avoid spamming while dragging slider
    return () => clearTimeout(timer);
  }, [rsiPeriod, fetchData]);

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
    let items = mergedData;

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
      items = items.filter((e) => e.symbol.includes(q));
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
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
  }, [mergedData, signalFilter, search, sortKey, sortDir, showWatchlistOnly, watchlist]);

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

  const colCount = 7 + OPTIONAL_COLUMNS.filter((c) => visibleCols.has(c.id)).length;

  return (
    <div className="max-w-[1800px] mx-auto px-4 py-8">
      {/* ── Header ── */}
      {showHeader && (
        <header className="mb-6 rounded-3xl border border-white/5 bg-[#080F1B] p-6 sm:p-8 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#39FF14]/[0.02] rounded-full -mr-20 -mt-20 group-hover:bg-[#39FF14]/[0.04] transition-colors duration-1000" />
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 relative z-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-bold tracking-widest text-slate-400 uppercase backdrop-blur-sm group/logo transition-all hover:bg-white/10">
                  Mindscape Analytics LLC
                </div>
                {session && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/5 bg-white/5 px-2 py-1 group/auth transition-all hover:bg-white/10">
                    <div className="w-5 h-5 rounded-full bg-[#39FF14]/20 flex items-center justify-center">
                      <UserIcon size={12} className="text-[#39FF14] group-hover/auth:text-[#32e012] transition-colors" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 pr-1">{session.user.name || session.user.email}</span>
                    <button
                      onClick={async () => {
                        setIsLoggingOut(true);
                        await signOut({
                          fetchOptions: {
                            onSuccess: () => {
                              router.push('/login');
                            },
                          },
                        });
                      }}
                      disabled={isLoggingOut}
                      className="p-1 rounded-full hover:bg-[#FF4B5C]/20 text-slate-400 hover:text-[#FF4B5C] disabled:opacity-50 transition-colors cursor-pointer"
                      title="Sign Out"
                    >
                      <LogOut size={12} />
                    </button>
                  </div>
                )}
              </div>
              <h1 className="mt-4 text-3xl sm:text-5xl font-black text-white tracking-tighter">
                RSIQ <span className="text-[#39FF14]">Pro</span>
              </h1>
              <div className="flex flex-wrap items-center gap-6 mt-6">
                <div className="flex flex-col">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Market Bias</div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                      <div
                        className="h-full bg-[#39FF14] transition-all duration-1000"
                        style={{ width: `${Math.max(0, 50 + stats.bias / 2)}%` }}
                      />
                      <div
                        className="h-full bg-red-500 transition-all duration-1000"
                        style={{ width: `${Math.max(0, 50 - stats.bias / 2)}%` }}
                      />
                    </div>
                    <span className={cn("text-xs font-black tabular-nums", stats.bias > 0 ? "text-emerald-400" : stats.bias < 0 ? "text-red-400" : "text-slate-500")}>
                      {stats.bias > 0 ? '+' : ''}{stats.bias}%
                    </span>
                  </div>
                </div>

                <div className="h-8 w-px bg-white/5" />

                <div className="flex flex-wrap gap-5">
                  {[
                    { label: "Oversold", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold },
                    { label: "Overbought", value: stats.overbought, color: "text-red-400", onClick: showMostOverbought },
                    { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys }
                  ].map((s) => (
                    <button key={s.label} onClick={s.onClick} className="flex flex-col items-start group/stat">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5 group-hover/stat:text-slate-400 transition-colors">{s.label}</span>
                      <span className={cn("text-lg font-black tabular-nums transition-transform group-hover/stat:scale-110", s.color)}>
                        <Counter value={s.value} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 min-w-[320px]">
              <div className="flex flex-wrap items-center justify-start lg:justify-end gap-3 text-xs">
                {meta && (
                  <div className="group relative inline-flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-slate-300 transition-all hover:bg-white/[0.06]">
                    <Activity size={14} className="text-slate-500" />
                    <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Compute</span>
                    <span className="font-black text-slate-200 tabular-nums">{meta.computeTimeMs}ms</span>
                  </div>
                )}
                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-slate-300">
                  <BrainCircuit size={14} className="text-[#39FF14]" />
                  <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Coverage</span>
                  <span className="font-black text-slate-200 tabular-nums">{indicatorReadyCount}/{data.length}</span>
                </div>
                <div className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 transition-all text-xs",
                  isConnected
                    ? 'border-[#39FF14]/20 bg-[#39FF14]/5 text-[#39FF14]'
                    : 'border-white/5 bg-white/[0.02] text-slate-600'
                )}>
                  <div className={cn("h-1.5 w-1.5 rounded-full", isConnected ? 'bg-[#39FF14]' : 'bg-slate-600')} />
                  <span className="font-black tracking-tight uppercase text-[10px]">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
                </div>
                <button
                  onClick={() => { fetchData(); }}
                  className="group inline-flex items-center gap-2 rounded-2xl border border-[#39FF14]/20 bg-[#39FF14]/5 px-6 py-2.5 text-[10px] font-black tracking-widest text-[#39FF14] hover:bg-[#39FF14]/10 transition-all active:scale-95"
                  title="Refresh now"
                >
                  <RefreshCcw size={14} className={cn("transition-transform duration-700", refreshing && "animate-spin")} />
                  <span>{refreshing ? 'UPDATING' : `SYNC ${countdown}S`}</span>
                </button>
              </div>

              <div className="flex items-center justify-start lg:justify-end gap-6 bg-white/[0.02] border border-white/5 rounded-2xl px-5 py-3">
                {[
                  { label: "Oversold", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold },
                  { label: "Overbought", value: stats.overbought, color: "text-red-400", onClick: showMostOverbought },
                  { label: "Strong Buy", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys }
                ].map((s) => (
                  <button key={s.label} onClick={s.onClick} className="flex items-center gap-3 group/stat whitespace-nowrap">
                    <div className="flex flex-col items-end">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover/stat:text-slate-400 transition-colors">{s.label}</span>
                      <span className={cn("text-sm font-black tabular-nums tracking-tight", s.color)}>
                        <Counter value={s.value} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>
      )}


      <div className="flex flex-col lg:flex-row items-center gap-4 mb-8">
        <div className="relative flex-1 w-full lg:w-auto overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search crypto pair..."
            className="w-full pl-12 pr-4 py-4 text-sm bg-transparent text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#39FF14]/20 font-medium"
          />
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-900/40 rounded-2xl border border-white/5 p-1">
            {['all', 'strong-buy', 'buy', 'neutral', 'sell', 'strong-sell'].map((v) => (
              <button
                key={v}
                onClick={() => setSignalFilter(v as SignalFilter)}
                className={cn(
                  "px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all rounded-xl",
                  signalFilter === v ? "bg-white/5 text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {v === 'all' ? 'All' : v.replace('strong-', 'S-')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowWatchlistOnly((v) => !v)}
            className={cn(
              "px-5 py-3 text-[10px] font-bold uppercase tracking-widest rounded-2xl border transition-all",
              showWatchlistOnly
                ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                : "bg-slate-900/40 text-slate-500 border-white/5 hover:bg-slate-800/60"
            )}
            title="Toggle Watchlist"
          >
            <Star size={14} className={cn("inline mr-2", showWatchlistOnly && "fill-current")} />
            Watchlist {watchlist.size > 0 && `(${watchlist.size})`}
          </button>

          <button
            onClick={() => setShowHeader((v) => !v)}
            className={cn(
              "px-5 py-3 text-[10px] font-bold uppercase tracking-widest rounded-2xl border transition-all",
              showHeader
                ? "bg-[#39FF14]/5 text-[#39FF14] border-[#39FF14]/20"
                : "bg-slate-900/40 text-slate-500 border-white/5 hover:bg-slate-800/60"
            )}
            title="Toggle Premium Header"
          >
            <LayoutList size={14} className="inline mr-2" />
            Header
          </button>

          <div className="relative group" ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest rounded-2xl border border-white/5 bg-slate-900/40 text-slate-500 hover:bg-slate-800/60 transition-all"
            >
              <LayoutGrid size={14} className="inline mr-2" />
              Columns
            </button>
            <AnimatePresence>
              {showColPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-3 z-50 bg-[#0A0F1B] border border-white/10 rounded-2xl shadow-xl p-4 min-w-[240px]"
                >
                  <div className="grid grid-cols-1 gap-1">
                    {OPTIONAL_COLUMNS.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => toggleCol(col.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left",
                          visibleCols.has(col.id) ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-slate-500 hover:bg-white/5"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded-md border flex items-center justify-center transition-all", visibleCols.has(col.id) ? "bg-[#39FF14] border-[#39FF14]" : "border-slate-700")}>
                          {visibleCols.has(col.id) && <ShieldCheck size={12} className="text-white" />}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-tight">{col.label}</span>
                        <span className="text-[9px] font-medium text-slate-600 ml-auto">{col.group}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/40 border border-white/5 rounded-2xl px-5 py-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">RSI Period</span>
            <input
              type="range"
              min="7"
              max="35"
              value={rsiPeriod}
              onChange={(e) => setRsiPeriod(Number(e.target.value))}
              className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39FF14]"
            />
            <span className="text-xs font-black tabular-nums text-[#39FF14] w-4">{rsiPeriod}</span>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/40 overflow-hidden shadow-lg">
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
                {visibleCols.has('rsiCustom') && (
                  <SortHeader
                    label={`RSI (${rsiPeriod})`}
                    sortKey="rsiCustom"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                )}

                {visibleCols.has('emaCross') && <SortHeader label="Trend" sortKey="emaCross" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('macdHistogram') && <SortHeader label="MACD" sortKey="macdHistogram" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('bbPosition') && <SortHeader label="BB Pos" sortKey="bbPosition" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('stochK') && <SortHeader label="Stoch" sortKey="stochK" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('confluence') && <SortHeader label="Confluence" sortKey="confluence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('divergence') && <SortHeader label="Diverg" sortKey="rsiDivergence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
                {visibleCols.has('momentum') && <SortHeader label="Momentum" sortKey="momentum" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}

                <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                {visibleCols.has('strategy') && <SortHeader label="Strategy" sortKey="strategyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />}
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
                      useAnimations={filtered.length < 150}
                      rsiPeriod={rsiPeriod}
                    />
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-4 py-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-3">
          <Link
            href="http://mindscapeanalytics.com/"
            target="_blank"
            className="group flex flex-col items-start"
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-[#39FF14] transition-colors">By</span>
              <span className="text-sm font-black text-white tracking-tighter">Mindscape Analytics <span className="text-[#39FF14] uppercase">LLC</span></span>
            </div>
          </Link>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest tabular-nums hidden sm:block">
            &copy; 2026 {new Date().getFullYear() !== 2026 && `- ${new Date().getFullYear()}`} All Rights Reserved
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Universe</span>
            <span className="text-[10px] font-bold text-slate-300 tabular-nums">{data.length} Stable Pairs</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600">Status</span>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isConnected ? "bg-[#39FF14]" : "bg-slate-700")} />
            <span className="text-[10px] font-bold text-slate-300">{isConnected ? "Live Engine" : "Polling"}</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <Link
            href="/guide"
            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            Documentation
          </Link>
        </div>
      </footer>
    </div>
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
