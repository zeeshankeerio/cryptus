"use client";

import React from 'react';
import { Zap, ShieldCheck, MessageCircle } from 'lucide-react';
import { PersonaCard } from './LandingUI';

export function PersonaSection() {
  return (
    <section className="py-20 sm:py-32 md:py-40 border-t border-white/5 bg-[#05080F] px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-[#39FF14]/5 blur-[140px] rounded-full pointer-events-none -ml-64 opacity-50" />
      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-16 sm:mb-24 space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">The Professional Spectrum</h2>
          <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Engineered for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Top 1%.</span></p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <PersonaCard
            icon={<Zap className="text-[#39FF14]" />}
            role="The Scalper"
            needs="Absolute speed. Whale alerts. Zero-latency liquidation tracking for micro-entries."
            impact="Captures alpha in the milliseconds before the retail crowd reacts."
          />
          <PersonaCard
            icon={<ShieldCheck className="text-emerald-400" />}
            role="The Fund Manager"
            needs="HHI Index tracking. Neural risk matrix. Diversification armor for high-capital portfolios."
            impact="Protects enterprise assets during volatility cascades."
          />
          <PersonaCard
            icon={<MessageCircle className="text-blue-400" />}
            role="The Elite Provider"
            needs="Signal Narration. Instant X/Discord generation. High-aesthetic dashboards for streams."
            impact="Scales community trust with institutional-grade data transparency."
          />
        </div>
      </div>
    </section>
  );
}
