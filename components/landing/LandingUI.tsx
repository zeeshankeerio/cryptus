"use client";

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  ArrowUpRight, 
  Zap, 
  Lock 
} from 'lucide-react';

export function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.div
      whileHover={{ y: -8 }}
      className="p-6 sm:p-8 md:p-10 rounded-3xl sm:rounded-[40px] bg-white/[0.02] border border-white/5 hover:border-[#39FF14]/30 hover:bg-[#39FF14]/[0.02] transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-6 sm:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
      </div>
      <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl bg-white/5 flex items-center justify-center mb-6 sm:mb-8 md:mb-10 group-hover:scale-110 transition-transform relative z-10 group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14]">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 24 })}
      </div>
      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-3 sm:mb-5 relative z-10">{title}</h3>
      <p className="text-slate-500 text-sm font-medium leading-relaxed relative z-10 group-hover:text-slate-400 transition-colors">{desc}</p>
    </motion.div>
  );
}

export function LeadServiceCard({
  icon,
  title,
  desc,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className="rounded-3xl border border-white/10 bg-[#0a0f1a] p-6 sm:p-7 flex flex-col"
    >
      <div className="w-11 h-11 rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14] flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-5 text-xl font-black tracking-tight text-white">{title}</h3>
      <p className="mt-3 text-sm text-slate-400 leading-relaxed flex-1">{desc}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-flex items-center gap-2 text-[#39FF14] text-[11px] font-black uppercase tracking-[0.2em]"
      >
        Explore Service <ArrowUpRight size={14} />
      </a>
    </motion.div>
  );
}

export function TradingViewMiniChart({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      "symbol": symbol,
      "width": "100%",
      "height": "100%",
      "locale": "en",
      "dateRange": "1D",
      "colorTheme": "dark",
      "isTransparent": true,
      "autosize": true,
      "largeChartUrl": ""
    });
    container.current.appendChild(script);
  }, [symbol]);

  return (
    <div className="tradingview-widget-container h-[calc(100%-80px)] w-full opacity-60 group-hover:opacity-100 transition-opacity mt-14 pointer-events-none relative z-0" ref={container}>
      <div className="tradingview-widget-container__widget h-full w-full"></div>
    </div>
  );
}

export function IntelligenceCard({ icon, title, subtitle, children, delay = 0 }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group relative p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:border-[#39FF14]/30 hover:bg-[#39FF14]/[0.02] transition-all duration-500 overflow-hidden flex flex-col h-full"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.1] group-hover:scale-125 transition-all duration-700">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 120 })}
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/40 transition-all">
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#39FF14]">{subtitle}</span>
          <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
        </div>
      </div>

      <div className="flex-1 relative z-10">
        {children}
      </div>

      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Engine Stream</span>
        </div>
        <ArrowUpRight size={14} className="text-slate-600 group-hover:text-[#39FF14] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </motion.div>
  );
}

export function SignalRibbon({ label, value, status }: { label: string; value: string; status: 'bullish' | 'bearish' | 'neutral' }) {
  return (
    <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all group/ribbon">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === 'bullish' ? "bg-[#39FF14]" : status === 'bearish' ? "bg-red-500" : "bg-slate-500"
        )} />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover/ribbon:text-white transition-colors">{label}</span>
      </div>
      <span className={cn(
        "text-[11px] font-black tabular-nums",
        status === 'bullish' ? "text-[#39FF14]" : status === 'bearish' ? "text-red-500" : "text-white"
      )}>{value}</span>
    </div>
  );
}

