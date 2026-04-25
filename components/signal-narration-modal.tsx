'use client';

import { useState, useMemo } from 'react';
import { 
  X, Copy, Check, ExternalLink, ShieldAlert, Target, TrendingUp, 
  Activity, Zap, BarChart3, Info, AlertTriangle, Scale, Gauge 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ChartModal } from './chart-modal';
import { WinRateBadge } from './win-rate-badge';
import type { SignalNarration } from '@/lib/signal-narration';
import type { ScreenerEntry } from '@/lib/types';

/**
 * Signal Narration Modal - Displays institutional-grade signal analysis
 * Requirements: Requirement 12
 * Design: Institutional Surveillance Brief (2026 Redesign)
 */

interface SignalNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  narration: SignalNarration | null;
  symbol: string;
  entry?: ScreenerEntry;
  rsiPeriod?: number;
  smartMoneyScore?: number;
  orderFlowData?: { ratio: number; pressure: string };
  fundingRate?: { rate: number; annualized: number };
}

export function SignalNarrationModal({
  isOpen,
  onClose,
  narration,
  symbol,
  entry,
  rsiPeriod = 15,
  smartMoneyScore,
  orderFlowData,
  fundingRate,
}: SignalNarrationModalProps) {
  const [copied, setCopied] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(false);

  const handleCopyBrief = async () => {
    if (!narration) return;

    const symbolUrl = `${window.location.origin}/symbol/${symbol}`;
    const priceText = entry ? `Current Price: $${entry.price?.toLocaleString()}\nRSI (15m): ${entry.rsi15m?.toFixed(1) || 'N/A'}` : '';
    
    // Include risk params in brief if they exist
    const riskText = entry?.riskParams ? `
Risk/Reward: ${entry.riskParams.riskRewardRatio}:1
Stop Loss: $${entry.riskParams.stopLoss.toLocaleString()}
Take Profit 1: $${entry.riskParams.takeProfit1.toLocaleString()}
    `.trim() : '';

    const brief = `
${narration.emoji} ${narration.headline}

Symbol: ${symbol}
${priceText}
Conviction: ${narration.conviction}% (${narration.convictionLabel})
${riskText}

Institutional Flow:
• Smart Money: ${smartMoneyScore || 0}
• Funding: ${((fundingRate?.rate || 0) * 100).toFixed(4)}%

Technical Analysis:
${narration.reasons.map((reason, idx) => `• ${reason}`).join('\n')}

View Chart: ${symbolUrl}

---
Powered by Mindscape Analytics Signal Narration Engine™
    `.trim();

    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      toast.success('Institutional brief copied');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────

  const getConvictionColor = (conviction: number) => {
    if (conviction >= 85) return 'text-[#39FF14]';
    if (conviction >= 65) return 'text-emerald-400';
    if (conviction >= 45) return 'text-yellow-400';
    if (conviction >= 25) return 'text-orange-400';
    return 'text-slate-400';
  };

  const getConvictionBg = (conviction: number) => {
    if (conviction >= 85) return 'bg-[#39FF14]/10 border-[#39FF14]/30';
    if (conviction >= 65) return 'bg-emerald-400/10 border-emerald-400/30';
    if (conviction >= 45) return 'bg-yellow-400/10 border-yellow-400/30';
    if (conviction >= 25) return 'bg-orange-400/10 border-orange-400/30';
    return 'bg-slate-400/10 border-slate-400/30';
  };

  const getBiasColor = () => {
    if (!narration) return 'bg-slate-500';
    if (narration.headline.toLowerCase().includes('buy') || narration.emoji.includes('🟢')) return 'bg-[#39FF14]';
    if (narration.headline.toLowerCase().includes('sell') || narration.emoji.includes('🔴')) return 'bg-[#FF4B5C]';
    return 'bg-yellow-400';
  };

  const getBiasLabel = () => {
    if (!narration) return 'NEUTRAL';
    if (narration.headline.toLowerCase().includes('buy') || narration.emoji.includes('🟢')) return 'BULLISH BIAS';
    if (narration.headline.toLowerCase().includes('sell') || narration.emoji.includes('🔴')) return 'BEARISH BIAS';
    return 'CONSOLIDATION';
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[98%] max-w-6xl max-h-[90vh] overflow-hidden bg-[#070B14] border border-white/10 rounded-2xl shadow-[0_0_80px_-20px_rgba(0,0,0,0.8)] z-50 flex flex-col"
          >
            {/* ── Institutional Surveillance Ribbon (Unified Header) ── */}
            <div className="relative border-b border-white/10 bg-gradient-to-r from-blue-500/5 via-transparent to-emerald-500/5 px-5 py-4">
              <div className="flex items-center justify-between gap-6">
                {/* Left: Signal Profile */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="relative">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-3xl bg-white/5 border border-white/10 shadow-inner",
                      narration?.conviction && narration.conviction >= 85 && "shadow-[0_0_20px_-5px_rgba(57,255,20,0.4)] border-[#39FF14]/30"
                    )}>
                      {narration?.emoji || '⚪'}
                    </div>
                    {narration?.conviction && narration.conviction >= 85 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#39FF14] rounded-full animate-ping" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[#39FF14]/10 border border-[#39FF14]/20 animate-pulse">
                        <div className="w-1 h-1 rounded-full bg-[#39FF14]" />
                        <span className="text-[8px] font-black text-[#39FF14] uppercase tracking-widest">Active</span>
                      </div>
                      <span className="text-[10px] font-black tracking-[0.25em] text-blue-400 uppercase">Signal Intel v3</span>
                      <div className={cn("px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter border", getConvictionBg(narration?.conviction || 0))}>
                        {narration?.conviction}% Conviction
                      </div>
                    </div>
                    <h2 className="text-xl font-black text-white tracking-tight leading-none truncate max-w-md">
                      {narration?.headline || 'Analyzing Market Signals...'}
                    </h2>
                    <div className="flex items-center gap-3 mt-1.5 opacity-80 scale-90 origin-left">
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-black text-slate-500 uppercase">Conf:</span>
                        <span className="text-[9px] font-black text-blue-400">{entry?.confluence || 0}%</span>
                      </div>
                      <div className="w-px h-2 bg-white/10" />
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-black text-slate-500 uppercase">Flow:</span>
                        <span className={cn("text-[9px] font-black", (entry?.momentum || 0) > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                          {(entry?.momentum || 0).toFixed(1)}%
                        </span>
                      </div>
                      {entry?.longCandle && (
                        <>
                          <div className="w-px h-2 bg-white/10" />
                          <div className="flex items-center gap-1">
                            <Zap size={8} className="text-yellow-400" />
                            <span className="text-[7px] font-black text-yellow-400 uppercase">Vol Spike</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center: Live Surveillance Metrics (Compact Ribbon) */}
                <div className="hidden lg:flex flex-1 items-center justify-center gap-6 px-6 border-x border-white/5 mx-2">
                  {[
                    { label: 'Symbol', val: symbol, color: 'text-white' },
                    { label: 'Price', val: `$${entry?.price?.toLocaleString() || '-'}`, color: 'text-white font-mono' },
                    { label: '24h Δ', val: `${(entry?.change24h || 0) >= 0 ? '+' : ''}${entry?.change24h?.toFixed(2)}%`, color: (entry?.change24h || 0) >= 0 ? 'text-[#39FF14]' : 'text-[#FF4B5C]' },
                    { label: 'RSI(15m)', val: entry?.rsi15m?.toFixed(1) || 'N/A', color: (entry?.rsi15m || 50) >= 70 ? 'text-[#FF4B5C]' : (entry?.rsi15m || 50) <= 30 ? 'text-[#39FF14]' : 'text-slate-300' },
                    { label: 'Bias', val: getBiasLabel(), color: 'text-white italic', dot: true },
                    { label: 'Win Rate', val: <WinRateBadge symbol={symbol} className="scale-75 origin-left" />, color: 'text-white' },
                  ].map((m, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{m.label}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {m.dot && <div className={cn("w-1.5 h-1.5 rounded-full", getBiasColor())} />}
                        <span className={cn("text-xs font-black tracking-tight", m.color)}>{m.val}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={handleCopyBrief} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all",
                    copied ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]" : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
                  )}>
                    {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Brief'}
                  </button>
                  <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white border border-transparent hover:border-white/10">
                    <X size={20} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Main Intelligence Display (Panoramic Grid) ── */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left: Technical Evidence (High Density) */}
              <div className="flex-[0.68] p-5 border-r border-white/5 overflow-y-auto custom-scrollbar bg-[#090D18]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-blue-400">
                    <BarChart3 size={14} />
                    Evidence Analysis
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {narration?.reasons.map((reason, idx) => (
                    <div 
                      key={idx} 
                      className="group flex items-start gap-3.5 p-3.5 bg-black/40 border border-white/[0.03] rounded-xl hover:bg-white/[0.04] hover:border-blue-500/20 transition-all duration-300"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400 shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-all">
                        {idx + 1}
                      </div>
                      <p className="text-[12px] text-slate-300 leading-tight font-medium pt-0.5 group-hover:text-white transition-colors">
                        {reason}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Data Surveillance Matrix (NEW - Institutional Alignment) */}
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-5">
                  {/* RSI Spectrum Heatmap */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                      <Gauge size={12} className="text-purple-400" />
                      RSI Spectrum Heatmap
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { tf: '1m', val: entry?.rsi1m },
                        { tf: '5m', val: entry?.rsi5m },
                        { tf: '15m', val: entry?.rsi15m },
                        { tf: '1h', val: entry?.rsi1h },
                      ].map(r => (
                        <div key={r.tf} className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-black/40 border border-white/5">
                          <span className="text-[8px] font-black text-slate-500">{r.tf}</span>
                          <span className={cn(
                            "text-[11px] font-black font-mono",
                            (r.val || 50) >= 70 ? "text-[#FF4B5C]" : (r.val || 50) <= 30 ? "text-[#39FF14]" : "text-white"
                          )}>
                            {r.val?.toFixed(0) || '--'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trend & Volume Guard */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                      <ShieldAlert size={12} className="text-orange-400" />
                      Signal DNA
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">OBV Direction</span>
                        <span className={cn("font-black uppercase", entry?.obvTrend === 'bullish' ? 'text-[#39FF14]' : entry?.obvTrend === 'bearish' ? 'text-[#FF4B5C]' : 'text-slate-500')}>
                          {entry?.obvTrend || 'STABLE'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Momentum Flux</span>
                        <span className={cn("font-black tabular-nums", (entry?.momentum || 0) > 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                          {(entry?.momentum || 0).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Candle Profile</span>
                        <span className="font-black text-white uppercase">{entry?.candleDirection || 'NEUTRAL'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Execution Strategy & Market Regime */}
              <div className="flex-[0.32] bg-black/40 p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                {/* Risk Parameters Section */}
                <div className="bg-[#0D121F] border border-white/10 rounded-xl p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                      <Target size={12} className="text-emerald-400" />
                      Execution
                    </h4>
                    {entry?.riskParams && (
                      <div className="px-1.5 py-0.5 rounded-lg bg-emerald-500/10 text-[#39FF14] text-[9px] font-black border border-emerald-500/20">
                        {entry.riskParams.riskRewardRatio}:1 R/R
                      </div>
                    )}
                  </div>
                  
                  {entry?.riskParams ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-lg">
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-tighter mb-1">Target TP</p>
                        <p className="text-xs font-black text-[#39FF14] font-mono leading-none">${entry.riskParams.takeProfit1.toLocaleString()}</p>
                      </div>
                      <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-lg">
                        <p className="text-[7px] font-black text-slate-500 uppercase tracking-tighter mb-1">Stop Loss</p>
                        <p className="text-xs font-black text-[#FF4B5C] font-mono leading-none">${entry.riskParams.stopLoss.toLocaleString()}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center border border-dashed border-white/10 rounded-lg">
                      <p className="text-[8px] font-black text-slate-600 uppercase">Calculating Entry Strategy...</p>
                    </div>
                  )}
                </div>

                {/* Market Intelligence Grid */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3.5">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                      <Activity size={12} className="text-blue-400" />
                      Regime Intel
                    </h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Environment</span>
                        <span className="font-black text-white">{entry?.regime?.regime || 'STABLE'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Confidence</span>
                        <span className="font-black text-[#39FF14]">{entry?.regime?.confidence || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Trend Strength</span>
                        <span className="font-black text-white">{entry?.adx?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">Volatility (ATR)</span>
                        <span className={cn("font-black uppercase", (entry?.atr || 0) > 0.02 ? "text-orange-400" : "text-emerald-400")}>
                          {(entry?.atr || 0) > 0.02 ? 'High' : 'Normal'}
                        </span>
                      </div>
                    </div>

                    {/* Fibonacci Levels (If Available) */}
                    {entry?.fibLevels && (
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                        <h5 className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">Institutional Levels</h5>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center justify-between text-[9px] bg-black/20 p-1.5 rounded border border-white/5">
                            <span className="text-slate-500">61.8%</span>
                            <span className="text-white font-mono font-bold">${entry.fibLevels.level618.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] bg-black/20 p-1.5 rounded border border-white/5">
                            <span className="text-slate-500">50.0%</span>
                            <span className="text-white font-mono font-bold">${entry.fibLevels.level500.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Smart Money & Funding Intel (NEW) */}
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                      <h5 className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Institutional Flow</h5>
                      
                      <div className="bg-black/20 rounded-lg p-2.5 border border-white/5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] text-slate-500 uppercase font-black">Smart Money</span>
                          <span className={cn("text-[9px] font-black", (smartMoneyScore || 0) >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                            {(smartMoneyScore || 0) > 0 ? '+' : ''}{smartMoneyScore || 0}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden flex">
                          <div className={cn("h-full transition-all duration-500", (smartMoneyScore || 0) >= 0 ? "bg-[#39FF14]" : "bg-[#FF4B5C]")} style={{ width: `${Math.min(100, Math.abs(smartMoneyScore || 0) * 2)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500 font-bold uppercase tracking-tighter">Funding</span>
                        <span className={cn("font-mono font-black", (fundingRate?.rate || 0) > 0 ? "text-red-400" : "text-[#39FF14]")}>
                          {(fundingRate?.rate || 0) > 0 ? '+' : ''}{((fundingRate?.rate || 0) * 100).toFixed(4)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action: Full Spectrum Chart */}
                  <button
                    onClick={() => setIsChartOpen(true)}
                    className="group relative overflow-hidden flex items-center justify-center gap-2.5 py-4 bg-white/5 hover:bg-blue-600 border border-white/10 rounded-xl transition-all duration-300 active:scale-[0.98]"
                  >
                    <TrendingUp size={16} className="text-blue-400 group-hover:text-white transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 group-hover:text-white">Expand Full Analysis</span>
                  </button>
                </div>

                {/* Copyright / Attribution */}
                <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-[8px] font-black text-slate-600 uppercase tracking-widest">
                  <span>S.N.E Engine v3.0.4</span>
                  <span>Institutional Guard</span>
                </div>
              </div>
            </div>
          </motion.div>

          <ChartModal
            isOpen={isChartOpen}
            onClose={() => setIsChartOpen(false)}
            symbol={symbol}
            market={entry?.market}
            interval={rsiPeriod.toString()}
          />
        </>
      )}
    </AnimatePresence>
  );
}
