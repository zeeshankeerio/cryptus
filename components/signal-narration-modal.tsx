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
}

export function SignalNarrationModal({
  isOpen,
  onClose,
  narration,
  symbol,
  entry,
  rsiPeriod = 15,
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
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[95%] max-w-5xl max-h-[85vh] overflow-hidden bg-[#070B14] border border-white/10 rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] z-50 flex flex-col"
          >
            {/* Header: Surveillance Brief */}
            <div className="relative border-b border-white/5 bg-gradient-to-r from-blue-500/5 to-transparent p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-3xl bg-white/5 border border-white/10", 
                      narration?.conviction && narration.conviction >= 85 && "shadow-[0_0_20px_-5px_rgba(57,255,20,0.4)] border-[#39FF14]/30"
                    )}>
                      {narration?.emoji || '⚪'}
                    </div>
                    {/* Animated Pulse for high conviction */}
                    {narration?.conviction && narration.conviction >= 85 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#39FF14] rounded-full animate-ping" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-black tracking-[0.2em] text-blue-400 uppercase">Signal Narration Engine v2</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold text-slate-500 uppercase">Live Intelligence</span>
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight leading-none">
                      {narration?.headline || 'Analyzing Market Signals...'}
                    </h2>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-white">
                  <X size={24} strokeWidth={2.5} />
                </button>
              </div>

              {/* Metrics Ribbon */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-5">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Symbol</span>
                  <span className="text-sm font-black text-white">{symbol}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Price</span>
                  <span className="text-sm font-mono font-bold text-white">${entry?.price?.toLocaleString() || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">24h Change</span>
                  <span className={cn("text-sm font-mono font-bold", (entry?.change24h || 0) >= 0 ? "text-[#39FF14]" : "text-[#FF4B5C]")}>
                    {(entry?.change24h || 0) >= 0 ? '+' : ''}{entry?.change24h?.toFixed(2)}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">RSI (15m)</span>
                  <span className={cn("text-sm font-mono font-bold", 
                    (entry?.rsi15m || 50) >= 70 ? "text-[#FF4B5C]" : (entry?.rsi15m || 50) <= 30 ? "text-[#39FF14]" : "text-slate-300"
                  )}>
                    {entry?.rsi15m?.toFixed(1) || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">ADX (Trend)</span>
                  <span className="text-sm font-mono font-bold text-slate-300">{entry?.adx?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Bias</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full", getBiasColor())} />
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter">{getBiasLabel()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* Left Column: Analysis (65%) */}
              <div className="flex-[0.65] p-6 border-r border-white/5 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    <BarChart3 size={14} className="text-blue-400" />
                    Technical Analysis
                  </h3>
                  <div className={cn("px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest", getConvictionBg(narration?.conviction || 0))}>
                    {narration?.conviction}% Conviction
                  </div>
                </div>

                <div className="space-y-2.5">
                  {narration?.reasons.map((reason, idx) => (
                    <div 
                      key={idx} 
                      className="group flex items-start gap-4 p-3.5 bg-white/[0.01] border border-white/5 rounded-xl hover:bg-white/[0.03] hover:border-white/10 transition-all duration-200"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400 shrink-0 group-hover:scale-110 transition-transform">
                        {idx + 1}
                      </div>
                      <p className="text-[13px] text-slate-300 leading-relaxed font-medium pt-0.5">
                        {reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Strategy & Context (35%) */}
              <div className="flex-[0.35] bg-black/20 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
                {/* Risk/Reward Card */}
                {entry?.riskParams ? (
                  <div className="bg-[#0D121F] border border-white/10 rounded-2xl p-5 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                        <Scale size={12} className="text-emerald-400" />
                        Risk Parameters
                      </h4>
                      <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black">
                        {entry.riskParams.riskRewardRatio}:1 R/R
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-white/5 pb-2">
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Take Profit 1 (Target)</p>
                          <p className="text-base font-black text-[#39FF14] font-mono leading-none mt-1">${entry.riskParams.takeProfit1.toLocaleString()}</p>
                        </div>
                        <Target size={18} className="text-[#39FF14]/40" />
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Stop Loss (Invalidation)</p>
                          <p className="text-base font-black text-[#FF4B5C] font-mono leading-none mt-1">${entry.riskParams.stopLoss.toLocaleString()}</p>
                        </div>
                        <ShieldAlert size={18} className="text-[#FF4B5C]/40" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-6 text-center">
                    <AlertTriangle size={24} className="text-slate-600 mx-auto mb-2" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Calculating Risk Levels...</p>
                  </div>
                )}

                {/* Market Context Card */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-4">
                    <Activity size={12} className="text-blue-400" />
                    Market Regime
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">Environment</span>
                      <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 text-[10px] font-black uppercase">
                        {entry?.regime?.regime || 'STABLE'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">Regime Conf.</span>
                      <span className="text-[11px] font-black text-white uppercase">{entry?.regime?.confidence || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">Volatility</span>
                      <span className={cn("text-[11px] font-black uppercase", 
                        (entry?.atr || 0) > 0.02 ? "text-orange-400" : "text-emerald-400"
                      )}>
                        {(entry?.atr || 0) > 0.02 ? 'High' : 'Normal'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-auto space-y-3">
                  <button
                    onClick={() => setIsChartOpen(true)}
                    className="w-full group relative overflow-hidden flex items-center justify-center gap-2.5 px-4 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-[0.1em] transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <TrendingUp size={16} />
                    View Interactive Chart
                  </button>
                  <button
                    onClick={handleCopyBrief}
                    className={cn(
                      "w-full flex items-center justify-center gap-2.5 px-4 py-3.5 border-2 rounded-xl font-black text-xs uppercase tracking-[0.1em] transition-all active:scale-[0.98]",
                      copied
                        ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                        : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={16} />}
                    {copied ? 'Brief Copied' : 'Institutional Brief'}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-black/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#39FF14] animate-pulse" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Surveillance Active</span>
              </div>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
                Powered by Mindscape Analytics Signal Narration Engine™
              </p>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                <Gauge size={10} />
                CONF: {narration?.conviction || 0}%
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
