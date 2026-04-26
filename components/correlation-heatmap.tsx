'use client';
/**
 * RSIQ Pro - Correlation Heatmap Panel
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
import { TrendingUp, TrendingDown, Info, Activity } from 'lucide-react';

interface CorrelationHeatmapProps {
  open: boolean;
  onClose: () => void;
  data: ScreenerEntry[];
}

export function CorrelationHeatmap({ open, onClose, data }: CorrelationHeatmapProps) {
  const [maxAssets, setMaxAssets] = useState(12);

  // Compute correlation matrix from screener data
  const matrix: CorrelationMatrix | null = useMemo(() => {
    if (!open || data.length < 2) return null;

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
           className="fixed inset-0 z-[500] flex items-center justify-center p-4 lg:p-8"
           onClick={onClose}
        >
          {/* Deep Institutional Backdrop */}
          <div className="absolute inset-0 bg-[#04080F]/90 backdrop-blur-md" />

          {/* Dynamic Glow Hub */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />

          {/* Interactive Panel */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0A0F1B]/95 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Command Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 border border-violet-500/30 flex items-center justify-center shadow-lg shadow-violet-500/10">
                  <span className="text-lg">🔗</span>
                </div>
                <div>
                  <h2 className="text-base font-black text-white tracking-tight uppercase">Correlation Matrix</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1 h-1 rounded-full bg-[#39FF14] animate-pulse" />
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Real-time Pearson Analysis v2.0</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="bg-black/40 border border-white/10 rounded-xl px-1.5 py-1.5 flex items-center gap-1.5">
                  <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-1.5 mr-1">Sample Size:</span>
                  {[8, 12, 16, 20].map(val => (
                    <button
                      key={val}
                      onClick={() => setMaxAssets(val)}
                      className={cn(
                        "px-2.5 py-1 text-[9px] font-black rounded-lg transition-all",
                        maxAssets === val ? "bg-white text-black" : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-all group"
                >
                  <span className="text-xl group-hover:rotate-90 transition-transform">✕</span>
                </button>
              </div>
            </div>

            {/* Operational Body */}
            <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-white/[0.005]">
              {!matrix ? (
                <div className="flex flex-col items-center justify-center py-32 gap-6 opacity-40">
                  <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center animate-pulse">
                     <span className="text-4xl text-slate-600">📊</span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-400 font-black uppercase tracking-widest">Insufficient Market Context</p>
                    <p className="text-[10px] text-slate-600 uppercase font-bold mt-2">Requirement: 2+ active assets with 15H+ history</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  {/* Heatmap Visualization */}
                  <div className="overflow-visible mb-12 flex justify-center">
                    <table className="border-collapse">
                      <thead>
                        <tr>
                          <th className="w-20" />
                          {matrix.symbols.map(sym => (
                            <th key={sym} className="px-1.5 py-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.15em]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              <span className="hover:text-white transition-colors cursor-default">{getSymbolAlias(sym)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.symbols.map((rowSym, i) => (
                          <tr key={rowSym} className="group/row">
                            <td className="pr-4 py-1 text-[10px] font-black text-slate-500 text-right uppercase tracking-wider whitespace-nowrap group-hover/row:text-white transition-colors">
                              {getSymbolAlias(rowSym)}
                            </td>
                            {matrix.matrix[i].map((r, j) => {
                              const isDiagonal = i === j;
                              return (
                                <motion.td
                                  key={matrix.symbols[j]}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: (i + j) * 0.01, duration: 0.2 }}
                                  className={cn(
                                    'w-11 h-11 sm:w-12 sm:h-12 text-center text-[11px] font-black tabular-nums border border-[#0A0F1B] transition-all relative overflow-hidden',
                                    isDiagonal ? 'bg-slate-900/40 text-slate-700' : getCorrelationColor(r),
                                    !isDiagonal && getCorrelationTextColor(r),
                                    !isDiagonal && 'hover:scale-[1.12] hover:z-10 hover:shadow-2xl hover:rounded-sm cursor-help active:scale-95'
                                  )}
                                  title={isDiagonal ? `${getSymbolAlias(rowSym)} Identity` : `${getSymbolAlias(rowSym)} ↔ ${getSymbolAlias(matrix.symbols[j])}: ${r.toFixed(3)}`}
                                >
                                  {isDiagonal ? '-' : r.toFixed(2)}
                                  {!isDiagonal && Math.abs(r) > 0.8 && (
                                    <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-white/20 animate-pulse" />
                                  )}
                                </motion.td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pro Intensity Scale */}
                  <div className="flex flex-col items-center gap-4 mb-12">
                    <div className="flex items-center gap-10">
                       <div className="flex flex-col items-center">
                         <span className="text-[10px] font-black text-rose-500 tracking-tighter">-1.00</span>
                         <span className="text-[7px] font-black text-slate-600 uppercase mt-1">Inverse</span>
                       </div>
                       <div className="relative group">
                         <div className="flex h-3.5 rounded-full overflow-hidden w-64 border border-white/5 shadow-inner">
                            <div className="flex-1 bg-gradient-to-r from-rose-500 via-slate-800 to-emerald-500" />
                         </div>
                         <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest bg-black/40 px-2 py-1 rounded-lg border border-white/10">Pearson Coefficient Scale</span>
                         </div>
                       </div>
                       <div className="flex flex-col items-center">
                         <span className="text-[10px] font-black text-emerald-400 tracking-tighter">+1.00</span>
                         <span className="text-[7px] font-black text-slate-600 uppercase mt-1">Direct</span>
                       </div>
                    </div>
                  </div>

                  {/* Institutional Intel Blocks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Top Clusters */}
                    <div
                      className="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-3xl p-6 relative overflow-hidden group hover:bg-emerald-500/[0.05] transition-all"
                    >
                      <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Dominant Correlations
                      </h3>
                      {matrix.topPositive.length === 0 ? (
                        <p className="text-[10px] text-slate-500 font-bold uppercase py-4">Equilibrium state detected</p>
                      ) : (
                        <div className="space-y-3">
                          {matrix.topPositive.map(p => (
                            <div key={`${p.symbolA}-${p.symbolB}`} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/[0.02] hover:border-emerald-500/20 transition-all">
                              <span className="text-[11px] font-black text-white uppercase tracking-tight">
                                {getSymbolAlias(p.symbolA)} <span className="text-slate-600 px-1 opacity-50">/</span> {getSymbolAlias(p.symbolB)}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[12px] font-black text-emerald-400 tabular-nums">{(p.coefficient * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hedging Suggestions */}
                    <div
                       className="bg-rose-500/[0.03] border border-rose-500/10 rounded-3xl p-6 relative overflow-hidden group hover:bg-rose-500/[0.05] transition-all"
                    >
                      <h3 className="text-[11px] font-black text-rose-400 uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        Counter-Trend Nodes
                      </h3>
                      {matrix.topNegative.length === 0 ? (
                        <p className="text-[10px] text-slate-500 font-bold uppercase py-4">High systemic beta found</p>
                      ) : (
                        <div className="space-y-3">
                          {matrix.topNegative.map(p => (
                            <div key={`${p.symbolA}-${p.symbolB}`} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/[0.02] hover:border-rose-500/20 transition-all">
                              <span className="text-[11px] font-black text-white uppercase tracking-tight">
                                {getSymbolAlias(p.symbolA)} <span className="text-slate-600 px-1 opacity-50">/</span> {getSymbolAlias(p.symbolB)}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-[12px] font-black text-rose-400 tabular-nums">{(p.coefficient * 100).toFixed(0)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Terminal Footer */}
            <div className="px-8 py-4 border-t border-white/[0.05] flex items-center justify-between opacity-50">
               <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">Proprietary Pearson Engine</span>
               <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em] tabular-nums">Refreshed: {new Date().toLocaleTimeString()}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
