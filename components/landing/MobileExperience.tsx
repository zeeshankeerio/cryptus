"use client";

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Smartphone, Zap, Sliders, Activity, Target } from 'lucide-react';
import { GridBackground } from './LandingUI';

function FeatureDetail({ title, desc, icon }: { title: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="flex gap-6 group">
      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/40 transition-all flex-shrink-0">
        {icon}
      </div>
      <div className="flex flex-col">
        <h4 className="text-xl font-black text-white tracking-tight uppercase group-hover:text-[#39FF14] transition-colors">{title}</h4>
        <p className="text-sm text-slate-400 font-medium leading-relaxed mt-2">{desc}</p>
      </div>
    </div>
  );
}

export function MobileExperience() {
  return (
    <section id="mobile" className="py-24 sm:py-32 md:py-48 bg-[#05080F] relative overflow-hidden">
      <GridBackground className="opacity-10" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-20 lg:gap-32">
          
          {/* Mobile Mockup (Left Side) */}
          <div className="relative flex justify-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative w-full max-w-[320px] sm:max-w-[400px]"
            >
              {/* Glow */}
              <div className="absolute -inset-20 bg-[#39FF14]/10 blur-[120px] rounded-full pointer-events-none" />
              
              <Image
                src="/images/rsi-mindscapeanalytics.png"
                alt="Parametric Edge Control - System Settings"
                width={800}
                height={1600}
                className="relative z-10 w-full h-auto drop-shadow-[0_40px_100px_rgba(0,0,0,0.8)] rounded-[3rem] border-8 border-slate-900"
              />
              
              {/* Overlay Badge */}
              <div className="absolute -top-4 -right-4 z-20 bg-white/10 text-white px-6 py-2 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-md">
                 <span className="text-[10px] font-black uppercase tracking-widest leading-none">System Settings</span>
              </div>
            </motion.div>
          </div>

          {/* Narrative (Right Side) */}
          <div className="space-y-12">
            <div className="space-y-6">
              <h2 className="text-4xl sm:text-7xl font-black text-white tracking-tighter uppercase leading-[0.9]">
                Parametric <br />
                <span className="text-[#39FF14]">Edge Control.</span>
              </h2>
              <p className="text-slate-400 text-sm sm:text-base font-medium max-w-lg leading-relaxed">
                Define your unique alpha. The engine recalculates the entire market instantly to match your exact trading style. High-density settings for institutional precision.
              </p>
            </div>

            <div className="space-y-8">
              <FeatureDetail 
                icon={<Sliders size={20} />}
                title="Custom RSI Tuning"
                desc="Adjust periods from 2 to 50; whole-market recalculation in sub-10ms. No lag, no compromise."
              />
              <FeatureDetail 
                icon={<Activity size={20} />}
                title="Volatility Surge Mode"
                desc="Real-time alerts when current 1M candle exceeds the 20-bar average size. Intercept breakouts as they trigger."
              />
              <FeatureDetail 
                icon={<Target size={20} />}
                title="Adaptive Thresholds"
                desc="Define unique overbought/oversold boundaries per asset class. Stop using static 70/30 in dynamic markets."
              />
            </div>

            <div className="pt-8 flex flex-wrap gap-4">
               <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03]">
                  <Smartphone size={14} className="text-[#39FF14]" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PWA Native Speed</span>
               </div>
               <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03]">
                  <Zap size={14} className="text-[#39FF14]" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Biometric Encrypted</span>
               </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
