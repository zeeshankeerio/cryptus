'use client';
/**
 * RSIQ Pro — Portfolio Risk Scanner Panel
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
import {
  loadPositions,
  savePositions,
  removePosition,
  clearPortfolio,
  computePortfolioRisk,
  type PortfolioPosition,
  type PortfolioRiskReport,
} from '@/lib/portfolio-scanner';

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

  // Compute risk report from positions + live screener data
  const report: PortfolioRiskReport = useMemo(() => {
    if (!open) return computePortfolioRisk([], []);
    return computePortfolioRisk(positions, data);
  }, [open, positions, data]);

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
    setPositions([]);
    clearPortfolio();
  }, []);

  const handleSelectSuggestion = useCallback((sym: string, price: number) => {
    setNewSymbol(sym);
    setNewEntry(price.toString());
    setShowSuggestions(false);
  }, []);

  // Risk score color
  const riskColor = report.riskScore >= 80 ? 'text-rose-400' : report.riskScore >= 60 ? 'text-orange-400' : report.riskScore >= 40 ? 'text-amber-400' : report.riskScore >= 20 ? 'text-emerald-400' : 'text-[#39FF14]';
  const riskBg = report.riskScore >= 80 ? 'from-rose-500/20' : report.riskScore >= 60 ? 'from-orange-500/20' : report.riskScore >= 40 ? 'from-amber-500/20' : 'from-emerald-500/20';

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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-[#0a0f1e] to-slate-950 shadow-[0_0_80px_rgba(0,0,0,0.6)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-sm">🛡️</span>
                </div>
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight">Portfolio Risk Scanner</h2>
                  <p className="text-[10px] text-slate-500">Real-time risk analysis, P&L tracking & hedge suggestions</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all">✕</button>
            </div>

            <div className="overflow-auto p-6 max-h-[calc(90vh-80px)]">
              {/* ── Risk Overview Cards ── */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                {/* Total Value */}
                <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Portfolio Value</span>
                  <div className="text-lg font-black text-white tabular-nums mt-1">${formatPrice(report.totalValue)}</div>
                </div>

                {/* P&L */}
                <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Unrealized P&L</span>
                  <div className={cn("text-lg font-black tabular-nums mt-1", report.totalPnl >= 0 ? 'text-[#39FF14]' : 'text-[#FF4B5C]')}>
                    {report.totalPnl >= 0 ? '+' : ''}{formatPrice(report.totalPnl)}
                    <span className="text-[10px] ml-1">({report.totalPnlPercent >= 0 ? '+' : ''}{report.totalPnlPercent.toFixed(1)}%)</span>
                  </div>
                </div>

                {/* Portfolio RSI */}
                <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Portfolio RSI</span>
                  <div className={cn("text-lg font-black tabular-nums mt-1",
                    report.portfolioRsi === null ? 'text-slate-600' :
                    report.portfolioRsi >= 70 ? 'text-[#FF4B5C]' :
                    report.portfolioRsi <= 30 ? 'text-[#39FF14]' : 'text-slate-300'
                  )}>
                    {report.portfolioRsi !== null ? report.portfolioRsi.toFixed(1) : '—'}
                  </div>
                </div>

                {/* Risk Score */}
                <div className={cn("bg-gradient-to-br to-transparent border border-white/5 rounded-2xl p-3", riskBg)}>
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Risk Score</span>
                  <div className={cn("text-lg font-black tabular-nums mt-1", riskColor)}>
                    {report.riskScore}
                    <span className="text-[10px] ml-1 text-slate-400">/ 100</span>
                  </div>
                  <span className={cn("text-[8px] font-black uppercase", riskColor)}>{report.riskLabel}</span>
                </div>

                {/* Concentration */}
                <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-3">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Concentration</span>
                  <div className="text-[11px] font-black text-slate-300 mt-1">{report.concentrationLabel}</div>
                  <span className="text-[8px] text-slate-600 tabular-nums">HHI: {report.concentrationHhi}</span>
                </div>
              </div>

              {/* ── Add Position Form ── */}
              <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 mb-6">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Add Position</h3>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[140px]">
                    <label className="text-[8px] font-bold text-slate-600 uppercase">Symbol</label>
                    <input
                      value={newSymbol}
                      onChange={e => { setNewSymbol(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="BTCUSDT"
                      className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-slate-700 focus:outline-none focus:border-[#39FF14]/50 transition-colors"
                    />
                    {/* Autocomplete dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 rounded-xl overflow-hidden z-10 shadow-2xl">
                        {suggestions.map(s => (
                          <button
                            key={s.symbol}
                            onMouseDown={() => handleSelectSuggestion(s.symbol, s.price)}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors"
                          >
                            <span className="text-[10px] font-bold text-slate-300">{s.alias}</span>
                            <span className="text-[10px] font-bold text-slate-500 tabular-nums">${formatPrice(s.price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-24">
                    <label className="text-[8px] font-bold text-slate-600 uppercase">Quantity</label>
                    <input
                      value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      placeholder="1.5"
                      type="number"
                      step="any"
                      className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-slate-700 focus:outline-none focus:border-[#39FF14]/50 transition-colors tabular-nums"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-[8px] font-bold text-slate-600 uppercase">Entry Price</label>
                    <input
                      value={newEntry}
                      onChange={e => setNewEntry(e.target.value)}
                      placeholder="65000"
                      type="number"
                      step="any"
                      className="w-full mt-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-slate-700 focus:outline-none focus:border-[#39FF14]/50 transition-colors tabular-nums"
                    />
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={!newSymbol || !newQty || !newEntry}
                    className="px-4 py-2 bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#39FF14]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    + Add
                  </button>
                  {positions.length > 0 && (
                    <button
                      onClick={handleClear}
                      className="px-3 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* ── Positions Table ── */}
              {report.positions.length > 0 && (
                <div className="bg-slate-900/30 border border-white/5 rounded-2xl overflow-hidden mb-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/5">
                        {['Asset', 'Qty', 'Entry', 'Current', 'Value', 'P&L', 'Weight', 'RSI', 'Risk', ''].map(h => (
                          <th key={h} className="px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-widest text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.positions.map(pos => (
                        <tr key={pos.symbol} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2.5 text-[11px] font-black text-white">{getSymbolAlias(pos.symbol)}</td>
                          <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400 tabular-nums">{pos.quantity}</td>
                          <td className="px-3 py-2.5 text-[10px] font-bold text-slate-500 tabular-nums">${formatPrice(pos.entryPrice)}</td>
                          <td className="px-3 py-2.5 text-[10px] font-bold text-slate-300 tabular-nums">${formatPrice(pos.currentPrice)}</td>
                          <td className="px-3 py-2.5 text-[10px] font-black text-white tabular-nums">${formatPrice(pos.marketValue)}</td>
                          <td className={cn("px-3 py-2.5 text-[10px] font-black tabular-nums", pos.pnl >= 0 ? 'text-[#39FF14]' : 'text-[#FF4B5C]')}>
                            {pos.pnl >= 0 ? '+' : ''}{formatPrice(pos.pnl)} ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(1)}%)
                          </td>
                          <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400 tabular-nums">{pos.weight.toFixed(1)}%</td>
                          <td className={cn("px-3 py-2.5 text-[10px] font-black tabular-nums",
                            pos.rsi === null ? 'text-slate-700' :
                            pos.rsi >= 70 ? 'text-[#FF4B5C]' :
                            pos.rsi <= 30 ? 'text-[#39FF14]' : 'text-slate-400'
                          )}>
                            {pos.rsi !== null ? pos.rsi.toFixed(1) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-[10px] font-bold text-slate-500 tabular-nums">{pos.riskContribution}%</td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => handleRemove(pos.symbol)}
                              className="text-slate-600 hover:text-rose-400 transition-colors text-xs"
                              title="Remove position"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Hedge Suggestions ── */}
              {report.hedgeSuggestions.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4">
                  <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3">⚠️ Risk Alerts & Hedge Suggestions</h3>
                  <div className="space-y-2">
                    {report.hedgeSuggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={cn("mt-0.5 text-[8px] font-black px-1.5 py-0.5 rounded uppercase",
                          s.urgency === 'high' ? 'bg-rose-500/20 text-rose-400' :
                          s.urgency === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-500/20 text-slate-400'
                        )}>{s.urgency}</span>
                        <span className="text-[10px] text-slate-300 leading-relaxed">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {positions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <span className="text-4xl">💼</span>
                  <p className="text-sm text-slate-400 font-medium">No positions added yet</p>
                  <p className="text-[10px] text-slate-600 max-w-md text-center">Add your crypto, forex, metals, or stock positions above to get real-time risk analysis with RSI-weighted scoring and automated hedge suggestions.</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
