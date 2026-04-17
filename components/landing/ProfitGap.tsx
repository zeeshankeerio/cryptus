"use client";

import React from 'react';
import { ComparisonModule } from './LandingUI';

export function ProfitGap() {
  return (
    <section className="py-20 sm:py-32 px-4 sm:px-6 relative overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 sm:mb-24 space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">The Profit Gap</h2>
          <p className="text-3xl sm:text-5xl font-black text-white tracking-tighter">Quantifying the <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Pro Edge.</span></p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 relative">
          {/* Center Connector */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-[80%] bg-white/5 hidden lg:block" />

          <ComparisonModule
            status="retail"
            title="The Retail Friction"
            points={[
              "Manual chart flipping across 10+ tabs",
              "60-second delay waiting for candle closure",
              "Analysis paralysis during high volatility",
              "Silent setups missed while away from desk",
              "Guessing signal strength with zero backtest data"
            ]}
          />

          <ComparisonModule
            status="pro"
            title="The Alpha Pro Edge"
            points={[
              "500+ symbols scanned autonomously every tick",
              "Real-time lead alerts before retail closes candles",
              "Instantly verified confluence win-rate tracking",
              "Institutional Whale volume & Liquidation flux",
              "Native Push alerts triggered 24/7 in your pocket"
            ]}
          />
        </div>
      </div>
    </section>
  );
}
