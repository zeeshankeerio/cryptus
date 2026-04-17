"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Cpu, Activity, Globe, ShieldCheck, ChevronRight } from 'lucide-react';

interface HeroProps {
  session: any;
}

export function Hero({ session }: HeroProps) {
  return (
    <>
      <section className="relative pt-28 sm:pt-24 md:pt-28 pb-12 sm:pb-20 md:pb-24 px-4 sm:px-6 z-10 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 left-1/4 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-[#39FF14]/10 blur-[120px] rounded-full"
          />
          <motion.div
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.05, 0.15, 0.05] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 right-1/4 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-emerald-500/10 blur-[100px] rounded-full"
          />
        </div>

        <div className="max-w-7xl mx-auto flex flex-col items-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 mb-6 sm:mb-10"
          >
            <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39FF14] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-[#39FF14]"></span>
            </span>
            <span className="text-[8px] sm:text-[11px] font-black uppercase tracking-[0.1em] sm:tracking-[0.25em] text-[#39FF14] text-center px-1">Enterprise Engine Active — 500+ Live Symbols (Crypto, Forex, Gold & Silver)</span>
          </motion.div>

          <div className="flex flex-col items-center">
            <motion.h1
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[3.2rem] sm:text-6xl md:text-8xl lg:text-9xl font-black text-center text-white tracking-tighter leading-[1.05] sm:leading-[0.85] mb-4 drop-shadow-2xl relative z-10"
            >
              THE ALPHA <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">TERMINAL.</span>
            </motion.h1>

            <h2 className="text-[9px] sm:text-xs md:text-sm font-black uppercase tracking-[0.2em] sm:tracking-[0.6em] text-[#39FF14] mb-6 sm:mb-10 text-center px-4">Institutional Speed for Professional Signal Execution</h2>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xs sm:text-base md:text-xl text-slate-400 max-w-4xl text-center leading-relaxed mb-6 sm:mb-10 font-medium px-6 sm:px-0"
          >
            <strong className="text-white">Stop operating with a 60-second delay.</strong> Retail traders miss high-alpha moves because candles haven't closed. RSIQ Pro gives you the lead by scanning <span className="text-[#39FF14]">500+ assets tick-by-tick</span>. Get the lead, <strong>verify the logic</strong>, and <span className="text-white">execute before the crowd</span>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full max-w-5xl"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center">
              {/* Left HUD Stats */}
              <div className="hidden md:flex flex-col gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu size={14} className="text-[#39FF14]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Engine Latency</span>
                  </div>
                  <div className="text-xl font-black text-white">0.5ms</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity size={14} className="text-[#39FF14]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Ticks / Day</span>
                  </div>
                  <div className="text-xl font-black text-white text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500">2.4B+</div>
                </div>
              </div>

              {/* Main CTAs */}
              <div className="flex flex-col gap-4">
                <Link
                  href={session ? "/terminal" : "/register"}
                  className="w-full px-8 py-4 sm:py-7 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-[0.25em] shadow-[0_20px_60px_rgba(57,255,20,0.3)] hover:shadow-[0_20px_80px_rgba(57,255,20,0.5)] transition-all text-[11px] sm:text-[14px] active:scale-95 text-center group"
                >
                  {session ? "Enter Terminal" : "Start 14-Day Free Trial"}
                  <ChevronRight size={18} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                {!session && (
                  <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 opacity-60">Full Access • No Credit Card Required</p>
                )}
                <Link
                  href={session ? "/terminal" : "/login"}
                  className="w-full text-center px-8 py-4 rounded-2xl border border-white/10 bg-white/[0.02] text-slate-300 font-black uppercase tracking-[0.2em] text-[11px] active:scale-95 transition-all backdrop-blur-sm"
                >
                  {session ? "Return to Desk" : "Sign In to Desk"}
                </Link>
              </div>

              {/* Right HUD Stats */}
              <div className="hidden md:flex flex-col gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={14} className="text-[#39FF14]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Active Symbols</span>
                  </div>
                  <div className="text-xl font-black text-white">580+</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={14} className="text-[#39FF14]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Security Grade</span>
                  </div>
                  <div className="text-xl font-black text-white">ENTERPRISE</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Institutional Trust Bar ─── */}
      <section className="py-12 border-y border-white/5 bg-white/[0.01] overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-[#05080F] via-transparent to-[#05080F] z-10 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8 md:gap-20">
          <div className="flex-shrink-0 flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">Connectivity Hub</span>
            <span className="text-sm font-black text-white uppercase tracking-widest mt-1">Global Exchanges</span>
          </div>
          <div className="flex-1 overflow-hidden relative h-10 flex items-center">
            <div className="animate-marquee whitespace-nowrap flex items-center gap-16 font-black text-[11px] uppercase tracking-[0.3em] text-slate-400/40">
              <span>Binance Direct</span>
              <span>Bybit WebSocket</span>
              <span>OKX Institutional</span>
              <span>Coinbase Pro</span>
              <span>Bitget Unified</span>
              <span>Kraken Terminal</span>
              <span>KuCoin Alpha</span>
              <span>Binance Direct</span>
              <span>Bybit WebSocket</span>
              <span>OKX Institutional</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
