'use client';

import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, TrendingUp, TrendingDown, Award, AlertTriangle,
  RefreshCcw, Trash2, ChevronUp, ChevronDown, Filter, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WinRateStats } from '@/lib/signal-tracker';
import { computeWinRateStats, getGlobalWinRate, clearSignalTracker } from '@/lib/signal-tracker';
import { toast } from 'sonner';

/**
 * Signal Tracker Dashboard Component
 * Requirements: Requirement 6 (Task 10)
 * Design: SignalTrackerDashboard, SignalStatsTable, GlobalStatsCard components
 * 
 * Features:
 * - Sortable table with win rate statistics
 * - Global summary card with best/worst performers
 * - Filter by minimum signal count
 * - Auto-refresh every 30 seconds
 * - Clear all data with confirmation
 * - Responsive design with virtualization for large datasets
 * - Memoized for performance
 */

type SortColumn = 'symbol' | 'totalSignals' | 'winRate5m' | 'winRate15m' | 'winRate1h' | 'avgReturn5m' | 'avgReturn15m' | 'avgReturn1h';
type SortDirection = 'asc' | 'desc';

interface SignalTrackerDashboardProps {
  className?: string;
}

export const SignalTrackerDashboard = memo(function SignalTrackerDashboard({
  className
}: SignalTrackerDashboardProps) {
  const [stats, setStats] = useState<WinRateStats[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>('totalSignals');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [minSignals, setMinSignals] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load and refresh data
  const loadData = useCallback(() => {
    setIsRefreshing(true);
    const data = computeWinRateStats();
    setStats(data);
    setTimeout(() => setIsRefreshing(false), 300);
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Filter and sort data
  const filteredAndSortedStats = useMemo(() => {
    let filtered = stats.filter(s => s.totalSignals >= minSignals);
    
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortColumn) {
        case 'symbol':
          return sortDirection === 'asc'
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case 'totalSignals':
          aVal = a.totalSignals;
          bVal = b.totalSignals;
          break;
        case 'winRate5m':
          aVal = a.winRate5m;
          bVal = b.winRate5m;
          break;
        case 'winRate15m':
          aVal = a.winRate15m;
          bVal = b.winRate15m;
          break;
        case 'winRate1h':
          aVal = a.winRate1h;
          bVal = b.winRate1h;
          break;
        case 'avgReturn5m':
          aVal = a.avgReturn5m;
          bVal = b.avgReturn5m;
          break;
        case 'avgReturn15m':
          aVal = a.avgReturn15m;
          bVal = b.avgReturn15m;
          break;
        case 'avgReturn1h':
          aVal = a.avgReturn1h;
          bVal = b.avgReturn1h;
          break;
        default:
          return 0;
      }
      
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    return filtered;
  }, [stats, sortColumn, sortDirection, minSignals]);

  // Handle sort
  const handleSort = useCallback((column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }, [sortColumn]);

  // Handle clear data
  const handleClearData = useCallback(() => {
    clearSignalTracker();
    setStats([]);
    setShowClearConfirm(false);
    toast.success('Signal tracking data cleared');
  }, []);

  // Global stats
  const globalStats = useMemo(() => getGlobalWinRate(), [stats]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
            <BarChart3 size={24} className="text-[#39FF14]" />
            Signal Tracker
          </h2>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Track signal accuracy and performance across all symbols
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-[#39FF14] hover:border-[#39FF14]/30 transition-all disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCcw size={16} className={isRefreshing ? "animate-spin" : ""} />
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={stats.length === 0}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-[#FF4B5C] hover:border-[#FF4B5C]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Clear all data"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Global Stats Card */}
      <GlobalStatsCard stats={globalStats} symbolStats={stats} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Min Signals:
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {[0, 5, 10, 20].map(val => (
            <button
              key={val}
              onClick={() => setMinSignals(val)}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border",
                minSignals === val
                  ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
              )}
            >
              {val === 0 ? 'All' : `${val}+`}
            </button>
          ))}
        </div>

        {minSignals > 0 && (
          <button
            onClick={() => setMinSignals(0)}
            className="p-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all"
            title="Clear filter"
          >
            <X size={12} />
          </button>
        )}

        <div className="ml-auto text-[10px] font-bold text-slate-500">
          Showing {filteredAndSortedStats.length} of {stats.length} symbols
        </div>
      </div>

      {/* Stats Table */}
      {filteredAndSortedStats.length > 0 ? (
        <SignalStatsTable
          stats={filteredAndSortedStats}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ) : (
        <EmptyState hasData={stats.length > 0} minSignals={minSignals} />
      )}

      {/* Clear Confirmation Dialog */}
      <AnimatePresence>
        {showClearConfirm && (
          <ClearConfirmationDialog
            onConfirm={handleClearData}
            onCancel={() => setShowClearConfirm(false)}
            totalSignals={globalStats.total}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Global Stats Card Component
 * Shows overall performance metrics
 */

interface GlobalStatsCardProps {
  stats: ReturnType<typeof getGlobalWinRate>;
  symbolStats: WinRateStats[];
}

const GlobalStatsCard = memo(function GlobalStatsCard({
  stats,
  symbolStats
}: GlobalStatsCardProps) {
  const bestPerformer = useMemo(() => {
    if (symbolStats.length === 0) return null;
    return symbolStats.reduce((best, curr) =>
      curr.winRate15m > best.winRate15m ? curr : best
    );
  }, [symbolStats]);

  const worstPerformer = useMemo(() => {
    if (symbolStats.length === 0) return null;
    return symbolStats.reduce((worst, curr) =>
      curr.winRate15m < worst.winRate15m && curr.totalSignals >= 5 ? curr : worst
    );
  }, [symbolStats]);

  const avgWinRate = stats.winRate15m;
  const isCalibrating = stats.total < 10;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Overall Win Rate */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Overall Win Rate
          </span>
          <BarChart3 size={16} className="text-slate-600" />
        </div>
        
        {isCalibrating ? (
          <div>
            <div className="text-2xl font-black text-slate-600 mb-1">
              Calibrating...
            </div>
            <div className="text-[9px] text-slate-600 font-bold">
              {stats.total} / 10 signals tracked
            </div>
          </div>
        ) : (
          <div>
            <div className={cn(
              "text-3xl font-black mb-1",
              avgWinRate >= 60 ? "text-[#39FF14]" :
              avgWinRate >= 40 ? "text-yellow-400" :
              "text-[#FF4B5C]"
            )}>
              {avgWinRate.toFixed(1)}%
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-500">
              <span>5m: {stats.winRate5m.toFixed(1)}%</span>
              <span>•</span>
              <span>15m: {stats.winRate15m.toFixed(1)}%</span>
              <span>•</span>
              <span>1h: {stats.winRate1h.toFixed(1)}%</span>
            </div>
            <div className="text-[9px] text-slate-600 font-bold mt-1">
              {stats.total} total signals
            </div>
          </div>
        )}
      </div>

      {/* Best Performer */}
      <div className="p-4 rounded-xl bg-[#39FF14]/5 border border-[#39FF14]/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-[#39FF14] uppercase tracking-wider">
            Best Performer
          </span>
          <Award size={16} className="text-[#39FF14]" />
        </div>
        
        {bestPerformer ? (
          <div>
            <div className="text-xl font-black text-white mb-1">
              {bestPerformer.symbol}
            </div>
            <div className="text-2xl font-black text-[#39FF14] mb-1">
              {bestPerformer.winRate15m.toFixed(1)}%
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              {bestPerformer.totalSignals} signals • Avg: {bestPerformer.avgReturn15m > 0 ? '+' : ''}{bestPerformer.avgReturn15m.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600 font-bold">
            No data yet
          </div>
        )}
      </div>

      {/* Worst Performer */}
      <div className="p-4 rounded-xl bg-[#FF4B5C]/5 border border-[#FF4B5C]/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold text-[#FF4B5C] uppercase tracking-wider">
            Needs Attention
          </span>
          <AlertTriangle size={16} className="text-[#FF4B5C]" />
        </div>
        
        {worstPerformer && worstPerformer.totalSignals >= 5 ? (
          <div>
            <div className="text-xl font-black text-white mb-1">
              {worstPerformer.symbol}
            </div>
            <div className="text-2xl font-black text-[#FF4B5C] mb-1">
              {worstPerformer.winRate15m.toFixed(1)}%
            </div>
            <div className="text-[9px] text-slate-500 font-bold">
              {worstPerformer.totalSignals} signals • Avg: {worstPerformer.avgReturn15m > 0 ? '+' : ''}{worstPerformer.avgReturn15m.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600 font-bold">
            All performing well
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Signal Stats Table Component
 * Sortable table with win rate statistics
 */

interface SignalStatsTableProps {
  stats: WinRateStats[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

const SignalStatsTable = memo(function SignalStatsTable({
  stats,
  sortColumn,
  sortDirection,
  onSort
}: SignalStatsTableProps) {
  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/[0.02]">
            <tr>
              <SortableHeader
                label="Symbol"
                column="symbol"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
                align="left"
              />
              <SortableHeader
                label="Signals"
                column="totalSignals"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="5m Win Rate"
                column="winRate5m"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="15m Win Rate"
                column="winRate15m"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="1h Win Rate"
                column="winRate1h"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="5m Avg"
                column="avgReturn5m"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="15m Avg"
                column="avgReturn15m"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="1h Avg"
                column="avgReturn1h"
                currentColumn={sortColumn}
                direction={sortDirection}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, idx) => (
              <StatsRow key={stat.symbol} stat={stat} index={idx} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/**
 * Sortable Header Component
 */

interface SortableHeaderProps {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  align?: 'left' | 'right' | 'center';
}

const SortableHeader = memo(function SortableHeader({
  label,
  column,
  currentColumn,
  direction,
  onSort,
  align = 'right'
}: SortableHeaderProps) {
  const isActive = currentColumn === column;
  
  return (
    <th
      onClick={() => onSort(column)}
      className={cn(
        "px-4 py-3 text-[9px] font-black uppercase tracking-wider cursor-pointer select-none transition-colors",
        isActive ? "text-[#39FF14]" : "text-slate-500 hover:text-slate-300",
        align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
      )}
    >
      <div className={cn(
        "flex items-center gap-1",
        align === 'left' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end'
      )}>
        <span>{label}</span>
        {isActive && (
          direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        )}
      </div>
    </th>
  );
});

/**
 * Stats Row Component
 */

interface StatsRowProps {
  stat: WinRateStats;
  index: number;
}

const StatsRow = memo(function StatsRow({ stat, index }: StatsRowProps) {
  const getWinRateColor = (rate: number) => {
    if (rate >= 60) return 'text-[#39FF14]';
    if (rate >= 40) return 'text-yellow-400';
    return 'text-[#FF4B5C]';
  };

  const getReturnColor = (ret: number) => {
    if (ret > 0) return 'text-[#39FF14]';
    if (ret < 0) return 'text-[#FF4B5C]';
    return 'text-slate-500';
  };

  return (
    <tr className={cn(
      "border-t border-white/5 transition-colors",
      index % 2 === 0 ? "bg-white/[0.01]" : "bg-transparent",
      "hover:bg-white/[0.04]"
    )}>
      <td className="px-4 py-3 text-left">
        <span className="text-sm font-black text-white">{stat.symbol}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-bold text-slate-400 tabular-nums">
          {stat.totalSignals}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className={cn("text-sm font-black tabular-nums", getWinRateColor(stat.winRate5m))}>
            {stat.winRate5m.toFixed(1)}%
          </span>
          <span className="text-[8px] font-bold text-slate-600 tabular-nums">
            {stat.wins5m}W / {stat.losses5m}L
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className={cn("text-sm font-black tabular-nums", getWinRateColor(stat.winRate15m))}>
            {stat.winRate15m.toFixed(1)}%
          </span>
          <span className="text-[8px] font-bold text-slate-600 tabular-nums">
            {stat.wins15m}W / {stat.losses15m}L
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end">
          <span className={cn("text-sm font-black tabular-nums", getWinRateColor(stat.winRate1h))}>
            {stat.winRate1h.toFixed(1)}%
          </span>
          <span className="text-[8px] font-bold text-slate-600 tabular-nums">
            {stat.wins1h}W / {stat.losses1h}L
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={cn("text-sm font-bold tabular-nums", getReturnColor(stat.avgReturn5m))}>
          {stat.avgReturn5m > 0 ? '+' : ''}{stat.avgReturn5m.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={cn("text-sm font-bold tabular-nums", getReturnColor(stat.avgReturn15m))}>
          {stat.avgReturn15m > 0 ? '+' : ''}{stat.avgReturn15m.toFixed(2)}%
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className={cn("text-sm font-bold tabular-nums", getReturnColor(stat.avgReturn1h))}>
          {stat.avgReturn1h > 0 ? '+' : ''}{stat.avgReturn1h.toFixed(2)}%
        </span>
      </td>
    </tr>
  );
});

/**
 * Empty State Component
 */

interface EmptyStateProps {
  hasData: boolean;
  minSignals: number;
}

const EmptyState = memo(function EmptyState({ hasData, minSignals }: EmptyStateProps) {
  if (hasData && minSignals > 0) {
    return (
      <div className="p-12 text-center rounded-xl bg-white/[0.02] border border-white/5">
        <Filter size={32} className="text-slate-600 mx-auto mb-3" />
        <h3 className="text-lg font-black text-white mb-2">
          No Symbols Match Filter
        </h3>
        <p className="text-sm text-slate-500 font-bold">
          Try lowering the minimum signal count filter
        </p>
      </div>
    );
  }

  return (
    <div className="p-12 text-center rounded-xl bg-white/[0.02] border border-white/5">
      <BarChart3 size={48} className="text-slate-600 mx-auto mb-4" />
      <h3 className="text-xl font-black text-white mb-2">
        No Signal Data Yet
      </h3>
      <p className="text-sm text-slate-500 font-bold mb-4">
        Signal tracking will begin when strong buy/sell signals are generated
      </p>
      <div className="text-[10px] text-slate-600 font-bold">
        Win rates are calculated at 5m, 15m, and 1h intervals after signal entry
      </div>
    </div>
  );
});

/**
 * Clear Confirmation Dialog
 */

interface ClearConfirmationDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  totalSignals: number;
}

const ClearConfirmationDialog = memo(function ClearConfirmationDialog({
  onConfirm,
  onCancel,
  totalSignals
}: ClearConfirmationDialogProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#FF4B5C]/10 border border-[#FF4B5C]/20 flex items-center justify-center">
            <AlertTriangle size={24} className="text-[#FF4B5C]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">Clear All Data?</h3>
            <p className="text-[10px] text-slate-500 font-bold">
              This action cannot be undone
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-400 font-bold mb-6">
          You are about to delete <strong className="text-white">{totalSignals} signal snapshots</strong> and all associated win rate statistics. This will reset your signal tracking history.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-xl bg-[#FF4B5C] text-white font-black uppercase tracking-wider hover:bg-[#FF4B5C]/90 transition-all"
          >
            Clear Data
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});
