"use client";

import React from 'react';
import { Zap, BarChart3, Bell, Cpu, LineChart, Layers } from 'lucide-react';
import { FeatureCard } from './LandingUI';

export function FeaturesGrid() {
  return (
    <section id="features" className="py-16 sm:py-24 md:py-32 bg-white/[0.02] border-t border-white/5 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-20 md:mb-24 space-y-3 sm:space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-[#39FF14]">RSI & MACD Crypto Scanner</h2>
          <h3 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Everything for <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Professional Trading.</span></h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          <FeatureCard
            icon={<Zap />}
            title="Global Market Reach"
            desc="Simultaneously track 500+ active symbols including Top Crypto pairs, premier Forex pairs, and precious metals like Gold (XAU) and Silver (XAG)."
          />
          <FeatureCard
            icon={<BarChart3 />}
            title="Confluence Strategy"
            desc="Never trade a single indicator again. Our engine combines 5+ technical signals for a unified decision score."
          />
          <FeatureCard
            icon={<Bell />}
            title="Real-Time Alerts"
            desc="Get instant push notifications and desktop sound alerts the second a setup aligns with your exact custom parameters."
          />
          <FeatureCard
            icon={<Cpu />}
            title="Deep Customization"
            desc="Input your custom RSI period, define unique thresholds, and isolate volatile markets to match your exact trading style."
          />
          <FeatureCard
            icon={<LineChart />}
            title="MACD + EMA Integration"
            desc="Full trend analysis built-in. EMA Golden/Death crosses and MACD histograms integrated into the main scanner."
          />
          <FeatureCard
            icon={<Layers />}
            title="Multi-Timeframe Sync"
            desc="Track 1m, 5m, 15m, and 1h intervals simultaneously. Align your micro entries with higher timeframe macro dominance."
          />
        </div>
      </div>
    </section>
  );
}
