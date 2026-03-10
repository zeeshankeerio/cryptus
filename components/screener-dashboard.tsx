'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { ScreenerEntry, ScreenerResponse, SortKey, SortDir, SignalFilter } from '@/lib/types';
import { useLivePrices } from '@/hooks/use-live-prices';

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

function getRsiColor(rsi: number | null): string {
  if (rsi === null) return 'text-gray-600';
  if (rsi <= 20) return 'text-emerald-400 font-semibold';
  if (rsi <= 30) return 'text-emerald-400';
  if (rsi <= 40) return 'text-emerald-300/70';
  if (rsi >= 80) return 'text-red-400 font-semibold';
  if (rsi >= 70) return 'text-red-400';
  if (rsi >= 60) return 'text-orange-300/70';
  return 'text-gray-300';
}

function getRsiBg(rsi: number | null): string {
  if (rsi === null) return '';
  if (rsi <= 25) return 'bg-emerald-500/10';
  if (rsi <= 30) return 'bg-emerald-500/5';
  if (rsi >= 75) return 'bg-red-500/10';
  if (rsi >= 70) return 'bg-red-500/5';
  return '';
}

function getScoreBarColor(score: number): string {
  if (score >= 40) return 'bg-emerald-400';
  if (score >= 15) return 'bg-emerald-300/70';
  if (score <= -40) return 'bg-red-400';
  if (score <= -15) return 'bg-red-300/70';
  return 'bg-gray-500';
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Signal Badge ──────────────────────────────────────────────

function SignalBadge({ signal }: { signal: ScreenerEntry['signal'] }) {
  const styles: Record<string, string> = {
    oversold: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    overbought: 'bg-red-500/15 text-red-400 border-red-500/30',
    neutral: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border ${styles[signal]}`}>
      {signal === 'oversold' && '▼ '}
      {signal === 'overbought' && '▲ '}
      {signal.charAt(0).toUpperCase() + signal.slice(1)}
    </span>
  );
}

function StrategyBadge({ signal, label }: { signal: ScreenerEntry['strategySignal']; label: string }) {
  const styles: Record<string, string> = {
    'strong-buy': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    'buy': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    'neutral': 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    'sell': 'bg-red-500/10 text-red-300 border-red-500/25',
    'strong-sell': 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${styles[signal]}`}>
      {label}
    </span>
  );
}

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
      className={`px-3 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-white whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-blue-400' : 'text-gray-500'}`}
    >
      <span className="inline-flex items-center gap-1">
        {align === 'right' && active && (
          <span className="text-blue-400">{currentDir === 'asc' ? '↑' : '↓'}</span>
        )}
        {label}
        {align !== 'right' && active && (
          <span className="text-blue-400">{currentDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 15 }).map((_, i) => (
        <tr key={i} className="border-b border-dark-700/50">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <div className={`skeleton h-4 ${j === 0 ? 'w-6' : j === 1 ? 'w-20' : 'w-14 ml-auto'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Column definitions ───────────────────────────────────────

type ColumnId =
  | 'rsi1m' | 'rsi5m' | 'rsi15m' | 'rsi1h'
  | 'emaCross' | 'macdHistogram' | 'bbPosition' | 'stochK'
  | 'vwapDiff' | 'volumeSpike' | 'strategy';

interface ColumnDef {
  id: ColumnId;
  label: string;
  group: string;
  defaultVisible: boolean;
}

const OPTIONAL_COLUMNS: ColumnDef[] = [
  { id: 'rsi1m', label: 'RSI 1m', group: 'RSI', defaultVisible: true },
  { id: 'rsi5m', label: 'RSI 5m', group: 'RSI', defaultVisible: true },
  { id: 'rsi15m', label: 'RSI 15m', group: 'RSI', defaultVisible: true },
  { id: 'rsi1h', label: 'RSI 1h', group: 'RSI', defaultVisible: true },
  { id: 'emaCross', label: 'EMA Cross', group: 'Trend', defaultVisible: true },
  { id: 'macdHistogram', label: 'MACD', group: 'Trend', defaultVisible: true },
  { id: 'bbPosition', label: 'BB Pos', group: 'Volatility', defaultVisible: false },
  { id: 'stochK', label: 'Stoch RSI', group: 'Momentum', defaultVisible: false },
  { id: 'vwapDiff', label: 'VWAP %', group: 'Volume', defaultVisible: false },
  { id: 'volumeSpike', label: 'Vol Spike', group: 'Volume', defaultVisible: false },
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
    if (typeof window === 'undefined') return 100;
    const saved = localStorage.getItem('crypto-rsi-pairs');
    const n = saved ? Number(saved) : 100;
    return PAIR_COUNTS.includes(n) ? n : 100;
  });
  const [countdown, setCountdown] = useState(30);
  const [lastFetchTime, setLastFetchTime] = useState(0);
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
  const symbolSet = useMemo(() => new Set(data.map((e) => e.symbol)), [data]);
  const { livePrices, isConnected } = useLivePrices(symbolSet);

  // Merge live prices with server data
  const mergedData = useMemo(() => {
    if (livePrices.size === 0) return data;
    return data.map((entry) => {
      const live = livePrices.get(entry.symbol);
      if (!live || live.updatedAt <= entry.updatedAt) return entry;
      return { ...entry, price: live.price, change24h: live.change24h, volume24h: live.volume24h };
    });
  }, [data, livePrices]);

  const indicatorReadyCount = useMemo(() => (
    data.filter((e) => e.rsi1m !== null || e.rsi5m !== null || e.rsi15m !== null || e.macdHistogram !== null).length
  ), [data]);

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
    if (background) setRefreshing(true);

    try {
      if (!background) setError(null);
      const timeoutMs = pairCount >= 500 ? 55_000 : pairCount >= 300 ? 40_000 : 25_000;
      const res = await fetch(`/api/screener?count=${pairCount}`, {
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
      setLastFetchTime(Date.now());
      setError(null);
      setLoading(false);
    } catch (err) {
      // Background fetch failures are silent when we already have data
      if (dataLenRef.current === 0) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      }
      setLoading(false);
    } finally {
      fetchingRef.current = false;
      setRefreshing(false);
    }
  }, [pairCount]);

  // ── Initial fetch with auto-retry ──
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    retryCountRef.current = 0;
    const doFetch = async () => {
      await fetchData();
      // If initial load failed and no data, retry with backoff (max 3 retries)
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

  // ── Resume refresh on tab focus ──
  useEffect(() => {
    const handler = () => {
      if (!document.hidden && refreshInterval > 0 && dataLenRef.current > 0) {
        fetchData(true);
        setCountdown(refreshInterval);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [refreshInterval, fetchData]);

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

    // Signal filter — supports both RSI-based and strategy-based
    if (signalFilter === 'oversold' || signalFilter === 'overbought') {
      items = items.filter((e) => e.signal === signalFilter);
    } else if (signalFilter !== 'all' && signalFilter !== 'neutral') {
      items = items.filter((e) => e.strategySignal === signalFilter);
    } else if (signalFilter === 'neutral') {
      items = items.filter((e) => e.strategySignal === 'neutral');
    }

    // Search filter
    if (search) {
      const q = search.toUpperCase();
      items = items.filter((e) => e.symbol.includes(q));
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
      const av = a[sortKey as keyof ScreenerEntry];
      const bv = b[sortKey as keyof ScreenerEntry];

      // Null values always sort to bottom regardless of direction
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      if (typeof av === 'boolean' && typeof bv === 'boolean') {
        return ((av ? 1 : 0) - (bv ? 1 : 0)) * dir;
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

  // Count visible columns for colSpan
  // Fixed cols: #, ★, symbol, price, 24h%, volume, signal = 7
  const colCount = 7 + OPTIONAL_COLUMNS.filter((c) => visibleCols.has(c.id)).length;

  // ── Render ──
  return (
    <div className="max-w-[1800px] mx-auto px-4 py-6">
      {/* ── Header ── */}
      <header className="mb-5 rounded-2xl border border-dark-700 bg-gradient-to-r from-dark-900 via-dark-800 to-dark-900 p-4 sm:p-5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-dark-600 bg-dark-800/80 px-2.5 py-1 text-[11px] tracking-wide text-gray-400 uppercase">
              Quant Dashboard
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-semibold text-white flex items-center gap-2.5 tracking-tight">
              <span className="text-blue-400">⚡</span>
              <span>CryptoRSI Screener</span>
            </h1>
            <p className="text-sm text-gray-400 mt-1.5">
              Multi-indicator market scanner · RSI · MACD · Bollinger · Stochastic · VWAP
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 text-xs">
            {meta && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-800/80 px-3 py-1.5 text-gray-300">
                <span className="text-gray-500">Compute</span>
                <span className="font-medium text-gray-200 tabular-nums">{meta.computeTimeMs}ms</span>
              </div>
            )}
            {data.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-800/80 px-3 py-1.5 text-gray-300">
                <span className="text-gray-500">Indicators</span>
                <span className="font-medium text-gray-200 tabular-nums">{indicatorReadyCount}/{data.length}</span>
              </div>
            )}
            <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
              isConnected
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-dark-600 bg-dark-800/80 text-gray-500'
            }`}>
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="font-medium text-xs tracking-wide">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-800/80 px-3 py-1.5 text-gray-300">
              <span className={`h-2 w-2 rounded-full ${refreshInterval > 0 ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="font-medium text-gray-200">{refreshInterval > 0 ? `${countdown}s` : 'Paused'}</span>
            </div>
            <button
              onClick={() => { fetchData(); setCountdown(refreshInterval); }}
              className="inline-flex items-center rounded-lg border border-dark-500 bg-dark-700 px-3 py-1.5 text-xs font-medium text-gray-100 hover:bg-dark-600 transition-colors"
              title="Refresh now"
            >
              {refreshing ? '⟳ …' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats bar (2 rows) ── */}
      {meta && (
        <div className="space-y-3 mb-5">
          {/* Row 1: core market metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="Total Pairs" value={meta.total} color="text-blue-400" helper="Universe" />
            <StatCard
              label="Oversold (RSI)"
              value={meta.oversold}
              color="text-emerald-400"
              onClick={showMostOversold}
              helper="Tap to filter"
            />
            <StatCard
              label="Overbought (RSI)"
              value={meta.overbought}
              color="text-red-400"
              onClick={showMostOverbought}
              helper="Tap to filter"
            />
            <StatCard
              label="Strong Buy"
              value={meta.strongBuy}
              color="text-emerald-400"
              onClick={showStrongBuys}
              helper="Top setups"
            />
          </div>

          {/* Row 2: strategy distribution */}
          <div className="rounded-xl border border-dark-700 bg-dark-800/70 p-2.5 sm:p-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              <MiniStatCard label="Strong Buy" value={meta.strongBuy} color="text-emerald-400" />
              <MiniStatCard label="Buy" value={meta.buy} color="text-emerald-300" />
              <MiniStatCard label="Neutral" value={meta.neutral} color="text-gray-300" />
              <MiniStatCard label="Sell" value={meta.sell} color="text-red-300" />
              <MiniStatCard label="Strong Sell" value={meta.strongSell} color="text-red-400" />
            </div>
          </div>
        </div>
      )}

      {/* ── Filters bar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-dark-800 rounded-xl border border-dark-700">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-dark-700 border border-dark-600 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔍</span>
        </div>

        {/* Signal filter */}
        <div className="flex rounded-lg border border-dark-600 overflow-hidden text-xs">
          {SIGNAL_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSignalFilter(f.value)}
              className={`px-2.5 py-2 transition-colors ${
                signalFilter === f.value
                  ? 'bg-blue-500/20 text-blue-400 font-medium'
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Watchlist toggle */}
        <button
          onClick={() => setShowWatchlistOnly((v) => !v)}
          className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
            showWatchlistOnly
              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
              : 'bg-dark-700 text-gray-400 border-dark-600 hover:bg-dark-600'
          }`}
        >
          ★ Watchlist{watchlistReady && watchlist.size > 0 ? ` (${watchlist.size})` : ''}
        </button>

        {/* Column picker */}
        <div className="relative" ref={colPickerRef}>
          <button
            onClick={() => setShowColPicker((v) => !v)}
            className="px-3 py-2 text-xs bg-dark-700 border border-dark-600 rounded-lg text-gray-400 hover:bg-dark-600 transition-colors"
          >
            ⊞ Columns
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-dark-800 border border-dark-600 rounded-xl shadow-xl p-3 min-w-[200px]">
              {OPTIONAL_COLUMNS.map((col) => (
                <label key={col.id} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.id)}
                    onChange={() => toggleCol(col.id)}
                    className="rounded border-dark-500"
                  />
                  <span className="text-gray-300">{col.label}</span>
                  <span className="text-gray-600 ml-auto">{col.group}</span>
                </label>
              ))}
              <div className="mt-2 pt-2 border-t border-dark-600 flex gap-2">
                <button
                  onClick={() => setVisibleCols(new Set(OPTIONAL_COLUMNS.map((c) => c.id)))}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >Show all</button>
                <button
                  onClick={() => setVisibleCols(new Set(OPTIONAL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)))}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >Reset</button>
              </div>
            </div>
          )}
        </div>

        {/* Pair count */}
        <select
          value={pairCount}
          onChange={(e) => setPairCount(Number(e.target.value))}
          className="px-3 py-2 text-xs bg-dark-700 border border-dark-600 rounded-lg text-gray-300 focus:outline-none"
        >
          {PAIR_COUNTS.map((c) => (
            <option key={c} value={c}>{c} pairs</option>
          ))}
        </select>

        {/* Refresh interval */}
        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          className="px-3 py-2 text-xs bg-dark-700 border border-dark-600 rounded-lg text-gray-300 focus:outline-none"
        >
          {REFRESH_OPTIONS.filter((o) => o.maxPairs >= pairCount).map((o) => (
            <option key={o.value} value={o.value}>⟳ {o.label}</option>
          ))}
        </select>

        {/* Reset */}
        {(search || signalFilter !== 'all' || showWatchlistOnly) && (
          <button
            onClick={resetFilters}
            className="px-3 py-2 text-xs text-gray-400 hover:text-white transition-colors"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={() => fetchData()} className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ── Indicators computing notice ── */}
      {!loading && data.length > 0 && indicatorReadyCount < data.length && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-sm flex items-center gap-3">
          <span className="animate-spin text-base">⟳</span>
          <span>Computing indicators... {indicatorReadyCount}/{data.length} ready. Prices are live and remaining pairs will fill in automatically.</span>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-xs font-medium text-gray-600 text-left w-10">#</th>
                <th className="px-2 py-3 text-xs font-medium text-gray-600 text-center w-8" title="Watchlist">★</th>
                <SortHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="24h %" sortKey="change24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Volume" sortKey="volume24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                {visibleCols.has('rsi1m') && (
                  <SortHeader label="RSI 1m" sortKey="rsi1m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('rsi5m') && (
                  <SortHeader label="RSI 5m" sortKey="rsi5m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('rsi15m') && (
                  <SortHeader label="RSI 15m" sortKey="rsi15m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('rsi1h') && (
                  <SortHeader label="RSI 1h" sortKey="rsi1h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('emaCross') && (
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-right uppercase tracking-wider whitespace-nowrap">EMA</th>
                )}
                {visibleCols.has('macdHistogram') && (
                  <SortHeader label="MACD" sortKey="macdHistogram" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('bbPosition') && (
                  <SortHeader label="BB Pos" sortKey="bbPosition" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('stochK') && (
                  <SortHeader label="Stoch" sortKey="stochK" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('vwapDiff') && (
                  <SortHeader label="VWAP %" sortKey="vwapDiff" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
                {visibleCols.has('volumeSpike') && (
                  <th className="px-3 py-3 text-xs font-medium text-gray-500 text-center uppercase tracking-wider whitespace-nowrap">Spike</th>
                )}
                <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                {visibleCols.has('strategy') && (
                  <SortHeader label="Score" sortKey="strategyScore" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={colCount} />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12 text-center text-gray-600">
                    No pairs match your filters
                  </td>
                </tr>
              ) : (
                filtered.map((entry, idx) => (
                  <tr
                    key={entry.symbol}
                    className={`border-b border-dark-700/40 transition-colors hover:bg-dark-700/40 ${getRsiBg(entry.rsi15m)}`}
                  >
                    <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => toggleWatchlist(entry.symbol)}
                        className={`text-sm transition-colors ${watchlist.has(entry.symbol) ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}
                        title={watchlist.has(entry.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        {watchlist.has(entry.symbol) ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-white text-sm">{entry.symbol.replace('USDT', '')}</span>
                      <span className="text-gray-600 text-xs ml-0.5">/USDT</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-200 tabular-nums font-mono">
                      ${formatPrice(entry.price)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${
                      entry.change24h > 0 ? 'text-emerald-400' : entry.change24h < 0 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {entry.change24h > 0 ? '+' : ''}{entry.change24h.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums">
                      {formatVolume(entry.volume24h)}
                    </td>
                    {visibleCols.has('rsi1m') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi1m)}`}>
                        {formatRsi(entry.rsi1m)}
                      </td>
                    )}
                    {visibleCols.has('rsi5m') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi5m)}`}>
                        {formatRsi(entry.rsi5m)}
                      </td>
                    )}
                    {visibleCols.has('rsi15m') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi15m)}`}>
                        {formatRsi(entry.rsi15m)}
                      </td>
                    )}
                    {visibleCols.has('rsi1h') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi1h)}`}>
                        {formatRsi(entry.rsi1h)}
                      </td>
                    )}
                    {visibleCols.has('emaCross') && (
                      <td className="px-3 py-2.5 text-right text-xs">
                        <span className={
                          entry.emaCross === 'bullish'
                            ? 'text-emerald-400'
                            : entry.emaCross === 'bearish'
                              ? 'text-red-400'
                              : 'text-gray-600'
                        }>
                          {entry.emaCross === 'bullish' ? '▲ Bull' : entry.emaCross === 'bearish' ? '▼ Bear' : '— None'}
                        </span>
                      </td>
                    )}
                    {visibleCols.has('macdHistogram') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${
                        entry.macdHistogram === null
                          ? 'text-gray-600'
                          : entry.macdHistogram > 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      }`}>
                        {formatNum(entry.macdHistogram, 4)}
                      </td>
                    )}
                    {visibleCols.has('bbPosition') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${
                        entry.bbPosition === null
                          ? 'text-gray-600'
                          : entry.bbPosition < 0.2
                            ? 'text-emerald-400'
                            : entry.bbPosition > 0.8
                              ? 'text-red-400'
                              : 'text-gray-300'
                      }`}>
                        {formatNum(entry.bbPosition)}
                      </td>
                    )}
                    {visibleCols.has('stochK') && (
                      <td className="px-3 py-2.5 text-right text-xs tabular-nums font-mono">
                        <span className={getRsiColor(entry.stochK)}>{formatRsi(entry.stochK)}</span>
                        {entry.stochD !== null && (
                          <span className="text-gray-600 ml-1">/ {entry.stochD.toFixed(0)}</span>
                        )}
                      </td>
                    )}
                    {visibleCols.has('vwapDiff') && (
                      <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${
                        entry.vwapDiff === null
                          ? 'text-gray-600'
                          : entry.vwapDiff > 0
                            ? 'text-emerald-300/70'
                            : 'text-red-300/70'
                      }`}>
                        {formatPct(entry.vwapDiff)}
                      </td>
                    )}
                    {visibleCols.has('volumeSpike') && (
                      <td className="px-3 py-2.5 text-center">
                        {entry.volumeSpike
                          ? <span className="text-yellow-400 text-sm" title="Volume Spike">🔥</span>
                          : <span className="text-gray-700 text-xs">—</span>
                        }
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right">
                      <SignalBadge signal={entry.signal} />
                    </td>
                    {visibleCols.has('strategy') && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 bg-dark-600 rounded-full overflow-hidden" title={`Score: ${entry.strategyScore}`}>
                            <div
                              className={`h-full rounded-full transition-all ${getScoreBarColor(entry.strategyScore)}`}
                              style={{ width: `${Math.min(100, Math.abs(entry.strategyScore))}%`, marginLeft: entry.strategyScore < 0 ? 'auto' : 0 }}
                            />
                          </div>
                          <StrategyBadge signal={entry.strategySignal} label={entry.strategyLabel} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-4 flex flex-wrap items-center justify-between text-xs text-gray-600 px-1">
        <span>
          Showing {filtered.length} of {data.length} pairs
          {signalFilter !== 'all' && ` · filtered by ${signalFilter}`}
          {showWatchlistOnly && ` · watchlist only`}
        </span>
        <span className="flex items-center gap-2">
          <span>Data from{isConnected ? ' · Live WebSocket' : ' · REST API'} · RSI 14 · EMA 9/21 · MACD 12/26/9 · BB 20</span>
          <Link href="/guide" className="text-blue-500 hover:text-blue-400 transition-colors">📖 Guide</Link>
        </span>
      </footer>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  onClick,
  helper,
}: {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  helper?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3.5 bg-dark-800/85 rounded-xl border border-dark-700 ${onClick ? 'cursor-pointer hover:border-dark-500 hover:bg-dark-700/70 transition-colors' : ''}`}
    >
      <div className="text-xs text-gray-500 mb-1.5 tracking-wide uppercase">{label}</div>
      <div className={`text-3xl leading-none font-semibold tabular-nums ${color}`}>{value}</div>
      {helper && <div className="mt-2 text-[11px] text-gray-500">{helper}</div>}
    </div>
  );
}

function MiniStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-2.5 bg-dark-800 rounded-lg border border-dark-700 text-center">
      <div className="text-[11px] text-gray-500 mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl leading-none font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
