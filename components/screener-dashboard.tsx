'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Search, Bell, BellOff, Settings, Filter, Star, Info, Download,
  RefreshCcw, Zap, ZapOff, BarChart3, TrendingUp, TrendingDown,
  LayoutGrid, LayoutList, ChevronUp, ChevronDown, Clock,
  Flame, ShieldCheck, Activity, BrainCircuit, Gauge,
  LogOut, User as UserIcon, Minus, Plus, AlertTriangle,
  ArrowDownCircle, MinusCircle, ArrowUpCircle, Smartphone,
  Link as LinkIcon, Shield, Menu, X, SortAsc, CheckSquare, Square
} from 'lucide-react';
import { useSession, signOut } from '@/lib/auth-client';
import { AUTH_CONFIG } from '@/lib/config';
import { UserProfileDropdown } from './user-profile-dropdown';
import { TrialIndicator } from './trial-indicator';
import { GlobalWinRateBadge } from './global-win-rate-badge';
import { WinRateBadge } from './win-rate-badge';
import { useWinRateContext } from './win-rate-context';
import { SignalNarrationModal } from './signal-narration-modal';
import { QuietHoursSection } from './quiet-hours-section';
import { BulkActionsToolbar } from './bulk-actions-toolbar';
import { BulkConfirmationDialog, type BulkActionConfig } from './bulk-confirmation-dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import type { ScreenerEntry, ScreenerResponse, SortKey, SortDir, SignalFilter } from '@/lib/types';
import type { LiquidationEvent } from '@/lib/derivatives-types';
import { useLivePrices, useSymbolPrice } from '@/hooks/use-live-prices';
import { useAlertEngine } from '@/hooks/use-alert-engine';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useDerivativesIntel } from '@/hooks/use-derivatives-intel';
import { DerivativesPanel, OrderFlowBar } from '@/components/derivatives-panel';
import { FundingRateCellWithTooltip } from '@/components/funding-rate-cell';
import { OrderFlowIndicator } from '@/components/order-flow-indicator';
import { CorrelationHeatmap } from '@/components/correlation-heatmap';
import { PortfolioScannerPanel } from '@/components/portfolio-scanner-panel';
import { approximateRsi, approximateEma, calculateRsiWithState } from '@/lib/rsi';
import { computeStrategyScore, deriveSignal, calculateRsi, latestEma, detectEmaCross, calculateMacd, calculateBollinger, calculateStochRsi, calculateROC, calculateConfluence, latestEmaWithState, calculateMacdWithState, calculateBollingerWithState, calculateATR, calculateADX } from '@/lib/indicators';
import { getSymbolAlias, getSymbolTicker } from '@/lib/symbol-utils';
import { generateSignalNarration } from '@/lib/signal-narration';
import type { AssetClass } from '@/lib/asset-classes';
import { useMarketData } from '@/hooks/use-market-data';
import { toast } from 'sonner';
import { notificationEngine } from '@/lib/notification-engine';
import { getMarketType } from '@/lib/market-utils';
import { getGlobalWinRate } from '@/lib/signal-tracker';

// ─── Formatting helpers ────────────────────────────────────────

function formatPrice(p: number, market?: string): string {
  if (market === 'Forex') {
    // Institutional Forex: 5 decimals for pipettes (e.g., 1.08456)
    // JPY pairs are handled by the p >= 100 check below if needed, but here we force 3 or 5
    if (p > 50) return p.toFixed(3); // USD/JPY
    return p.toFixed(5);
  }
  if (market === 'Metal') return p.toFixed(2); // Gold/Silver
  if (market === 'Stocks' || market === 'Index') return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  if (rsi === null) return '-';
  return rsi.toFixed(1);
}

function formatIndicator(val: number | null, market?: string, precision = 4): string {
  if (val === null || val === undefined) return '-';
  if (market === 'Forex') {
    // 0.0001 = 1 pip. For JPY (price > 50), 0.01 = 1 pip.
    // For general display, we multiply by 10,000 and label as pips.
    return `${(val * 10000).toFixed(1)} pips`;
  }
  return val.toFixed(precision);
}

function formatNum(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '-';
  if (n === 0) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

function formatPct(n: number | null): string {
  if (n === null) return '-';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatTimeAgo(ts: number): string {
  if (!ts) return '-';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'Just now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function getRsiColor(rsi: number | null): string {
  if (rsi === null) return 'text-slate-600';
  if (rsi >= 75) return 'text-[#FF4B5C] drop-shadow-[0_0_10px_rgba(255,75,92,0.4)] font-black'; // Extreme OB
  if (rsi <= 25) return 'text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.4)] font-black'; // Extreme OS
  if (rsi >= 70) return 'text-[#FF4B5C] drop-shadow-[0_0_8px_rgba(255,75,92,0.2)] font-bold';
  if (rsi <= 30) return 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.2)] font-bold';
  if (rsi >= 60) return 'text-[#FF4B5C]/80 font-bold';
  if (rsi <= 40) return 'text-[#39FF14]/80 font-bold';
  return 'text-white/90 font-medium';
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



// ─── Tactical Grid Constants ─────────────────────────────────────

const COL_WIDTHS = {
  rank: "w-[44px] min-w-[44px]",
  star: "w-[36px] min-w-[36px]",
  symbol: "w-[120px] min-w-[120px]",
  price: "w-[115px] min-w-[115px]",
  change: "w-[95px] min-w-[95px]",
  volume: "w-[100px] min-w-[100px]",
  rsi: "w-[80px] min-w-[80px]",
  ema: "w-[100px] min-w-[100px]",
  trend: "w-[85px] min-w-[85px]",
  macd: "w-[95px] min-w-[95px]",
  bb: "w-[90px] min-w-[90px]",
  stoch: "w-[85px] min-w-[85px]",
  signal: "w-[96px] min-w-[96px]",  // Increased from 90px to fit badge
  edit: "w-[50px] min-w-[50px]",
  confluence: "w-[95px] min-w-[95px]",
  divergence: "w-[90px] min-w-[90px]",
  momentum: "w-[85px] min-w-[85px]",
  atr: "w-[80px] min-w-[80px]",
  adx: "w-[80px] min-w-[80px]",
  vwap: "w-[85px] min-w-[85px]",
  funding: "w-[100px] min-w-[100px]",  // Increased from 95px to prevent overflow
  flow: "w-[95px] min-w-[95px]",      // Increased from 90px to prevent overflow
  smart: "w-[90px] min-w-[90px]",
  winRate: "w-[90px] min-w-[90px]",   // Win Rate column
};

// ─── Atomic Components ──────────────────────────────────────────

const SortHeader = memo(function SortHeader({
  label, sortKey, currentKey, currentDir, onSort, align = 'right', widthClass, stickyOffset
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir; onSort: (k: SortKey) => void; align?: 'left' | 'right' | 'center'; widthClass?: string; stickyOffset?: number;
}) {
  const isActive = currentKey === sortKey;
  const ariaSort = isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={ariaSort}
      role="columnheader"
      style={stickyOffset !== undefined ? { left: stickyOffset } : {}}
      className={cn(
        "px-3 py-3 text-[10px] font-bold uppercase text-slate-500 cursor-pointer select-none transition-colors",
        isActive ? "text-[#39FF14] bg-white/[0.02]" : "hover:text-slate-300 hover:bg-white/[0.01]",
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        widthClass || "w-32",
        stickyOffset !== undefined && "sticky z-30 bg-[#0A0F1B]/95",
        sortKey === 'price' && stickyOffset !== undefined && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.5)]"
      )}
    >
      <div className={cn("flex items-center gap-1.5", align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start')}>
        <span className="tracking-widest whitespace-nowrap">{label}</span>
        {isActive ? (
          currentDir === 'asc' ? <ChevronUp size={12} className="text-[#39FF14]" /> : <ChevronDown size={12} className="text-[#39FF14]" />
        ) : (
          <SortAsc size={10} className="opacity-0 group-hover:opacity-40" />
        )}
      </div>
    </th>
  );
});

const IndicatorCell = memo(function IndicatorCell({
  value,
  formatted,
  colorClass = "text-slate-300",
  widthClass,
  align = 'right',
  title,
  intensity = false,
  isSyncing = false
}: {
  value: number | null;
  formatted: string;
  colorClass?: string;
  widthClass: string;
  align?: 'left' | 'right' | 'center';
  title?: string;
  intensity?: boolean;
  isSyncing?: boolean;
}) {
  const hasIntensity = intensity && value !== null && Math.abs(value) > 2;
  const showSyncing = isSyncing && value === null;

  return (
    <td
      title={title}
      className={cn(
        "px-3 py-3 tabular-nums font-bold font-mono text-[11px] border-white/[0.01] transition-colors duration-200",
        colorClass,
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        widthClass,
        hasIntensity && (value > 0 ? "bg-[#39FF14]/[0.03]" : "bg-[#FF4B5C]/[0.03]"),
        showSyncing && "animate-pulse"
      )}
    >
      <span className={cn(
        "relative",
        hasIntensity && "drop-shadow-[0_0_8px_currentColor]",
        showSyncing && "text-slate-700 font-normal"
      )}>
        {showSyncing ? '...' : formatted}
      </span>
    </td>
  );
});


const SymbolCell = memo(function SymbolCell({
  symbol, market, marketState, isLive, stickyOffset, onOpenSettings
}: {
  symbol: string; market: string; marketState?: string | null; isLive: boolean; stickyOffset: number; onOpenSettings: (s: string) => void;
}) {
  return (
    <td
      style={{ left: stickyOffset }}
      className={cn("sticky z-10 px-3 py-4 bg-[#0A0F1B]/95", COL_WIDTHS.symbol)}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <div className="relative group shrink-0">
            <span
              className="font-black text-white text-[13px] tracking-tight hover:text-[#39FF14] transition-colors cursor-pointer"
              onClick={() => onOpenSettings(symbol)}
            >
              {getSymbolAlias(symbol)}
            </span>
            {isLive && (
              <div className="absolute -left-2.5 top-1.5 w-1 h-1 rounded-full bg-[#39FF14] shadow-[0_0_5px_#39FF14] animate-pulse" title="Institutional Heartbeat: Data Live" />
            )}
          </div>
          <MarketBadge market={market as any} />
          {market !== 'Crypto' && marketState !== 'REGULAR' && (
            <span className="text-[7px] px-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-sm font-black uppercase tracking-tighter shadow-[0_0_8px_rgba(255,75,92,0.1)]">
              {marketState || 'CLOSED'}
            </span>
          )}
        </div>
        <span className="text-slate-700 text-[8px] font-black uppercase tracking-wider opacity-60">
          {market === 'Crypto' ? 'USDT' : getSymbolTicker(symbol)}
        </span>
      </div>
    </td>
  );
});

const PriceCell = memo(function PriceCell({
  price, lastChange, stickyOffset, market
}: {
  price: number; lastChange: number; stickyOffset: number; market?: string;
}) {
  // Flash animation: briefly highlight the cell when price changes direction
  const prevPriceRef = useRef(price);
  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (price === prevPriceRef.current) return;
    const dir = price > prevPriceRef.current ? 'up' : 'down';
    prevPriceRef.current = price;
    setFlashDir(dir);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashDir(null), 600);
    return () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); };
  }, [price]);

  const dirColor = lastChange > 0 ? 'text-[#39FF14]' : lastChange < 0 ? 'text-[#FF4B5C]' : 'text-slate-100';

  return (
    <td
      style={{ left: stickyOffset }}
      className={cn(
        "sticky z-10 px-3 py-4 text-right tabular-nums font-bold font-mono text-[13px] bg-[#0A0F1B]/95 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.5)] transition-colors duration-150",
        flashDir === 'up' && "bg-[#39FF14]/[0.06]",
        flashDir === 'down' && "bg-[#FF4B5C]/[0.06]",
        COL_WIDTHS.price
      )}
    >
      <div className="flex items-center justify-end gap-1">
        {flashDir === 'up' && <span className="text-[#39FF14] text-[9px] leading-none">▲</span>}
        {flashDir === 'down' && <span className="text-[#FF4B5C] text-[9px] leading-none">▼</span>}
        <span className={cn(dirColor, "transition-colors duration-150")}>
          ${formatPrice(price, market)}
        </span>
      </div>
    </td>
  );
});

function SignalBadge({ signal }: { signal: ScreenerEntry['signal'] }) {
  const config: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
    oversold: {
      bg: 'bg-[#39FF14]/15',
      text: 'text-[#39FF14]',
      border: 'border-[#39FF14]/50',
      dot: 'bg-[#39FF14]',
      label: 'O-SOLD',
    },
    overbought: {
      bg: 'bg-[#FF4B5C]/15',
      text: 'text-[#FF4B5C]',
      border: 'border-[#FF4B5C]/50',
      dot: 'bg-[#FF4B5C]',
      label: 'O-BOUGHT',
    },
    neutral: {
      bg: 'bg-slate-800/20',
      text: 'text-slate-500',
      border: 'border-slate-700/30',
      dot: 'bg-slate-600',
      label: 'NEUTRAL',
    },
  };

  const style = config[signal] ?? config.neutral;
  const isActive = signal !== 'neutral';

  return (
    <span className={cn(
      "inline-flex items-center justify-center gap-1 px-2 py-1 w-[72px]",
      "text-[8px] font-black uppercase tracking-[0.1em] leading-none whitespace-nowrap",
      "rounded-lg border transition-colors duration-200",
      style.bg, style.text, style.border,
    )}>
      {/* Pulsing dot instead of pulsing the whole badge — no layout shift */}
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot, isActive && "animate-pulse")} />
      <span>{style.label}</span>
    </span>
  );
}

function StrategyBadge({ signal, label, reasons, entry, onViewNarration }: { signal: ScreenerEntry['strategySignal']; label: string; reasons?: string[]; entry?: ScreenerEntry; onViewNarration?: (entry: ScreenerEntry) => void }) {
  const config: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    'strong-buy': {
      bg: 'bg-[#39FF14]/25',
      text: 'text-[#39FF14]',
      border: 'border-[#39FF14]/50',
      icon: '🚀'
    },
    'buy': {
      bg: 'bg-[#39FF14]/15',
      text: 'text-[#39FF14]/90',
      border: 'border-[#39FF14]/30',
      icon: '📈'
    },
    'neutral': {
      bg: 'bg-slate-700/20',
      text: 'text-slate-400',
      border: 'border-slate-600/30',
      icon: '➖'
    },
    'sell': {
      bg: 'bg-[#FF4B5C]/15',
      text: 'text-[#FF4B5C]/90',
      border: 'border-[#FF4B5C]/30',
      icon: '📉'
    },
    'strong-sell': {
      bg: 'bg-[#FF4B5C]/25',
      text: 'text-[#FF4B5C]',
      border: 'border-[#FF4B5C]/50',
      icon: '⚠️'
    },
  };

  const style = config[signal] || config.neutral;

  // Signal Narration Engine™ - generate rich explanations for non-neutral signals
  const narration = useMemo(() => {
    if (!entry || signal === 'neutral') return null;
    return generateSignalNarration(entry);
  }, [entry, signal]);

  const title = narration
    ? `${narration.emoji} ${narration.headline} (${narration.conviction}% ${narration.convictionLabel})\n\nTechnical Signals:\n${narration.reasons.map(r => `• ${r}`).join('\n')}\n\n📋 Click to copy institutional brief`
    : reasons?.length ? `Strategic Alignment:\n${reasons.map(r => `• ${r}`).join('\n')}` : undefined;

  // Signal Sharing - copy narration shareLine to clipboard for viral growth
  const handleCopySignal = useCallback(() => {
    if (!narration || !entry) return;
    const symbolUrl = `https://rsiq.mindscapeanalytics.com/symbol/${entry.symbol.toLowerCase()}`;
    const text = `📊 RSIQ PRO | ${narration.emoji} ${narration.headline}\n\n${narration.reasons.join('\n')}\n\nConviction: ${narration.conviction}% (${narration.convictionLabel})\nView Data: ${symbolUrl}`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Strategy Brief copied!', { duration: 2000 });
    }).catch(() => {
      toast.error('Failed to copy');
    });
  }, [narration, entry]);

  return (
    <>
      <span
        className={cn(
          "inline-flex items-center justify-center gap-1 px-2 py-1 w-[72px]",
          "text-[8px] font-black uppercase tracking-[0.08em] leading-none whitespace-nowrap overflow-hidden transition-all duration-200",
          "rounded-lg border",
          style.bg, style.text, style.border,
          (narration || reasons?.length) && 'cursor-help active:scale-95'
        )}
        title={title}
        onClick={narration ? handleCopySignal : undefined}
      >
        <span className="text-[9px] shrink-0">{style.icon}</span>
        <span className="truncate">{label}</span>
        {narration && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewNarration?.(entry!);
            }}
            className="ml-0.5 shrink-0 opacity-40 hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
            title="View detailed analysis"
          >
            <Info size={10} />
          </button>
        )}
      </span>
    </>
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

