'use client';
/**
 * RSIQ Pro - Portfolio Risk Scanner Panel
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Premium institutional feature that lets users input positions and receive
 * real-time portfolio risk analysis with hedge suggestions.
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatPrice } from '@/lib/utils';
import { getSymbolAlias } from '@/lib/symbol-utils';
import type { ScreenerEntry } from '@/lib/types';
import { useLivePrices } from '@/hooks/use-live-prices';
import {
  loadPositions,
  savePositions,
  removePosition,
  clearPortfolio,
  computePortfolioRisk,
  type PortfolioPosition,
  type PortfolioRiskReport,
} from '@/lib/portfolio-scanner';
import { Target, Shield, AlertTriangle, Trash2, Plus, ArrowUpRight, ArrowDownRight, LayoutGrid, List } from 'lucide-react';

interface PortfolioScannerPanelProps {
  open: boolean;
  onClose: () => void;
  data: ScreenerEntry[];
}

export function PortfolioScannerPanel({ open, onClose, data }: PortfolioScannerPanelProps) {
  const [positions, setPositions] = useState<PortfolioPosition[]>(() => loadPositions());
  const [newSymbol, setNewSymbol] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newEntry, setNewEntry] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Subscribe to real-time prices for portfolio symbols
  const portfolioSymbols = useMemo(() => new Set(positions.map(p => p.symbol.toUpperCase())), [positions]);
  const { livePrices } = useLivePrices(portfolioSymbols, 100); // 100ms throttle for high-density flux

  // Compute risk report from positions + live screener data + real-time ticks
  const report: PortfolioRiskReport = useMemo(() => {
    if (!open) return computePortfolioRisk([], [], livePrices);
    return computePortfolioRisk(positions, data, livePrices);
  }, [open, positions, data, livePrices]);

  // Symbol autocomplete suggestions
  const suggestions = useMemo(() => {
    if (!newSymbol || newSymbol.length < 1) return [];
    const q = newSymbol.toUpperCase();
    return data
      .filter(e => e.symbol.toUpperCase().includes(q) || getSymbolAlias(e.symbol).toUpperCase().includes(q))
      .slice(0, 6)
      .map(e => ({ symbol: e.symbol, alias: getSymbolAlias(e.symbol), price: e.price }));
  }, [newSymbol, data]);

  const handleAdd = useCallback(() => {
    const symbol = newSymbol.trim().toUpperCase();
    const qty = parseFloat(newQty);
    const entry = parseFloat(newEntry);

    if (!symbol || isNaN(qty) || qty <= 0 || isNaN(entry) || entry <= 0) return;

    const updated = [...positions, { symbol, quantity: qty, entryPrice: entry }];
    setPositions(updated);
    savePositions(updated);
    setNewSymbol('');
    setNewQty('');
    setNewEntry('');
  }, [newSymbol, newQty, newEntry, positions]);

  const handleRemove = useCallback((sym: string) => {
    const updated = positions.filter(p => p.symbol !== sym);
    setPositions(updated);
    removePosition(sym);
  }, [positions]);

  const handleClear = useCallback(() => {
    if (!confirm('Purge all portfolio data?')) return;
    setPositions([]);
    clearPortfolio();
  }, []);

  const handleSelectSuggestion = useCallback((sym: string, price: number) => {
    setNewSymbol(sym);
    setNewEntry(price.toString());
    setShowSuggestions(false);
  }, []);

  // Risk Score Visualization Logic
  const riskColor = report.riskScore >= 80 ? 'text-[#FF4B5C]' : report.riskScore >= 60 ? 'text-orange-500' : report.riskScore >= 40 ? 'text-amber-500' : report.riskScore >= 20 ? 'text-emerald-500' : 'text-[#39FF14]';
  const riskBorder = report.riskScore >= 80 ? 'border-[#FF4B5C]/30' : report.riskScore >= 60 ? 'border-orange-500/30' : report.riskScore >= 40 ? 'border-amber-500/30' : 'border-emerald-500/30';

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
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#04080F]/90 backdrop-blur-md" />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="relative w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0A0F1B]/95 shadow-[0_40px_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Command Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                  <Shield size={20} className="text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white tracking-tight uppercase">Risk Scanner Engine</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{positions.length} Positions Under Monitor</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {positions.length > 0 && (
                  <button
                    onClick={handleClear}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl text-[9px] font-black text-rose-400 uppercase tracking-widest transition-all"
                  >
                    <Trash2 size={12} />
                    Purge All
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-all group"
                >
                  <span className="text-xl group-hover:rotate-90 transition-transform">✕</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-8 custom-scrollbar">
              {/* ── Intelligence HUD ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                {/* Risk Score Hub */}
                <div className={cn("lg:col-span-4 bg-black/30 border rounded-3xl p-6 flex items-center gap-6", riskBorder)}>
                  <div className="relative w-24 h-24 flex items-center justify-center">
                     <svg className="w-full h-full transform -rotate-90">
                       <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                       <circle cx="48" cy="48" r="44" stroke="currentColor" strokeWidth="8" fill="transparent" className={riskColor} strokeDasharray={276} strokeDashoffset={276 - (276 * report.riskScore) / 100} strokeLinecap="round" />
                     </svg>
                     <div className="absolute flex flex-col items-center">
                        <span className={cn("text-2xl font-black tabular-nums", riskColor)}>{report.riskScore}</span>
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Score</span>
                     </div>
                  </div>
                  <div className="flex-1">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Current Threat Level</span>
                    <h3 className={cn("text-xl font-black uppercase tracking-tight mt-1", riskColor)}>{report.riskLabel}</h3>
                    <p className="text-[10px] text-slate-400 font-medium mt-1 leading-relaxed">{report.concentrationLabel}</p>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Net Asset Value', value: `$${formatPrice(report.totalValue)}`, icon: <Target size={14} />, color: 'text-white' },
                    { 
                      label: 'Portfolio P&L', 
                      value: `${report.totalPnl >= 0 ? '+' : ''}${formatPrice(report.totalPnl)}`, 
                      percent: `${report.totalPnlPercent >= 0 ? '+' : ''}${report.totalPnlPercent.toFixed(2)}%`,
                      color: report.totalPnl >= 0 ? 'text-[#39FF14]' : 'text-rose-500' 
                    },
                    { 
                      label: 'Aggregate RSI', 
                      value: report.portfolioRsi !== null ? report.portfolioRsi.toFixed(1) : '-',
                      color: report.portfolioRsi === null ? 'text-slate-300' : report.portfolioRsi >= 70 ? 'text-rose-500' : report.portfolioRsi <= 30 ? 'text-[#39FF14]' : 'text-slate-300'
                    },
                    { label: 'HHI Index', value: report.concentrationHhi, labelExtra: 'Concentration', color: 'text-slate-400' }
                  ].map((stat, i) => (
                    <div key={i} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 flex flex-col justify-between group hover:bg-white/[0.04] transition-all">
                       <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{stat.label}</span>
                       <div className="mt-2">
                         <div className={cn("text-lg font-black tabular-nums", stat.color)}>{stat.value}</div>
                         {stat.percent && <div className={cn("text-[9px] font-bold mt-0.5", stat.color)}>{stat.percent}</div>}
                         {stat.labelExtra && <div className="text-[9px] font-bold text-slate-700 mt-0.5 uppercase tracking-tighter">{stat.labelExtra}</div>}
                       </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Operational Entry ── */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Plus size={14} className="text-[#39FF14]" />
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Deploy New Position</h3>
                </div>
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Symbol Identity</label>
                    <input
                      value={newSymbol}
                      onChange={e => { setNewSymbol(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="BTCUSDT / EURUSD..."
                      className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white placeholder-slate-800 focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0A0F1B] border border-white/10 rounded-2xl overflow-hidden z-[600] shadow-[0_20px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                        {suggestions.map(s => (
                          <button
                            key={s.symbol}
                            onMouseDown={() => handleSelectSuggestion(s.symbol, s.price)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/[0.03] last:border-0"
                          >
                            <span className="text-[11px] font-black text-white">{s.alias}</span>
                            <span className="text-[10px] font-black text-slate-500 tabular-nums">${formatPrice(s.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-32">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Volume</label>
                    <input
                      value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner tabular-nums"
                    />
                  </div>
                  <div className="w-40">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest ml-1">Execution Price</label>
                    <input
                      value={newEntry}
                      onChange={e => setNewEntry(e.target.value)}
                      placeholder="0.00"
                      type="number"
                      className="w-full mt-2 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner tabular-nums"
                    />
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={!newSymbol || !newQty || !newEntry}
                    className="h-[46px] px-8 bg-cyan-500 text-black rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-cyan-400 disabled:opacity-20 disabled:grayscale transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                  >
                    Commit Entry
                  </button>
                </div>
              </div>

              {/* ── Active Positions ── */}
              {report.positions.length > 0 ? (
                <div className="space-y-6">
                  <div className="bg-black/20 border border-white/[0.05] rounded-3xl overflow-hidden shadow-2xl">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-white/[0.02]">
                          {['Symbol', 'Quantity', 'Entry Basis', 'Price Action', 'Market Value', 'P&L Insight', 'Exposure', 'RSI', ''].map(h => (
                            <th key={h} className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] text-left border-b border-white/[0.05]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.positions.map(pos => (
                          <tr key={pos.symbol} className="group hover:bg-white/[0.02] transition-all border-b border-white/[0.03] last:border-0">
                            <td className="px-6 py-5 font-black text-white text-[12px]">{getSymbolAlias(pos.symbol)}</td>
                            <td className="px-6 py-5 font-bold text-slate-400 text-[11px] tabular-nums">{pos.quantity}</td>
                            <td className="px-6 py-5 font-bold text-slate-600 text-[11px] tabular-nums">${formatPrice(pos.entryPrice)}</td>
                            <td className="px-6 py-5 font-black text-slate-300 text-[11px] tabular-nums">
                               <div className="flex items-center gap-2">
                                 ${formatPrice(pos.currentPrice)}
                                 {pos.pnl >= 0 ? <ArrowUpRight size={12} className="text-[#39FF14]" /> : <ArrowDownRight size={12} className="text-rose-500" />}
                               </div>
                            </td>
                            <td className="px-6 py-5 font-black text-white text-[11px] tabular-nums">${formatPrice(pos.marketValue)}</td>
                            <td className={cn("px-6 py-5 font-black text-[11px] tabular-nums", pos.pnl >= 0 ? 'text-[#39FF14]' : 'text-rose-500')}>
                              <span className="opacity-90">{pos.pnl >= 0 ? '+' : ''}{formatPrice(pos.pnl)}</span>
                              <span className="ml-2 px-1.5 py-0.5 rounded-lg bg-current/10 border border-current/20 text-[9px]">{pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%</span>
                            </td>
                            <td className="px-6 py-5">
                               <div className="flex flex-col gap-1 w-20">
                                 <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                   <div className="h-full bg-cyan-500" style={{ width: `${pos.weight}%` }} />
                                 </div>
                                 <span className="text-[9px] font-black text-slate-600 tabular-nums">{pos.weight.toFixed(1)}%</span>
                               </div>
                            </td>
                            <td className={cn("px-6 py-5 font-black tabular-nums text-[11px]",
                              pos.rsi === null ? 'text-slate-800' :
                              pos.rsi >= 70 ? 'text-rose-500' :
                              pos.rsi <= 30 ? 'text-[#39FF14]' : 'text-slate-500'
                            )}>
                              {pos.rsi !== null ? pos.rsi.toFixed(1) : '-'}
                            </td>
                            <td className="px-6 py-5">
                              <button
                                onClick={() => handleRemove(pos.symbol)}
                                className="w-8 h-8 rounded-xl bg-rose-500/5 hover:bg-rose-500/20 text-rose-500/40 hover:text-rose-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Defensive Intelligence (Hedges) ── */}
                  {report.hedgeSuggestions.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {report.hedgeSuggestions.map((s, i) => (
                        <div key={i} className="bg-amber-500/[0.03] border border-amber-500/10 rounded-3xl p-5 flex items-start gap-4 hover:bg-amber-500/[0.05] transition-all group">
                          <div className={cn("mt-1 p-2 rounded-xl bg-amber-500/10 text-amber-500", s.urgency === 'high' && 'animate-pulse')}>
                             <AlertTriangle size={16} />
                          </div>
                          <div className="flex-1">
                             <div className="flex items-center gap-2 mb-1">
                               <span className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                                 s.urgency === 'high' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                               )}>{s.urgency} Risk Alert</span>
                             </div>
                             <p className="text-[10px] font-black text-slate-300 leading-relaxed uppercase tracking-tight">{s.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-32 opacity-30">
                  <div className="w-24 h-24 rounded-full bg-slate-900 flex items-center justify-center mb-6">
                     <Shield size={40} className="text-slate-700" />
                  </div>
                  <h4 className="text-xs font-black text-white uppercase tracking-[0.3em] mb-2">No Active Intelligence</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center max-w-sm">Commit positions above to initiate real-time risk modeling and volatility correlation analysis.</p>
                </div>
              )}
            </div>

            {/* Terminal Footer */}
            <div className="px-8 py-4 border-t border-white/[0.05] flex items-center justify-between opacity-50">
               <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">Advanced Risk Matrix v4.1</span>
               <div className="flex items-center gap-4 text-[8px] font-black text-slate-600 uppercase tracking-[0.4em]">
                  <span className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-[#39FF14]" /> Neural Latency: 12ms</span>
                  <span className="tabular-nums">Updated: {new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())}</span>
               </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
