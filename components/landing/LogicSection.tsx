"use client";

import React from 'react';
import { AnalysisItem, StatBox } from './LandingUI';

export function LogicSection() {
  return (
    <section id="logic" className="py-16 sm:py-24 md:py-32 border-y border-white/5 bg-white/[0.01] px-4 sm:px-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] sm:w-[800px] h-[400px] sm:h-[800px] bg-[#39FF14]/5 blur-[160px] rounded-full pointer-events-none -mr-20 sm:-mr-40 -mt-20 sm:-mt-40" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-20 lg:gap-24 items-center">
          <div className="space-y-8 sm:space-y-12">
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">The Intelligence Layer</h2>
              <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-[0.95]">
                Engineered for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Winning Execution.</span>
              </p>
              <div className="text-slate-400 text-sm sm:text-base leading-relaxed mt-4 max-w-md">
                <p><strong className="text-slate-200">The Problem:</strong> Information Fragmentation. Most traders lose because they are forced to synthesize 5+ disconnected tools while the market moves instantly.</p>
                <div className="mt-4"><strong className="text-[#39FF14]">The Solution:</strong> A Unified Command Center. We merge real-time liquidation flux, institutional indicators, and smart money footprints into a single low-latency decision engine.</div>
              </div>
            </div>

            <div className="space-y-6 sm:space-y-8">
              <AnalysisItem
                title="59-Second Alpha Lead"
                desc="Don't wait for candles to close. The Alpha Logic Engine (ALE-v4) calculates approximated indicators per-tick, giving you the lead before standard retail screeners even refresh."
              />
              <AnalysisItem
                title="Neural Divergence Detection"
                desc="Identifies RSI and MACD divergences before they manifest in price, allowing for high-precision institutional reversal entries."
              />
              <AnalysisItem
                title="Signal Win-Rate Tracker"
                desc="Stop guessing. Every signal pattern is indexed and tracked against historical outcomes, providing real-time accuracy ratios for every alert."
              />
              <AnalysisItem
                title="Whale & Liq. Flux Tracking"
                desc="Merge technicals with the orderbook. ALE-v4 overlays large trade flow and margin liquidation clusters directly onto the confluence logic."
              />
              <AnalysisItem
                title="HHI Concentration Alpha"
                desc="Monitor the Herfindahl-Hirschman Index for market concentration. Know when the top 5 wallets are shifting the entire asset's momentum."
              />
              <AnalysisItem
                title="Adaptive Load Shedding"
                desc="Engineered for high-volatility resilience. ALE-v4 prioritizes 0.5ms data fidelity during extreme market cascades, ensuring your alerts stay live."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 relative">
            <StatBox value="+14% / -6%" label="Market Bias Delta" />
            <StatBox value="0.5ms" label="Engine Latency" highlight />
            <StatBox value="24/7" label="Live Uptime" />
            <StatBox value="500+" label="Pairs Tracked" />
          </div>
        </div>
      </div>
    </section>
  );
}
