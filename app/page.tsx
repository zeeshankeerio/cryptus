"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Zap, 
  ShieldCheck, 
  BarChart3, 
  TrendingUp, 
  Bell, 
  Cpu,
  Smartphone,
  Terminal,
  Activity,
  ChevronRight,
  Target,
  LineChart,
  Lock,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (session && !isPending) {
      router.push('/terminal');
    }
  }, [session, isPending, router]);

  // If session is present, show a minimal loading state while redirecting
  if (session && !isPending) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <div className="w-16 h-16 border-t-2 border-[#39FF14] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-300 selection:bg-[#39FF14]/30 selection:text-white overflow-hidden font-sans">
      {/* ─── Grid Overlay ─── */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent)] pointer-events-none z-0" />

      {/* ─── Header ─── */}
      <nav className="fixed top-0 w-full z-[100] border-b border-white/5 bg-[#05080F]/90 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border border-[#39FF14]/30 flex items-center justify-center shadow-lg shadow-[#39FF14]/10">
                <TrendingUp size={24} className="text-[#39FF14]" />
             </div>
             <div className="flex flex-col">
               <span className="text-xl font-black text-white tracking-tighter leading-none">RSIQ <span className="text-[#39FF14]">PRO</span></span>
               <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500 leading-none mt-1">Global Terminal</span>
             </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8 mr-auto ml-16">
             <a href="#features" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Features</a>
             <a href="#logic" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">The Logic</a>
             <a href="#mobile" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Mobile</a>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/login" className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Login</Link>
            <Link 
              href="/terminal" 
              className="px-6 py-3 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-[#39FF14]/20 hover:scale-105 active:scale-95 transition-all"
            >
              Launch Terminal
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-44 pb-32 px-6 z-10 overflow-hidden">
        {/* Alpha Glow Effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#39FF14]/10 blur-[120px] rounded-full"
          />
          <motion.div 
            animate={{ 
              scale: [1.2, 1, 1.2],
              opacity: [0.05, 0.15, 0.05]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 blur-[100px] rounded-full"
          />
        </div>

        <div className="max-w-7xl mx-auto flex flex-col items-center relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 mb-10"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#39FF14] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#39FF14]"></span>
            </span>
            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-[#39FF14]">Enterprise Engine Active — 500+ Pairs</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-6xl md:text-8xl lg:text-9xl font-black text-center text-white tracking-tighter leading-[0.85] mb-10 drop-shadow-2xl"
          >
            THE ALPHA <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-[#39FF14] to-emerald-800">TERMINAL.</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-2xl text-slate-500 max-w-3xl text-center leading-relaxed mb-16 font-medium"
          >
            Institutional-grade crypto scanning. Combining multi-indicator confluence, real-time sentiment analysis, and professional strategy scoring.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-6"
          >
            <Link 
              href="/register" 
              className="w-full sm:w-auto px-12 py-6 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-[0.25em] shadow-[0_20px_60px_rgba(57,255,20,0.3)] hover:shadow-[0_20px_80px_rgba(57,255,20,0.5)] transition-all text-[13px] active:scale-95"
            >
              Start Trading Now
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── Desktop Preview Section ─── */}
      <section id="preview" className="relative px-6 pb-40 z-10">
        <div className="max-w-[1400px] mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: 'spring', damping: 20 }}
            className="relative p-2 rounded-[40px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-[0_80px_160px_rgba(0,0,0,0.9)] group"
          >
             <div className="bg-[#0A0E17] rounded-[32px] overflow-hidden relative border border-white/5">
                <Image 
                  src="/images/desktop_view.webp" 
                  alt="RSIQ Pro Desktop Terminal" 
                  width={2560} 
                  height={1440}
                  className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-700"
                />
                
                {/* Floating Detail Overlays */}
                <div className="absolute top-10 left-10 p-6 rounded-2xl bg-black/60 backdrop-blur-xl border border-[#39FF14]/30 shadow-2xl hidden lg:block max-w-xs transition-transform group-hover:-translate-y-2">
                   <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#39FF14]/20 flex items-center justify-center">
                         <Activity size={18} className="text-[#39FF14]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Market Bias Algorithm</span>
                   </div>
                   <p className="text-[11px] text-slate-400 leading-relaxed font-bold">
                      Calculates global sentiment across 500+ pairs. Identifies macro reversals before they hit the tape.
                   </p>
                </div>

                <div className="absolute bottom-10 right-10 p-6 rounded-2xl bg-black/60 backdrop-blur-xl border border-[#39FF14]/30 shadow-2xl hidden lg:block max-w-xs transition-transform group-hover:translate-y-2">
                   <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#39FF14]/20 flex items-center justify-center">
                         <Target size={18} className="text-[#39FF14]" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white">Strategy Scoring</span>
                   </div>
                   <p className="text-[11px] text-slate-400 leading-relaxed font-bold">
                      Proprietary 0-100 score combining RSI Divergence, EMA Crossovers, and MACD Momentum.
                   </p>
                </div>
             </div>
          </motion.div>
        </div>
      </section>

      {/* ─── The Alpha Logic Section ─── */}
      <section id="logic" className="py-40 border-y border-white/5 bg-white/[0.01] px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#39FF14]/5 blur-[160px] rounded-full pointer-events-none -mr-40 -mt-40" />
        
        <div className="max-w-7xl mx-auto">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
             <div className="space-y-12">
                <div className="space-y-4">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">The Intelligence Layer</h2>
                  <p className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-[0.95]">
                    Engineered for <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Winning Execution.</span>
                  </p>
                </div>

                <div className="space-y-8">
                   <AnalysisItem 
                     title="Multi-Indicator Confluence" 
                     desc="Stop relying on a single data point. RSIQ Pro cross-references RSI, MACD Histogram, Stochastics, and BB Position to find high-probability setups." 
                   />
                   <AnalysisItem 
                     title="Custom RSI Tuning" 
                     desc="Fine-tune your edge. Adjust RSI periods from 2 to 50 in real-time. Our custom calculation engine applies your strategy to the entire market instantly." 
                   />
                   <AnalysisItem 
                     title="Real-Time Divergence Detection" 
                     desc="Automated Bullish and Bearish divergence tracking across multiple timeframes. Spot reversals hours before they happen." 
                   />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                <StatBox value="+14% / -6%" label="Market Bias Delta" />
                <StatBox value="0.5ms" label="Engine Latency" highlight />
                <StatBox value="24/7" label="Live Uptime" />
                <StatBox value="500+" label="Pairs Tracked" />
             </div>
           </div>
        </div>
      </section>

      {/* ─── Mobile / PWA Experience Section ─── */}
      <section id="mobile" className="py-40 px-6">
        <div className="max-w-7xl mx-auto flex flex-col xl:flex-row items-center gap-32">
          <div className="flex-1 order-2 xl:order-1 flex justify-center">
             <motion.div 
               initial={{ rotate: -5, y: 20 }}
               whileInView={{ rotate: 0, y: 0 }}
               viewport={{ once: true }}
               className="relative w-[320px] md:w-[380px] p-4 rounded-[60px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden"
             >
                <div className="bg-[#05080F] rounded-[48px] overflow-hidden relative aspect-[9/19] border border-white/10 p-1">
                   <div className="w-full h-full rounded-[44px] overflow-hidden relative">
                      <Image 
                        src="/images/mobile_view.webp" 
                        alt="RSIQ Pro Mobile View" 
                        width={1080} 
                        height={2280}
                        className="w-full h-full object-cover"
                      />
                   </div>
                   
                   {/* App Drawer Sim */}
                   <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/10 rounded-full" />
                </div>

                {/* Mobile Specific Badges */}
                <div className="absolute -right-10 top-1/4 p-4 rounded-2xl bg-[#39FF14] text-black shadow-2xl rotate-12 hidden md:block z-20">
                   <Smartphone size={24} className="mb-2" />
                   <span className="text-[10px] font-black uppercase tracking-widest leading-none">PWA NATIVE <br /> READY</span>
                </div>
             </motion.div>
          </div>

          <div className="flex-1 order-1 xl:order-2 space-y-12">
             <div className="space-y-4">
                <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">Always Informed</h2>
                <h3 className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-[0.95]">
                   The Terminal <br /> in Your Pocket.
                </h3>
             </div>
             <p className="text-lg text-slate-500 font-medium leading-relaxed max-w-xl">
                Experience full terminal functionality on the go. Our PWA (Progressive Web App) allows you to install RSIQ Pro as a native application with lightning-fast performance and no browser orientation.
             </p>
             <div className="grid grid-cols-2 gap-8 pt-6">
                <MobileFeature icon={<Bell />} text="Instant Push Alerts" />
                <MobileFeature icon={<Smartphone />} text="App-like Navigation" />
                <MobileFeature icon={<ShieldCheck />} text="Biometric Ready" />
                <MobileFeature icon={<Activity />} text="Low Data Usage" />
             </div>
          </div>
        </div>
      </section>

      {/* ─── Core Features Grid ─── */}
      <section className="py-40 bg-white/[0.02] border-t border-white/5 px-6">
         <div className="max-w-7xl mx-auto">
            <div className="text-center mb-24 space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">Advanced Capabilities</h2>
              <p className="text-5xl font-black text-white tracking-tighter">Everything for Professional Trading.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
               <FeatureCard 
                 icon={<Zap />} 
                 title="Market Bias Dashboard" 
                 desc="A high-level view of long/short sentiment across the entire crypto ecosystem. Spot trend reversals before they form." 
               />
               <FeatureCard 
                 icon={<BarChart3 />} 
                 title="Confluence Strategy" 
                 desc="Never trade a single indicator again. Our engine combines 5+ technical signals for a unified decision score." 
               />
               <FeatureCard 
                 icon={<Cpu />} 
                 title="Custom Formula Engine" 
                 desc="Input your custom RSI period and watch the entire market re-calculate in absolute real-time (sub-10ms)." 
               />
               <FeatureCard 
                 icon={<Lock />} 
                 title="Institutional Security" 
                 desc="Enterprise-grade authentication and data encryption. Your strategy, watchlist, and data remain strictly yours." 
               />
               <FeatureCard 
                 icon={<LineChart />} 
                 title="MACD + EMA Integration" 
                 desc="Full trend analysis built-in. EMA Golden/Death crosses and MACD histograms integrated into the main scanner." 
               />
               <FeatureCard 
                 icon={<Layers />} 
                 title="Multi-Timeframe Sync" 
                 desc="Track 1m, 5m, 15m, and 1h intervals simultaneously. Align your entries with higher timeframe dominance." 
               />
            </div>
         </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-60 px-6 relative overflow-hidden bg-gradient-to-b from-transparent to-[#0A0E17]">
         <div className="absolute inset-0 bg-[#39FF14]/[0.02] [mask-image:radial-gradient(circle_at_center,black,transparent)] pointer-events-none" />
         
         <div className="max-w-4xl mx-auto text-center space-y-16 relative z-10">
            <h2 className="text-7xl md:text-9xl font-black text-white tracking-tighter leading-[0.85]">READY FOR THE ALPHA?</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-10">
               <Link 
                 href="/register" 
                 className="w-full sm:w-auto px-16 py-8 rounded-3xl bg-[#39FF14] text-black font-black uppercase tracking-[0.3em] shadow-[0_40px_100px_rgba(57,255,20,0.4)] hover:shadow-[0_40px_140px_rgba(57,255,20,0.6)] transition-all text-sm group"
               >
                 Create Your Terminal
                 <ArrowUpRight size={20} className="inline ml-3 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
               </Link>
            </div>
            <div className="pt-40 opacity-20 flex flex-col items-center gap-4">
               <div className="flex items-center gap-8 grayscale">
                  <span className="text-xl font-black text-white">MINDSCAPE ANALYTICS LLC</span>
               </div>
               <span className="text-[10px] font-black uppercase tracking-[1.5em] text-slate-500">Global Terminal &copy; 2026</span>
            </div>
         </div>
      </section>
    </div>
  );
}

function AnalysisItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="group border-l-2 border-white/10 pl-8 py-3 hover:border-[#39FF14] transition-colors relative">
       <div className="absolute left-0 top-0 bottom-0 w-0 bg-gradient-to-r from-[#39FF14]/5 to-transparent group-hover:w-full transition-all duration-500" />
       <h4 className="text-white font-black uppercase tracking-widest text-[12px] mb-2 relative z-10 group-hover:text-[#39FF14] transition-colors">{title}</h4>
       <p className="text-slate-500 text-[13px] font-medium leading-relaxed relative z-10 group-hover:text-slate-400 transition-colors">{desc}</p>
    </div>
  );
}

function StatBox({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
  return (
    <motion.div 
      whileHover={{ scale: 1.05 }}
      className={cn(
        "p-10 rounded-[40px] border flex flex-col items-center justify-center text-center gap-2",
        highlight 
          ? "bg-[#39FF14] border-[#39FF14] text-black shadow-2xl shadow-[#39FF14]/30" 
          : "bg-white/[0.03] border-white/5 text-white"
      )}
    >
       <span className="text-5xl font-black tracking-tighter leading-none">{value}</span>
       <span className={cn("text-[10px] font-black uppercase tracking-[0.3em]", highlight ? "opacity-60" : "text-slate-500")}>
         {label}
       </span>
    </motion.div>
  );
}

function MobileFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-4 group">
       <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/40 transition-all">
          {icon}
       </div>
       <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">{text}</span>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.div 
      whileHover={{ y: -12 }}
      className="p-10 rounded-[40px] bg-white/[0.02] border border-white/5 hover:border-[#39FF14]/30 hover:bg-[#39FF14]/[0.02] transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
         {React.cloneElement(icon as React.ReactElement<any>, { size: 100 })}
      </div>
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-10 group-hover:scale-110 transition-transform relative z-10 group-hover:bg-[#39FF14]/10 group-hover:text-[#39FF14]">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 28 })}
      </div>
      <h3 className="text-2xl font-black text-white tracking-tight mb-5 relative z-10">{title}</h3>
      <p className="text-slate-500 text-sm font-medium leading-relaxed relative z-10 group-hover:text-slate-400 transition-colors">{desc}</p>
    </motion.div>
  );
}
