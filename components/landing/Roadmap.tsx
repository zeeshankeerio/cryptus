"use client";

import React from 'react';
import { Cpu, LineChart, Handshake } from 'lucide-react';
import { FeatureCard } from './LandingUI';

export function Roadmap() {
  return (
    <section className="py-20 sm:py-32 md:py-40 border-t border-white/5 bg-[#05080F] px-4 sm:px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-20 space-y-3 sm:space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-amber-400">Future Roadmap</h2>
          <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Expanding the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Alpha Edge.</span></p>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto mt-4 font-medium">We are continuously pushing the boundaries of retail trading technology. Here is what is deploying next to your terminal.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          <FeatureCard
            icon={<Cpu />}
            title="Autonomous Webhooks"
            desc="Connect RSIQ Pro directly to your broker or algorithmic trading bots via customizable JSON webhook triggers. Completely automate your execution."
          />
          <FeatureCard
            icon={<LineChart />}
            title="Advanced Flow & Options Insights"
            desc="Incorporate dark pool prints, options delta exposure, and institutional orderbook flow directly into the scanning confluence logic."
          />
          <FeatureCard
            icon={<Handshake />}
            title="Alpha Syndicates"
            desc="Share your customized screening layouts and trigger conditions with your community through private generated share-links."
          />
        </div>
      </div>
    </section>
  );
}
