"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  ShieldCheck, 
  MessageCircle, 
  BarChart3, 
  Bell, 
  Cpu, 
  LineChart, 
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { FeatureCard, PersonaCard, GridBackground } from './LandingUI';

export function ProfessionalEdge() {
  return (
    <section className="py-24 sm:py-32 md:py-40 bg-white/[0.01] border-y border-white/5 relative overflow-hidden">
      <GridBackground className="opacity-5" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14] mb-4">Institutional Spectrum</h2>
          <p className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
            Everything for <span className="text-[#39FF14]">Professional Trading.</span>
          </p>
          <p className="mt-6 text-slate-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Consolidating elite-grade intelligence with ultra-low latency execution. Built for the top 1% of market participants who demand absolute clarity.
          </p>
        </div>

        {/* Persona Segment */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <PersonaCard
            icon={<Zap />}
            role="The Scalper"
            color="cyan"
            needs="Absolute speed. Whale alerts. Zero-latency liquidation tracking for micro-entries."
            impact="Captures alpha in the milliseconds before the retail crowd reacts."
          />
          <PersonaCard
            icon={<ShieldCheck />}
            role="The Fund Manager"
            color="green"
            needs="HHI Index tracking. Neural risk matrix. Diversification armor for high-capital portfolios."
            impact="Protects enterprise assets during volatility cascades."
          />
          <PersonaCard
            icon={<MessageCircle />}
            role="The Elite Provider"
            color="blue"
            needs="Signal Narration. Instant X/Discord generation. High-aesthetic dashboards for streams."
            impact="Scales community trust with institutional-grade data transparency."
          />
        </div>

        {/* Feature Segment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <FeatureCard
            icon={<BarChart3 />}
            color="purple"
            title="Global Market Reach"
            desc="Track 500+ active symbols including Top Crypto, Forex pairs, and Gold (XAU/USD) with zero-lag ingestion."
          />
          <FeatureCard
            icon={<Layers />}
            color="cyan"
            title="Confluence Strategy"
            desc="Our engine combines 5+ technical signals (RSI, MACD, EMA, VWAP) for a unified decision score."
          />
          <FeatureCard
            icon={<Bell />}
            color="amber"
            title="Institutional Alerts"
            desc="Whale Footprint and Liquidation Flux monitoring. Native push notifications delivered in milliseconds."
          />
          <FeatureCard
            icon={<Cpu />}
            color="blue"
            title="Deep Customization"
            desc="Define unique thresholds, custom RSI periods, and isolate volatile markets to match your exact style."
          />
          <FeatureCard
            icon={<LineChart />}
            color="green"
            title="Trend Integration"
            desc="EMA Golden/Death crosses and MACD histograms integrated directly into the real-time scanner."
          />
          <FeatureCard
            icon={<Zap />}
            color="red"
            title="Multi-Timeframe Sync"
            desc="Align micro entries with higher timeframe macro dominance across 1m, 5m, 15m, and 1h intervals."
          />
        </div>
      </div>
    </section>
  );
}
