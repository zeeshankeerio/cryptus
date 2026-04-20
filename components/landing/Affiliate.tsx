"use client";

import React from 'react';
import { Handshake } from 'lucide-react';

export function Affiliate() {
  return (
    <section id="affiliate" className="py-20 sm:py-32 bg-gradient-to-b from-[#05080F] to-[#0A0E17] border-t border-white/5 relative overflow-hidden px-4 sm:px-6">
      <div className="absolute top-1/2 left-1/2 w-full max-w-3xl h-[400px] bg-[#39FF14]/5 blur-[120px] rounded-full pointer-events-none transform -translate-x-1/2 -translate-y-1/2" />

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="p-8 sm:p-16 rounded-[4rem] bg-white/[0.02] border border-white/5 shadow-2xl flex flex-col items-center text-center group">
          <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-white mb-8 border border-white/10 shadow-lg group-hover:scale-110 group-hover:border-[#39FF14]/30 group-hover:text-[#39FF14] transition-all duration-500">
            <Handshake size={32} />
          </div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14] mb-4">Strategic Partnerships</h2>
          <h3 className="text-4xl sm:text-6xl font-black text-white tracking-tighter mb-6">Open for <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Collaboration.</span></h3>
          <p className="text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto mb-10 sm:mb-14 leading-relaxed font-medium">
            We are actively looking for elite traders, fund managers, and community leaders to join our exclusive affiliate network. Bring institutional-grade tools to your audience and earn high-tier revenue share.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <a
              href="mailto:partners@mindscapeanalytics.com"
              className="w-full sm:w-auto px-10 py-5 sm:py-6 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-[0.2em] hover:scale-105 transition-all text-xs text-center shadow-xl shadow-[#39FF14]/20"
            >
              Apply as Affiliate
            </a>
            <a
              href="mailto:contact@mindscapeanalytics.com"
              className="w-full sm:w-auto px-10 py-5 sm:py-6 rounded-2xl border border-white/20 text-white font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-all text-xs text-center hover:scale-105"
            >
              Contact for Synergy
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
