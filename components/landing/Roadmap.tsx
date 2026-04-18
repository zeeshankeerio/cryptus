"use client";

import React from 'react';
import { Cpu, Network, ShieldCheck, Activity, BrainCircuit, Globe, Bot } from 'lucide-react';
import { FeatureCard } from './LandingUI';

export function Roadmap() {
  return (
    <section className="py-20 sm:py-32 md:py-40 border-t border-white/5 bg-[#05080F] px-4 sm:px-6 relative overflow-hidden">
      {/* Background glow for the 2026 section */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#39FF14]/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16 sm:mb-24 space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.6em] text-[#39FF14]">
            Project 2026
          </h2>
          <p className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tighter leading-[0.95]">
            The Autonomous <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Edge.</span>
          </p>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto mt-6 font-medium leading-relaxed">
            RSIQ Pro is evolving from a descriptive terminal into an agentic decision engine. Here is a glimpse into the classified intelligence dropping in our upcoming cycle.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          <FeatureCard
            icon={<Bot />}
            title="Autonomous Alpha Agents"
            desc="Deploy intelligent copilot processes that adapt to your logic and manage your risk. Your personal 24/7 institutional execution desk."
          />
          <FeatureCard
            icon={<Globe />}
            title="Macro Liquidity Topologies"
            desc="Visualize the tectonic shifts of global capital in real-time. Front-run retail as liquidity aggressively rotates across entire asset classes."
          />
          <FeatureCard
            icon={<Network />}
            title="Predictive Network Forensics"
            desc="Look past the orderbook. Next-generation topology algorithms detect institutional accumulation and spoofing before it manifests on the chart."
          />
          <FeatureCard
            icon={<BrainCircuit />}
            title="Multimodal Intelligence Parsing"
            desc="Go beyond price action. Our upcoming systems ingest and vectorize raw global data feeds—converting unspoken market shifts into measurable quantitative metrics."
          />
          <FeatureCard
            icon={<ShieldCheck />}
            title="Behavioral Risk Guardrails"
            desc="Eliminate human error. An adaptive copilot that learns your execution psychology, mathematically intervening to protect your capital from deviation."
          />
          <FeatureCard
            icon={<Activity />}
            title="Cognitive Alerting Matrix"
            desc="Speak your strategy in plain language. Let the engine compile your natural logic into a relentless, highly-complex cross-asset monitor."
          />
        </div>
      </div>
    </section>
  );
}
