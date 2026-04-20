"use client";

import React from 'react';
import { ProjectStep, GridBackground } from './LandingUI';
import { cn } from '@/lib/utils';
import { ShieldCheck } from 'lucide-react';

export function Roadmap() {
  return (
    <section className="py-24 sm:py-32 md:py-48 bg-[#05080F] border-t border-white/5 relative overflow-hidden">
      <GridBackground className="opacity-10" />
      
      {/* Background glow for the 2026 section */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#39FF14]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-left mb-20 max-w-3xl">
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9] mb-4">
            Project 2026: <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">The Autonomous Edge.</span>
          </h2>
        </div>

        <div className="relative mt-24">
          {/* Connector Path (Desktop) */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5 hidden lg:block -translate-y-1/2" />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 relative">
            <div className="lg:mt-0">
              <ProjectStep 
                subtitle="Present"
                title="Descriptive Intelligence"
                desc="(0.5ms Terminal, Confluence Logic, Whale Flux)"
                active
              />
            </div>
            
            <div className="lg:mt-24">
              <ProjectStep 
                subtitle="Near-Term"
                title="Predictive Forensics"
                desc="(Macro Liquidity Topologies, Spoofing Detection, Vectorized Data Parsing)"
              />
            </div>

            <div className="lg:mt-48 relative">
              <ProjectStep 
                subtitle="Future"
                title="Agentic Execution"
                desc="(Autonomous Alpha Agents)"
              />
              
              {/* Behavioral Risk Guardrails Callout */}
              <div className="mt-8 lg:absolute lg:-bottom-48 lg:left-0 lg:right-0 p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] group transition-all hover:-translate-y-1">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#39FF14] flex-shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-white uppercase tracking-widest mb-1">Behavioral Risk Guardrails</h5>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      An adaptive copilot that learns your execution psychology and mathematically intervenes to protect capital.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
