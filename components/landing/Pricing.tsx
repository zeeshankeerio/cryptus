"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { PlanCard, ComparisonModule } from './LandingUI';

export function Pricing() {
  return (
    <section id="pricing" className="py-16 sm:py-24 md:py-32 bg-[#05080F] border-t border-white/5 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#39FF14]/5 blur-[200px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16 sm:mb-24 space-y-4">
          <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">Capital Commitment</h2>
          <p className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tighter">Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Terminal Grade.</span></p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20 sm:mb-32 max-w-5xl mx-auto">
          <PlanCard
            tier="Professional"
            price="$20"
            highlight
            trial
            href="/register?plan=monthly"
            features={[
              "All Timeframes (1m - 4h)",
              "500+ Asset Global Library",
              "Neuro-Confluence Engine",
              "0.5ms Priority Latency",
              "Native Mobile PWA Install",
              "Premium Support Access"
            ]}
          />
          <PlanCard
            tier="Enterprise"
            price="$200"
            trial
            href="/register?plan=yearly"
            features={[
              "Annual Professional License",
              "2 Months Free Included",
              "Exclusive Beta Logic Access",
              "Priority Roadmap Voting",
              "White-Glove Onboarding",
              "Everything in Pro"
            ]}
          />
        </div>
      </div>
    </section>
  );
}
