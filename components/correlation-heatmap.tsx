'use client';
/**
 * RSIQ Pro — Correlation Heatmap Panel
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Renders an NxN heatmap matrix showing real-time Pearson correlations
 * between tracked assets. Includes top correlated/anti-correlated pair insights.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { getSymbolAlias } from '@/lib/symbol-utils';
import type { ScreenerEntry } from '@/lib/types';
import {
  computeCorrelationMatrix,
  pricesToReturns,
  getCorrelationColor,
  getCorrelationTextColor,
  type CorrelationMatrix,
  type AssetReturns,
} from '@/lib/correlation-engine';

interface CorrelationHeatmapProps {
  open: boolean;
  onClose: () => void;
  data: ScreenerEntry[];
}

export function CorrelationHeatmap({ open, onClose, data }: CorrelationHeatmapProps) {
  const [maxAssets, setMaxAssets] = useState(12);

  // Compute correlation matrix from screener data (closes array → returns → Pearson)
  const matrix: CorrelationMatrix | null = useMemo(() => {
    if (!open || data.length < 2) return null;

    // Filter to entries that have historical closes (needed for returns)
    const withCloses = data
      .filter(e => e.historicalCloses && e.historicalCloses.length >= 15)
      .slice(0, maxAssets);

    if (withCloses.length < 2) return null;

    const assetReturns: AssetReturns[] = withCloses.map(e => ({
      symbol: e.symbol,
      returns: pricesToReturns(e.historicalCloses || []),
    }));

    return computeCorrelationMatrix(assetReturns);
  }, [open, data, maxAssets]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Panel */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-[#0a0f1e] to-slate-950 shadow-[0_0_80px_rgba(0,0,0,0.6)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                  <span className="text-sm">🔗</span>
                </div>
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight">Correlation Heatmap</h2>
                  <p className="text-[10px] text-slate-500">Real-time Pearson correlations across your watchlist</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Asset count control */}
                <select
                  value={maxAssets}
                  onChange={e => setMaxAssets(Number(e.target.value))}
                  className="bg-slate-900/80 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-300 cursor-pointer"
                >
                  <option value={8}>Top 8</option>
                  <option value={12}>Top 12</option>
                  <option value={16}>Top 16</option>
                  <option value={20}>Top 20</option>
                </select>

                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-auto p-6 max-h-[calc(85vh-80px)]">
              {!matrix ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="text-4xl">📊</span>
                  <p className="text-sm text-slate-400 font-medium">Insufficient data for correlation analysis</p>
                  <p className="text-[10px] text-slate-600">Need at least 2 assets with 15+ historical data points</p>
                </div>
              ) : (
                <>
                  {/* Heatmap Grid */}
                  <div className="overflow-x-auto">
                    <table className="border-collapse mx-auto">
                      <thead>
                        <tr>
                          <th className="w-16" />
                          {matrix.symbols.map(sym => (
                            <th key={sym} className="px-1 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {getSymbolAlias(sym).slice(0, 6)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.symbols.map((rowSym, i) => (
                          <tr key={rowSym}>
                            <td className="pr-2 py-0.5 text-[8px] font-black text-slate-500 text-right uppercase tracking-wider whitespace-nowrap">
                              {getSymbolAlias(rowSym).slice(0, 6)}
                            </td>
                            {matrix.symbols.map((colSym, j) => {
                              const r = matrix.matrix[i][j];
                              const isDiagonal = i === j;
                              return (
                                <td
                                  key={colSym}
                                  className={cn(
                                    'w-9 h-9 text-center text-[9px] font-black tabular-nums border border-white/5 transition-all',
                                    isDiagonal ? 'bg-slate-800/60' : getCorrelationColor(r),
                                    getCorrelationTextColor(r),
                                    !isDiagonal && 'hover:ring-1 hover:ring-white/30 cursor-help'
                                  )}
                                  title={isDiagonal ? `${getSymbolAlias(rowSym)} vs itself` : `${getSymbolAlias(rowSym)} ↔ ${getSymbolAlias(colSym)}: r = ${r.toFixed(2)}`}
                                >
                                  {isDiagonal ? '—' : r.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <span className="text-[8px] text-slate-600 font-bold">-1.0</span>
                    <div className="flex h-2 rounded-full overflow-hidden w-48">
                      <div className="flex-1 bg-rose-500" />
                      <div className="flex-1 bg-rose-500/60" />
                      <div className="flex-1 bg-rose-500/25" />
                      <div className="flex-1 bg-slate-700" />
                      <div className="flex-1 bg-emerald-500/25" />
                      <div className="flex-1 bg-emerald-500/60" />
                      <div className="flex-1 bg-emerald-500" />
                    </div>
                    <span className="text-[8px] text-slate-600 font-bold">+1.0</span>
                  </div>

                  {/* Insights */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    {/* Top Positive */}
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                      <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">🔗 Most Correlated</h3>
                      {matrix.topPositive.length === 0 ? (
                        <p className="text-[10px] text-slate-500">No significant positive correlations</p>
                      ) : (
                        <div className="space-y-2">
                          {matrix.topPositive.map(p => (
                            <div key={`${p.symbolA}-${p.symbolB}`} className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-300">
                                {getSymbolAlias(p.symbolA)} ↔ {getSymbolAlias(p.symbolB)}
                              </span>
                              <span className="text-[10px] font-black text-emerald-400 tabular-nums">{p.coefficient.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Top Negative (Hedging Opportunities) */}
                    <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4">
                      <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-3">🛡️ Hedge Opportunities</h3>
                      {matrix.topNegative.length === 0 ? (
                        <p className="text-[10px] text-slate-500">No significant negative correlations found</p>
                      ) : (
                        <div className="space-y-2">
                          {matrix.topNegative.map(p => (
                            <div key={`${p.symbolA}-${p.symbolB}`} className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-300">
                                {getSymbolAlias(p.symbolA)} ↔ {getSymbolAlias(p.symbolB)}
                              </span>
                              <span className="text-[10px] font-black text-rose-400 tabular-nums">{p.coefficient.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
