"use client";

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { TrendingUp, ShieldCheck } from 'lucide-react';

export function TerminalPreview() {
  return (
    <section id="preview" className="relative px-4 sm:px-6 pb-20 sm:pb-32 md:pb-40 z-10">
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-10">
          {/* Main Terminal Image */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="xl:col-span-8 relative p-1.5 rounded-[32px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-2xl group overflow-hidden"
          >
            <Image
              src="/images/system_images/main_dashboard.png"
              alt="RSIQ Pro Institutional Terminal"
              width={2560}
              height={1440}
              className="w-full h-auto rounded-[26px] object-cover opacity-90 group-hover:opacity-100 transition-all duration-700 group-hover:scale-[1.02]"
            />

            {/* Floating Alert HUD Tags */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 30 }}
              whileInView={{ opacity: 1, scale: 1, x: 0 }}
              animate={{ y: [0, -10, 0] }}
              viewport={{ once: true }}
              transition={{ 
                y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                delay: 0.4
              }}
              className="absolute -top-4 -right-4 sm:-top-8 sm:-right-8 z-30 w-32 sm:w-48 md:w-56 drop-shadow-[0_20px_40px_rgba(57,255,20,0.4)]"
            >
              <Image 
                src="/images/system_images/liqudition_alert.png" 
                alt="Liquidation Alert" 
                width={500} 
                height={150} 
                className="w-full h-auto border border-white/10 rounded-xl"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -30 }}
              whileInView={{ opacity: 1, scale: 1, x: 0 }}
              animate={{ y: [0, 8, 0] }}
              viewport={{ once: true }}
              transition={{ 
                y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                delay: 0.6
              }}
              className="absolute bottom-12 sm:bottom-20 -left-2 sm:-left-8 z-30 w-32 sm:w-48 md:w-56 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
            >
              <Image 
                src="/images/system_images/whale_alerts.png" 
                alt="Whale Alert" 
                width={500} 
                height={150} 
                className="w-full h-auto border border-white/10 rounded-xl"
              />
            </motion.div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E17]/80 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-4 bg-black/60 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10">
                <div className="w-2 h-2 rounded-full bg-[#39FF14] animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Live Decision Engine Active</span>
              </div>
            </div>
          </motion.div>

          {/* Sidebar High-Performance Stats */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="flex-1 p-8 rounded-[32px] bg-white/[0.03] border border-white/10 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-500 text-[#39FF14]">
                <TrendingUp size={120} />
              </div>
              <h4 className="text-[11px] font-black uppercase tracking-widest text-[#39FF14] mb-4">Liquidation Flux V4</h4>
              <p className="text-2xl font-black text-white tracking-tight leading-tight">Intercept institutional margin exhaustion.</p>
              <div className="mt-8 relative h-32 w-full">
                <Image src="/images/system_images/Signal_naratives.png" alt="Signal Narration" fill className="object-contain" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="flex-1 p-8 rounded-[32px] bg-[#39FF14]/[0.05] border border-[#39FF14]/20 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform duration-500 text-[#39FF14]">
                <ShieldCheck size={120} />
              </div>
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Portfolio Armor</h4>
              <p className="text-2xl font-black text-white tracking-tight leading-tight">Neural HHI risk scoring built-in.</p>
              <div className="mt-8 relative h-32 w-full">
                <Image src="/images/system_images/portfolio_risk.png" alt="Portfolio Risk" fill className="object-contain" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