export function ComparisonModule({ title, points, status }: { title: string; points: string[]; status: 'retail' | 'pro' }) {
  return (
    <div className={cn(
      "p-8 rounded-[2.5rem] border flex flex-col h-full transition-all duration-500",
      status === 'pro'
        ? "bg-[#39FF14]/[0.01] border-[#39FF14]/20 shadow-[0_0_80px_rgba(57,255,20,0.05)]"
        : "bg-white/[0.01] border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
    )}>
      <div className="flex items-center gap-4 mb-8">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center border",
          status === 'pro' ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]" : "bg-white/5 border-white/10 text-slate-500"
        )}>
          {status === 'pro' ? <Zap size={20} /> : <Lock size={20} />}
        </div>
        <h4 className="text-xl font-black text-white tracking-tight">{title}</h4>
      </div>

      <div className="space-y-4 flex-1">
        {points.map((p, i) => (
          <div key={i} className="flex items-start gap-3 group/point">
            <div className={cn(
              "mt-1.5 w-1.5 h-1.5 rounded-full",
              status === 'pro' ? "bg-[#39FF14]" : "bg-slate-700"
            )} />
            <p className="text-sm font-medium text-slate-400 group-hover/point:text-slate-200 transition-colors leading-relaxed">
              {p}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 pt-6 border-t border-white/5">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          Result: <span className={status === 'pro' ? "text-[#39FF14]" : "text-red-500"}>
            {status === 'pro' ? "Alpha Captured" : "Retail Friction"}
          </span>
        </span>
      </div>
    </div>
  );
}

export function PlanCard({ 
  tier, 
  price, 
  features, 
  highlight = false,
  trial = false,
  href = "/register"
}: { 
  tier: string; 
  price: string; 
  features: string[]; 
  highlight?: boolean;
  trial?: boolean;
  href?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -10 }}
      className={cn(
        "p-10 rounded-[3rem] border flex flex-col relative overflow-hidden transition-all duration-700 h-full",
        highlight
          ? "bg-[#39FF14]/[0.02] border-[#39FF14]/30 shadow-[0_40px_100px_rgba(57,255,20,0.1)]"
          : "bg-white/[0.02] border-white/5"
      )}
    >
      {highlight && (
        <div className="absolute top-0 right-0 p-6">
          <span className="px-3 py-1 rounded-full bg-[#39FF14] text-black text-[9px] font-black uppercase tracking-widest shadow-xl">Best Value</span>
        </div>
      )}

      {trial && (
        <div className="absolute top-10 right-10 rotate-12 hidden md:block">
           <span className="px-2 py-1 rounded bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] text-[8px] font-black uppercase tracking-widest">14d Free Trial</span>
        </div>
      )}

      <div className="mb-8">
        <h4 className={cn("text-[10px] font-black uppercase tracking-[0.4em] mb-2", highlight ? "text-[#39FF14]" : "text-slate-500")}>
          {tier}
        </h4>
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black text-white tracking-tighter">{price}</span>
          <span className="text-sm font-bold text-slate-500">
            {price === "Free" ? "" : (tier.toLowerCase().includes('enterprise') || price === "$200") ? "/yr" : "/mo"}
          </span>
        </div>
        {trial && (
          <p className="text-[10px] font-black uppercase tracking-widest text-[#39FF14] mt-2 opacity-80">Full Access • Cancel Anytime</p>
        )}
      </div>

      <div className="space-y-5 flex-1 pt-4">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={cn("w-1 h-1 rounded-full", highlight ? "bg-[#39FF14]" : "bg-slate-700")} />
            <span className="text-sm font-medium text-slate-400">{f}</span>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className={cn(
          "mt-12 w-full py-5 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all text-center",
          highlight
            ? "bg-[#39FF14] text-black shadow-xl shadow-[#39FF14]/20 hover:scale-[1.02]"
            : "bg-white/5 text-white hover:bg-white/10"
        )}
      >
        {trial ? "Start 14-Day Free Trial" : `Select ${tier} Plan`}
      </Link>
    </motion.div>
  );
}

export function MobileFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 group p-3 sm:p-0 rounded-xl sm:rounded-none bg-white/[0.03] sm:bg-transparent border border-white/5 sm:border-none">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/40 transition-all flex-shrink-0">
        {icon}
      </div>
      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">{text}</span>
    </div>
  );
}

export function PersonaCard({ icon, role, needs, impact }: { icon: React.ReactNode; role: string; needs: string; impact: string }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="p-6 sm:p-10 rounded-[28px] sm:rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex flex-col"
    >
      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 flex items-center justify-center mb-6 sm:mb-8">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
      </div>
      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">TARGET PERSONA</h4>
      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-4">{role}</h3>
      <p className="text-sm text-slate-400 font-medium leading-relaxed mb-6 flex-1">
        {needs}
      </p>
      <div className="pt-6 border-t border-white/5">
        <span className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]">IMPACT:</span>
        <p className="mt-1 text-xs text-white/80 font-bold italic">"{impact}"</p>
      </div>
    </motion.div>
  );
}

export function AnalysisItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="group border-l-2 border-white/10 pl-5 sm:pl-8 py-1 sm:py-3 hover:border-[#39FF14] transition-colors relative">
      <div className="absolute left-0 top-0 bottom-0 w-0 bg-gradient-to-r from-[#39FF14]/5 to-transparent group-hover:w-full transition-all duration-500" />
      <h4 className="text-white font-black uppercase tracking-widest text-[10px] sm:text-[12px] mb-1 sm:mb-2 relative z-10 group-hover:text-[#39FF14] transition-colors">{title}</h4>
      <p className="text-slate-500 text-[11px] sm:text-[13px] font-medium leading-relaxed relative z-10 group-hover:text-slate-400 transition-colors">{desc}</p>
    </div>
  );
}

export function StatBox({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={cn(
        "p-5 sm:p-7 md:p-10 rounded-3xl sm:rounded-[40px] border flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2",
        highlight
          ? "bg-[#39FF14] border-[#39FF14] text-black shadow-2xl shadow-[#39FF14]/30"
          : "bg-white/[0.03] border-white/5 text-white"
      )}
    >
      <span className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter leading-none">{value}</span>
      <span className={cn("text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]", highlight ? "opacity-60" : "text-slate-500")}>
        {label}
      </span>
    </motion.div>
  );
}

