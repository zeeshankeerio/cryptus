"use client";

import React from 'react';
import { GridBackground } from './LandingUI';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

const SERVICES = [
  {
    title: "AI Agents & Voice",
    desc: "Automate lead qualification and trading community management 24/7.",
    pos: "tl",
    color: "text-[#39FF14]"
  },
  {
    title: "SaaS Engineering",
    desc: "High-performance Next.js builds, enterprise auth, and multi-tenant architecture.",
    pos: "tr",
    color: "text-[#39FF14]"
  },
  {
    title: "Cloud & Data Ops",
    desc: "Global, low-latency node clusters engineered for high-frequency analytical workloads.",
    pos: "bl",
    color: "text-[#39FF14]"
  },
  {
    title: "Custom Automation",
    desc: "Algorithmic trading systems and webhook integrations.",
    pos: "br",
    color: "text-[#39FF14]"
  }
];

export function Services() {
  return (
    <section id="services" className="py-24 sm:py-32 md:py-48 bg-[#05080F] border-t border-white/5 relative overflow-hidden">
      <GridBackground className="opacity-10" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-left mb-16 sm:mb-24 space-y-4">
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9]">
            Build More <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Than a Scanner.</span>
          </h2>
          <p className="text-slate-400 text-sm sm:text-base font-medium max-w-2xl">
            Powered by Mindscape Analytics: Turn RSIQ Pro into your growth engine with productized SaaS engineering and managed infrastructure.
          </p>
        </div>

        <div className="relative group">
          {/* Central Crossing Lines */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2 hidden md:block" />
          
          {/* Central Engine Node */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#05080F] border-4 border-white/10 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-slate-500 animate-pulse" />
            </div>
            <div className="mt-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest whitespace-nowrap shadow-2xl backdrop-blur-md">
              RSIQ Pro Engine
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-16 md:gap-y-0 relative">
            {SERVICES.map((s, i) => (
              <div 
                key={i} 
                className={cn(
                  "p-8 sm:p-12 md:p-16 flex flex-col group/service transition-all duration-500",
                  // Vertical and Horizontal padding adjustments for the quadrant look
                  s.pos === 'tl' && "md:border-r md:border-b border-transparent",
                  s.pos === 'tr' && "md:border-b border-transparent",
                  s.pos === 'bl' && "md:border-r border-transparent"
                )}
              >
                <div className="flex-1">
                  <h3 className={cn("text-2xl sm:text-3xl font-black tracking-tight uppercase mb-4 transition-colors", s.color)}>{s.title}</h3>
                  <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm">{s.desc}</p>
                </div>
                <a 
                  href="https://mindscapeanalytics.com" 
                  target="_blank" 
                  className="mt-12 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover/service:text-white transition-all"
                >
                  Explore Ecosystem <ArrowUpRight size={14} className="group-hover/service:translate-x-0.5 group-hover/service:-translate-y-0.5 transition-transform" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
