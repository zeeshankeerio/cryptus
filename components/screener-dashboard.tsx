'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ScreenerEntry, ScreenerResponse, SortKey, SortDir, SignalFilter } from '@/lib/types';

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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 15 }).map((_, i) => (
        <tr key={i} className="border-b border-dark-700/50">
          <td className="px-3 py-3"><div className="skeleton h-4 w-6" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-20" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-24 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-14 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-20 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-12 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-12 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-12 ml-auto" /></td>
          <td className="px-3 py-3"><div className="skeleton h-4 w-20 ml-auto" /></td>
        </tr>
      ))}
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: 'Off', value: 0 },
];

const PAIR_COUNTS = [50, 100, 150, 200];

export default function ScreenerDashboard() {
  // ── State ──
  const [data, setData] = useState<ScreenerEntry[]>([]);
  const [meta, setMeta] = useState<ScreenerResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('volume24h');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [pairCount, setPairCount] = useState(100);
  const [countdown, setCountdown] = useState(30);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const fetchingRef = useRef(false);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setError(null);
      const res = await fetch(`/api/screener?count=${pairCount}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);

      const json: ScreenerResponse = await res.json();
      setData(json.data);
      setMeta(json.meta);
      setLastFetchTime(Date.now());
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setLoading(false);
    } finally {
      fetchingRef.current = false;
    }
  }, [pairCount]);

  // ── Initial fetch ──
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Auto-refresh ──
  useEffect(() => {
    if (refreshInterval <= 0) return;

    setCountdown(refreshInterval);
    const refetchTimer = setInterval(() => {
      fetchData();
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
    let items = data;

    // Signal filter
    if (signalFilter !== 'all') {
      items = items.filter((e) => e.signal === signalFilter);
    }

    // Search filter
    if (search) {
      const q = search.toUpperCase();
      items = items.filter((e) => e.symbol.includes(q));
    }

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    items = [...items].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });

    return items;
  }, [data, signalFilter, search, sortKey, sortDir]);

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
  const resetFilters = () => {
    setSearch('');
    setSignalFilter('all');
    setSortKey('volume24h');
    setSortDir('desc');
  };

  // ── Render ──
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      {/* ── Header ── */}
      <header className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-blue-400">⚡</span> CryptoRSI Screener
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time RSI across multiple timeframes
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {meta && (
              <span className="text-gray-500">
                {meta.computeTimeMs}ms · {timeAgo(lastFetchTime)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${refreshInterval > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-gray-400 text-xs">
                {refreshInterval > 0 ? `${countdown}s` : 'Paused'}
              </span>
            </span>
            <button
              onClick={() => { fetchData(); setCountdown(refreshInterval); }}
              className="px-3 py-1.5 text-xs bg-dark-700 hover:bg-dark-600 rounded-lg border border-dark-600 transition-colors"
              title="Refresh now"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats bar ── */}
      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Pairs" value={meta.total} color="text-blue-400" />
          <StatCard
            label="Oversold"
            value={meta.oversold}
            color="text-emerald-400"
            onClick={showMostOversold}
          />
          <StatCard
            label="Overbought"
            value={meta.overbought}
            color="text-red-400"
            onClick={showMostOverbought}
          />
          <StatCard label="Neutral" value={meta.total - meta.oversold - meta.overbought} color="text-gray-400" />
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
          {(['all', 'oversold', 'overbought', 'neutral'] as SignalFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSignalFilter(f)}
              className={`px-3 py-2 transition-colors capitalize ${
                signalFilter === f
                  ? 'bg-blue-500/20 text-blue-400 font-medium'
                  : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
              }`}
            >
              {f}
            </button>
          ))}
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
          {REFRESH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>⟳ {o.label}</option>
          ))}
        </select>

        {/* Reset */}
        {(search || signalFilter !== 'all') && (
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
          <button onClick={fetchData} className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-900/50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-xs font-medium text-gray-600 text-left w-10">#</th>
                <SortHeader label="Symbol" sortKey="symbol" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                <SortHeader label="Price" sortKey="price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="24h %" sortKey="change24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Volume" sortKey="volume24h" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="RSI 1m" sortKey="rsi1m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="RSI 5m" sortKey="rsi5m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="RSI 15m" sortKey="rsi15m" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Signal" sortKey="signal" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-gray-600">
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
                    <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi1m)}`}>
                      {formatRsi(entry.rsi1m)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi5m)}`}>
                      {formatRsi(entry.rsi5m)}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-sm tabular-nums font-mono ${getRsiColor(entry.rsi15m)}`}>
                      {formatRsi(entry.rsi15m)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <SignalBadge signal={entry.signal} />
                    </td>
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
        </span>
        <span>
          Data from Binance · RSI period 14
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
}: {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3 bg-dark-800 rounded-xl border border-dark-700 ${onClick ? 'cursor-pointer hover:border-dark-500 transition-colors' : ''}`}
    >
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
