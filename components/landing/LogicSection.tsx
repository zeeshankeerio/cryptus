"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StatBox, GridBackground } from './LandingUI';

// ─── Alpha Lead Timeline ──────────────────

function AlphaTimeline() {
  const points = [
    { time: '0ms', label: 'ALE-v4 Trigger', desc: 'Calculates indicators tick-by-tick.', pos: 'top' },
    { time: '12s', label: 'Whale & Liq. Flux', desc: 'Detects distribution clusters.', pos: 'bottom' },
    { time: '45s', label: 'Neural Divergence', desc: 'Identifies RSI/MACD lead.', pos: 'top' },
    { time: '60s', label: 'Retail Reaction', desc: 'Crowd reacts to old data.', pos: 'bottom', retail: true }
  ];

  return (
    <div className="relative py-20 px-4 group">
      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -translate-y-1/2 group-hover:bg-white/20 transition-colors" />
      <div className="flex justify-between relative max-w-5xl mx-auto">
        {points.map((p, i) => (
          <div key={i} className="relative flex flex-col items-center">
            {/* Timeline Marker */}
            <div className={cn(
              "w-4 h-4 rounded-full border-2 border-[#05080F] z-10 transition-all duration-500",
              p.retail ? "bg-slate-600 scale-90" : "bg-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.5)]"
            )} />
            
            {/* Time Label */}
            <span className="absolute top-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.time}</span>

            {/* Callout */}
            <div className={cn(
              "absolute w-48 sm:w-64 p-4 rounded-xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-700",
              p.pos === 'top' ? "-top-32" : "top-16",
              p.retail ? "opacity-40 grayscale" : "group-hover:border-[#39FF14]/30"
            )}>
              <h4 className={cn("text-[11px] font-black uppercase tracking-widest mb-1", p.retail ? "text-slate-500" : "text-[#39FF14]")}>
                {p.label}
              </h4>
              <p className="text-[10px] text-slate-400 leading-relaxed">{p.desc}</p>
            </div>

            {/* Connecting Line */}
            <div className={cn(
              "absolute w-px bg-white/5",
              p.pos === 'top' ? "-top-12 h-12" : "top-4 h-12"
            )} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Logic Funnel ──────────────────

function LogicFunnel() {
  const layers = [
    { title: 'Trend & Momentum', desc: 'EMA 20/50 Cross, MACD Divergence', color: 'bg-slate-700/50' },
    { title: 'Oscillators', desc: 'RSI(14) 15m/1h Align, Stochastic K/D', color: 'bg-red-900/20' },
    { title: 'Volume & Volatility', desc: 'VWAP Diff, Volume Spike Detection', color: 'bg-emerald-900/20' }
  ];

  return (
    <div className="relative flex flex-col items-center py-12">
      <div className="text-center mb-8">
        <span className="text-[10px] font-black text-[#39FF14] uppercase tracking-[0.5em]">Integrated Intelligence</span>
        <h3 className="text-xl font-black text-white tracking-tight mt-1">Unified Strategy Score</h3>
      </div>

      <div className="w-full max-w-md space-y-2 relative">
        {layers.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.2 }}
            className={cn(
              "relative p-6 border border-white/10 rounded-xl overflow-hidden group",
              "clip-funnel-" + (i + 1)
            )}
            style={{
              clipPath: i === 0 ? 'polygon(5% 0%, 95% 0%, 90% 100%, 10% 100%)' :
                        i === 1 ? 'polygon(10% 0%, 90% 0%, 80% 100%, 20% 100%)' :
                                  'polygon(20% 0%, 80% 0%, 70% 100%, 30% 100%)'
            }}
          >
            <div className={cn("absolute inset-0 opacity-40 transition-opacity group-hover:opacity-60", l.color)} />
            <div className="relative z-10 text-center">
              <h4 className="text-[11px] font-black text-white uppercase tracking-widest">{l.title}</h4>
              <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">{l.desc}</p>
            </div>
          </motion.div>
        ))}
        
        {/* Output Arrow */}
        <div className="flex flex-col items-center pt-4">
          <div className="w-px h-8 bg-gradient-to-b from-white/20 to-[#39FF14]" />
          <div className="p-4 rounded-xl bg-[#39FF14] text-black text-center shadow-[0_0_30px_rgba(57,255,20,0.3)]">
            <span className="text-[10px] font-black uppercase tracking-widest block leading-none">Setup Score</span>
            <span className="text-2xl font-black tracking-tighter">0-100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LogicSection() {
  return (
    <section id="logic" className="py-24 sm:py-32 border-y border-white/5 bg-[#05080F] relative overflow-hidden">
      <GridBackground className="opacity-10" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14] mb-4">Signal Architecture</h2>
          <p className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
            The 59-Second <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Alpha Lead.</span>
          </p>
          <p className="mt-6 text-slate-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            We merge 18 indicators to eliminate false positives. Don't trade a single indicator again. Intercept leads before retail candles even manifest.
          </p>
        </div>

        <AlphaTimeline />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 sm:gap-24 items-center mt-32">
          <div className="space-y-12">
            <div className="space-y-4">
              <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase">Deep Signal Confluence: <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">The Logic Layer</span></h3>
              <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                Our Neural Engine syncs technicals across all timeframes to identify institutional-grade setups. 2.4 Billion daily ticks processed into a single verified score.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <StatBox value="0.5ms" label="Engine Latency" highlight />
              <StatBox value="2.4B" label="Daily Ticks" />
              <StatBox value="18" label="Indicators" />
              <StatBox value="100%" label="Verified" />
            </div>
          </div>

          <LogicFunnel />
        </div>
      </div>
    </section>
  );
}
