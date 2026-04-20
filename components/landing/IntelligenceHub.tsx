"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Layers, ArrowUpRight } from 'lucide-react';
import { IntelligenceCard, GridBackground, SignalRibbon } from './LandingUI';
import { cn } from '@/lib/utils';

export function IntelligenceHub() {
  return (
    <section className="py-24 sm:py-32 bg-[#05080F] border-y border-white/5 relative overflow-hidden">
      <GridBackground className="opacity-10" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14] mb-4">Situational Awareness</h2>
          <p className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
            Global Market <span className="text-[#39FF14]">Surveillance.</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-24">
          {/* Module 1: The Logic Layer */}
          <IntelligenceCard
            icon={<Layers />}
            subtitle="The Logic Layer"
            title="Deep Signal Confluence"
            color="green"
            delay={0.1}
          >
            <div className="space-y-6 mt-6">
              <p className="text-sm text-slate-400 leading-relaxed">
                Our Neural Engine syncs <span className="text-white font-bold">5+ indicators</span> across all timeframes to identify institutional-grade setups in real-time.
              </p>
              <div className="space-y-2">
                <SignalRibbon label="RSI(14) 15M / 1H ALIGN" value="OVERSOLD" status="bullish" />
                <SignalRibbon label="MACD Histogram Divergence" value="CONFIRMED" status="bullish" />
                <SignalRibbon label="EMA 20/50 Multi-Cross" value="BULLISH" status="bullish" />
                <SignalRibbon label="Stochastic K/D Signal" value="NEUTRAL" status="neutral" />
              </div>
            </div>
          </IntelligenceCard>

          {/* Module 2: Smart Money */}
          <IntelligenceCard
            icon={<ShieldCheck />}
            subtitle="Smart Money"
            title="Whale Surveillance"
            color="amber"
            delay={0.2}
          >
            <div className="space-y-6 mt-6">
              <p className="text-sm text-slate-400 leading-relaxed">
                Intercept the footprints of institutional capital. Track big wallet movements and margin exhaustion levels instantly.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Buy Volume</span>
                  <span className="text-lg font-black text-[#39FF14] tracking-tight">$42.8M</span>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Liq. Risk</span>
                  <span className="text-lg font-black text-red-500 tracking-tight">V. LOW</span>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[#05080F] border border-white/5 relative overflow-hidden">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-2">Recent Footprint <span className="text-[7px] lowercase opacity-50 ml-1">1.4s ago</span></span>
                <p className="text-[10px] text-slate-300 font-medium italic leading-snug">"Large Buy Wall detected at $94,800. Net Flow: +1,240 BTC."</p>
                <div className="absolute top-0 right-0 p-2 opacity-10">
                   <ShieldCheck size={40} />
                </div>
              </div>
            </div>
          </IntelligenceCard>

          {/* Module 3: Terminal Flow */}
          <IntelligenceCard
            icon={<Zap />}
            subtitle="Terminal Flow"
            title="Institutional Execution"
            color="blue"
            delay={0.3}
          >
            <div className="space-y-6 mt-6">
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 relative group/terminal">
                <div className="flex justify-between items-center mb-4">
                   <div className="flex gap-1.5">
                      {[1,2,3].map(i => <div key={i} className="w-4 h-1 rounded-full bg-[#39FF14]/40" />)}
                   </div>
                   <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-widest">Logic Verified</span>
                </div>
                <div className="flex justify-between items-end mb-1">
                   <span className="text-[10px] font-bold text-slate-400">Execution Lead</span>
                   <span className="text-sm font-black text-white">0.5ms</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-4">
                  <motion.div initial={{ width: 0 }} whileInView={{ width: '94%' }} className="h-full bg-[#39FF14] shadow-[0_0_10px_#39FF14]" />
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold text-slate-400">Total Alpha Scored</span>
                   <span className="text-sm font-black text-[#39FF14]">+14.2%</span>
                </div>
              </div>

              <button className="w-full py-4 rounded-xl bg-white/[0.03] border border-white/10 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-[#39FF14] hover:text-black hover:border-transparent transition-all group/btn flex items-center justify-center gap-2">
                Access Signals <ArrowUpRight size={14} className="group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
              </button>
            </div>
          </IntelligenceCard>
        </div>

        {/* Institutional Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 pt-16 border-t border-white/5">
          <div className="flex flex-col gap-1">
             <span className="text-3xl font-black text-white tracking-tighter uppercase">500+</span>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Symbols scanned autonomously every tick</span>
          </div>
          <div className="flex flex-col gap-1">
             <span className="text-3xl font-black text-white tracking-tighter uppercase">Real-Time</span>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Lead alerts before retail closes candles</span>
          </div>
          <div className="flex flex-col gap-1">
             <span className="text-3xl font-black text-white tracking-tighter uppercase">Verified</span>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Instantly verified confluence win-rate tracking</span>
          </div>
          <div className="flex flex-col gap-1">
             <span className="text-3xl font-black text-white tracking-tighter uppercase">24/7</span>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Native push alerts triggered in your pocket</span>
          </div>
        </div>
      </div>
    </section>
  );
}
