"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Layers, ShieldCheck, Zap } from 'lucide-react';
import { IntelligenceCard, SignalRibbon } from './LandingUI';

export function IntelligenceHub() {
  return (
    <section className="py-16 sm:py-24 md:py-32 bg-white/[0.01] border-y border-white/5 relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#39FF14]/[0.02] blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/[0.02] blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16 sm:mb-24 space-y-4">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.6em] text-[#39FF14]"
          >
            Situational Awareness
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tighter leading-[0.95]"
          >
            Global Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Surveillance.</span>
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Module 1: Signal Confluence */}
          <IntelligenceCard
            icon={<Layers className="text-[#39FF14]" />}
            subtitle="The Logic Layer"
            title="Deep Signal Confluence"
            delay={0.1}
          >
            <div className="space-y-3 mt-4">
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Our Neural Engine syncs <strong className="text-white">5+ indicators</strong> across all timeframes to identify institutional-grade setups in real-time.
              </p>
              <div className="space-y-2">
                <SignalRibbon label="RSI(14) 15M / 1H Align" value="OVERSOLD" status="bullish" />
                <SignalRibbon label="MACD Histogram Divergence" value="CONFIRMED" status="bullish" />
                <SignalRibbon label="EMA 20/50 Multi-Cross" value="BULLISH" status="bullish" />
                <SignalRibbon label="Stochastic K/D Signal" value="NEUTRAL" status="neutral" />
              </div>
            </div>
          </IntelligenceCard>

          {/* Module 2: Whale Surveillance */}
          <IntelligenceCard
            icon={<ShieldCheck className="text-emerald-400" />}
            subtitle="Smart Money"
            title="Institutional Whale Logic"
            delay={0.2}
          >
            <div className="space-y-3 mt-4">
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                Intercept the footprints of institutional capital. Track <span className="text-[#39FF14]">Whale cluster movements</span> and <span className="text-red-500">Cross-Exchange Liquidations</span> instantly to find high-probability reversal zones.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[#39FF14]/5 border border-[#39FF14]/10 flex flex-col items-center">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Buy Volume</span>
                  <span className="text-sm font-black text-[#39FF14] tracking-tight">$42.8M</span>
                </div>
                <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 flex flex-col items-center">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Liq. Risk</span>
                  <span className="text-sm font-black text-red-500 tracking-tight">V. LOW</span>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recent Footprint</span>
                  <span className="text-[8px] text-slate-600 font-bold tabular-nums">1.4s ago</span>
                </div>
                <p className="text-[10px] text-white/80 font-medium leading-tight italic">"Large Buy Wall detected at $94,800. Net Flow: +1,240 BTC."</p>
              </div>
            </div>
          </IntelligenceCard>

          {/* Module 3: Execution Hub */}
          <IntelligenceCard
            icon={<Zap className="text-amber-400" />}
            subtitle="Terminal Flow"
            title="Institutional Execution"
            delay={0.3}
          >
            <div className="space-y-4 mt-4">
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-1 rounded-full bg-[#39FF14]" />
                    <div className="w-2.5 h-1 rounded-full bg-[#39FF14]/40" />
                    <div className="w-2.5 h-1 rounded-full bg-[#39FF14]/40" />
                  </div>
                  <span className="text-[8px] font-black text-[#39FF14] uppercase tracking-widest">Logic Verified</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Execution Lead</span>
                    <span className="text-[10px] font-bold text-white tabular-nums">0.5ms</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: '92%' }}
                      transition={{ duration: 1.5, delay: 0.5 }}
                      className="h-full bg-gradient-to-r from-[#39FF14] to-emerald-400"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-bold text-slate-400">Total Alpha Scored</span>
                    <span className="text-[10px] font-bold text-[#39FF14] tabular-nums">+14.2%</span>
                  </div>
                </div>
              </div>
              <button className="w-full py-3.5 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-[10px] font-black uppercase tracking-widest hover:bg-[#39FF14] hover:text-black transition-all">
                Access Signals
              </button>
            </div>
          </IntelligenceCard>
        </div>

        {/* Dynamic Capability Footnote */}
        <div className="mt-16 sm:mt-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[22px] font-black text-white tracking-tighter">500+</span>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Symbols scanned autonomously every tick</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[22px] font-black text-white tracking-tighter">REAL-TIME</span>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Lead alerts before retail closes candles</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[22px] font-black text-white tracking-tighter">VERIFIED</span>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Instantly verified confluence win-rate tracking</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[22px] font-black text-white tracking-tighter">24/7</span>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Native Push alerts triggered in your pocket</span>
          </div>
        </div>
      </div>
    </section>
  );
}
