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

export function FeatureCard({ 
  icon, 
  title, 
  desc, 
  color = "green" 
}: { 
  icon: React.ReactNode; 
  title: string; 
  desc: string; 
  color?: "green" | "blue" | "purple" | "amber" | "red" | "cyan";
}) {
  const themes = {
    green: "hover:border-[#39FF14]/30 hover:bg-[#39FF14]/[0.02] group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14]",
    blue: "hover:border-blue-500/30 hover:bg-blue-500/[0.02] group-hover:bg-blue-500/10 group-hover:text-blue-500",
    purple: "hover:border-purple-500/30 hover:bg-purple-500/[0.02] group-hover:bg-purple-500/10 group-hover:text-purple-500",
    amber: "hover:border-amber-500/30 hover:bg-amber-500/[0.02] group-hover:bg-amber-500/10 group-hover:text-amber-500",
    red: "hover:border-red-500/30 hover:bg-red-500/[0.02] group-hover:bg-red-500/10 group-hover:text-red-500",
    cyan: "hover:border-cyan-400/30 hover:bg-cyan-400/[0.02] group-hover:bg-cyan-400/10 group-hover:text-cyan-400"
  };

  return (
    <motion.div
      whileHover={{ y: -8 }}
      className={cn(
        "p-6 sm:p-8 md:p-10 rounded-3xl sm:rounded-[40px] bg-white/[0.02] border border-white/5 transition-all group relative overflow-hidden",
        themes[color]
      )}
    >
      <div className="absolute top-0 right-0 p-6 sm:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
      </div>
      <div className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl bg-white/5 flex items-center justify-center mb-6 sm:mb-8 md:mb-10 group-hover:scale-110 transition-transform relative z-10">
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

export function IntelligenceCard({ 
  icon, 
  title, 
  subtitle, 
  children, 
  delay = 0,
  color = "green"
}: { 
  icon: React.ReactNode; 
  title: string; 
  subtitle: string; 
  children: React.ReactNode; 
  delay?: number;
  color?: "green" | "blue" | "purple" | "amber" | "red" | "cyan";
}) {
  const themes = {
    green: {
      border: "hover:border-[#39FF14]/30",
      bg: "hover:bg-[#39FF14]/[0.02]",
      text: "text-[#39FF14]",
      iconBorder: "group-hover:border-[#39FF14]/40",
      dot: "bg-[#39FF14]"
    },
    blue: {
      border: "hover:border-blue-500/30",
      bg: "hover:bg-blue-500/[0.02]",
      text: "text-blue-500",
      iconBorder: "group-hover:border-blue-500/40",
      dot: "bg-blue-500"
    },
    purple: {
      border: "hover:border-purple-500/30",
      bg: "hover:bg-purple-500/[0.02]",
      text: "text-purple-500",
      iconBorder: "group-hover:border-purple-500/40",
      dot: "bg-purple-500"
    },
    amber: {
      border: "hover:border-amber-500/30",
      bg: "hover:bg-amber-500/[0.02]",
      text: "text-amber-500",
      iconBorder: "group-hover:border-amber-500/40",
      dot: "bg-amber-500"
    },
    red: {
      border: "hover:border-red-500/30",
      bg: "hover:bg-red-500/[0.02]",
      text: "text-red-500",
      iconBorder: "group-hover:border-red-500/40",
      dot: "bg-red-500"
    },
    cyan: {
      border: "hover:border-cyan-400/30",
      bg: "hover:bg-cyan-400/[0.02]",
      text: "text-cyan-400",
      iconBorder: "group-hover:border-cyan-400/40",
      dot: "bg-cyan-400"
    }
  };

  const theme = themes[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className={cn(
        "group relative p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 transition-all duration-500 overflow-hidden flex flex-col h-full",
        theme.border,
        theme.bg
      )}
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.1] group-hover:scale-125 transition-all duration-700">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 120 })}
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className={cn(
          "w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-inherit transition-all",
          theme.text,
          theme.iconBorder
        )}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", theme.text)}>{subtitle}</span>
          <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
        </div>
      </div>

      <div className="flex-1 relative z-10">
        {children}
      </div>

      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", theme.dot)} />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Engine Stream</span>
        </div>
        <ArrowUpRight size={14} className={cn("text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5", theme.text)} />
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
        <h4 className={cn("text-[10px] font-black uppercase tracking-[0.5em] mb-2", highlight ? "text-[#39FF14]" : "text-slate-500")}>
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

export function PersonaCard({ 
  icon, 
  role, 
  needs, 
  impact,
  color = "green"
}: { 
  icon: React.ReactNode; 
  role: string; 
  needs: string; 
  impact: string;
  color?: "green" | "blue" | "purple" | "cyan";
}) {
  const themes = {
    green: "text-[#39FF14]",
    blue: "text-blue-500",
    purple: "text-purple-500",
    cyan: "text-cyan-400"
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="p-6 sm:p-10 rounded-[28px] sm:rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex flex-col h-full"
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
        <span className={cn("text-[10px] font-black uppercase tracking-widest", themes[color])}>IMPACT:</span>
        <p className="mt-1 text-xs text-white/80 font-bold">"{impact}"</p>
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

/* ─── Institutional Primitives ────────────────── */

export function GridBackground({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0", className)} />
  );
}

export function OutcomeLabel({ text, type }: { text: string; type: 'retail' | 'alpha' }) {
  return (
    <div className={cn(
      "w-full py-4 px-6 text-[11px] font-black uppercase tracking-[0.2em]",
      type === 'retail' ? "bg-red-500/20 text-red-500 border-t border-red-500/30" : "bg-[#39FF14]/20 text-[#39FF14] border-t border-[#39FF14]/30"
    )}>
      Outcome: {text}
    </div>
  );
}

export function SignalPreview({ type, title, subtitle, bullets }: { type: 'buy' | 'sell'; title: string; subtitle: string; bullets: string[] }) {
  return (
    <div className="p-6 rounded-2xl bg-[#0a0f1a] border border-white/10 shadow-2xl relative overflow-hidden group">
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-1",
        type === 'buy' ? "bg-[#39FF14]" : "bg-red-500"
      )} />
      <div className="flex items-center gap-3 mb-4">
        <div className={cn(
          "w-3 h-3 rounded-full animate-pulse",
          type === 'buy' ? "bg-[#39FF14]" : "bg-red-500"
        )} />
        <span className={cn(
          "text-[11px] font-black uppercase tracking-widest",
          type === 'buy' ? "text-[#39FF14]" : "text-red-500"
        )}>{title}</span>
        <span className="text-slate-400 text-[11px] font-medium">{subtitle}</span>
      </div>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-2 text-[10px] text-slate-300 font-medium">
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectStep({ 
  title, 
  subtitle, 
  desc, 
  active = false,
  color = "green"
}: { 
  title: string; 
  subtitle: string; 
  desc: string; 
  active?: boolean;
  color?: "green" | "blue" | "purple" | "cyan" | "amber";
}) {
  const themes = {
    green: "bg-[#39FF14]/[0.05] border-[#39FF14]/30 text-[#39FF14]",
    blue: "bg-blue-500/[0.05] border-blue-500/30 text-blue-500",
    purple: "bg-purple-500/[0.05] border-purple-500/30 text-purple-500",
    cyan: "bg-cyan-400/[0.05] border-cyan-400/30 text-cyan-400",
    amber: "bg-amber-400/[0.05] border-amber-400/30 text-amber-400"
  };

  return (
    <div className={cn(
      "p-8 rounded-3xl border transition-all duration-500 flex flex-col gap-4",
      active 
        ? cn("scale-105 shadow-[0_0_50px_rgba(57,255,20,0.05)]", themes[color]) 
        : "bg-white/[0.02] border-white/5 opacity-60 flex-shrink"
    )}>
      <div className="flex flex-col">
        <span className={cn("text-[10px] font-black uppercase tracking-[0.5em] mb-1", active ? "text-inherit" : "text-slate-500")}>
          {subtitle}
        </span>
        <h4 className="text-xl font-black text-white tracking-tight">{title}</h4>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

