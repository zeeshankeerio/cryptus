"use client";

import React from 'react';
import { Coins, Globe, CircleDollarSign, Gauge } from 'lucide-react';

export function MarketTicker() {
  return (
    <div className="fixed top-0 w-full z-[110] bg-[#39FF14] text-black h-6 sm:h-8 flex items-center overflow-hidden border-b border-black/10">
      <div className="animate-marquee whitespace-nowrap flex items-center gap-8 sm:gap-12 font-black text-[9px] sm:text-[10px] uppercase tracking-widest px-4">
        {[...Array(10)].map((_, i) => (
          <React.Fragment key={i}>
            <div className="flex items-center gap-2">
              <Coins size={12} />
              <span>BTC/USD $96,442.20 <span className="text-emerald-700 opacity-80">+2.4%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={12} />
              <span>XAU/USD $2,742.15 <span className="text-red-700 opacity-80">-0.1%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CircleDollarSign size={12} />
              <span>EUR/USD 1.0542 <span className="text-emerald-700 opacity-80">+0.04%</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge size={12} />
              <span className="hidden sm:inline">MARKET VOLATILITY: EXTREME</span>
              <span className="sm:hidden">VOLATILITY: HIGH</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