// ─── Live Status Indicator (PWA Performance Monitor) ──────────────
const LiveStatusIndicator = memo(function LiveStatusIndicator({
  lastUpdate,
  isConnected
}: {
  lastUpdate: number;
  isConnected: boolean;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-800/30 border border-slate-700/40">
        <div className="w-2 h-2 rounded-full bg-slate-700" />
        <span className="text-slate-600 text-[9px] uppercase tracking-wider">OFFLINE</span>
      </div>
    );
  }

  const ageMs = now - lastUpdate;
  const ageSec = Math.floor(ageMs / 1000);

  let color = 'text-[#39FF14]'; // Green
  let bgColor = 'bg-[#39FF14]/10';
  let borderColor = 'border-[#39FF14]/30';
  let dotColor = 'bg-[#39FF14]';
  let status = 'LIVE';
  let shouldPulse = true;

  if (ageMs > 3000) {
    color = 'text-red-500';
    bgColor = 'bg-red-500/10';
    borderColor = 'border-red-500/30';
    dotColor = 'bg-red-500';
    status = 'STALE';
    shouldPulse = false;
  } else if (ageMs > 1000) {
    color = 'text-yellow-500';
    bgColor = 'bg-yellow-500/10';
    borderColor = 'border-yellow-500/30';
    dotColor = 'bg-yellow-500';
    status = 'SLOW';
    shouldPulse = true;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-300",
        bgColor,
        borderColor
      )}
      title={`Last update: ${ageSec}s ago`}
    >
      <div className={cn(
        "w-2 h-2 rounded-full transition-all duration-300",
        dotColor,
        shouldPulse && "animate-pulse shadow-[0_0_8px_currentColor]"
      )} />
      <span className={cn("text-[9px] uppercase tracking-wider font-black", color)}>
        {status}
      </span>
      {ageMs > 1000 && (
        <span className="text-slate-500 text-[8px] font-bold">
          ({ageSec}s)
        </span>
      )}
    </div>
  );
});


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
  globalUseObv,
  globalUseWilliamsR,
  globalVolatilityEnabled,
  globalLongCandleThreshold,
  globalVolumeSpikeThreshold,
  fundingRate,
  orderFlowData,
  smartMoneyScore,
  bulkMode,
  isSelected,
  onToggleSelection,
  onViewNarration,
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
  globalUseObv: boolean;
  globalUseWilliamsR: boolean;
  globalVolatilityEnabled: boolean;
  globalLongCandleThreshold: number;
  globalVolumeSpikeThreshold: number;
  fundingRate: { rate: number; annualized: number } | null;
  orderFlowData: { ratio: number; pressure: string; buyVolume1m: number; sellVolume1m: number } | null;
  smartMoneyScore: { score: number; label: string } | null;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (symbol: string) => void;
  onViewNarration: (entry: ScreenerEntry) => void;
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
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
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
      adx: entry.adx,
      atr: entry.atr,
      obvTrend: (tick as any).obvTrend ?? entry.obvTrend ?? 'none',
      williamsR: (tick as any).williamsR ?? entry.williamsR ?? null,
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
        obv: globalUseObv,
        williamsR: globalUseWilliamsR,
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
      rsiDivergence: tick.rsiDivergence ?? entry.rsiDivergence,
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
      confluence: tick.confluence ?? entry.confluence,
      confluenceLabel: tick.confluenceLabel ?? entry.confluenceLabel,
      rsiDivergenceCustom: tick.rsiDivergenceCustom ?? entry.rsiDivergenceCustom,
      rsiCrossover: tick.rsiCrossover ?? entry.rsiCrossover,
      momentum: tick.momentum ?? entry.momentum,
      atr: tick.atr ?? entry.atr,
      adx: tick.adx ?? entry.adx,
      vwapDiff: tick.vwapDiff ?? entry.vwapDiff,
      volumeSpike: (tick.volumeSpike ?? liveVolumeSpike) || entry.volumeSpike,
      stochK: tick.stochK ?? entry.stochK,
      stochD: tick.stochD ?? entry.stochD,
      bbUpper: tick.bbUpper ?? entry.bbUpper,
      bbLower: tick.bbLower ?? entry.bbLower,
      bbMiddle: tick.bbMiddle ?? entry.bbMiddle,
      vwap: tick.vwap ?? entry.vwap,
      macdLine: entry.macdLine,
      macdSignal: entry.macdSignal,
      strategyScore: tick.strategyScore ?? liveStrategy.score,
      strategySignal: (tick.strategySignal as any) ?? liveStrategy.signal,
      strategyLabel: tick.strategyScore !== undefined
        ? (tick.strategyScore >= 55 ? 'Strong Buy'
          : tick.strategyScore >= 25 ? 'Buy'
            : tick.strategyScore <= -55 ? 'Strong Sell'
              : tick.strategyScore <= -25 ? 'Sell'
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
    globalSignalThresholdMode, globalOverbought, globalOversold, globalVolumeSpikeThreshold
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
    rsiCrossover: entry.rsiCrossover,
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
  // Task: Syncing State Detection
  // If indicators are missing but price info exists, it's a "warming up" state (ticker-only fallback).
  const isSyncing = display.rsi15m === null && (display.price || 0) > 0;

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

  const stickyOffsetSym = bulkMode
    ? (visibleCols.has('rank') ? 132 : 84)  // Add 44px for checkbox
    : (visibleCols.has('rank') ? 88 : 40);
  const stickyOffsetPrice = stickyOffsetSym + 120;

  return (
    <tr
      ref={rowRef}
      className={cn(
        "group transition-colors duration-150 border-white/[0.02] h-[68px]",
        idx % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
        "hover:bg-white/[0.04] active:bg-white/[0.06]"
      )}
      style={{
        borderLeftWidth: isFlash ? '4px' : '0px',
        borderLeftColor: isFlash
          ? (display.strategySignal.includes('buy') ? '#39FF14' : display.strategySignal.includes('sell') ? '#FF4B5C' : 'rgba(255,255,255,0.2)')
          : 'transparent',
        contentVisibility: 'auto',
        containIntrinsicSize: '0 68px'
      } as any}
    >
      {bulkMode && (
        <td className="sticky left-0 z-10 px-3 py-4 bg-[#0A0F1B]/95 w-[44px] min-w-[44px]">
          <button
            onClick={() => onToggleSelection?.(entry.symbol)}
            className="flex items-center justify-center w-full h-full text-slate-500 hover:text-[#39FF14] transition-colors"
          >
            {isSelected ? (
              <CheckSquare size={14} className="text-[#39FF14]" />
            ) : (
              <Square size={14} />
            )}
          </button>
        </td>
      )}
      {visibleCols.has('rank') && (
        <IndicatorCell value={idx + 1} formatted={(idx + 1).toString()} colorClass="text-slate-600" widthClass={COL_WIDTHS.rank} align="left" />
      )}

      <td className={cn("px-2 py-4 text-center", COL_WIDTHS.star)}>
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

      <SymbolCell
        symbol={entry.symbol}
        market={entry.market}
        marketState={entry.marketState}
        isLive={!!display.isLiveRsi}
        stickyOffset={stickyOffsetSym}
        onOpenSettings={onOpenSettings}
      />

      <PriceCell
        price={display.price}
        lastChange={display.lastPriceChange}
        stickyOffset={stickyOffsetPrice}
        market={entry.market}
      />

      <IndicatorCell
        value={display.change24h}
        formatted={formatPct(display.change24h)}
        colorClass={display.change24h > 0 ? "text-[#39FF14]" : display.change24h < 0 ? "text-[#FF4B5C]" : "text-slate-600"}
        widthClass={COL_WIDTHS.change}
      />

      <IndicatorCell
        value={display.volume24h}
        formatted={formatVolume(display.volume24h)}
        colorClass="text-slate-500"
        widthClass={COL_WIDTHS.volume}
      />

      {visibleCols.has('rsi1m') && (
        <EditableRsiCell
          symbol={entry.symbol}
          rsi={display.rsi1m}
          field="rsi1mPeriod"
          currentConfig={coinConfigs[entry.symbol]}
          onSave={onSaveConfig}
          disabled={!globalUseRsi}
          isSyncing={isSyncing}
          className={COL_WIDTHS.rsi}
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
          isSyncing={isSyncing}
          className={COL_WIDTHS.rsi}
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
          isSyncing={isSyncing}
          className={COL_WIDTHS.rsi}
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
          isSyncing={isSyncing}
          className={COL_WIDTHS.rsi}
        />
      )}

      {visibleCols.has('ema9') && (
        <IndicatorCell
          value={display.ema9}
          formatted={(globalUseEma && display.ema9 != null) ? `$${formatPrice(display.ema9, entry.market)}` : '-'}
          colorClass={globalUseEma ? "text-slate-300" : "text-slate-700/40"}
          widthClass={COL_WIDTHS.ema}
          isSyncing={isSyncing}
        />
      )}
      {visibleCols.has('ema21') && (
        <IndicatorCell
          value={display.ema21}
          formatted={(globalUseEma && display.ema21 != null) ? `$${formatPrice(display.ema21, entry.market)}` : '-'}
          colorClass={globalUseEma ? "text-slate-300" : "text-slate-700/40"}
          widthClass={COL_WIDTHS.ema}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('emaCross') && (
        <IndicatorCell
          value={null}
          formatted={display.emaCross === 'bullish' ? 'BULL' : display.emaCross === 'bearish' ? 'BEAR' : 'NEUTRAL'}
          colorClass={display.emaCross === 'bullish' ? "text-[#39FF14]" : display.emaCross === 'bearish' ? "text-[#FF4B5C]" : "text-slate-500"}
          widthClass={COL_WIDTHS.trend}
          align="right"
        />
      )}

      {visibleCols.has('macdHistogram') && (
        <IndicatorCell
          value={display.macdHistogram}
          formatted={display.macdHistogram != null ? formatNum(display.macdHistogram, 4) : '-'}
          colorClass={display.macdHistogram != null ? (display.macdHistogram! > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]") : "text-slate-700/40"}
          widthClass={COL_WIDTHS.macd}
          intensity={true}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('bbUpper') && (
        <IndicatorCell
          value={display.bbUpper}
          formatted={(globalUseBb && display.bbUpper != null) ? `$${formatPrice(display.bbUpper, entry.market)}` : '-'}
          colorClass={globalUseBb ? "text-[#FF4B5C]/70" : "text-slate-700/40"}
          widthClass={COL_WIDTHS.bb}
          isSyncing={isSyncing}
        />
      )}
      {visibleCols.has('bbLower') && (
        <IndicatorCell
          value={display.bbLower}
          formatted={(globalUseBb && display.bbLower != null) ? `$${formatPrice(display.bbLower, entry.market)}` : '-'}
          colorClass={globalUseBb ? "text-[#39FF14]/70" : "text-slate-700/40"}
          widthClass={COL_WIDTHS.bb}
          isSyncing={isSyncing}
        />
      )}
      {visibleCols.has('bbPosition') && (
        <IndicatorCell
          value={display.bbPosition}
          formatted={(globalUseBb && display.bbPosition != null) ? formatNum(display.bbPosition) : '-'}
          colorClass={globalUseBb ? (display.bbPosition! < 0.2 ? "text-[#39FF14]" : display.bbPosition! > 0.8 ? "text-[#FF4B5C]" : "text-slate-400") : "text-slate-700/40"}
          widthClass={COL_WIDTHS.bb}
          isSyncing={isSyncing}
        />
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
          ) : <span className="text-slate-700">-</span>}
        </td>
      )}

      {visibleCols.has('confluence') && (
        <td className={cn(
          "px-3 py-4 text-right text-[10px] font-black uppercase tracking-tighter transition-all duration-300 whitespace-nowrap",
          display.confluence >= 15 ? "text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.3)]" :
            display.confluence <= -15 ? "text-[#FF4B5C] drop-shadow-[0_0_8px_rgba(255,75,92,0.3)]" :
              "text-slate-600"
        )}>
          {display.confluenceLabel || '-'}
        </td>
      )}

      {visibleCols.has('divergence') && (
        <td className={cn("px-3 py-4 text-right text-[10px] font-black uppercase whitespace-nowrap overflow-hidden", COL_WIDTHS.divergence)}>
          {(() => {
            // Show RSI crossover if available, otherwise show divergence
            const crossover = display.rsiCrossover;
            const divergence = entry.rsiPeriodAtCreation === rsiPeriod ? display.rsiDivergenceCustom : display.rsiDivergence;
            if (crossover === 'bullish_reversal') {
              return <span className="text-[#39FF14] drop-shadow-[0_0_6px_rgba(57,255,20,0.3)]" title="RSI Bullish Reversal — crossed back above oversold">↑ Rev</span>;
            }
            if (crossover === 'bearish_reversal') {
              return <span className="text-[#FF4B5C] drop-shadow-[0_0_6px_rgba(255,75,92,0.3)]" title="RSI Bearish Reversal — crossed back below overbought">↓ Rev</span>;
            }
            if (divergence === 'bullish') {
              return <span className="text-[#39FF14] drop-shadow-[0_0_6px_rgba(57,255,20,0.3)]" title="Bullish Divergence — price lower low, RSI higher low">Bull Div</span>;
            }
            if (divergence === 'bearish') {
              return <span className="text-[#FF4B5C] drop-shadow-[0_0_6px_rgba(255,75,92,0.3)]" title="Bearish Divergence — price higher high, RSI lower high">Bear Div</span>;
            }
            return <span className="text-slate-800">-</span>;
          })()}
        </td>
      )}

      {visibleCols.has('vwapDiff') && (
        <IndicatorCell
          value={display.vwapDiff}
          formatted={globalUseVwap && display.vwapDiff !== null ? formatPct(display.vwapDiff) : '-'}
          colorClass={globalUseVwap ? (display.vwapDiff! > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]") : "text-slate-700/40"}
          widthClass={COL_WIDTHS.vwap}
          intensity={true}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('longCandle') && (
        (() => {
          const hasData = globalVolatilityEnabled && display.curCandleSize != null && display.avgBarSize1m && display.avgBarSize1m > 0;
          const ratio = hasData ? display.curCandleSize! / display.avgBarSize1m! : null;
          const isTriggered = ratio !== null && ratio >= globalLongCandleThreshold;
          return (
            <IndicatorCell
              value={null}
              formatted={ratio !== null ? `${ratio.toFixed(1)}x` : '-'}
              colorClass={isTriggered ? "text-amber-400" : ratio !== null ? "text-slate-600" : "text-slate-700/40"}
              widthClass={COL_WIDTHS.signal}
              intensity={isTriggered}
            />
          );
        })()
      )}

      {visibleCols.has('volumeSpike') && (
        (() => {
          const hasData = globalVolatilityEnabled && display.curCandleVol != null && display.avgVolume1m && display.avgVolume1m > 0;
          const ratio = hasData ? display.curCandleVol! / display.avgVolume1m! : null;
          const isTriggered = ratio !== null && ratio >= globalVolumeSpikeThreshold;
          return (
            <IndicatorCell
              value={null}
              formatted={ratio !== null ? `${ratio.toFixed(1)}x` : '-'}
              colorClass={isTriggered ? "text-[#39FF14]" : ratio !== null ? "text-slate-600" : "text-slate-700/40"}
              widthClass={COL_WIDTHS.signal}
              intensity={isTriggered}
            />
          );
        })()
      )}

      {visibleCols.has('momentum') && (
        <IndicatorCell
          value={display.momentum}
          formatted={globalUseMomentum && display.momentum != null ? formatPct(display.momentum) : '-'}
          colorClass={globalUseMomentum ? (display.momentum! > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]") : "text-slate-700/40"}
          widthClass={COL_WIDTHS.momentum}
          intensity={true}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('atr') && (
        <IndicatorCell
          value={display.atr}
          formatted={display.atr != null ? formatPrice(display.atr, entry.market) : '-'}
          colorClass="text-slate-500"
          widthClass={COL_WIDTHS.atr}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('adx') && (
        <IndicatorCell
          value={display.adx}
          formatted={display.adx != null ? display.adx.toFixed(1) : '-'}
          colorClass={display.adx && display.adx >= 25 ? "text-[#39FF14]" : "text-slate-600"}
          widthClass={COL_WIDTHS.adx}
          intensity={true}
          isSyncing={isSyncing}
        />
      )}

      {visibleCols.has('fundingRate') && (
        <td className={cn("px-3 py-3 text-center overflow-hidden", COL_WIDTHS.funding)}>
          <FundingRateCellWithTooltip
            data={fundingRate ? {
              symbol: entry.symbol,
              rate: fundingRate.rate,
              annualized: fundingRate.annualized,
              markPrice: display.price,
              indexPrice: display.price,
              nextFundingTime: Date.now() + 8 * 60 * 60 * 1000,
              updatedAt: entry.updatedAt || Date.now()
            } : undefined}
            compact={true}
            showTooltip={true}
          />
        </td>
      )}

      {visibleCols.has('orderFlow') && (
        <td className={cn("px-3 py-3 text-center overflow-hidden", COL_WIDTHS.flow)}>
          <OrderFlowIndicator
            data={orderFlowData ? {
              symbol: entry.symbol,
              pressure: orderFlowData.pressure as any,
              ratio: orderFlowData.ratio,
              buyVolume1m: orderFlowData.buyVolume1m,
              sellVolume1m: orderFlowData.sellVolume1m,
              tradeCount1m: 0,
              updatedAt: entry.updatedAt || Date.now()
            } : undefined}
            compact={true}
            showTooltip={true}
          />
        </td>
      )}

      {visibleCols.has('smartMoney') && (
        <IndicatorCell
          value={smartMoneyScore?.score || null}
          formatted={smartMoneyScore ? (smartMoneyScore.score > 0 ? `+${smartMoneyScore.score}` : `${smartMoneyScore.score}`) : '-'}
          colorClass={smartMoneyScore ? (smartMoneyScore.score >= 30 ? "text-[#39FF14]" : smartMoneyScore.score <= -30 ? "text-[#FF4B5C]" : "text-slate-500") : "text-slate-800"}
          widthClass={COL_WIDTHS.smart}
          intensity={true}
        />
      )}

      {visibleCols.has('winRate') && (
        <td className={cn("px-3 py-3 text-right overflow-hidden", COL_WIDTHS.winRate)}>
          <WinRateBadge symbol={entry.symbol} className="scale-90 origin-right" />
        </td>
      )}

      <td className={cn("px-3 py-3 text-right overflow-hidden", COL_WIDTHS.signal)}>
        <SignalBadge signal={display.signal.toLowerCase() as any} />
      </td>

      {visibleCols.has('strategy') && (
        <td className={cn("px-3 py-3 text-right overflow-hidden", COL_WIDTHS.signal)}>
          <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} reasons={display.strategyReasons} entry={entry} onViewNarration={onViewNarration} />
        </td>
      )}

      <td className={cn("px-3 py-4 text-right hidden sm:table-cell", COL_WIDTHS.edit)}>
        <button
          onClick={() => onOpenSettings(entry.symbol)}
          className="p-2 text-slate-700 hover:text-[#39FF14] hover:bg-[#39FF14]/10 rounded-lg transition-all active:scale-90"
          title="Customize RSI"
        >
          <Settings size={14} />
        </button>
      </td>
    </tr>
  );
});


// ─── Editable RSI Cell (Inline Editing) ──────────────────────────

function EditableRsiCell({
  symbol,
  rsi,
  field,
  currentConfig,
  onSave,
  disabled,
  isSyncing,
  className
}: {
  symbol: string;
  rsi: number | null;
  field: string;
  currentConfig?: any;
  onSave: (symbol: string, config: any) => Promise<void>;
  disabled?: boolean;
  isSyncing?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(currentConfig?.[field] ?? 14);
  const inputRef = useRef<HTMLInputElement>(null);

  // Flash animation when RSI crosses extreme thresholds
  const prevRsiRef = useRef(rsi);
  const [rsiFlash, setRsiFlash] = useState(false);
  useEffect(() => {
    if (rsi === null || prevRsiRef.current === rsi) return;
    const prev = prevRsiRef.current;
    prevRsiRef.current = rsi;
    // Flash when entering extreme zones (≤25 or ≥75)
    if ((rsi <= 25 || rsi >= 75) && (prev === null || (prev > 25 && prev < 75))) {
      setRsiFlash(true);
      const t = setTimeout(() => setRsiFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [rsi]);

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
      <td className={cn("px-3 py-3 text-right text-xs tabular-nums font-bold font-mono text-slate-700/40", className)}>
        -
      </td>
    );
  }

  if (editing) {
    return (
      <td className={cn("px-1 py-3 text-right", className)}>
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
        "px-3 py-3 text-right text-sm tabular-nums font-bold font-mono cursor-pointer group/cell relative transition-all duration-150",
        className,
        currentPeriod !== 14 ? "bg-[#39FF14]/[0.03]" : "hover:bg-white/[0.03]",
        getRsiColor(rsi),
        isSyncing && rsi === null && "animate-pulse",
        rsiFlash && rsi !== null && rsi <= 25 && "bg-[#39FF14]/[0.12]",
        rsiFlash && rsi !== null && rsi >= 75 && "bg-[#FF4B5C]/[0.12]",
      )}
    >
      <div className="flex flex-col items-end leading-none">
        <span className={cn(
          isSyncing && rsi === null && "text-slate-800 font-normal",
          rsiFlash && "scale-110 inline-block transition-transform"
        )}>
          {isSyncing && rsi === null ? "..." : formatRsi(rsi)}
        </span>
        <span className="text-[7px] text-slate-600 font-black opacity-0 group-hover/cell:opacity-100 transition-opacity">P:{currentPeriod}</span>
      </div>
      {currentPeriod !== 14 && (
        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#39FF14]/40" title={`Custom Period: ${currentPeriod}`} />
      )}
    </td>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────

function SkeletonRows({ visibleCols }: { visibleCols: Set<string> }) {
  const stickyOffsetSym = visibleCols.has('rank') ? 88 : 40;
  const stickyOffsetPrice = visibleCols.has('rank') ? 88 + 120 : 40 + 120;

  return (
    <>
      {Array.from({ length: 15 }).map((_, i) => (
        <tr key={i} className="border-b border-white/5 h-[53px]">
          {visibleCols.has('rank') && (
            <td className={cn("px-3 py-4", COL_WIDTHS.rank)}>
              <div className="skeleton h-3 w-4 bg-white/5 animate-pulse rounded" />
            </td>
          )}
          <td className={cn("px-2 py-4", COL_WIDTHS.star)}>
            <div className="skeleton h-3 w-3 bg-white/5 animate-pulse rounded mx-auto" />
          </td>
          <td className={cn("px-3 py-4 sticky z-10 bg-[#0A0F1B]/95", COL_WIDTHS.symbol)} style={{ left: stickyOffsetSym }}>
            <div className="flex items-center gap-2">
              <div className="skeleton h-6 w-6 bg-white/5 animate-pulse rounded-full" />
              <div className="skeleton h-3 w-16 bg-white/5 animate-pulse rounded" />
            </div>
          </td>
          <td className={cn("px-3 py-4 sticky z-10 bg-[#0A0F1B]/95", COL_WIDTHS.price)} style={{ left: stickyOffsetPrice }}>
            <div className="skeleton h-3 w-20 bg-white/5 animate-pulse rounded ml-auto" />
          </td>
          <td className={cn("px-3 py-4", COL_WIDTHS.change)}>
            <div className="skeleton h-3 w-12 bg-white/5 animate-pulse rounded ml-auto" />
          </td>
          <td className={cn("px-3 py-4", COL_WIDTHS.volume)}>
            <div className="skeleton h-3 w-14 bg-white/5 animate-pulse rounded ml-auto" />
          </td>

          {/* Dynamic Cols Skeletons */}
          {Array.from(visibleCols).filter(id => !['rank'].includes(id)).map(id => {
            let width = "w-[80px]";
            if (id.startsWith('rsi')) width = COL_WIDTHS.rsi;
            else if (id.startsWith('ema')) width = COL_WIDTHS.ema;
            else if (id === 'emaCross') width = COL_WIDTHS.trend;
            else if (id === 'macdHistogram') width = COL_WIDTHS.macd;
            else if (id.startsWith('bb')) width = COL_WIDTHS.bb;
            else if (id === 'stochK') width = COL_WIDTHS.stoch;
            else if (id === 'confluence') width = COL_WIDTHS.confluence;
            else if (id === 'divergence') width = COL_WIDTHS.divergence;
            else if (id === 'momentum') width = COL_WIDTHS.momentum;
            else if (id === 'atr') width = COL_WIDTHS.atr;
            else if (id === 'adx') width = COL_WIDTHS.adx;
            else if (id === 'vwapDiff') width = COL_WIDTHS.vwap;
            else if (id === 'longCandle' || id === 'volumeSpike') width = COL_WIDTHS.signal;
            else if (id === 'fundingRate') width = COL_WIDTHS.funding;
            else if (id === 'orderFlow') width = COL_WIDTHS.flow;
            else if (id === 'smartMoney') width = COL_WIDTHS.smart;
            else if (id === 'strategy') width = COL_WIDTHS.signal;

            // Skip core cols already handled above
            if (['rank', 'symbol', 'price', 'change24h', 'volume24h'].includes(id)) return null;

            return (
              <td key={id} className={cn("px-3 py-4", width)}>
                <div className="skeleton h-3 w-12 bg-white/5 animate-pulse rounded ml-auto" />
              </td>
            );
          })}

          <td className={cn("px-3 py-4", COL_WIDTHS.signal)}>
            <div className="skeleton h-5 w-20 bg-white/5 animate-pulse rounded-lg ml-auto" />
          </td>
          <td className={cn("px-3 py-4 hidden sm:table-cell", COL_WIDTHS.edit)}>
            <div className="skeleton h-4 w-4 bg-white/5 animate-pulse rounded ml-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Column definitions ───────────────────────────────────────

type ColumnId =
  | 'rank' | 'winRate' | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h'
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
  { id: 'winRate', label: 'Win Rate', group: 'Intelligence', defaultVisible: true },
  { id: 'rsi1m', label: 'RSI 1m', group: 'RSI', defaultVisible: false },
  { id: 'rsi5m', label: 'RSI 5m', group: 'RSI', defaultVisible: false },
  { id: 'rsi15m', label: 'RSI 15m', group: 'RSI', defaultVisible: true },
  { id: 'rsi1h', label: 'RSI 1h', group: 'RSI', defaultVisible: false },
  { id: 'ema9', label: 'EMA 9', group: 'Moving Avg', defaultVisible: false },
  { id: 'ema21', label: 'EMA 21', group: 'Moving Avg', defaultVisible: false },
  { id: 'emaCross', label: 'Trend', group: 'Indicators', defaultVisible: true },
  { id: 'macdHistogram', label: 'MACD', group: 'Indicators', defaultVisible: true },
  { id: 'bbUpper', label: 'BB Upper', group: 'Volatility', defaultVisible: false },
  { id: 'bbLower', label: 'BB Lower', group: 'Volatility', defaultVisible: false },
  { id: 'bbPosition', label: 'BB Pos', group: 'Volatility', defaultVisible: false },
  { id: 'stochK', label: 'Stoch RSI', group: 'Momentum', defaultVisible: true },
  { id: 'vwapDiff', label: 'VWAP %', group: 'Volume', defaultVisible: true },
  { id: 'confluence', label: 'Confluence', group: 'Intelligence', defaultVisible: true },
  { id: 'divergence', label: 'Div / Rev', group: 'Intelligence', defaultVisible: true },
  { id: 'momentum', label: 'Momentum', group: 'Intelligence', defaultVisible: true },
  { id: 'atr', label: 'ATR', group: 'Volatility', defaultVisible: false },
  { id: 'adx', label: 'ADX', group: 'Volatility', defaultVisible: true },
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
  globalUseObv,
  globalUseWilliamsR,
  globalVolatilityEnabled,
  globalLongCandleThreshold,
  globalVolumeSpikeThreshold,
  fundingRate,
  orderFlowData,
  smartMoneyScore,
  onViewNarration,
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
  globalUseObv: boolean;
  globalUseWilliamsR: boolean;
  globalVolatilityEnabled: boolean;
  globalLongCandleThreshold: number;
  globalVolumeSpikeThreshold: number;
  fundingRate: { rate: number; annualized: number } | null;
  orderFlowData: { ratio: number; pressure: string; buyVolume1m: number; sellVolume1m: number } | null;
  smartMoneyScore: { score: number; label: string } | null;
  onViewNarration: (entry: ScreenerEntry) => void;
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
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
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
      rsiCrossover: entry.rsiCrossover,
      market: entry.market,
      adx: entry.adx,
      atr: entry.atr,
      obvTrend: (tick as any).obvTrend ?? entry.obvTrend ?? 'none',
      williamsR: (tick as any).williamsR ?? entry.williamsR ?? null,
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
        obv: globalUseObv,
        williamsR: globalUseWilliamsR,
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
      rsiDivergence: tick.rsiDivergence ?? entry.rsiDivergence,
      macdHistogram: tick.macdHistogram ?? entry.macdHistogram,
      confluence: tick.confluence ?? entry.confluence,
      confluenceLabel: tick.confluenceLabel ?? entry.confluenceLabel,
      rsiDivergenceCustom: tick.rsiDivergenceCustom ?? entry.rsiDivergenceCustom,
      rsiCrossover: tick.rsiCrossover ?? entry.rsiCrossover,
      momentum: tick.momentum ?? entry.momentum,
      atr: tick.atr ?? entry.atr,
      adx: tick.adx ?? entry.adx,
      vwapDiff: tick.vwapDiff ?? entry.vwapDiff,
      volumeSpike: (tick.volumeSpike ?? liveVolumeSpike) || entry.volumeSpike,
      stochK: tick.stochK ?? entry.stochK,
      stochD: tick.stochD ?? entry.stochD,
      bbUpper: tick.bbUpper ?? entry.bbUpper,
      bbLower: tick.bbLower ?? entry.bbLower,
      bbMiddle: tick.bbMiddle ?? entry.bbMiddle,
      vwap: tick.vwap ?? entry.vwap,
      macdLine: entry.macdLine,
      macdSignal: entry.macdSignal,
      strategyScore: tick.strategyScore ?? liveStrategy.score,
      strategySignal: (tick.strategySignal as any) ?? liveStrategy.signal,
      strategyLabel: tick.strategyScore !== undefined
        ? (tick.strategyScore >= 55 ? 'Strong Buy'
          : tick.strategyScore >= 25 ? 'Buy'
            : tick.strategyScore <= -55 ? 'Strong Sell'
              : tick.strategyScore <= -25 ? 'Sell'
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
    globalSignalThresholdMode, globalOverbought, globalOversold, globalVolumeSpikeThreshold
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
    rsiCrossover: entry.rsiCrossover,
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
          <div className="flex items-center gap-1.5">
            <div className="relative group shrink-0">
              <span className="font-black text-white text-sm tracking-tight">{getSymbolAlias(entry.symbol)}</span>
              {display.isLiveRsi && (
                <div className="absolute -left-2 top-1 w-0.5 h-0.5 rounded-full bg-[#39FF14] shadow-[0_0_3px_#39FF14] animate-pulse" title="Institutional Heartbeat" />
              )}
            </div>
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
          <div className="flex-1 flex justify-center text-[8px] text-slate-700 uppercase font-black tracking-widest">No Indicators Selected</div>
        ) : (
          activeIndicators.map(col => {
            const val = display[col.id as keyof typeof display];
            const isRsi = col.id.startsWith('rsi');

            return (
              <div key={col.id} className="flex flex-col items-center shrink-0 min-w-[32px]">
                <span className="text-[6px] font-black text-slate-600 uppercase mb-0.5">{col.label.replace('RSI ', '')}</span>
                {isRsi ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseRsi ? getRsiColor(val as number) : "text-slate-700/40")}>
                    {globalUseRsi ? formatRsi(val as number) : '-'}
                  </span>
                ) : col.id === 'strategy' ? (
                  <StrategyBadge signal={display.strategySignal} label={display.strategyLabel} entry={entry} onViewNarration={onViewNarration} />

                ) : col.id === 'winRate' ? (
                  <WinRateBadge symbol={entry.symbol} className="scale-90 origin-center" />
                ) : col.id === 'divergence' ? (
                  <span className={cn("text-[8px] font-black uppercase", (entry.rsiPeriodAtCreation === rsiPeriod ? display.rsiDivergenceCustom : display.rsiDivergence) === 'bullish' ? "text-[#39FF14]" : (entry.rsiPeriodAtCreation === rsiPeriod ? display.rsiDivergenceCustom : display.rsiDivergence) === 'bearish' ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {(entry.rsiPeriodAtCreation === rsiPeriod ? display.rsiDivergenceCustom : display.rsiDivergence) === 'bullish' ? 'DIV+' : (entry.rsiPeriodAtCreation === rsiPeriod ? display.rsiDivergenceCustom : display.rsiDivergence) === 'bearish' ? 'DIV-' : '-'}
                  </span>
                ) : col.id === 'vwapDiff' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseVwap && (val as number) > 0 ? "text-[#39FF14]" : globalUseVwap && (val as number) < 0 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {globalUseVwap ? formatPct(val as number) : '-'}
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
                    ) : '-'}
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
                    ) : '-'}
                  </span>
                ) : col.id === 'momentum' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", globalUseMomentum && (val as number) > 0 ? "text-emerald-300" : globalUseMomentum && (val as number) < 0 ? "text-red-300" : "text-slate-500")}>
                    {globalUseMomentum ? formatPct(val as number) : '-'}
                  </span>
                ) : col.id === 'ema9' || col.id === 'ema21' ? (
                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                    {globalUseEma && typeof val === 'number' ? `$${formatPrice(val, entry.market)}` : '-'}
                  </span>
                ) : col.id === 'bbUpper' || col.id === 'bbLower' ? (
                  <span className="text-[9px] font-bold text-slate-300 tabular-nums">
                    {globalUseBb && typeof val === 'number' ? `$${formatPrice(val, entry.market)}` : '-'}
                  </span>
                ) : col.id === 'macdHistogram' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", (val as number) > 0 ? "text-[#39FF14]" : (val as number) < 0 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {typeof val === 'number' ? val.toFixed(4) : '-'}
                  </span>
                ) : col.id === 'confluence' ? (
                  <span className={cn("text-[9px] font-bold tabular-nums", display.confluence >= 15 ? "text-[#39FF14]" : display.confluence <= -15 ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.confluenceLabel || '-'}
                  </span>
                ) : col.id === 'emaCross' ? (
                  <span className={cn("text-[9px] font-bold uppercase", display.emaCross === 'bullish' ? "text-[#39FF14]" : display.emaCross === 'bearish' ? "text-[#FF4B5C]" : "text-slate-700")}>
                    {display.emaCross !== 'none' ? (display.emaCross === 'bullish' ? 'BULL' : 'BEAR') : '-'}
                  </span>
                ) : col.id === 'stochK' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseStoch && (val as number) > 80 ? "text-[#FF4B5C]" : globalUseStoch && (val as number) < 20 ? "text-[#39FF14]" : "text-slate-300")}>
                    {globalUseStoch && typeof val === 'number' ? val.toFixed(1) : '-'}
                  </span>
                ) : col.id === 'bbPosition' ? (
                  <span className={cn("text-[10px] font-black tabular-nums font-mono", globalUseBb && (val as number) >= 0.9 ? "text-[#FF4B5C]" : globalUseBb && (val as number) <= 0.1 ? "text-[#39FF14]" : "text-slate-300")}>
                    {globalUseBb && typeof val === 'number' ? val.toFixed(2) : '-'}
                  </span>
                ) : col.id === 'atr' || col.id === 'adx' ? (
                  <span className="text-[10px] font-black tabular-nums font-mono text-slate-300">
                    {globalVolatilityEnabled && typeof val === 'number' ? formatIndicator(val, entry.market, col.id === 'atr' ? 4 : 1) : '-'}
                  </span>
                ) : col.id === 'fundingRate' ? (
                  <span className={cn("text-[9px] font-black tabular-nums",
                    fundingRate ? (fundingRate.rate > 0 ? "text-green-400" : fundingRate.rate < 0 ? "text-red-400" : "text-slate-500") : "text-slate-700"
                  )}>
                    {fundingRate ? `${fundingRate.rate > 0 ? '+' : ''}${(fundingRate.rate * 100).toFixed(3)}%` : '-'}
                  </span>
                ) : col.id === 'orderFlow' ? (
                  orderFlowData ? (
                    <div className="flex items-center gap-0.5">
                      <div className="w-6 h-1 rounded-full bg-slate-800 overflow-hidden flex">
                        <div className="h-full bg-green-500/60" style={{ width: `${orderFlowData.ratio * 100}%` }} />
                        <div className="h-full bg-red-500/60" style={{ width: `${(1 - orderFlowData.ratio) * 100}%` }} />
                      </div>
                    </div>
                  ) : <span className="text-slate-700 text-[9px]">-</span>
                ) : col.id === 'smartMoney' ? (
                  <span className={cn("text-[8px] font-black",
                    smartMoneyScore ? (
                      smartMoneyScore.score >= 30 ? "text-green-400" :
                        smartMoneyScore.score <= -30 ? "text-red-400" : "text-slate-500"
                    ) : "text-slate-700"
                  )}>
                    {smartMoneyScore ? `${smartMoneyScore.score > 0 ? '+' : ''}${smartMoneyScore.score}` : '-'}
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
                        : '-'}
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
                "text-sm font-black font-mono tabular-nums tracking-tighter inline-block transition-opacity duration-500",
                tick && tick.updatedAt && (Date.now() - tick.updatedAt) > 30000 ? "opacity-40" : "opacity-100"
              )}
              style={{ color: display.lastPriceChange && display.lastPriceChange > 0 ? '#39FF14' : display.lastPriceChange && display.lastPriceChange < 0 ? '#FF4B5C' : '#ffffff' }}
            >
              ${formatPrice(display.price)}
            </span>
          </div>
          <div className={cn("text-[8px] font-black font-mono tabular-nums flex items-center gap-0.5", display.change24h >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
            {display.change24h > 0 ? '+' : ''}{display.change24h.toFixed(2)}%
          </div>

          {/* Quick Indicator Sub-Bar (Mobile High Density) */}
          <div className="flex items-center gap-2 mt-1.5 opacity-80 scale-90 origin-right">
            {/* Volume Display */}
            <div className="flex flex-col items-end">
              <span className="text-[5px] font-black text-slate-600 uppercase leading-none mb-0.5">VOL</span>
              <span className="text-[7px] font-black tabular-nums leading-none text-slate-400">
                {formatVolume(display.volume24h)}
              </span>
            </div>

            {fundingRate && (
              <div className="flex flex-col items-end">
                <span className="text-[5px] font-black text-slate-600 uppercase leading-none mb-0.5">FUND</span>
                <span className={cn("text-[7px] font-black tabular-nums leading-none", fundingRate.rate > 0 ? "text-green-400" : "text-red-400")}>
                  {fundingRate.rate > 0 ? '+' : ''}{(fundingRate.rate * 100).toFixed(2)}%
                </span>
              </div>
            )}
            {orderFlowData && (
              <div className="flex flex-col items-end">
                <span className="text-[5px] font-black text-slate-600 uppercase leading-none mb-0.5">FLOW</span>
                <div className="w-10 h-0.5 rounded-full bg-slate-800 overflow-hidden flex">
                  <div className="h-full bg-green-500/60" style={{ width: `${orderFlowData.ratio * 100}%` }} />
                  <div className="h-full bg-red-500/60" style={{ width: `${(1 - orderFlowData.ratio) * 100}%` }} />
                </div>
              </div>
            )}
            {smartMoneyScore && (
              <div className="flex flex-col items-end">
                <span className="text-[5px] font-black text-slate-600 uppercase leading-none mb-0.5">SMART$</span>
                <span className={cn("text-[7px] font-black tabular-nums leading-none", smartMoneyScore.score >= 0 ? "text-green-400" : "text-red-400")}>
                  {smartMoneyScore.score > 0 ? '+' : ''}{smartMoneyScore.score}
                </span>
              </div>
            )}
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
    <div className="fixed bottom-0 left-0 right-0 z-[200] lg:hidden">
      <div className="border-t border-white/10 bg-[#080F1B]/95 backdrop-blur-md shadow-[0_-10px_20px_rgba(0,0,0,0.5)] px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between pointer-events-auto">
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
                "relative flex flex-col items-center justify-center py-1.5 px-4 rounded-xl transition-all active:scale-95",
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
  const [showAssetClassDropdown, setShowAssetClassDropdown] = useState(false);
  // ── State ──
  const [data, setData] = useState<ScreenerEntry[]>([]);
  const isMobile = useIsMobile();
  const [meta, setMeta] = useState<ScreenerResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true); // 🔥 NEW: Track first load separately
  const [error, setError] = useState<string | null>(null);
  const [geoBlocked, setGeoBlocked] = useState(false); // 🔥 NEW: Track geo-blocking
  const [apiUnavailable, setApiUnavailable] = useState(false); // 🔥 NEW: Track API failures
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
  // Disable heavy animations for large lists OR when user prefers reduced motion
  // Use useState with lazy init to avoid TDZ issues in minified bundle
  const [prefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [rsiPeriod, setRsiPeriod] = useState(14);

  // Compute useAnimations with useMemo to avoid TDZ issues in production build
  const useAnimations = useMemo(() => !prefersReducedMotion && pairCount <= 300, [prefersReducedMotion, pairCount]);
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
  const [globalThresholdsEnabled, setGlobalThresholdsEnabled] = useState(true);
  const [globalOverbought, setGlobalOverbought] = useState(80);
  const [globalOversold, setGlobalOversold] = useState(20);
  const [globalThresholdTimeframes, setGlobalThresholdTimeframes] = useState<string[]>(['1m', '5m', '15m', '1h']);
  const [globalLongCandleThreshold, setGlobalLongCandleThreshold] = useState(3.0);
  const [globalVolumeSpikeThreshold, setGlobalVolumeSpikeThreshold] = useState(3.0);
  const [globalVolatilityEnabled, setGlobalVolatilityEnabled] = useState(true);
  // ── Signal Tag Display Controls ──
  const [globalShowSignalTags, setGlobalShowSignalTags] = useState(true);
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
  const [globalUseObv, setGlobalUseObv] = useState(true);
  const [globalUseWilliamsR, setGlobalUseWilliamsR] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'alerts' | 'watchlist' | 'settings'>('home');
  const [coinConfigs, setCoinConfigs] = useState<Record<string, any>>({});
  const coinConfigsRef = useRef<Record<string, any>>({});
  const [selectedCoinForConfig, setSelectedCoinForConfig] = useState<string | null>(null);
  const [selectedNarrationEntry, setSelectedNarrationEntry] = useState<ScreenerEntry | null>(null);
  const [showNarrationModal, setShowNarrationModal] = useState(false);

  // ── Signal Narration Engine™ ──


  // ── PWA Performance Monitoring ──
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState(Date.now());

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
  const [preferencesSynced, setPreferencesSynced] = useState(false);
  const savingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const isSyncingRef = useRef(false);

  // Use a refined mount-aware hydration strategy for client-only defaults
  const [hasMounted, setHasMounted] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            // Context-aware exit: PWA drops to login, Web drops to landing page
            const isPWA = window.matchMedia('(display-mode: standalone)').matches;
            const targetUrl = isPWA ? '/login' : '/';
            router.push(targetUrl);

            // Hard reload safety for institutional lag
            if (typeof window !== 'undefined') {
              setTimeout(() => { window.location.href = targetUrl; }, 500);
            }
          }
        }
      });
    } catch (e) {
      if (typeof window !== 'undefined') {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        window.location.href = isPWA ? '/login' : '/';
      }
    }
  };

  const isOwner = session?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL || (session?.user as any)?.role === 'owner' || (session?.user as any)?.role === 'admin';

  useEffect(() => {
    setHasMounted(true);

    const loadPrefsFromServer = async () => {
      if (!session?.user?.id) return;
      try {
        const res = await fetch('/api/user/preferences');
        if (!res.ok) throw new Error('Failed to load prefs');
        const prefs = await res.json();

        if (prefs && Object.keys(prefs).length > 0) {
          isSyncingRef.current = true;
          try {
            if (prefs.watchlist) setWatchlist(new Set(prefs.watchlist));
            if (prefs.globalThresholdsEnabled !== undefined) setGlobalThresholdsEnabled(prefs.globalThresholdsEnabled);
            if (prefs.globalOverbought !== undefined) setGlobalOverbought(prefs.globalOverbought);
            if (prefs.globalOversold !== undefined) setGlobalOversold(prefs.globalOversold);
            if (prefs.globalThresholdTimeframes !== undefined) setGlobalThresholdTimeframes(prefs.globalThresholdTimeframes);
            if (prefs.globalLongCandleThreshold !== undefined) setGlobalLongCandleThreshold(prefs.globalLongCandleThreshold);
            if (prefs.globalVolumeSpikeThreshold !== undefined) setGlobalVolumeSpikeThreshold(prefs.globalVolumeSpikeThreshold);
            if (prefs.globalVolatilityEnabled !== undefined) setGlobalVolatilityEnabled(prefs.globalVolatilityEnabled);
            if (prefs.globalSignalThresholdMode !== undefined) setGlobalSignalThresholdMode(prefs.globalSignalThresholdMode as any);
            if (prefs.globalUseRsi !== undefined) setGlobalUseRsi(prefs.globalUseRsi);
            if (prefs.globalUseMacd !== undefined) setGlobalUseMacd(prefs.globalUseMacd);
            if (prefs.globalUseBb !== undefined) setGlobalUseBb(prefs.globalUseBb);
            if (prefs.globalUseStoch !== undefined) setGlobalUseStoch(prefs.globalUseStoch);
            if (prefs.globalUseEma !== undefined) setGlobalUseEma(prefs.globalUseEma);
            if (prefs.globalUseVwap !== undefined) setGlobalUseVwap(prefs.globalUseVwap);
            if (prefs.globalUseConfluence !== undefined) setGlobalUseConfluence(prefs.globalUseConfluence);
            if (prefs.globalUseDivergence !== undefined) setGlobalUseDivergence(prefs.globalUseDivergence);
            if (prefs.globalUseMomentum !== undefined) setGlobalUseMomentum(prefs.globalUseMomentum);
            if (prefs.globalUseObv !== undefined) setGlobalUseObv(prefs.globalUseObv);
            if (prefs.globalUseWilliamsR !== undefined) setGlobalUseWilliamsR(prefs.globalUseWilliamsR);
            if (prefs.visibleColumns !== undefined) setVisibleCols(new Set(prefs.visibleColumns as ColumnId[]));
            if (prefs.refreshInterval !== undefined) setRefreshInterval(prefs.refreshInterval);
            if (prefs.pairCount !== undefined) setPairCount(prefs.pairCount);
            if (prefs.smartMode !== undefined) setSmartMode(prefs.smartMode);
            if (prefs.showHeader !== undefined) setShowHeader(prefs.showHeader);
            if (prefs.rsiPeriod !== undefined) setRsiPeriod(prefs.rsiPeriod);
            if (prefs.soundEnabled !== undefined) setSoundEnabled(prefs.soundEnabled);
          } finally {
            setTimeout(() => { isSyncingRef.current = false; }, 200);
          }
          setPreferencesSynced(true);
          return;
        }
      } catch (err) {
        console.warn('[screener] Initial server-side pref sync failed, using local fallback:', err);
      }

      // ── Local Fallback (Only if server fails or is empty) ──
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
        if (window.innerWidth < 1280) setVisibleCols(new Set(['rsi15m', 'strategy']) as any);
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

      const gSTM = localStorage.getItem('crypto-rsi-global-signal-threshold-mode');
      if (gSTM === 'custom' || gSTM === 'default') setGlobalSignalThresholdMode(gSTM);

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
      loadFlag('crypto-rsi-global-use-obv', setGlobalUseObv);
      loadFlag('crypto-rsi-global-use-williamsr', setGlobalUseWilliamsR);

      setPreferencesSynced(true);
    };

    loadPrefsFromServer();

    // User Profile Click-Outside Orchestration
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // ── Multi-Tab Sync Infrastructure ──
    if (!syncChannelRef.current && typeof window !== 'undefined') {
      syncChannelRef.current = new BroadcastChannel('rsiq-state-sync');
      syncChannelRef.current.onmessage = (event) => {
        const { type, payload } = event.data;
        isSyncingRef.current = true;
        try {
          if (type === 'PREFS_UPDATED') {
            // Update local state without triggering a re-save cycle
            if (payload.globalOverbought !== undefined) setGlobalOverbought(payload.globalOverbought);
            if (payload.globalOversold !== undefined) setGlobalOversold(payload.globalOversold);
            if (payload.globalThresholdsEnabled !== undefined) {
              setGlobalThresholdsEnabled(payload.globalThresholdsEnabled);
              setAlertsEnabled(payload.globalThresholdsEnabled);
            }
            if (payload.pairCount !== undefined) setPairCount(payload.pairCount);
            if (payload.refreshInterval !== undefined) setRefreshInterval(payload.refreshInterval);
            if (payload.smartMode !== undefined) setSmartMode(payload.smartMode);
            if (payload.showHeader !== undefined) setShowHeader(payload.showHeader);
            if (payload.rsiPeriod !== undefined) setRsiPeriod(payload.rsiPeriod);
            if (payload.soundEnabled !== undefined) setSoundEnabled(payload.soundEnabled);
            if (payload.visibleColumns !== undefined) setVisibleCols(new Set(payload.visibleColumns));

            // Indicator Synching
            if (payload.globalUseRsi !== undefined) setGlobalUseRsi(payload.globalUseRsi);
            if (payload.globalUseMacd !== undefined) setGlobalUseMacd(payload.globalUseMacd);
            if (payload.globalUseBb !== undefined) setGlobalUseBb(payload.globalUseBb);
            if (payload.globalUseStoch !== undefined) setGlobalUseStoch(payload.globalUseStoch);
            if (payload.globalUseEma !== undefined) setGlobalUseEma(payload.globalUseEma);
            if (payload.globalUseVwap !== undefined) setGlobalUseVwap(payload.globalUseVwap);
            if (payload.globalUseConfluence !== undefined) setGlobalUseConfluence(payload.globalUseConfluence);
            if (payload.globalUseDivergence !== undefined) setGlobalUseDivergence(payload.globalUseDivergence);
            if (payload.globalUseMomentum !== undefined) setGlobalUseMomentum(payload.globalUseMomentum);
            if (payload.globalUseObv !== undefined) setGlobalUseObv(payload.globalUseObv);
            if (payload.globalUseWilliamsR !== undefined) setGlobalUseWilliamsR(payload.globalUseWilliamsR);
          } else if (type === 'CONFIGS_UPDATED') {
            setCoinConfigs(payload);
          } else if (type === 'WATCHLIST_UPDATED') {
            setWatchlist(new Set(payload));
          }
        } finally {
          // Reset sync flag after state updates propagate
          setTimeout(() => { isSyncingRef.current = false; }, 100);
        }
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      syncChannelRef.current?.close();
      syncChannelRef.current = null;
    };
  }, [session?.user?.id, isProfileOpen]);

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

  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);


  // Watchlist (hydrate from localStorage after mount to avoid SSR/CSR mismatch)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  // Bulk Actions State
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
  const [bulkActionConfig, setBulkActionConfig] = useState<BulkActionConfig | null>(null);
  const [showBulkConfirmation, setShowBulkConfirmation] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Live WebSocket prices
  const symbolSet = useMemo(() => {
    const baseSet = data.length > 0 ? new Set(data.map((e) => e.symbol)) : new Set<string>();

    // 🔥 Institutional Priority: Always include Watchlist symbols in the live set
    watchlist.forEach(s => baseSet.add(s));

    // Intelligent Search Candidate: If search looks like a ticker, warm it up instantly
    if (search && search.length >= 2 && search.length <= 10 && !search.includes(' ')) {
      const upper = search.toUpperCase();
      const symbol = upper.endsWith('USDT') ? upper : `${upper}USDT`;
      baseSet.add(symbol);
    }

    if (baseSet.size > 0) return baseSet;

    // Fallback: Warm up sockets with the Top 20 Majors instantly while waiting for API
    return new Set([
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT',
      'SHIBUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT', 'PEPEUSDT', 'NEARUSDT', 'LTCUSDT',
      'TRXUSDT', 'UNIUSDT', 'SUIUSDT', 'APTUSDT', 'OPUSDT'
    ]);
  }, [data, watchlist, search]);
  const liveThrottleMs = pairCount <= 100 ? 150 : pairCount <= 300 ? 250 : 400;
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

  // ── Institutional 2026 Optimization: Win Rate Symbol Registration ──
  // Registers active symbols with the global provider to allow for automatic pruning of stale data.
  const winRateContext = useWinRateContext();
  useEffect(() => {
    if (winRateContext && symbolSet.size > 0) {
      winRateContext.setActiveSymbols(symbolSet);
    }
  }, [symbolSet, winRateContext]);

  // ── PWA Performance: Track last price update for live status indicator ──
  // Use a ref to avoid triggering re-renders on every tick.
  // Update state at 2s intervals max — the LiveStatusIndicator only needs ~1s precision.
  const lastGlobalUpdateRef = useRef(Date.now());
  const lastGlobalUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (livePrices.size === 0) return;
    lastGlobalUpdateRef.current = Date.now();
    // Only schedule one pending timer at a time — cancel previous to prevent timer storms
    if (lastGlobalUpdateTimerRef.current) return;
    lastGlobalUpdateTimerRef.current = setTimeout(() => {
      setLastGlobalUpdate(lastGlobalUpdateRef.current);
      lastGlobalUpdateTimerRef.current = null;
    }, 2000);
  }, [livePrices]);

  // ── Win Rate Ribbon: read from localStorage at most every 30s ──
  // Initialize with null to avoid TDZ issues, then load in useEffect
  const [globalWinRate, setGlobalWinRate] = useState<ReturnType<typeof getGlobalWinRate> | null>(null);
  useEffect(() => {
    const update = () => setGlobalWinRate(getGlobalWinRate());
    update(); // Load immediately on mount
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
    // getGlobalWinRate is a stable imported function — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    isStale: derivativesStale,
    updateConfig: updateDerivConfig,
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
  // livePrices is intentionally NOT in the dep array — live price merging happens per-row
  // via useSymbolPrice() to avoid re-running this expensive memo on every 100ms tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const processedData = useMemo<ScreenerEntry[]>(() => {
    // ─── Phase 1: Institutional Intelligence Normalization ───
    // We prioritize the hardened backend stream (data).
    // If backend data is warming up, we use the frontend hook (marketData) as a fallback.
    const unifiedIds = new Set(data.map(d => d.symbol));
    const normalizedMarketData = (marketData || [])
      .filter(md => !unifiedIds.has(md.symbol))
      .map(md => {
        const resolvedMarket = getMarketType(md.symbol);
        const closes = md.closes || [];

        // ── Institutional 2026 Optimization: Real-Time Baseline Intelligence ──
        const rsi14 = calculateRsi(closes, 14);
        const rsi1m = closes.length >= 20 ? calculateRsi(closes.slice(-20), 14) : rsi14;
        const ema9 = latestEma(closes, 9);
        const ema21 = latestEma(closes, 21);
        const emaCross = detectEmaCross(closes, 9, 21);
        const macdRes = calculateMacd(closes, 12, 26, 9);
        const bbRes = calculateBollinger(closes, 20, 2);
        const stochRes = calculateStochRsi(closes, 14, 14, 3, 3);

        // ── Institutional 2026 Optimization: Real-Time State Seeds ──
        const rsiState1m = calculateRsiWithState(closes.length >= 20 ? closes.slice(-20) : closes, 14);
        const rsiState5m = calculateRsiWithState(closes.length >= 20 ? closes.slice(-20) : closes, 14); // Fallback to 1m data for seed
        const rsiState15m = calculateRsiWithState(closes, 14);
        const rsiState1h = calculateRsiWithState(closes, 14);
        const rsiStateCustom = calculateRsiWithState(closes, rsiPeriod);

        const ema9State = latestEmaWithState(closes, 9);
        const ema21State = latestEmaWithState(closes, 21);
        const macdState = calculateMacdWithState(closes, 12, 26, 9);

        // Calculate Volatility Context immediately
        const recentCloses = closes.slice(-20);
        const avgBarSize = recentCloses.length > 1
          ? recentCloses.reduce((acc, val, i) => i === 0 ? acc : acc + Math.abs(val - recentCloses[i - 1]), 0) / (recentCloses.length - 1)
          : 0.1;

        // Hardened Baseline Momentum & Confluence
        const roc10 = calculateROC(closes, 10) || 0;
        const baselineConfluence = calculateConfluence({
          rsi1m, rsi5m: null, rsi15m: rsi14, rsi1h: null,
          macdHistogram: macdRes?.histogram ?? 0,
          emaCross,
          stochK: stochRes?.k ?? 50,
          bbPosition: bbRes?.position ?? 0.5
        });

        // Correct VWAP Baseline
        const vwapPriceBaseline = closes.length >= 1 ? closes[closes.length - 1] : md.price || 0;
        const vwapDiff = (vwapPriceBaseline && md.price) ? ((md.price - vwapPriceBaseline) / vwapPriceBaseline) * 100 : 0;

        const momentumPriceBaseline = closes.length >= 10 ? closes[closes.length - 10] : (closes[0] || md.price || 0);

        // Immediate Strategy Scoring
        const baselineStrategy = computeStrategyScore({
          rsi1m: rsi1m,
          rsi5m: null,
          rsi15m: rsi14,
          rsi1h: null,
          emaCross,
          macdHistogram: macdRes?.histogram ?? 0,
          bbPosition: bbRes?.position ?? 0.5,
          stochK: stochRes?.k ?? 50,
          stochD: stochRes?.d ?? 50,
          vwapDiff,
          momentum: roc10,
          confluence: baselineConfluence.score,
          price: md.price || 0,
          volumeSpike: false,
          market: resolvedMarket,
          enabledIndicators: {
            rsi: true, ema: true, macd: true, bb: true, stoch: true, vwap: true,
            obv: true, williamsR: true,
          }
        });

        const entry: ScreenerEntry = {
          symbol: md.symbol,
          price: md.price,
          change24h: md.changePercent,
          volume24h: md.volume,
          rsi1m, rsi5m: null, rsi15m: rsi14, rsi1h: null, rsiCustom: rsi14,
          ema9, ema21, emaCross,
          macdLine: macdRes?.macdLine ?? null,
          macdSignal: macdRes?.signalLine ?? null,
          macdHistogram: macdRes?.histogram ?? null,
          bbUpper: bbRes?.upper ?? null,
          bbMiddle: bbRes?.middle ?? null,
          bbLower: bbRes?.lower ?? null,
          bbPosition: bbRes?.position ?? (md.price && md.sma50 ? (md.price > md.sma50 ? 0.7 : 0.3) : 0.5),
          stochK: stochRes?.k ?? null,
          stochD: stochRes?.d ?? null,
          strategyScore: baselineStrategy.score,
          strategySignal: (baselineStrategy.signal as any) || 'neutral',
          strategyLabel: baselineStrategy.label || 'Neutral',
          strategyReasons: baselineStrategy.reasons || [],
          signal: baselineStrategy.score >= 60 ? 'overbought' : baselineStrategy.score <= -60 ? 'oversold' : 'neutral',
          confluence: baselineConfluence.score,
          momentum: roc10,
          vwap: vwapPriceBaseline,
          vwapDiff,
          atr: calculateATR(closes, closes, closes, 14),
          adx: calculateADX(closes, closes, closes, 14),
          market: resolvedMarket,
          marketState: md.marketState || 'REGULAR',
          curCandleSize: 0,
          curCandleVol: 0,
          avgBarSize1m: avgBarSize,
          avgVolume1m: md.volume / 1440, // Rough 24h average fallback
          candleDirection: null,
          isLiveRsi: true,
          rsiDivergence: 'none',
          volumeSpike: false,
          longCandle: false,
          obvTrend: 'none' as const,
          williamsR: null,
          rsiPeriodAtCreation: rsiPeriod,
          rsiState1m,
          rsiState5m,
          rsiState15m,
          rsiState1h,
          rsiStateCustom,
          ema9State,
          ema21State,
          macdFastState: macdState?.fastState || null,
          macdSlowState: macdState?.slowState || null,
          macdSignalState: macdState?.signalState || null,
          momentumPriceBaseline,
          vwapPriceBaseline,
          rsiDivergenceCustom: 'none',
          signalStartedAt: Date.now(),
          updatedAt: md.updatedAt,
          open1m: vwapPriceBaseline,
          volStart1m: 0,
          historicalCloses: closes.slice(-50)
        };
        return entry;
      });

    const combinedData = [...data, ...normalizedMarketData];
    if (combinedData.length === 0) return [];

    return combinedData.map(entry => {
      // 1. Get live price data
      const live = livePrices.get(entry.symbol);

      // 2. Base merged entry
      let merged: ScreenerEntry = live ? (() => {
        // Compute live volatility booleans from real-time candle data
        const mergedAvgBar = live.avgBarSize1m ?? entry.avgBarSize1m;
        const mergedAvgVol = live.avgVolume1m ?? entry.avgVolume1m;
        const mergedCandleSize = live.curCandleSize ?? entry.curCandleSize;
        const mergedCandleVol = live.curCandleVol ?? entry.curCandleVol;
        const liveVolumeSpike = (mergedCandleVol != null && mergedAvgVol && mergedAvgVol > 0)
          ? (mergedCandleVol / mergedAvgVol) >= globalVolumeSpikeThreshold
          : (live.volumeSpike ?? entry.volumeSpike);
        const liveLongCandle = (mergedCandleSize != null && mergedAvgBar && mergedAvgBar > 0)
          ? (mergedCandleSize / mergedAvgBar) >= globalLongCandleThreshold
          : entry.longCandle;
        return {
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
          bbUpper: live.bbUpper ?? entry.bbUpper,
          bbLower: live.bbLower ?? entry.bbLower,
          bbPosition: live.bbPosition ?? entry.bbPosition,
          stochK: live.stochK ?? entry.stochK,
          stochD: live.stochD ?? entry.stochD,
          vwapDiff: live.vwapDiff ?? entry.vwapDiff,
          momentum: live.momentum ?? entry.momentum,
          atr: live.atr ?? entry.atr,
          adx: live.adx ?? entry.adx,
          strategyScore: live.strategyScore ?? entry.strategyScore,
          strategySignal: (live.strategySignal ?? entry.strategySignal) as any,
          curCandleSize: mergedCandleSize,
          curCandleVol: mergedCandleVol,
          avgBarSize1m: mergedAvgBar,
          avgVolume1m: mergedAvgVol,
          candleDirection: (live.candleDirection ?? entry.candleDirection) as any,
          volumeSpike: liveVolumeSpike,
          longCandle: liveLongCandle,
          marketState: 'OPEN',
        };
      })() : entry;

      // ─── Phase 2: Institutional Logic Overlay ───
      // We apply the same weighted strategy logic to all assets (Crypto & traditional).
      // If the backend hasn't provided a score yet (fallback mode), we calculate a local one.
      if (merged.strategyScore === 0) {
        const strat = computeStrategyScore({
          rsi1m: merged.rsi1m,
          rsi5m: merged.rsi5m,
          rsi15m: merged.rsi15m,
          rsi1h: merged.rsi1h,
          macdHistogram: merged.macdHistogram,
          bbPosition: merged.bbPosition,
          stochK: merged.stochK,
          stochD: merged.stochD,
          emaCross: merged.emaCross,
          vwapDiff: merged.vwapDiff,
          volumeSpike: merged.volumeSpike,
          price: merged.price,
          adx: merged.adx,
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
            obv: globalUseObv,
            williamsR: globalUseWilliamsR,
          }
        });
        merged = {
          ...merged,
          strategyScore: strat.score,
          strategySignal: strat.signal,
          strategyLabel: strat.label,
          strategyReasons: strat.reasons,
        };
      }

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
    data, rsiPeriod, marketData, activeAssetClass,
    globalShowSignalTags, globalUseRsi, globalSignalThresholdMode,
    coinConfigs, globalThresholdsEnabled, globalOverbought, globalOversold,
    globalUseMacd, globalUseBb, globalUseStoch, globalUseEma, globalUseVwap,
    globalUseConfluence, globalUseDivergence, globalUseMomentum,
    globalVolumeSpikeThreshold, globalLongCandleThreshold
  ]);

  // ── Signal Narration Engine™ (Institutional Intelligence) ──
  const handleViewNarration = useCallback((entry: ScreenerEntry) => {
    setSelectedNarrationEntry(entry);
    setShowNarrationModal(true);
  }, []);

  const selectedNarration = useMemo(() => {
    if (!selectedNarrationEntry) return null;
    return generateSignalNarration(selectedNarrationEntry);
  }, [selectedNarrationEntry]);

  // Intelligence: Maintain live data accuracy in the modal
  useEffect(() => {
    if (selectedNarrationEntry && showNarrationModal) {
      const liveEntry = processedData.find(e => e.symbol === selectedNarrationEntry.symbol);
      if (liveEntry) setSelectedNarrationEntry(liveEntry);
    }
  }, [processedData, showNarrationModal]);


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
          momentumPriceBaseline: entry.momentumPriceBaseline,
          vwapPriceBaseline: entry.vwapPriceBaseline,
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
          atr: entry.atr,
          adx: entry.adx,
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
          momentum: globalUseMomentum,
          obv: globalUseObv,
          williamsR: globalUseWilliamsR,
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [
    processedData, coinConfigs, watchlist, syncStates, updateSymbols, postToWorker,
    globalUseRsi, globalUseMacd, globalUseBb, globalUseStoch, globalUseEma,
    globalUseVwap, globalUseConfluence, globalUseDivergence, globalUseMomentum,
    globalUseObv, globalUseWilliamsR,
    alertsEnabled, globalThresholdsEnabled, globalLongCandleThreshold,
    globalVolumeSpikeThreshold, globalVolatilityEnabled, globalShowSignalTags,
    globalSignalThresholdMode, globalOverbought, globalOversold
  ]);

  // ── Persistence Engine: Sync to Server ──
  useEffect(() => {
    if (!preferencesSynced || !session?.user?.id || isSyncingRef.current) return;

    if (savingRef.current) clearTimeout(savingRef.current);

    savingRef.current = setTimeout(async () => {
      try {
        const body = {
          globalThresholdsEnabled,
          globalOverbought,
          globalOversold,
          globalThresholdTimeframes,
          globalLongCandleThreshold,
          globalVolumeSpikeThreshold,
          globalVolatilityEnabled,
          globalSignalThresholdMode,
          globalUseRsi,
          globalUseMacd,
          globalUseBb,
          globalUseStoch,
          globalUseEma,
          globalUseVwap,
          globalUseConfluence,
          globalUseDivergence,
          globalUseMomentum,
          globalUseObv,
          globalUseWilliamsR,
          visibleColumns: Array.from(visibleCols),
          refreshInterval,
          pairCount,
          smartMode,
          showHeader,
          rsiPeriod,
          soundEnabled,
          watchlist: Array.from(watchlist)
        };

        await fetch('/api/user/preferences', {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' }
        });

        // ── Keep localStorage as local fallback for immediate hydration ──
        localStorage.setItem('crypto-rsi-alerts-enabled', alertsEnabled ? '1' : '0');
        localStorage.setItem('crypto-rsi-sound-enabled', soundEnabled ? '1' : '0');
        localStorage.setItem('crypto-rsi-global-thresholds-enabled', globalThresholdsEnabled ? '1' : '0');
        localStorage.setItem('crypto-rsi-global-overbought', String(globalOverbought));
        localStorage.setItem('crypto-rsi-global-oversold', String(globalOversold));
        localStorage.setItem('crypto-rsi-global-timeframes', JSON.stringify(globalThresholdTimeframes));
        localStorage.setItem('crypto-rsi-global-long-candle-threshold', String(globalLongCandleThreshold));
        localStorage.setItem('crypto-rsi-global-volume-spike-threshold', String(globalVolumeSpikeThreshold));
        localStorage.setItem('crypto-rsi-global-volatility-enabled', globalVolatilityEnabled ? '1' : '0');
        localStorage.setItem('crypto-rsi-global-signal-threshold-mode', globalSignalThresholdMode);
        localStorage.setItem('crypto-rsi-refresh', String(refreshInterval));
        localStorage.setItem('crypto-rsi-pairs', String(pairCount));
        localStorage.setItem('crypto-rsi-smart-mode', smartMode ? '1' : '0');
        localStorage.setItem('crypto-rsi-show-header', showHeader ? '1' : '0');
        localStorage.setItem('crypto-rsi-period', String(rsiPeriod));
        localStorage.setItem('crypto-rsi-visible-cols', JSON.stringify(Array.from(visibleCols)));

        const saveFlag = (key: string, val: boolean) => localStorage.setItem(key, val ? '1' : '0');
        saveFlag('crypto-rsi-global-use-rsi', globalUseRsi);
        saveFlag('crypto-rsi-global-use-macd', globalUseMacd);
        saveFlag('crypto-rsi-global-use-bb', globalUseBb);
        saveFlag('crypto-rsi-global-use-stoch', globalUseStoch);
        saveFlag('crypto-rsi-global-use-ema', globalUseEma);
        saveFlag('crypto-rsi-global-use-vwap', globalUseVwap);
        saveFlag('crypto-rsi-global-use-confluence', globalUseConfluence);
        saveFlag('crypto-rsi-global-use-divergence', globalUseDivergence);
        saveFlag('crypto-rsi-global-use-momentum', globalUseMomentum);
        saveFlag('crypto-rsi-global-use-obv', globalUseObv);
        saveFlag('crypto-rsi-global-use-williamsr', globalUseWilliamsR);

        // ── Broadcast to other tabs for seamless "Zero-Lag" sync ──
        syncChannelRef.current?.postMessage({ type: 'PREFS_UPDATED', payload: body });
      } catch (err) {
        console.error('[screener] failed to sync preferences to server:', err);
      }
    }, 2000); // 2s debounce for institutional stability

    return () => {
      if (savingRef.current) clearTimeout(savingRef.current);
    };
  }, [
    preferencesSynced, session?.user?.id,
    globalThresholdsEnabled, globalOverbought, globalOversold, globalThresholdTimeframes,
    globalLongCandleThreshold, globalVolumeSpikeThreshold, globalVolatilityEnabled,
    globalSignalThresholdMode, globalUseRsi, globalUseMacd, globalUseBb, globalUseStoch,
    globalUseEma, globalUseVwap, globalUseConfluence, globalUseDivergence, globalUseMomentum,
    visibleCols, refreshInterval, pairCount, smartMode, showHeader, rsiPeriod, soundEnabled,
    watchlist,
    alertsEnabled
  ]);

  const {
    alerts,
    clearAlertHistory,
    resumeAudioContext,
    getGlobalWinRate,
    audioState,
    isAudioSuspended
  } = useAlertEngine(
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
    localStorage.setItem('crypto-rsi-global-use-obv', globalUseObv ? '1' : '0');
  }, [globalUseObv]);
  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-use-williamsr', globalUseWilliamsR ? '1' : '0');
  }, [globalUseWilliamsR]);

  useEffect(() => {
    localStorage.setItem('crypto-rsi-global-volatility-enabled', globalVolatilityEnabled ? '1' : '0');
  }, [globalVolatilityEnabled]);

  // ─── Real-time Stats Engine (Tab-Scoped) ──────────────────────
  // CRITICAL FIX: Stats are computed from the active asset class tab only,
  // so header counts exactly match what the user sees in the visible table.
  const stats = useMemo(() => {
    const MARKET_MAP: Record<string, string[]> = {
      crypto: ['Crypto'],
      forex: ['Forex'],
      metals: ['Metal'],
      stocks: ['Index', 'Stocks']
    };
    const targetMarkets = MARKET_MAP[activeAssetClass] || ['Crypto'];
    const tabData = processedData.filter(e => targetMarkets.includes(e.market));
    const total = tabData.length;
    let oversold = 0;
    let overbought = 0;
    let strongBuy = 0;
    let buy = 0;
    let neutral = 0;
    let sell = 0;
    let strongSell = 0;
    let spikeCount = 0;

    for (const entry of tabData) {
      if (entry.signal === 'oversold') oversold++;
      else if (entry.signal === 'overbought') overbought++;

      if (entry.volumeSpike || entry.longCandle) spikeCount++;

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

    const pressureDist = {
      sell: Math.round((bearish / totalSignals) * 100),
      neutral: Math.round((neutral / totalSignals) * 100),
      buy: Math.round((bullish / totalSignals) * 100),
    };

    const spikeRate = total > 0 ? spikeCount / total : 0;
    const volatilityLevel = spikeRate > 0.15 ? 'EXTREME' : spikeRate > 0.08 ? 'HIGH' : spikeRate > 0.03 ? 'MED' : 'LOW';

    return { total, oversold, overbought, strongBuy, buy, neutral, sell, strongSell, bias, pressureDist, volatilityLevel };
  }, [processedData, activeAssetClass]);


  // ─── Feed Health Aggregation (Debounced — 5s) ──────────────────
  // PERF: Feed health is informational. Computing on every livePrices tick (3/sec)
  // was wasteful. Now uses a ref-based debounce to recalculate at most once per 5s.
  const feedHealthRef = useRef({ activeFeeds: 0, staleFeeds: 0, totalFeeds: 0, activePercent: 0, status: 'healthy' as 'healthy' | 'degraded' | 'critical', oldestTickAge: 0 });
  const feedHealthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedHealth, setFeedHealth] = useState(feedHealthRef.current);

  useEffect(() => {
    if (feedHealthTimerRef.current) return; // Already scheduled
    feedHealthTimerRef.current = setTimeout(() => {
      feedHealthTimerRef.current = null;
      const now = Date.now();
      let activeFeeds = 0, staleFeeds = 0, totalFeeds = 0, oldestTickAge = 0;
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
      const next = { activeFeeds, staleFeeds, totalFeeds, activePercent, status, oldestTickAge };
      feedHealthRef.current = next;
      setFeedHealth(next);
    }, 5000);

    return () => {
      if (feedHealthTimerRef.current) {
        clearTimeout(feedHealthTimerRef.current);
        feedHealthTimerRef.current = null;
      }
    };
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

        // Gap 3: Immediately push new thresholds/periods to the worker
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

        // ── Institutional Multi-Tab Sync ──
        syncChannelRef.current?.postMessage({
          type: 'CONFIGS_UPDATED',
          payload: { ...coinConfigs, [symbol]: updated }
        });
      }
    } catch (err) {
      console.error('[screener] Failed to save config:', err);
    }
  };



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

      // Sync to other tabs
      syncChannelRef.current?.postMessage({
        type: 'WATCHLIST_UPDATED',
        payload: Array.from(next)
      });

      return next;
    });
  }, []);

  // Bulk Actions Handlers
  const toggleBulkMode = useCallback(() => {
    setBulkMode(prev => !prev);
    if (bulkMode) {
      // Exiting bulk mode - clear selections
      setSelectedSymbols(new Set());
    }
  }, [bulkMode]);

  const toggleSymbolSelection = useCallback((symbol: string) => {
    setSelectedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  }, []);

  const clearAllSelections = useCallback(() => {
    setSelectedSymbols(new Set());
  }, []);

  const handleBulkAction = useCallback((actionId: 'priority' | 'sound' | 'quietHours' | 'template') => {
    switch (actionId) {
      case 'priority':
        setBulkActionConfig({
          type: 'priority',
          priority: 'medium'
        });
        setShowBulkConfirmation(true);
        break;

      case 'sound':
        setBulkActionConfig({
          type: 'sound',
          sound: 'default'
        });
        setShowBulkConfirmation(true);
        break;

      case 'quietHours':
        setBulkActionConfig({
          type: 'quietHours',
          quietHoursEnabled: true,
          quietHoursStart: 22,
          quietHoursEnd: 8
        });
        setShowBulkConfirmation(true);
        break;

      case 'template':
        toast.info('Template selection coming soon');
        break;
    }
  }, []);

  const executeBulkAction = useCallback(async () => {
    if (!bulkActionConfig || selectedSymbols.size === 0) return;

    setIsBulkProcessing(true);

    try {
      const updates: Record<string, any> = {};

      switch (bulkActionConfig.type) {
        case 'priority':
          updates.priority = bulkActionConfig.priority;
          break;
        case 'sound':
          updates.sound = bulkActionConfig.sound;
          break;
        case 'quietHours':
          updates.quietHoursEnabled = bulkActionConfig.quietHoursEnabled;
          updates.quietHoursStart = bulkActionConfig.quietHoursStart;
          updates.quietHoursEnd = bulkActionConfig.quietHoursEnd;
          break;
      }

      const response = await fetch('/api/config/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          symbols: Array.from(selectedSymbols),
          updates
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Bulk update failed');
      }

      const result = await response.json();

      toast.success(`Updated ${result.processed} symbols successfully`, {
        description: result.failed > 0 ? `${result.failed} symbols failed to update` : undefined
      });

      // Refresh coin configs
      fetch(`/api/config?ts=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(json => setCoinConfigs(json))
        .catch(err => console.error('[screener] Failed to reload configs:', err));

      setSelectedSymbols(new Set());
      setBulkMode(false);
      setShowBulkConfirmation(false);
      setBulkActionConfig(null);

    } catch (error: any) {
      console.error('[bulk-action] Failed:', error);
      toast.error('Bulk action failed', {
        description: error.message || 'Please try again'
      });
    } finally {
      setIsBulkProcessing(false);
    }
  }, [bulkActionConfig, selectedSymbols]);

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

  // ── Fetch data (Optimized for smooth background updates) ──
  const fetchData = useCallback(async (background = false) => {
    if (background && backoffUntilRef.current && Date.now() < backoffUntilRef.current) {
      return;
    }

    const fetchToken = ++fetchTokenRef.current;
    activeFetchControllerRef.current?.abort();
    const controller = new AbortController();
    activeFetchControllerRef.current = controller;

    fetchingRef.current = true;

    // Only show spinner for initial load, not for background refreshes
    const isInitial = !background && dataLenRef.current === 0;
    if (isInitial) setRefreshing(true);
    // Background refreshes are completely silent - no UI disruption

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const requestStartedAt = Date.now();
    try {
      if (!background) {
        setError(null);
        setGeoBlocked(false);
        setApiUnavailable(false);
      }
      const timeoutMs = pairCount >= 800 ? 60_000 : pairCount >= 500 ? 55_000 : pairCount >= 300 ? 40_000 : 25_000;
      timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      const searchCandidate = (search && search.length >= 2 && search.length <= 10 && !search.includes(' '))
        ? (search.toUpperCase().endsWith('USDT') ? search.toUpperCase() : `${search.toUpperCase()}USDT`)
        : '';
      const prioritySymbols = [...new Set([
        ...Array.from(visibleSymbolsRef.current),
        ...Array.from(watchlist),
        searchCandidate
      ])].filter(Boolean).join(',');

      // The API natively resolves Yahoo symbols out of band, so we fetch EXACTLY the Crypto pair limit.
      const effectiveCount = Math.min(pairCount, entitlements.maxRecords || pairCount);
      const url = `/api/screener?count=${effectiveCount}&smart=${smartMode ? '1' : '0'}&rsiPeriod=${rsiPeriod}&search=${encodeURIComponent(search)}&prioritySymbols=${encodeURIComponent(prioritySymbols)}&exchange=${exchange}&ts=${Date.now()}`;

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

      // 🔥 NEW: Check for geo-blocking or API unavailability
      if (json.meta && (json.meta as any).geoBlocked) {
        setGeoBlocked(true);
        setApiUnavailable(true);

        // If we have cached data, keep showing it with a warning
        if (dataLenRef.current > 0) {
          toast.warning('API Geo-Blocked', {
            description: 'Exchange APIs are blocked in your region. Showing cached data. Consider using a VPN.',
            duration: 10000,
          });
          return; // Keep existing data
        }

        throw new Error('All exchanges are geo-blocked in your region. Please use a VPN or try a different network.');
      }

      // 🔥 NEW: Handle empty data with better error messages
      if (json.data.length === 0 && json.meta) {
        if ((json.meta as any).apiUnavailable || (json.meta as any).error) {
          setApiUnavailable(true);

          // If we have cached data, keep it
          if (dataLenRef.current > 0) {
            toast.warning('API Temporarily Unavailable', {
              description: 'Exchange APIs are experiencing issues. Showing cached data.',
              duration: 8000,
            });
            return; // Keep existing data
          }

          throw new Error((json.meta as any).error || 'Exchange APIs are temporarily unavailable');
        }
      }

      // 503 with data means partial result - still usable
      if (!res.ok && !(res.status === 503 && json.data?.length > 0)) {
        if (res.status === 503) {
          toast.info('Upstream Sync In Progress', {
            description: 'The institutional feed is currently calibrating with exchange nodes. System will refresh automatically.',
            duration: 5000,
          });
          // Non-fatal, just wait for next poll
          return;
        }
        throw new Error(`API error ${res.status}`);
      }

      // 🔥 OPTIMIZED: Smooth data updates using requestAnimationFrame to prevent UI freezes
      if (json.data.length > 0) {
        // Use requestAnimationFrame to batch DOM updates and prevent jank
        requestAnimationFrame(() => {
          setData(json.data);
          dataLenRef.current = json.data.length;
          setMeta(json.meta);
          setError(null);
          setGeoBlocked(false);
          setApiUnavailable(false);
        });
      } else if (dataLenRef.current === 0) {
        // No cached data and no new data - show error
        throw new Error('No data available. Please check your network connection.');
      }

      setLoading(false);
      setInitialLoad(false); // 🔥 NEW: Mark initial load complete
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
      // If a newer fetch started, this one was intentionally cancelled - discard silently.
      if (fetchToken !== fetchTokenRef.current) return;
      if (controller.signal.aborted) {
        // Client-side timeout (not an intentional cancel, since token still matches).
        // Show an error so the user knows why the table is empty.
        if (dataLenRef.current === 0) {
          setError('Connection timed out - server is slow or unreachable. Tap to retry.');
          setInitialLoad(false); // 🔥 NEW: Mark initial load complete even on error
        }
        return;
      }

      // 🔥 NEW: Better error handling - keep cached data if available
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';

      if (dataLenRef.current === 0) {
        setError(errorMessage);
        setInitialLoad(false); // 🔥 NEW: Mark initial load complete even on error
      } else {
        // We have cached data, just show a toast
        toast.error('Update Failed', {
          description: errorMessage + '. Showing cached data.',
          duration: 5000,
        });
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
  }, [pairCount, smartMode, rsiPeriod, search, exchange, handleUpgradeRequired, entitlements.maxRecords, entitlements.availableRecordOptions, syncStates, watchlist]);

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
    fetch(`/api/config?ts=${Date.now()}`, { cache: 'no-store' })
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
    // visible while the live fetch runs. Exchange mismatch is fine here -
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
        const configRes = await fetch(`/api/config?ts=${Date.now()}`, { cache: 'no-store' });
        if (configRes.ok) {
          const contentType = configRes.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const cfg = await configRes.json();
            setCoinConfigs(cfg);
          } else {
            console.warn('[screener] Config API returned non-JSON response. Likely redirect or auth error.');
          }
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

  // ── Global Interaction Monitor for Institutional Audio Resilience ──
  useEffect(() => {
    if (!hasMounted) return;

    const handleInteraction = () => {
      // Resume on first click to satisfy browser autoplay policies
      if (isAudioSuspended) {
        resumeAudioContext().then(() => {
          console.log('[screener] Audio context unlocked via interaction');
        });
      }
    };

    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [hasMounted, isAudioSuspended, resumeAudioContext]);

  // ── PWA Wake & Network Recovery ──────────────────────────────────
  useEffect(() => {
    if (!hasMounted) return;

    const handleWake = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Institutional Recovery] PWA Foregrounded. Forcing re-sync...');
        fetchDataRef.current(true);
      }
    };

    const handleOnline = () => {
      console.log('[Institutional Recovery] Network restored. Re-establishing link...');
      fetchDataRef.current(true);
    };

    window.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
      window.removeEventListener('online', handleOnline);
    };
  }, [hasMounted]);

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
  }, [exchange, hasMounted]); // removed fetchData dep - use fetchDataRef instead

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
  // Auto-switch asset class when search finds a symbol in another class
  // This must be a useEffect, NOT inside useMemo (calling setState in useMemo is a React anti-pattern)
  useEffect(() => {
    if (!search || search.length < 2) return;
    const q = search.toUpperCase();
    const itemsInCurrentTab = processedData.filter(e => {
      const targetMarkets = ({ crypto: ['Crypto'], forex: ['Forex'], metals: ['Metal'], stocks: ['Index'] })[activeAssetClass] || ['Crypto'];
      if (!targetMarkets.includes(e.market)) return false;
      const alias = getSymbolAlias(e.symbol).toUpperCase();
      return e.symbol.includes(q) || alias.includes(q);
    });
    if (itemsInCurrentTab.length === 0) {
      const matchesOverall = processedData.find(e => {
        const alias = getSymbolAlias(e.symbol).toUpperCase();
        return e.symbol.includes(q) || alias.includes(q);
      });
      if (matchesOverall) {
        const m = matchesOverall.market;
        const targetClass = m === 'Crypto' ? 'crypto' : m === 'Forex' ? 'forex' : m === 'Metal' ? 'metals' : 'stocks';
        if (targetClass !== activeAssetClass) setActiveAssetClass(targetClass);
      }
    }
  }, [search, processedData, activeAssetClass]);

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

    // ── Asset Class Filter ──
    const marketMap: Record<string, string[]> = {
      crypto: ['Crypto'],
      forex: ['Forex'],
      metals: ['Metal'],
      stocks: ['Index', 'Stocks']
    };
    const targetMarkets = marketMap[activeAssetClass] || ['Crypto'];
    items = items.filter(e => targetMarkets.includes(e.market));

    // Sort — use stable snapshot of funding/orderFlow/smartMoney to avoid re-sort on every tick
    const dir = sortDir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
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
      if (sortKey === 'fundingRate') {
        av = fundingRates.get(a.symbol)?.rate ?? -9999;
        bv = fundingRates.get(b.symbol)?.rate ?? -9999;
      }
      if (sortKey === 'orderFlow') {
        av = orderFlow.get(a.symbol)?.ratio ?? -9999;
        bv = orderFlow.get(b.symbol)?.ratio ?? -9999;
      }
      if (sortKey === 'smartMoney') {
        av = smartMoney.get(a.symbol)?.score ?? -9999;
        bv = smartMoney.get(b.symbol)?.score ?? -9999;
      }

      if (av === null || av === undefined || av === -9999) return 1;
      if (bv === null || bv === undefined || bv === -9999) return -1;
      if (av === bv) return 0;

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });

    return items;
  }, [processedData, signalFilter, search, sortKey, sortDir, showWatchlistOnly, watchlist, activeAssetClass, fundingRates, orderFlow, smartMoney]);

  // Bulk Actions: Select all visible symbols (must be after filtered is defined)
  const selectAllSymbols = useCallback(() => {
    const visibleSymbols = filtered.map(e => e.symbol);
    setSelectedSymbols(new Set(visibleSymbols));
  }, [filtered]);

  // ── 2026 UX Improvement: Live Tab Item Counts ──
  const assetClassCounts = useMemo(() => {
    const counts = { crypto: 0, forex: 0, metals: 0, stocks: 0 };
    processedData.forEach(e => {
      if (e.market === 'Crypto') counts.crypto++;
      else if (e.market === 'Forex') counts.forex++;
      else if (e.market === 'Metal') counts.metals++;
      else if (e.market === 'Index') counts.stocks++;
    });
    return counts;
  }, [processedData]);

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
    <div className="w-full px-0 lg:px-8 pt-0 lg:pt-4 pb-32 lg:py-6">
      {/* ── Loading State (Initial Load) ── */}
      {initialLoad && loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0F1B]/95 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-md px-6">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 border-4 border-[#39FF14]/20 rounded-full animate-ping" />
              <div className="absolute inset-0 border-4 border-t-[#39FF14] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
              <Activity className="absolute inset-0 m-auto text-[#39FF14]" size={32} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-white uppercase tracking-wider">Loading Market Data</h3>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600 mt-4">
                <div className="w-2 h-2 bg-[#39FF14] rounded-full animate-pulse" />
                <span>Connecting to institutional feed...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Geo-Block Error Screen ── */}
      {geoBlocked && !loading && data.length === 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0F1B]/95 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-lg px-6">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 bg-rose-500/10 rounded-full" />
              <Shield className="absolute inset-0 m-auto text-rose-400" size={48} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-rose-400 uppercase tracking-wider">Exchange APIs Blocked</h3>
              <p className="text-base text-slate-300 leading-relaxed">
                All exchange APIs are geo-restricted in your region. This is a network-level restriction imposed by the exchanges.
              </p>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 space-y-2 text-left">
                <p className="text-sm text-slate-400 font-bold">Possible Solutions:</p>
                <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
                  <li>Use a VPN to connect from a different region</li>
                  <li>Try a different network connection</li>
                  <li>Contact your network administrator</li>
                  <li>Wait and try again later (temporary blocks may clear)</li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setGeoBlocked(false);
                  setApiUnavailable(false);
                  fetchData();
                }}
                className="mt-4 px-6 py-3 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-xl text-rose-400 font-black uppercase tracking-wider transition-all"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── API Unavailable Error Screen ── */}
      {apiUnavailable && !geoBlocked && !loading && data.length === 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0F1B]/95 backdrop-blur-sm">
          <div className="text-center space-y-6 max-w-lg px-6">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 bg-amber-500/10 rounded-full" />
              <AlertTriangle className="absolute inset-0 m-auto text-amber-400" size={48} />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-amber-400 uppercase tracking-wider">Exchange APIs Unavailable</h3>
              <p className="text-base text-slate-300 leading-relaxed">
                The exchange APIs are temporarily experiencing issues. This is usually a temporary condition.
              </p>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2 text-left">
                <p className="text-sm text-slate-400 font-bold">What's Happening:</p>
                <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
                  <li>Exchange servers may be under maintenance</li>
                  <li>High traffic causing temporary outages</li>
                  <li>Network connectivity issues</li>
                  <li>Rate limits exceeded (will auto-recover)</li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setApiUnavailable(false);
                  fetchData();
                }}
                className="mt-4 px-6 py-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-xl text-amber-400 font-black uppercase tracking-wider transition-all"
              >
                Retry Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Silent Background Refresh (No Visible Overlay) ── */}
      {/* Refresh happens silently in the background without disrupting the user experience */}
      {/* Status is shown only in the subtle header indicator */}

      {/* ── Connection Status Indicator (Always Visible in Header) ── */}
      {/* This will be integrated into the existing header health indicator */}

      {/* ── Sticky Institutional Command Center (4-Row Architecture) ── */}
      {showHeader && (
        <header className="sticky top-0 z-[40] mb-4 lg:mb-6 rounded-none lg:rounded-b-3xl border-b border-x-0 lg:border-x border-white/10 bg-[#080F1B]/95 backdrop-blur-3xl px-3 py-2 sm:px-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300">
          {/* Subtle Dynamic Hub Glow */}
          <div className="absolute inset-0 overflow-hidden rounded-b-3xl pointer-events-none">
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#39FF14]/[0.03] rounded-full -mr-32 -mt-32 blur-[100px]" />
          </div>

          <div className="flex flex-col gap-2.5 lg:gap-3.5 relative z-10 w-full">

            {/* ROW 1: STRATEGIC IDENTITY & COMMAND SEARCH */}
            <div className="hidden lg:flex items-center justify-between gap-4 h-10">
              <div className="flex items-center gap-4 bg-black/40 border border-white/5 rounded-2xl p-0.5 pl-3 pr-0.5 shadow-inner h-full shrink-0">
                <Link href="/" className="flex items-center gap-3 group px-1">
                  <div className="relative w-28 h-7 transition-all group-hover:scale-105 active:scale-95">
                    <Image src="/logo/rsiq-mindscapeanalytics.png" alt="RSIQ Pro" fill priority className="object-contain" />
                  </div>
                </Link>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex bg-slate-900/60 rounded-xl p-0.5 border border-white/5">
                  {[
                    { id: 'binance', label: 'BIN' },
                    { id: 'bybit', label: 'BYB' },
                    { id: 'bybit-linear', label: 'PRP' }
                  ].map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => setExchange(ex.id)}
                      className={cn(
                        "px-2.5 py-1 text-[7px] font-black uppercase rounded-lg transition-all",
                        exchange === ex.id ? "bg-white/10 text-white shadow-sm" : "text-slate-600 hover:text-slate-400"
                      )}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
                <div className="h-4 w-px bg-white/10" />
                <LiveStatusIndicator lastUpdate={lastGlobalUpdate} isConnected={isConnected} />
              </div>

              <div className="relative flex-1 max-w-[480px] h-full">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="COMMAND SEARCH (SYM, ASSET, CLASS)..."
                  className="w-full h-full pl-10 pr-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] bg-black/40 border border-white/10 rounded-2xl text-[#39FF14] placeholder:text-slate-800 focus:outline-none focus:border-[#39FF14]/40 focus:bg-black/60 transition-all shadow-inner"
                />
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-700" />
              </div>

              <div className="flex items-center gap-2 h-full">
                <div className="flex items-center bg-black/40 border border-white/5 rounded-2xl p-0.5 h-full shadow-inner">
                  <div className="flex items-center gap-2 px-3 h-full border-r border-white/5 relative group/health">
                    <motion.div
                      animate={{
                        opacity: (isConnected && !derivativesStale) ? [1, 0.4, 1] : 1,
                        scale: (isConnected && !derivativesStale) ? [1, 1.2, 1] : 1
                      }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all duration-500",
                        !isConnected ? "bg-slate-700" :
                          (isAudioSuspended && soundEnabled) ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.8)]" :
                            (derivativesStale ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" : "bg-[#39FF14] shadow-[0_0_8px_#39FF14]")
                      )}
                    />
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-[7px] font-black uppercase tracking-[0.2em] leading-none transition-colors",
                        (isAudioSuspended && soundEnabled && isConnected) ? "text-amber-400" : "text-slate-600"
                      )}>
                        {!isConnected ? "Offline" :
                          (isAudioSuspended && soundEnabled) ? "Audio Muted" :
                            (derivativesStale ? "Syncing" : "Ultra-Live")}
                      </span>
                      {isConnected && !derivativesStale && (
                        <span className="text-[5px] font-bold text-[#39FF14]/50 uppercase tracking-tighter mt-0.5">
                          {isAudioSuspended && soundEnabled ? "Tap to enable sound" : "Verified"}
                        </span>
                      )}
                    </div>

                    {/* Pro Health Tooltip */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 p-2 bg-[#0A0E17] border border-white/10 rounded-xl shadow-2xl opacity-0 group-hover/health:opacity-100 transition-opacity pointer-events-none z-[100]">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase">Price Engine</span>
                          <span className={cn("text-[7px] font-bold", isConnected ? "text-[#39FF14]" : "text-slate-600")}>{isConnected ? "Connected" : "Idle"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase">Intel Heartbeat</span>
                          <span className={cn("text-[7px] font-bold", !derivativesStale ? "text-[#39FF14]" : "text-amber-500")}>{!derivativesStale ? "Active" : "Re-syncing..."}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[7px] font-black text-slate-500 uppercase">Audio Stream</span>
                          <span className={cn("text-[7px] font-bold", !isAudioSuspended ? "text-[#39FF14]" : "text-amber-500")}>
                            {audioState === 'running' ? 'Active' : audioState === 'suspended' ? 'Blocked' : 'Idle'}
                          </span>
                        </div>
                        {processedData.length > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[7px] font-black text-slate-500 uppercase">Indicator Coverage</span>
                            <span className={cn("text-[7px] font-bold tabular-nums", indicatorReadyCount / processedData.length >= 0.8 ? "text-[#39FF14]" : "text-amber-500")}>
                              {indicatorReadyCount}/{processedData.length} ({Math.round(indicatorReadyCount / processedData.length * 100)}%)
                            </span>
                          </div>
                        )}
                        <div className="pt-1 border-t border-white/5">
                          <p className="text-[6px] text-slate-600 leading-tight">Institutional-grade monitoring ensures zero-gap data liveness across all derivatives streams.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => fetchData()} className="w-10 h-full flex flex-col items-center justify-center rounded-xl hover:bg-white/5 text-slate-500 hover:text-[#39FF14] transition-all group">
                    <RefreshCcw size={12} className={cn("transition-transform duration-700", refreshing && "animate-spin")} />
                    <span className="text-[6px] font-black mt-0.5 tabular-nums text-slate-600 font-mono tracking-tighter">{countdown}S</span>
                  </button>
                </div>

                {/* Live Engine Status Badge */}
                <div className="flex items-center gap-2 px-3 py-1 bg-black/60 border border-white/[0.06] rounded-lg ml-1">
                  <span className={cn("text-[10px] leading-none", isConnected ? "text-[#39FF14]" : "text-slate-600")}>✓</span>
                  <span className="text-slate-400 text-[8px] font-black uppercase tracking-[0.15em] whitespace-nowrap">
                    Engine <span className={isConnected ? "text-[#39FF14]" : "text-slate-600"}>{isConnected ? "Live" : "Offline"}</span>
                    {data.length > 0 && <span className="text-slate-600 ml-1">({data.length} pairs)</span>}
                  </span>
                </div>

                <div className="h-4 w-px bg-white/10 mx-1" />

                <div className="flex items-center gap-1.5 h-full">
                  <button
                    onClick={() => setShowAlertPanel(!showAlertPanel)}
                    className={cn(
                      "h-full px-3 rounded-2xl border transition-all flex items-center gap-1.5",
                      showAlertPanel ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.1)]" : "bg-white/5 border-white/10 text-slate-500 hover:text-white"
                    )}
                    title="Intelligence Alerts Panel"
                  >
                    <div className="relative">
                      <Bell size={14} className={alerts.length > 0 && !showAlertPanel ? "animate-pulse" : ""} />
                      {alerts.length > 0 && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF4B5C] shadow-[0_0_5px_#FF4B5C]" />
                      )}
                    </div>
                    {alerts.length > 0 && <span className="text-[10px] font-black">{alerts.length}</span>}
                  </button>
                  <button
                    onClick={() => setAlertsEnabled(!alertsEnabled)}
                    className={cn(
                      "h-full px-3 rounded-2xl border transition-all",
                      alertsEnabled ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.1)]" : "bg-white/5 border-white/10 text-slate-500 hover:text-white"
                    )}
                    title={alertsEnabled ? "Global Alerts Enabled" : "Global Alerts Muted"}
                  >
                    {alertsEnabled ? <Zap size={14} /> : <ZapOff size={14} />}
                  </button>
                  <button onClick={() => setShowGlobalSettings(true)} className="h-full px-3 rounded-2xl border border-white/10 bg-white/5 text-slate-500 hover:text-[#39FF14] hover:bg-[#39FF14]/5 transition-all" title="Institutional Interface Settings"><Settings size={14} /></button>

                  {/* Bulk Actions Button */}
                  <button
                    onClick={toggleBulkMode}
                    className={cn(
                      "h-full px-3 rounded-2xl border transition-all",
                      bulkMode
                        ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.1)]"
                        : "bg-white/5 border-white/10 text-slate-500 hover:text-[#39FF14] hover:bg-[#39FF14]/5"
                    )}
                    title={bulkMode ? "Exit Bulk Mode" : "Bulk Actions"}
                  >
                    {bulkMode ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>

                  {/* Global Win Rate Badge */}
                  <GlobalWinRateBadge />

                  <div className="relative h-full" ref={profileRef}>
                    <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="h-full w-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center hover:border-[#39FF14]/30 transition-all text-slate-500 hover:text-white group">
                      <UserIcon size={16} className="group-hover:scale-110 transition-transform" />
                    </button>
                    <AnimatePresence>
                      {isProfileOpen && session && (
                        <UserProfileDropdown session={session} isOwner={isOwner} onLogout={handleSignOut} isLoggingOut={isLoggingOut} onClose={() => setIsProfileOpen(false)} onShowGlobalSettings={() => setShowGlobalSettings(true)} />
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>


            {/* ROW 2: STRATEGIC PULSE & INTEL RIBBON */}
            <div className="hidden lg:flex items-center gap-3 h-10 mb-1.5">
              {/* Enhanced Asset Class Dropdown with Icons & Names */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowAssetClassDropdown(!showAssetClassDropdown)}
                  className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-2xl px-4 py-2 shadow-inner h-full hover:bg-white/5 transition-all group"
                >
                  <span className="text-base">
                    {activeAssetClass === 'crypto' ? '₿' : activeAssetClass === 'forex' ? '💱' : activeAssetClass === 'metals' ? '🥇' : '📈'}
                  </span>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">
                    {activeAssetClass === 'crypto' ? 'Crypto' : activeAssetClass === 'forex' ? 'Forex' : activeAssetClass === 'metals' ? 'Metals' : 'Stocks'}
                  </span>
                  <span className="text-[8px] font-mono text-slate-500 tabular-nums">
                    {assetClassCounts[activeAssetClass]}
                  </span>
                  <ChevronDown size={12} className={cn("text-slate-500 transition-transform", showAssetClassDropdown && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {showAssetClassDropdown && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute top-full mt-2 left-0 z-[100] min-w-[220px] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2"
                    >
                      {[
                        { id: 'crypto' as const, icon: '₿', label: 'Crypto', desc: 'Digital Assets', count: assetClassCounts.crypto },
                        { id: 'forex' as const, icon: '💱', label: 'Forex', desc: 'Currency Pairs', count: assetClassCounts.forex },
                        { id: 'metals' as const, icon: '🥇', label: 'Metals', desc: 'Precious & Industrial', count: assetClassCounts.metals },
                        { id: 'stocks' as const, icon: '📈', label: 'Stocks', desc: 'Equities & Indices', count: assetClassCounts.stocks },
                      ].map((ac) => (
                        <button
                          key={ac.id}
                          onClick={() => { setActiveAssetClass(ac.id); setShowAssetClassDropdown(false); }}
                          disabled={ac.count === 0}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group",
                            activeAssetClass === ac.id
                              ? "bg-[#39FF14]/10 text-[#39FF14]"
                              : ac.count > 0
                                ? "text-slate-300 hover:bg-white/5 hover:text-white"
                                : "text-slate-700 opacity-40 cursor-not-allowed"
                          )}
                        >
                          <span className="text-xl">{ac.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-black uppercase tracking-wider">{ac.label}</span>
                              <span className={cn(
                                "text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded-md",
                                activeAssetClass === ac.id
                                  ? "bg-[#39FF14]/20 text-[#39FF14]"
                                  : "bg-white/5 text-slate-500"
                              )}>
                                {ac.count}
                              </span>
                            </div>
                            <span className="text-[8px] text-slate-500 font-medium">{ac.desc}</span>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 flex items-center bg-black/40 border border-white/5 rounded-2xl px-4 gap-6 h-full shadow-inner backdrop-blur-md">
                {/* Liquidation Signal Heat */}
                <div className="flex items-center gap-2 group cursor-help shrink-0" title="5-Minute Aggregated Liquidation Data">
                  <Flame size={13} className="text-orange-500 animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-[6px] font-black text-slate-600 uppercase leading-none tracking-widest mb-0.5">Liq Flux</span>
                    <div className="flex items-center gap-2 text-[9px] font-mono font-black tabular-nums">
                      <span className="text-red-500">-${Math.round((liquidations.filter((l: LiquidationEvent) => (Date.now() - l.timestamp) < 300000).reduce((acc: number, l: LiquidationEvent) => acc + (l.side === 'Sell' ? l.valueUsd : 0), 0)) / 1000)}K</span>
                      <span className="text-emerald-500">+${Math.round((liquidations.filter((l: LiquidationEvent) => (Date.now() - l.timestamp) < 300000).reduce((acc: number, l: LiquidationEvent) => acc + (l.side === 'Buy' ? l.valueUsd : 0), 0)) / 1000)}K</span>
                    </div>
                  </div>
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Combined Pressure & Bias Indicators */}
                <div className="flex items-center gap-6 flex-1 max-w-[300px]">
                  <div className="flex-1 flex flex-col gap-1" title="Smart Money Orderflow vs Retail Dispersion">
                    <div className="flex items-center justify-between">
                      <span className="text-[6px] font-black text-slate-600 uppercase tracking-widest leading-none">Pressure</span>
                      <span className="text-[8px] font-black tabular-nums text-slate-400">84%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden flex shadow-inner">
                      <div className="h-full bg-red-500/70" style={{ width: '22%' }} />
                      <div className="h-full bg-slate-800" style={{ width: '40%' }} />
                      <div className="h-full bg-[#39FF14]/70" style={{ width: '38%' }} />
                    </div>
                  </div>

                  <div className="flex flex-col items-center min-w-[40px]">
                    <span className="text-[6px] font-black text-slate-600 uppercase tracking-widest leading-none mb-0.5">Bias</span>
                    <span className={cn("text-[9px] font-black tabular-nums font-mono", stats.bias >= 0 ? "text-[#39FF14]" : "text-rose-500")}>
                      {stats.bias > 0 ? '+' : ''}{stats.bias}%
                    </span>
                  </div>

                  <div className="flex flex-col items-center min-w-[50px]">
                    <span className="text-[6px] font-black text-slate-600 uppercase tracking-widest leading-none mb-0.5">Sentiment</span>
                    <div className="flex items-center gap-1.5">
                      <Gauge size={10} className={fearGreedColor} />
                      <span className={cn("text-[9px] font-black tabular-nums", fearGreedColor)}>{fearGreedScore}</span>
                    </div>
                  </div>

                  <div className="h-4 w-px bg-white/5" />

                  <div className="flex flex-col items-center min-w-[35px]">
                    <span className="text-[6px] font-black text-slate-600 uppercase tracking-widest leading-none mb-0.5">Vol</span>
                    <span className="text-[9px] font-black tabular-nums text-[#39FF14] animate-pulse">HIGH</span>
                  </div>
                </div>

                <div className="h-4 w-px bg-white/10" />

                {/* Signal Density (Oversold/Bought Ribbon - Compact) */}
                <div className="flex-1 flex items-center justify-between gap-1 overflow-hidden">
                  {[
                    { label: "OS", value: stats.oversold, color: "text-emerald-400", onClick: showMostOversold, id: 'oversold' },
                    { label: "SB", value: stats.strongBuy, color: "text-blue-400", onClick: showStrongBuys, id: 'strong-buy' },
                    { label: "B", value: stats.buy, color: "text-emerald-400/80", onClick: showBuys, id: 'buy' },
                    { label: "N", value: stats.neutral, color: "text-slate-500", onClick: showNeutrals, id: 'neutral' },
                    { label: "S", value: stats.sell, color: "text-rose-400/80", onClick: showSells, id: 'sell' },
                    { label: "SS", value: stats.strongSell, color: "text-red-400", onClick: showStrongSells, id: 'strong-sell' },
                    { label: "OB", id: 'overbought', value: stats.overbought, color: "text-rose-400", onClick: showMostOverbought },
                  ].map((s) => (
                    <button
                      key={s.label} onClick={s.onClick}
                      className={cn(
                        "flex flex-col items-center justify-center min-w-[28px] px-1 py-0.5 rounded-lg transition-all border border-transparent",
                        signalFilter === s.id ? "bg-[#39FF14]/10 border-[#39FF14]/20" : "hover:bg-white/5"
                      )}
                    >
                      <span className="text-[6px] font-black text-slate-600 uppercase tracking-tighter mb-0.5">{s.label}</span>
                      <span className={cn("text-[9px] font-black tabular-nums leading-none", s.color)}><Counter value={s.value} /></span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ROW 3: OPERATIONAL UTILITIES & DYNAMICS */}
            <div className="hidden lg:flex items-center gap-3 h-9">
              {/* Institutional Action Cluster */}
              <div className="flex items-center bg-black/40 border border-white/5 rounded-xl p-0.5 h-full shadow-inner shrink-0">
                <button onClick={() => setShowWatchlistOnly(!showWatchlistOnly)} className={cn("h-full px-3 rounded-xl flex items-center gap-2 transition-all group", showWatchlistOnly ? "bg-yellow-500/10 text-yellow-400" : "text-slate-500 hover:text-slate-300")}>
                  <Star size={12} fill={showWatchlistOnly ? "currentColor" : "none"} />
                  <span className="text-[7.5px] font-black uppercase tracking-wider">W/L</span>
                </button>
                <div className="h-4 w-px bg-white/10" />
                <button onClick={() => setShowCorrelation(!showCorrelation)} className={cn("h-full px-3 rounded-xl flex items-center gap-2 transition-all", showCorrelation ? "bg-violet-500/10 text-violet-400" : "text-slate-500 hover:text-slate-300")}>
                  <LinkIcon size={12} />
                  <span className="text-[7.5px] font-black uppercase tracking-wider">CORR</span>
                </button>
                <div className="h-4 w-px bg-white/10" />
                <button onClick={() => setShowPortfolio(true)} className={cn("h-full px-3 rounded-xl flex items-center gap-2 transition-all", showPortfolio ? "bg-cyan-500/10 text-cyan-400" : "text-slate-500 hover:text-slate-300")}>
                  <Shield size={12} />
                  <span className="text-[7.5px] font-black uppercase tracking-wider">RISK</span>
                </button>
                <div className="h-4 w-px bg-white/10" />
                <button onClick={handleExportCsv} className="h-full px-3 rounded-xl text-slate-500 hover:text-white transition-all flex items-center group/exp" title="Export Market Data">
                  <Download size={12} className="group-hover/exp:translate-y-0.5 transition-transform" />
                  <span className="text-[7.5px] font-black uppercase tracking-wider ml-2">CSV</span>
                </button>
              </div>

              <div className="flex-1 overflow-hidden h-full bg-black/30 border border-white/5 rounded-xl flex items-center px-4 relative">
                <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#080F1B] to-transparent z-10" />
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#080F1B] to-transparent z-10" />
                <div className="animate-marquee flex gap-12 items-center">
                  {[...topMovers.gainers, ...topMovers.losers, ...topMovers.gainers, ...topMovers.losers].map((mover, i) => (
                    <div key={i} className="flex items-center gap-2.5 whitespace-nowrap group/mover cursor-pointer hover:bg-white/5 px-2 py-0.5 rounded-lg transition-all border border-transparent hover:border-white/5">
                      <span className="text-[9px] font-black text-slate-400 font-mono tracking-tighter group-hover/mover:text-white uppercase">{getSymbolAlias(mover.symbol)}</span>
                      <div className="flex items-center gap-1">
                        {mover.change24h >= 0 ? <TrendingUp size={9} className="text-[#39FF14]" /> : <TrendingDown size={9} className="text-rose-500" />}
                        <span className={cn("text-[10px] font-black tabular-nums", mover.change24h >= 0 ? "text-[#39FF14]" : "text-rose-500")}>
                          {mover.change24h > 0 ? '+' : ''}{mover.change24h.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* High-Density Row & Col Orchestration */}
              <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded-xl p-0.5 h-full px-2">
                <div className="flex items-center gap-0.5">
                  {[100, 300, 500].map(cnt => (
                    <button key={cnt} onClick={() => handlePairCountChange(cnt)} className={cn("px-2 py-0.5 h-full text-[8px] font-black uppercase rounded-lg transition-all", pairCount === cnt ? "bg-white text-black" : "text-slate-600 hover:text-slate-400")}>
                      {cnt}
                    </button>
                  ))}
                </div>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <button onClick={() => setShowGlobalSettings(true)} className="px-2.5 py-1 sm:px-2 sm:py-0.5 h-full text-[8px] font-black uppercase text-slate-500 hover:text-[#39FF14] flex items-center gap-1.5 transition-all" title="Configure visible columns and system parameters">
                  <LayoutGrid size={11} />
                  Cols
                </button>
                <div className="h-4 w-px bg-white/10 mx-1" />
                <div className="flex items-center gap-2 px-1 h-full text-[8px] font-black uppercase text-slate-500">
                  <span>RSI</span>
                  <input type="range" min="2" max="50" value={rsiPeriod} onChange={(e) => setRsiPeriod(Number(e.target.value))} className="w-14 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39FF14]" />
                  <span className="text-[#39FF14] tabular-nums w-4 text-center">{rsiPeriod}</span>
                </div>
              </div>
            </div>

            {/* ─── MOBILE COMMAND CENTER (Enterprise Architecture) ─── */}
            <div className="lg:hidden flex flex-col gap-2 relative z-10 w-full">
              {/* COMPACT COMMAND BAR (Mobile Row 1: Identity & Connectivity) */}
              <div className="flex items-center justify-between gap-3 h-10 px-1">
                <Link href="/" className="flex items-center active:scale-95 transition-all">
                  <div className="relative w-28 h-6 -ml-1">
                    <Image src="/logo/rsiq-mindscapeanalytics.png" alt="RSIQ Pro" fill className="object-contain" />
                  </div>
                </Link>

                <div className="flex items-center gap-1.5 h-full">
                  {/* Mobile Live Status */}
                  <div className="flex items-center bg-black/40 border border-white/5 rounded-xl px-2.5 h-full shadow-inner">
                    <motion.div
                      animate={{
                        opacity: (isConnected && !derivativesStale) ? [0.4, 1, 0.4] : 1,
                        scale: (isConnected && !derivativesStale) ? [0.9, 1.1, 0.9] : 1
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all duration-300",
                        !isConnected ? "bg-slate-700" :
                          (isAudioSuspended && soundEnabled) ? "bg-amber-400" :
                            (derivativesStale ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.5)]")
                      )}
                    />
                    <span className={cn(
                      "text-[7px] font-black tabular-nums uppercase tracking-widest ml-1.5 transition-colors",
                      (isAudioSuspended && soundEnabled && isConnected) ? "text-amber-400" : "text-slate-500"
                    )}>
                      {(!isConnected || derivativesStale) ? "SYNC" : "LIVE"}
                    </span>
                  </div>

                  {/* Alert bell with count */}
                  <button
                    onClick={() => { setShowAlertPanel(true); }}
                    className={cn(
                      "relative w-10 h-full flex items-center justify-center rounded-xl border transition-all active:scale-90",
                      alerts.length > 0 ? "bg-[#FF4B5C]/10 border-[#FF4B5C]/20 text-[#FF4B5C]" : "bg-white/5 border-white/10 text-slate-500"
                    )}
                  >
                    <Bell size={15} className={alerts.length > 0 ? "animate-pulse" : ""} />
                    {alerts.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#FF4B5C] rounded-full border-2 border-[#090F1A] text-[7px] font-black text-white flex items-center justify-center">
                        {alerts.length > 9 ? '9+' : alerts.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setShowMobileMenu(true)}
                    className="w-10 h-full flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 active:scale-90 transition-all"
                  >
                    <Menu size={16} />
                  </button>
                </div>
              </div>

              {/* TACTICAL SEARCH (Mobile Row 2) */}
              <div className="relative h-9">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="TACTICAL SEARCH (SYM, ASSET)..."
                  className="w-full h-full pl-9 pr-4 text-[9px] font-black uppercase tracking-[0.1em] bg-black/60 border border-white/10 rounded-xl text-[#39FF14] placeholder:text-slate-800 transition-all focus:border-[#39FF14]/30 shadow-inner"
                />
                <Search size={12} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-700 font-black" />
              </div>

              {/* INTEL RIBBON (Mobile Row 3: Live Stats - Horizontally Scrollable) */}
              <div className="flex items-center gap-4 bg-black/20 border-t border-white/5 -mx-3 px-4 py-2 mt-0.5 overflow-x-auto no-scrollbar shadow-inner">
                {/* Liq Flux */}
                <div className="flex items-center gap-2 shrink-0 border-r border-white/5 pr-4">
                  <Flame size={12} className="text-orange-500" />
                  <div className="flex flex-col">
                    <span className="text-[5px] font-black text-slate-600 uppercase tracking-widest leading-none">Liq Flux</span>
                    <div className="flex items-center gap-2 text-[8px] font-mono font-black tabular-nums leading-none mt-0.5">
                      <span className="text-red-500">-${Math.round((liquidations.filter((l: LiquidationEvent) => (Date.now() - l.timestamp) < 300000).reduce((acc: number, l: LiquidationEvent) => acc + (l.side === 'Sell' ? l.valueUsd : 0), 0)) / 1000)}K</span>
                      <span className="text-emerald-500">+${Math.round((liquidations.filter((l: LiquidationEvent) => (Date.now() - l.timestamp) < 300000).reduce((acc: number, l: LiquidationEvent) => acc + (l.side === 'Buy' ? l.valueUsd : 0), 0)) / 1000)}K</span>
                    </div>
                  </div>
                </div>

                {/* Pressure */}
                <div className="flex flex-col shrink-0 min-w-[80px] border-r border-white/5 pr-4">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[5px] font-black text-slate-600 uppercase tracking-widest leading-none">Pressure</span>
                    <span className={cn("text-[7px] font-black tabular-nums leading-none", stats.bias >= 0 ? "text-[#39FF14]" : "text-rose-500")}>
                      {Math.abs(stats.bias)}%
                    </span>
                  </div>
                  <div className="w-full h-0.5 bg-slate-900 rounded-full overflow-hidden flex">
                    <div className="h-full bg-rose-500/70" style={{ width: `${stats.pressureDist.sell}%` }} />
                    <div className="h-full bg-slate-800" style={{ width: `${stats.pressureDist.neutral}%` }} />
                    <div className="h-full bg-[#39FF14]/70" style={{ width: `${stats.pressureDist.buy}%` }} />
                  </div>
                </div>

                {/* Bias */}
                <div className="flex flex-col items-center shrink-0 border-r border-white/5 pr-4">
                  <span className="text-[5px] font-black text-slate-600 uppercase tracking-widest leading-none">Bias</span>
                  <span className={cn("text-[9px] font-black tabular-nums font-mono leading-none mt-0.5", stats.bias >= 0 ? "text-[#39FF14]" : "text-rose-500")}>
                    {stats.bias > 0 ? '+' : ''}{stats.bias}%
                  </span>
                </div>

                {/* Sentiment */}
                <div className="flex flex-col items-center shrink-0 border-r border-white/5 pr-4">
                  <span className="text-[5px] font-black text-slate-600 uppercase tracking-widest leading-none">Sentiment</span>
                  <div className="flex items-center gap-1 leading-none mt-0.5">
                    <Gauge size={10} className={fearGreedColor} />
                    <span className={cn("text-[9px] font-black tabular-nums font-mono", fearGreedColor)}>{fearGreedScore}</span>
                  </div>
                </div>

                {/* Vol */}
                <div className="flex flex-col items-center shrink-0 pr-1">
                  <span className="text-[5px] font-black text-slate-600 uppercase tracking-widest leading-none">Vol</span>
                  <span className={cn(
                    "text-[8px] font-black tabular-nums leading-none mt-0.5 animate-pulse",
                    stats.volatilityLevel === 'EXTREME' ? "text-rose-500" :
                      stats.volatilityLevel === 'HIGH' ? "text-orange-500" :
                        stats.volatilityLevel === 'MED' ? "text-yellow-400" : "text-[#39FF14]/70"
                  )}>
                    {stats.volatilityLevel}
                  </span>
                </div>

              </div>
            </div>


          </div>
        </header>
      )}

      {/* ─── DERIVATIVES INTELLIGENCE PANEL (MINIMIZED) ─── */}
      <div className="mb-6 opacity-90 hover:opacity-100 transition-opacity">
        <DerivativesPanel
          fundingRates={fundingRates}
          liquidations={liquidations}
          whaleAlerts={whaleAlerts}
          orderFlow={orderFlow}
          openInterest={openInterest}
          smartMoney={smartMoney}
          isConnected={derivativesConnected}
          onUpdateConfig={updateDerivConfig}
        />
      </div>

      {/* ─── SIGNAL WIN RATE TRACKER™ RIBBON ─── */}
      {globalWinRate && globalWinRate.evaluated15m >= 3 && (
        <div className="mb-4 flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/[0.04] bg-white/[0.015] backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-[#39FF14]/70" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Signal Accuracy</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {globalWinRate.evaluated5m > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">5m</span>
                <span className={cn("text-[11px] font-black tabular-nums font-mono", globalWinRate.winRate5m >= 60 ? 'text-[#39FF14]' : globalWinRate.winRate5m >= 45 ? 'text-amber-400' : 'text-[#FF4B5C]')}>
                  {globalWinRate.winRate5m.toFixed(0)}%
                </span>
              </div>
            )}
            {globalWinRate.evaluated15m > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">15m</span>
                <span className={cn("text-[11px] font-black tabular-nums font-mono", globalWinRate.winRate15m >= 60 ? 'text-[#39FF14]' : globalWinRate.winRate15m >= 45 ? 'text-amber-400' : 'text-[#FF4B5C]')}>
                  {globalWinRate.winRate15m.toFixed(0)}%
                </span>
              </div>
            )}
            {globalWinRate.evaluated1h > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-600">1h</span>
                <span className={cn("text-[11px] font-black tabular-nums font-mono", globalWinRate.winRate1h >= 60 ? 'text-[#39FF14]' : globalWinRate.winRate1h >= 45 ? 'text-amber-400' : 'text-[#FF4B5C]')}>
                  {globalWinRate.winRate1h.toFixed(0)}%
                </span>
              </div>
            )}
            <span className="text-[7px] font-bold text-slate-700 tabular-nums">{globalWinRate.total} signals</span>
          </div>
        </div>
      )}

      <CorrelationHeatmap open={showCorrelation} onClose={() => setShowCorrelation(false)} data={processedData} />
      <PortfolioScannerPanel open={showPortfolio} onClose={() => setShowPortfolio(false)} data={processedData} />

      {/* Indicator Coverage Warning — shown when < 50% of symbols have indicators ready */}
      {!loading && processedData.length > 0 && indicatorReadyCount / processedData.length < 0.5 && (
        <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-amber-400 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-300">Indicators Warming Up</span>
            <span className="text-[10px] text-slate-400">
              {indicatorReadyCount}/{processedData.length} symbols ready ({Math.round(indicatorReadyCount / processedData.length * 100)}%)
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.round(indicatorReadyCount / processedData.length * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}


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



      {/* ── Main List (Table or Cards) ── */}
      {isMobile ? (
        <div className="flex flex-col pb-32">
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-44 rounded-3xl skeleton border border-white/5 opacity-40" />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full py-32 text-center flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-slate-900/50 flex items-center justify-center border border-white/5 shadow-inner">
                <LayoutGrid size={40} className="text-slate-700" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-black uppercase tracking-[0.2em] text-sm">Asset Hunter Idle</p>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] max-w-[200px] mx-auto leading-relaxed">
                  Your Watchlist is empty. Star assets in the global terminal to track them here.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* COMPACTED COLUMN HEADER (Mobile Only) */}
              <div className="sticky top-0 z-30 flex items-center justify-between px-2 py-2 bg-[#0A0F1B]/95 backdrop-blur-md border-b border-white/10 shadow-lg">
                <div className="w-[110px] shrink-0 text-[8px] font-black uppercase tracking-widest text-slate-500">
                  <span className="flex items-center gap-2">
                    {visibleCols.has('rank') && <span className="w-4">#</span>}
                    <span>Instrument</span>
                  </span>
                </div>

                <div className="flex-1 flex items-center gap-4 px-3 mx-2 overflow-hidden">
                  {OPTIONAL_COLUMNS.filter(c => visibleCols?.has(c.id)).map(col => (
                    <div key={col.id} className="shrink-0 min-w-[32px] text-center">
                      <span className="text-[6px] font-black text-slate-600 uppercase tracking-tighter leading-none block">{col.label.replace('RSI ', '')}</span>
                    </div>
                  ))}
                </div>

                <div className="w-[65px] shrink-0 text-right text-[8px] font-black uppercase tracking-widest text-slate-500 pr-2">
                  Market
                </div>
              </div>

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
                  globalUseObv={globalUseObv}
                  globalUseWilliamsR={globalUseWilliamsR}
                  globalVolatilityEnabled={globalVolatilityEnabled}
                  globalLongCandleThreshold={globalLongCandleThreshold}
                  globalVolumeSpikeThreshold={globalVolumeSpikeThreshold}
                  fundingRate={fundingRates.get(entry.symbol) ? { rate: fundingRates.get(entry.symbol)!.rate, annualized: fundingRates.get(entry.symbol)!.annualized } : null}
                  orderFlowData={orderFlow.get(entry.symbol) ? { ratio: orderFlow.get(entry.symbol)!.ratio, pressure: orderFlow.get(entry.symbol)!.pressure, buyVolume1m: orderFlow.get(entry.symbol)!.buyVolume1m, sellVolume1m: orderFlow.get(entry.symbol)!.sellVolume1m } : null}
                  smartMoneyScore={smartMoney.get(entry.symbol) ? { score: smartMoney.get(entry.symbol)!.score, label: smartMoney.get(entry.symbol)!.label } : null}
                  onViewNarration={handleViewNarration}
                />
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/5 bg-slate-900/40 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-8">
          {/* isolation: isolate creates a new stacking context so tooltips inside don't bleed outside */}
          <div className="overflow-x-auto overflow-y-auto max-h-[min(850px,85vh)] custom-scrollbar" style={{ isolation: 'isolate' }}>
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20 bg-[#0A0F1B]/95 border-b border-white/5">
                <tr>
                  {bulkMode && (
                    <th className="sticky left-0 z-30 bg-[#0A0F1B]/95 px-3 py-3 w-[44px] min-w-[44px]">
                      <button
                        onClick={selectedSymbols.size === filtered.length ? clearAllSelections : selectAllSymbols}
                        className="flex items-center justify-center w-full h-full text-slate-500 hover:text-[#39FF14] transition-colors"
                        title={selectedSymbols.size === filtered.length ? "Deselect All" : "Select All"}
                      >
                        {selectedSymbols.size === filtered.length ? (
                          <CheckSquare size={14} className="text-[#39FF14]" />
                        ) : selectedSymbols.size > 0 ? (
                          <MinusCircle size={14} className="text-[#39FF14]" />
                        ) : (
                          <Square size={14} />
                        )}
                      </button>
                    </th>
                  )}
                  {visibleCols.has('rank') && (
                    <th className={cn("px-3 py-3 text-[10px] font-bold uppercase text-slate-500 text-left tracking-widest whitespace-nowrap", COL_WIDTHS.rank)}>#</th>
                  )}
                  <th className={cn("px-2 py-3 text-[10px] font-bold text-slate-500 text-center uppercase tracking-widest", COL_WIDTHS.star)}>★</th>
                  <SortHeader
                    label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="left"
                    widthClass={COL_WIDTHS.symbol}
                    stickyOffset={visibleCols.has('rank') ? 88 : 40}
                  />
                  <SortHeader
                    label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right"
                    widthClass={COL_WIDTHS.price}
                    stickyOffset={visibleCols.has('rank') ? 88 + 120 : 40 + 120}
                  />

                  <SortHeader
                    label="24h Chg" sortKey="change24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right"
                    widthClass={COL_WIDTHS.change}
                  />
                  <SortHeader label="Volume" sortKey="volume24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.volume} />

                  {visibleCols.has('rsi1m') && <SortHeader label="RSI 1m" sortKey="rsi1m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.rsi} />}
                  {visibleCols.has('rsi5m') && <SortHeader label="RSI 5m" sortKey="rsi5m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.rsi} />}
                  {visibleCols.has('rsi15m') && <SortHeader label="RSI 15m" sortKey="rsi15m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.rsi} />}
                  {visibleCols.has('rsi1h') && <SortHeader label="RSI 1h" sortKey="rsi1h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.rsi} />}
                  {visibleCols.has('ema9') && <SortHeader label="EMA 9" sortKey="ema9" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.ema} />}
                  {visibleCols.has('ema21') && <SortHeader label="EMA 21" sortKey="ema21" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.ema} />}
                  {visibleCols.has('emaCross') && <SortHeader label="Trend" sortKey="emaCross" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.trend} />}
                  {visibleCols.has('macdHistogram') && <SortHeader label="MACD" sortKey="macdHistogram" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.macd} />}
                  {visibleCols.has('bbUpper') && <SortHeader label="BB Up" sortKey="bbUpper" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.bb} />}
                  {visibleCols.has('bbLower') && <SortHeader label="BB Low" sortKey="bbLower" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.bb} />}
                  {visibleCols.has('bbPosition') && <SortHeader label="BB Pos" sortKey="bbPosition" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.bb} />}
                  {visibleCols.has('stochK') && <SortHeader label="Stoch" sortKey="stochK" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.stoch} />}
                  {visibleCols.has('confluence') && <SortHeader label="Confluence" sortKey="confluence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.confluence} />}
                  {visibleCols.has('divergence') && <SortHeader label="Diverg" sortKey="rsiDivergence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.divergence} />}
                  {visibleCols.has('momentum') && <SortHeader label="Momentum" sortKey="momentum" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.momentum} />}
                  {visibleCols.has('atr') && <SortHeader label="ATR" sortKey="atr" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.atr} />}
                  {visibleCols.has('adx') && <SortHeader label="ADX" sortKey="adx" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.adx} />}
                  {visibleCols.has('vwapDiff') && <SortHeader label="VWAP %" sortKey="vwapDiff" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.vwap} />}
                  {visibleCols.has('longCandle') && <SortHeader label="Long Candle" sortKey="longCandle" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.signal} />}
                  {visibleCols.has('volumeSpike') && <SortHeader label="Vol Spike" sortKey="volumeSpike" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.signal} />}

                  {visibleCols.has('fundingRate') && <SortHeader label="Funding" sortKey="fundingRate" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.funding} />}
                  {visibleCols.has('orderFlow') && <SortHeader label="Flow" sortKey="orderFlow" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.flow} />}
                  {visibleCols.has('smartMoney') && <SortHeader label="Smart $" sortKey="smartMoney" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.smart} />}
                  {visibleCols.has('winRate') && <th className={cn("px-3 py-3 text-[10px] font-bold uppercase text-slate-500 text-right tracking-widest whitespace-nowrap", COL_WIDTHS.winRate)}>Win Rate</th>}

                  <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.signal} />
                  {visibleCols.has('strategy') && <SortHeader label="Strategy" sortKey="strategyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" widthClass={COL_WIDTHS.signal} />}
                  <th className={cn("px-3 py-3 text-right text-[10px] font-bold uppercase text-slate-500 hidden sm:table-cell tracking-widest whitespace-nowrap", COL_WIDTHS.edit)}>Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(loading || (activeAssetClass !== 'crypto' && marketDataLoading && processedData.length === 0)) ? (
                  <SkeletonRows visibleCols={visibleCols} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-6 py-32 text-center">
                      <div className="flex flex-col items-center gap-6">
                        <div className="w-24 h-24 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center shadow-2xl">
                          <LayoutGrid size={48} className="text-slate-800" />
                        </div>
                        <div className="space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Analytical Deadzone</p>
                          <p className="text-slate-600 font-bold uppercase tracking-[0.2em] text-[8px] max-w-sm mx-auto leading-relaxed">
                            {showWatchlistOnly
                              ? "Your high-priority intelligence feed is currently empty. Star assets in the 'Global' universe to initiate dedicated tracking."
                              : "No assets match your current matrix constraints. Adjust filters or search parameters."}
                          </p>
                          {showWatchlistOnly && (
                            <button
                              onClick={() => setShowWatchlistOnly(false)}
                              className="mt-6 px-6 py-2.5 bg-slate-800/30 text-slate-400 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:text-white hover:bg-slate-800/80 transition-all active:scale-95"
                            >
                              Return to Global Terminal
                            </button>
                          )}
                        </div>
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
                        globalUseObv={globalUseObv}
                        globalUseWilliamsR={globalUseWilliamsR}
                        globalVolatilityEnabled={globalVolatilityEnabled}
                        globalLongCandleThreshold={globalLongCandleThreshold}
                        globalVolumeSpikeThreshold={globalVolumeSpikeThreshold}
                        fundingRate={fundingRates.get(entry.symbol) ? { rate: fundingRates.get(entry.symbol)!.rate, annualized: fundingRates.get(entry.symbol)!.annualized } : null}
                        orderFlowData={orderFlow.get(entry.symbol) ? { ratio: orderFlow.get(entry.symbol)!.ratio, pressure: orderFlow.get(entry.symbol)!.pressure, buyVolume1m: orderFlow.get(entry.symbol)!.buyVolume1m, sellVolume1m: orderFlow.get(entry.symbol)!.sellVolume1m } : null}
                        smartMoneyScore={smartMoney.get(entry.symbol) ? { score: smartMoney.get(entry.symbol)!.score, label: smartMoney.get(entry.symbol)!.label } : null}
                        bulkMode={bulkMode}
                        isSelected={selectedSymbols.has(entry.symbol)}
                        onToggleSelection={toggleSymbolSelection}
                        onViewNarration={handleViewNarration}
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signal Narration Modal Overlay */}
      <AnimatePresence>
        {showNarrationModal && selectedNarrationEntry && selectedNarration && (
          <SignalNarrationModal
            isOpen={showNarrationModal}
            onClose={() => setShowNarrationModal(false)}
            symbol={selectedNarrationEntry.symbol}
            narration={selectedNarration}
            entry={selectedNarrationEntry}
            rsiPeriod={rsiPeriod}
          />
        )}
      </AnimatePresence>

      {!isMobile && (
        <footer className="mt-auto py-8 border-t border-white/5 bg-[#05080F]/50 backdrop-blur-sm relative z-10 w-full">
          <div className="w-full flex flex-col md:flex-row items-center justify-between gap-8 px-6 sm:px-10 opacity-60 hover:opacity-100 transition-opacity duration-500">
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
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      !isConnected ? "bg-slate-700" : (derivativesStale ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" : "bg-[#39FF14] animate-pulse shadow-[0_0_8px_rgba(57,255,20,0.5)]")
                    )} />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight">
                      {!isConnected ? "Polling Mode" : (derivativesStale ? "Institutional Syncing" : "Ultra-Liveness Engine")}
                    </span>
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
            setVisibleCols={setVisibleCols}
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
            globalUseObv={globalUseObv}
            setGlobalUseObv={setGlobalUseObv}
            globalUseWilliamsR={globalUseWilliamsR}
            setGlobalUseWilliamsR={setGlobalUseWilliamsR}
            isConnected={isConnected}
          />
        )}
      </AnimatePresence>

      {/* MOBILE COMMAND CENTER SIDEBAR */}
      <AnimatePresence>
        {showMobileMenu && (
          <div className="fixed inset-0 z-[600] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 bottom-0 w-[270px] bg-[#05080F]/95 backdrop-blur-3xl border-l border-white/10 p-4 flex flex-col gap-4 shadow-[0_0_100px_rgba(0,0,0,0.9)]"
            >
              {/* Slim Strategic Header */}
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] shadow-[0_0_8px_#39FF14]" />
                  <span className="text-white font-black uppercase tracking-[0.2em] text-[10px]">Institutional Hub</span>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 active:scale-90 active:text-white transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-6 pt-2">
                {/* Section: Asset Universe */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#39FF14]/70">Asset Universe</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['crypto', 'forex', 'metals', 'stocks'].map((ac) => (
                      <button
                        key={ac}
                        onClick={() => { setActiveAssetClass(ac as any); setShowMobileMenu(false); }}
                        className={cn(
                          "py-2.5 rounded-lg flex items-center gap-2.5 px-3 transition-all border",
                          activeAssetClass === ac ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]" : "bg-white/5 border-white/5 text-slate-500 hover:text-slate-300"
                        )}
                      >
                        <span className="text-sm">{ac === 'crypto' ? '₿' : ac === 'forex' ? '💱' : ac === 'metals' ? '🥇' : '📈'}</span>
                        <span className="text-[8px] font-black uppercase tracking-[0.1em]">{ac}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section: Matrix Signal Filter */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">Confluence Filters</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { label: "ALL ASSETS", id: 'all' },
                      { label: "OVERSOLD", id: 'oversold' },
                      { label: "STRONG BUY", id: 'strong-buy' },
                      { label: "BUY", id: 'buy' },
                      { label: "NEUTRAL", id: 'neutral' },
                      { label: "SELL", id: 'sell' },
                      { label: "STRONG SELL", id: 'strong-sell' },
                      { label: "OVERBOUGHT", id: 'overbought' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSignalFilter(s.id as any); setShowMobileMenu(false); }}
                        className={cn(
                          "py-2.5 rounded-lg text-[7.5px] font-black transition-all border uppercase px-1.5",
                          signalFilter === s.id
                            ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                            : "bg-white/5 border-white/5 text-slate-500"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section: Strategic Operations */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">Strategic Stack</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => { setShowWatchlistOnly(!showWatchlistOnly); setShowMobileMenu(false); }}
                      className={cn(
                        "py-3 rounded-lg flex flex-col items-center gap-1 transition-all border",
                        showWatchlistOnly ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" : "bg-white/5 border-white/5 text-slate-300"
                      )}
                    >
                      <Star size={18} fill={showWatchlistOnly ? "currentColor" : "none"} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Watchlist</span>
                    </button>
                    <button
                      onClick={() => { setShowCorrelation(true); setShowMobileMenu(false); }}
                      className="py-3 rounded-lg flex flex-col items-center gap-1 bg-white/5 border border-white/5 text-slate-300 active:bg-violet-500/10 active:text-violet-400 transition-all"
                    >
                      <LinkIcon size={18} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Correlation</span>
                    </button>
                    <button
                      onClick={() => { setShowPortfolio(true); setShowMobileMenu(false); }}
                      className="py-3 rounded-lg flex flex-col items-center gap-1 bg-white/5 border border-white/5 text-slate-300 active:bg-cyan-500/10 active:text-cyan-400 transition-all"
                    >
                      <Shield size={18} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Risk Scan</span>
                    </button>
                    <button
                      onClick={() => { handleExportCsv(); setShowMobileMenu(false); }}
                      className="py-3 rounded-lg flex flex-col items-center gap-1 bg-white/5 border border-white/5 text-slate-300 active:bg-blue-500/10 active:text-blue-400 transition-all"
                    >
                      <Download size={18} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Export CSV</span>
                    </button>
                  </div>
                </div>

                {/* Section: Exchange Selector */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#39FF14]/70">Data Source</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'binance', label: 'Binance', short: 'BIN' },
                      { id: 'bybit', label: 'Bybit Spot', short: 'BYB' },
                      { id: 'bybit-linear', label: 'Bybit Perp', short: 'PRP' },
                    ].map((ex) => (
                      <button
                        key={ex.id}
                        onClick={() => { setExchange(ex.id); setShowMobileMenu(false); }}
                        className={cn(
                          "py-2.5 rounded-lg flex flex-col items-center gap-1 transition-all border",
                          exchange === ex.id
                            ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                            : "bg-white/5 border-white/5 text-slate-500"
                        )}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest">{ex.short}</span>
                        <span className="text-[7px] font-bold text-slate-600 uppercase">{ex.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section: Pair Count */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">Pair Count</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[100, 300, 500].map(cnt => (
                      <button
                        key={cnt}
                        onClick={() => { handlePairCountChange(cnt); setShowMobileMenu(false); }}
                        className={cn(
                          "py-2.5 rounded-lg text-[10px] font-black transition-all border",
                          pairCount === cnt
                            ? "bg-white text-black border-white"
                            : "bg-white/5 border-white/5 text-slate-500"
                        )}
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section: RSI Period */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">RSI Period</span>
                    <span className="text-[10px] font-black text-[#39FF14] tabular-nums">{rsiPeriod}</span>
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <span className="text-[8px] text-slate-600 font-mono">2</span>
                    <input
                      type="range"
                      min="2"
                      max="50"
                      value={rsiPeriod}
                      onChange={(e) => setRsiPeriod(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#39FF14]"
                    />
                    <span className="text-[8px] text-slate-600 font-mono">50</span>
                  </div>
                </div>

                {/* Section: Bulk Actions */}
                <div className="space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">Bulk Operations</span>
                  <button
                    onClick={() => { toggleBulkMode(); setShowMobileMenu(false); }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg transition-all border",
                      bulkMode
                        ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                        : "bg-white/5 border-white/5 text-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {bulkMode ? <CheckSquare size={18} /> : <Square size={18} />}
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {bulkMode ? `Bulk Mode (${selectedSymbols.size} selected)` : 'Bulk Alert Config'}
                      </span>
                    </div>
                    <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded", bulkMode ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-slate-800 text-slate-500")}>
                      {bulkMode ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>

                {/* Section: System Configuration */}
                <div className="space-y-3 pb-2">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">System Parameters</span>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => { setShowGlobalSettings(true); setShowMobileMenu(false); }} className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 text-slate-300 active:bg-[#39FF14]/10 transition-all group">
                      <div className="flex items-center gap-4">
                        <LayoutGrid size={18} className="group-hover:text-[#39FF14] transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Interface Settings</span>
                      </div>
                      <span className="text-[8px] opacity-40 font-mono">COLUMNS</span>
                    </button>
                    <button onClick={() => { setAlertsEnabled(!alertsEnabled); }} className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 text-slate-300 active:bg-[#39FF14]/10 transition-all group">
                      <div className="flex items-center gap-4">
                        {alertsEnabled ? <Zap size={18} className="text-[#39FF14]" /> : <ZapOff size={18} className="text-slate-600" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">Global Alerts</span>
                      </div>
                      <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded", alertsEnabled ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-slate-800 text-slate-500")}>
                        {alertsEnabled ? "ON" : "OFF"}
                      </span>
                    </button>
                    <button onClick={() => { setSoundEnabled(!soundEnabled); }} className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 text-slate-300 active:bg-amber-500/10 transition-all group">
                      <div className="flex items-center gap-4">
                        {soundEnabled ? <Bell size={18} className="text-amber-500" /> : <BellOff size={18} className="text-slate-600" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">Alert Sound</span>
                      </div>
                      <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded", soundEnabled ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-500")}>
                        {soundEnabled ? "ON" : "OFF"}
                      </span>
                    </button>
                    <button onClick={() => { fetchData(true); setShowMobileMenu(false); }} className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 text-slate-300 active:bg-blue-500/10 transition-all group">
                      <div className="flex items-center gap-4">
                        <RefreshCcw size={18} className={cn("text-blue-400", refreshing && "animate-spin")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Re-Sync Intelligence</span>
                      </div>
                      <span className="text-[8px] opacity-40 font-mono">{countdown}S</span>
                    </button>
                    {/* Alert History */}
                    <button
                      onClick={() => { setShowAlertPanel(true); setShowMobileMenu(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 text-slate-300 active:bg-[#39FF14]/10 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Bell size={18} className={alerts.length > 0 ? "text-amber-500" : "text-slate-600"} />
                          {alerts.length > 0 && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#FF4B5C]" />
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Alert History</span>
                      </div>
                      {alerts.length > 0 && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-[#FF4B5C]/10 text-[#FF4B5C]">
                          {alerts.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Section: Account */}
                <div className="space-y-3 pb-2">
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-600">Account</span>
                  <div className="flex flex-col gap-1.5">
                    {session && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                        <div className="w-8 h-8 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center shrink-0">
                          <UserIcon size={14} className="text-[#39FF14]" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[9px] font-black text-white truncate">{session.user?.name || 'User'}</span>
                          <span className="text-[7px] text-slate-600 truncate">{session.user?.email}</span>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => { router.push('/account'); setShowMobileMenu(false); }}
                      className="w-full flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/5 text-slate-300 active:bg-white/10 transition-all"
                    >
                      <UserIcon size={18} className="text-slate-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest">My Account</span>
                    </button>
                    <button
                      onClick={handleSignOut}
                      disabled={isLoggingOut}
                      className="w-full flex items-center gap-4 p-3 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400 active:bg-rose-500/10 transition-all"
                    >
                      <LogOut size={18} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {isLoggingOut ? 'Signing out...' : 'Sign Out'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="py-2 flex items-center justify-between border-t border-white/5">
                <span className="text-[6px] font-black uppercase tracking-[0.4em] text-slate-800">RSIQ PRO INSTITUTIONAL</span>
                <span className="text-[6px] font-black text-slate-800 tabular-nums uppercase">v4.0.2</span>
              </div>
            </motion.div>
          </div>
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

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={selectedSymbols.size}
        onAction={handleBulkAction}
        onCancel={() => {
          setBulkMode(false);
          setSelectedSymbols(new Set());
        }}
      />

      {/* Bulk Confirmation Dialog */}
      <BulkConfirmationDialog
        isOpen={showBulkConfirmation}
        onClose={() => {
          setShowBulkConfirmation(false);
          setBulkActionConfig(null);
        }}
        onConfirm={executeBulkAction}
        symbols={Array.from(selectedSymbols)}
        action={bulkActionConfig || { type: 'priority', priority: 'medium' }}
        isProcessing={isBulkProcessing}
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
            <QuietHoursSection
              enabled={config.quietHoursEnabled}
              startHour={config.quietHoursStart}
              endHour={config.quietHoursEnd}
              onEnabledChange={(enabled) => setConfig({ ...config, quietHoursEnabled: enabled })}
              onStartHourChange={(hour) => setConfig({ ...config, quietHoursStart: hour })}
              onEndHourChange={(hour) => setConfig({ ...config, quietHoursEnd: hour })}
              disabled={loading}
            />

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
  }, [value, label, localValue]);

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
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={cn(
        "fixed inset-y-0 right-0 z-[200] bg-slate-900/90 backdrop-blur-2xl border-l border-white/10 shadow-2xl overflow-hidden flex flex-col",
        "w-[85vw] sm:w-[22rem]"
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
                    <div className="text-right flex items-center gap-4">
                      {alert.price && (
                        <div className="text-right border-r border-white/10 pr-4">
                          <div className="text-[10px] font-black text-white tabular-nums tracking-wider">
                            ${formatPrice(alert.price)}
                          </div>
                          <div className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">Price</div>
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] font-black text-white/90 tabular-nums">
                          {alert.value.toFixed(2)}
                        </div>
                        <div className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">Reading</div>
                      </div>
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
  setVisibleCols,
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
  setGlobalUseMomentum,
  globalUseObv,
  setGlobalUseObv,
  globalUseWilliamsR,
  setGlobalUseWilliamsR,
  isConnected
}: {
  onClose: () => void;
  visibleCols: Set<string>;
  setVisibleCols: (cols: Set<ColumnId>) => void;
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
  globalUseObv: boolean;
  setGlobalUseObv: (v: boolean) => void;
  globalUseWilliamsR: boolean;
  setGlobalUseWilliamsR: (v: boolean) => void;
  isConnected: boolean;
}) {
  const { status: pushStatus, toggle: togglePush, isLoading: pushLoading } = usePushNotifications();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex justify-end bg-slate-950/90 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-[85vw] sm:w-[32rem] max-w-lg bg-[#080F1B] border-l border-white/10 rounded-l-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-full"
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
            <X size={20} />
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
                    { id: 'mom', label: 'Momentum', state: globalUseMomentum, setter: setGlobalUseMomentum, icon: <TrendingUp size={10} /> },
                    { id: 'obv', label: 'OBV Trend', state: globalUseObv, setter: setGlobalUseObv, icon: <BarChart3 size={10} /> },
                    { id: 'wr', label: 'Williams %R', state: globalUseWilliamsR, setter: setGlobalUseWilliamsR, icon: <Activity size={10} /> },
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

              {/* ── Institutional Notification Health ── */}
              <div className="p-5 rounded-3xl border border-[#39FF14]/20 bg-[#39FF14]/[0.02] shadow-[0_0_50px_-15px_rgba(57,255,20,0.1)] mb-6 group/health">
                <div className="flex flex-col mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#39FF14] flex items-center gap-2">
                      <ShieldCheck size={14} className="animate-pulse" />
                      Notification Health
                    </span>
                    <span className={cn("text-[8px] font-black px-2 py-0.5 rounded-full uppercase", isConnected ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-rose-500/10 text-rose-500")}>
                      {isConnected ? "Engine Ready" : "Unstable"}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase leading-relaxed">
                    Verify background synchronization, sound delivery, and institutional vibration patterns for mobile.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      notificationEngine.notify({
                        title: "🔔 TEST SIGNAL: Success",
                        body: "Notification engine is synchronized. Sound and vibrations verified.",
                        symbol: "TEST",
                        priority: "high",
                        type: "test"
                      });
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-[#39FF14]/40 hover:bg-[#39FF14]/5 transition-all group/btn"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14] group-hover/btn:scale-110 transition-transform">
                      <Bell size={16} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover/btn:text-[#39FF14]">Test Alert</span>
                  </button>

                  <button
                    onClick={() => {
                      if ('Notification' in window) {
                        Notification.requestPermission().then(p => {
                          if (p === 'granted') toast.success('Push Permissions Granted');
                        });
                      }
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-400/40 hover:bg-blue-400/5 transition-all group/perm"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-400/10 flex items-center justify-center text-blue-400 group-hover/perm:scale-110 transition-transform">
                      <Smartphone size={16} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover/perm:text-blue-400">Grant Permission</span>
                  </button>
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

        <div className="p-6 border-t border-white/5 bg-white/[0.02] space-y-3">
          {/* Reset to Default Button */}
          <button
            onClick={() => {
              if (confirm('Reset all settings to institutional defaults?\n\n• All 11 strategy indicators → ON\n• RSI period → 14 (industry standard)\n• Thresholds → 80/20 (institutional grade)\n• Signal mode → Custom (expert)\n• Volatility detection → ON\n• Columns → Optimal trading set\n• Keep your watchlist and alerts\n\nContinue?')) {
                // Reset all indicators to default (all ON — expert mode)
                setGlobalUseRsi(true);
                setGlobalUseMacd(true);
                setGlobalUseBb(true);
                setGlobalUseStoch(true);
                setGlobalUseEma(true);
                setGlobalUseVwap(true);
                setGlobalUseConfluence(true);
                setGlobalUseDivergence(true);
                setGlobalUseMomentum(true);
                setGlobalUseObv(true);
                setGlobalUseWilliamsR(true);

                // Reset RSI — institutional-grade 80/20 thresholds
                setRsiPeriod(14);
                setGlobalOverbought(80);
                setGlobalOversold(20);
                setGlobalThresholdsEnabled(true);
                setGlobalThresholdTimeframes(['15m']);

                // Reset signal display — custom mode for accuracy
                setGlobalShowSignalTags(true);
                setGlobalSignalThresholdMode('custom');

                // Reset volatility — enabled with balanced thresholds
                setGlobalVolatilityEnabled(true);
                setGlobalLongCandleThreshold(3);
                setGlobalVolumeSpikeThreshold(3);

                // Reset performance
                setRefreshInterval(3000);
                setPairCount(100);

                // Reset columns to optimal institutional trading set
                const optimalCols = new Set(
                  OPTIONAL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)
                ) as Set<ColumnId>;
                setVisibleCols(optimalCols);

                toast.success('Settings reset to institutional defaults');
              }
            }}
            className="w-full bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white font-black uppercase tracking-[0.2em] py-4 rounded-2xl border border-white/5 hover:border-white/10 active:scale-95 transition-all text-xs flex items-center justify-center gap-2"
          >
            <RefreshCcw size={14} />
            Reset to Default
          </button>

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
