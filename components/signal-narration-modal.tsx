'use client';

import { useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { SignalNarration } from '@/lib/signal-narration';
import type { ScreenerEntry } from '@/lib/types';

/**
 * Signal Narration Modal - Displays institutional-grade signal analysis
 * Requirements: Requirement 12
 * Design: SignalNarrationModal component
 */

interface SignalNarrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  narration: SignalNarration | null;
  symbol: string;
  entry?: ScreenerEntry;
}

export function SignalNarrationModal({
  isOpen,
  onClose,
  narration,
  symbol,
  entry,
}: SignalNarrationModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyBrief = async () => {
    if (!narration) return;

    // Construct the institutional brief with symbol detail link and live metrics
    const symbolUrl = `${window.location.origin}/symbol/${symbol}`;
    const priceText = entry ? `Current Price: $${entry.price?.toLocaleString()}\nRSI (15m): ${entry.rsi15m?.toFixed(1) || 'N/A'}` : '';

    const brief = `
${narration.emoji} ${narration.headline}

Symbol: ${symbol}
${priceText}
Conviction: ${narration.conviction}% (${narration.convictionLabel})

Analysis:
${narration.reasons.map((reason, idx) => `${idx + 1}. ${reason}`).join('\n')}

View detailed chart: ${symbolUrl}

---
Powered by Mindscape Analytics Signal Narration Engine™
    `.trim();

    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      toast.success('Signal brief copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleOpenSymbolPage = () => {
    window.open(`/symbol/${symbol}`, '_blank');
  };

  // Determine conviction color
  const getConvictionColor = (conviction: number) => {
    if (conviction >= 85) return 'text-[#39FF14]';
    if (conviction >= 65) return 'text-emerald-400';
    if (conviction >= 45) return 'text-yellow-400';
    if (conviction >= 25) return 'text-orange-400';
    return 'text-slate-400';
  };

  // Determine conviction background
  const getConvictionBg = (conviction: number) => {
    if (conviction >= 85) return 'bg-[#39FF14]/10 border-[#39FF14]/30';
    if (conviction >= 65) return 'bg-emerald-400/10 border-emerald-400/30';
    if (conviction >= 45) return 'bg-yellow-400/10 border-yellow-400/30';
    if (conviction >= 25) return 'bg-orange-400/10 border-orange-400/30';
    return 'bg-slate-400/10 border-slate-400/30';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0A0F1B] border border-white/10 rounded-xl shadow-2xl z-50 p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{narration?.emoji || '⚪'}</span>
                  <div>
                    <h2 className="text-xl font-black text-white leading-tight">
                      {narration?.headline || 'No Active Signal'}
                    </h2>
                    <p className="text-sm font-bold text-slate-400 mt-1 flex items-center gap-2">
                      {symbol}
                      {entry && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-800" />
                          <span className="text-white font-mono tabular-nums">${entry.price?.toLocaleString()}</span>
                          {entry.rsi15m !== null && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-slate-800" />
                              <span className={cn(
                                "font-mono tabular-nums px-1.5 py-0.5 rounded text-[10px] bg-white/5",
                                entry.rsi15m >= 70 ? 'text-[#FF4B5C]' : entry.rsi15m <= 30 ? 'text-[#39FF14]' : 'text-slate-400'
                              )}>
                                RSI: {entry.rsi15m.toFixed(1)}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {narration ? (
              <>
                {/* Conviction Score */}
                <div className={cn(
                  "flex items-center justify-between p-4 rounded-lg border mb-6",
                  getConvictionBg(narration.conviction)
                )}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Conviction Level
                    </p>
                    <p className={cn(
                      "text-2xl font-black tabular-nums",
                      getConvictionColor(narration.conviction)
                    )}>
                      {narration.conviction}%
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-lg font-black uppercase tracking-wide",
                      getConvictionColor(narration.conviction)
                    )}>
                      {narration.convictionLabel}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {narration.conviction >= 85 ? 'Institutional Grade' :
                       narration.conviction >= 65 ? 'High Confidence' :
                       narration.conviction >= 45 ? 'Moderate Confidence' :
                       narration.conviction >= 25 ? 'Low Confidence' :
                       'Speculative'}
                    </p>
                  </div>
                </div>

                {/* Analysis Reasons */}
                <div className="mb-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Technical Analysis
                  </h3>
                  <div className="space-y-3">
                    {narration.reasons.map((reason, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-lg hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="text-lg font-black text-slate-600 tabular-nums shrink-0">
                          {idx + 1}.
                        </span>
                        <p className="text-sm text-slate-300 leading-relaxed">
                          {reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyBrief}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold text-sm transition-all",
                      copied
                        ? "bg-[#39FF14]/20 border-2 border-[#39FF14]/40 text-[#39FF14]"
                        : "bg-white/5 border-2 border-white/10 text-white hover:bg-white/10 hover:border-white/20"
                    )}
                  >
                    {copied ? (
                      <>
                        <Check size={16} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={16} />
                        Copy Signal Brief
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleOpenSymbolPage}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border-2 border-white/10 rounded-lg font-bold text-sm text-white hover:bg-white/10 hover:border-white/20 transition-all"
                  >
                    <ExternalLink size={16} />
                    View Chart
                  </button>
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 text-center">
                    Powered by Mindscape Analytics Signal Narration Engine™
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">
                  No active signal detected. All indicators are within normal ranges.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
