"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Bell, Download, ShieldCheck, Wifi, ArrowUpRight, Zap, Smartphone, Star } from 'lucide-react';
import { MobileFeature } from './LandingUI';

export function MobileExperience() {
  return (
    <section id="mobile" className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-white/[0.01]">
      {/* Background Decorative Element */}
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-[#39FF14]/5 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 -ml-32 opacity-30" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-10 lg:gap-12 xl:gap-16">
          
          {/* Column 1: Narrative (Left Side) */}
          <div className="flex flex-col items-start space-y-6 lg:space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-3"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#39FF14]">Always Informed</span>
              </div>
              <h3 className="text-4xl md:text-5xl lg:text-7xl font-black text-white tracking-tighter leading-[0.9] lg:leading-[0.85]">
                THE TERMINAL <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">IN YOUR POCKET.</span>
              </h3>
            </motion.div>

            <p className="text-sm sm:text-base lg:text-lg text-slate-400 font-medium leading-relaxed max-w-lg">
              Experience institutional-grade logic anywhere. Our high-performance PWA grants full terminal access with biometric security, real-time push confluence alerts, and native install speed on iOS and Android.
            </p>

            {/* High-Performance Feature Grid */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6 w-full max-w-md pt-2">
              <MobileFeature icon={<Bell size={18} />} text="Push Alerts" />
              <MobileFeature icon={<Download size={18} />} text="Install PWA" />
              <MobileFeature icon={<ShieldCheck size={18} />} text="Biometric" />
              <MobileFeature icon={<Wifi size={18} />} text="Offline Ready" />
            </div>

            {/* Action Button */}
            <div className="pt-4">
              <Link
                href="/register"
                className="group inline-flex items-center gap-4 px-8 py-4 sm:py-5 rounded-2xl bg-[#39FF14] text-black font-black uppercase text-[12px] sm:text-[13px] tracking-[0.2em] shadow-[0_20px_60px_rgba(57,255,20,0.3)] hover:shadow-[0_20px_80px_rgba(57,255,20,0.5)] transition-all active:scale-95"
              >
                Authorize Mobile Access
                <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Column 2: Mobile Mockup (Right Side) */}
          <div className="relative flex justify-center lg:justify-end py-10 lg:py-0">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative group w-full max-w-[300px] sm:max-w-[380px] xl:max-w-[440px]"
            >
              {/* Aura Bloom */}
              <div className="absolute -inset-20 -z-10 bg-[radial-gradient(circle_at_center,rgba(57,255,20,0.1),transparent_75%)] blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              
              {/* iPhone Frame + App Image */}
              <div className="relative">
                <Image
                  src="/images/rsi-mindscapeanalytics.png"
                  alt="RSIQ Pro PWA Native Terminal"
                  width={1200}
                  height={2400}
                  className="w-full h-auto drop-shadow-[0_40px_100px_rgba(0,0,0,0.6)] relative z-10"
                  priority
                />

                {/* The Institutional Blade Tag - Precision Positioning */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  whileInView={{ opacity: 1, scale: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 }}
                  className="absolute -top-4 -right-4 sm:-top-6 sm:-right-8 z-20 pointer-events-none"
                >
                  <div className="relative">
                    <div className="absolute -inset-1.5 bg-[#39FF14]/30 blur-xl rounded-2xl animate-pulse" />
                    <div className="relative bg-[#081008]/95 backdrop-blur-3xl border border-[#39FF14]/30 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl overflow-hidden">
                      {/* Technical Scanline */}
                      <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(57,255,20,0.1)_1px,transparent_1px)] bg-[size:100%_4px] animate-[scan_6s_linear_infinite]" />
                      
                      <div className="relative flex items-center justify-center">
                        <span className="flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39FF14] opacity-40"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#39FF14]"></span>
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-white tracking-[0.1em] uppercase leading-none mb-1">Retail Lag</span>
                        <span className="text-[8px] font-black text-[#39FF14] tracking-[0.1em] uppercase leading-none opacity-80">System Cleared</span>
                      </div>
                      <div className="ml-2 pl-3 border-l border-white/10">
                        <Zap size={16} className="text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]" />
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Badges - Tightened positioning */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -left-6 top-[25%] hidden xl:flex bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl z-20 flex-col items-center gap-2"
                >
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-[#39FF14] border border-emerald-500/20">
                    <Smartphone size={20} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">PWA Native</span>
                </motion.div>

                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -right-6 bottom-[15%] hidden xl:flex bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-3xl shadow-2xl z-20 flex-col items-center gap-2"
                >
                  <div className="flex gap-1.5">
                    {[...Array(5)].map((_, i) => <Star key={i} size={10} className="text-[#39FF14] fill-[#39FF14]" />)}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]">Institutional</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
