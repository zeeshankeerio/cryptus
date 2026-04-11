"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Zap, 
  ShieldCheck, 
  BarChart3, 
  TrendingUp, 
  Bell, 
  Cpu,
  Smartphone,
  Activity,
  Target,
  LineChart,
  Lock,
  Layers,
  ArrowUpRight,
  Menu,
  X,
  Download,
  Wifi,
  Star,
  Building2,
  MessageCircle,
  Handshake,
  ExternalLink,
} from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { MINDSCAPE_LINKS, withUTM } from '@/lib/mindscape-links';

export default function LandingPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    if (session && !isPending) {
      router.push('/terminal');
    }
  }, [session, isPending, router]);

  if (session && !isPending) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <div className="w-16 h-16 border-t-2 border-[#39FF14] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-300 selection:bg-[#39FF14]/30 selection:text-white overflow-x-hidden font-sans">
      {/* ─── Grid Overlay ─── */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent)] pointer-events-none z-0" />

      {/* ─── Header ─── */}
      <nav className="fixed top-0 w-full z-[100] border-b border-white/5 bg-[#05080F]/95 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border border-[#39FF14]/30 flex items-center justify-center shadow-lg shadow-[#39FF14]/10">
              <TrendingUp size={18} className="text-[#39FF14] sm:hidden" />
              <TrendingUp size={22} className="text-[#39FF14] hidden sm:block" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg sm:text-xl font-black text-white tracking-tighter leading-none">RSIQ <span className="text-[#39FF14]">PRO</span></span>
              <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-slate-500 leading-none mt-0.5">Global Terminal</span>
            </div>
          </div>
          
          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 mr-auto ml-16">
            <a href="#features" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Features</a>
            <a href="#logic" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">The Logic</a>
            <a href="#mobile" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Mobile</a>
            <a href="#services" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Services</a>
            <a href="#about" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">About</a>
            <a href="#connect" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Connect</a>
            <Link href="/services" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Services Page</Link>
            <Link href="/about" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">About Page</Link>
          </div>

          {/* Desktop CTA + Mobile Menu Toggle */}
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="/login" className="hidden sm:block text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Login</Link>
            <Link 
              href="/terminal" 
              className="px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl bg-[#39FF14] text-black text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] shadow-xl shadow-[#39FF14]/20 hover:scale-105 active:scale-95 transition-all"
            >
              Launch
            </Link>
            {/* Mobile Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-slate-400"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-white/5 bg-[#05080F]/98 backdrop-blur-2xl overflow-hidden"
            >
              <div className="px-4 py-4 flex flex-col gap-1">
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Features</a>
                <a href="#logic" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">The Logic</a>
                <a href="#mobile" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Mobile</a>
                <a href="#services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Services</a>
                <a href="#about" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">About</a>
                <a href="#connect" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Connect</a>
                <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Services Page</Link>
                <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">About Page</Link>
                <div className="my-2 border-t border-white/5" />
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-white/5 transition-all">Login</Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3.5 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em] text-center mt-1">Start Free Trial</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-28 sm:pt-36 md:pt-44 pb-16 sm:pb-24 md:pb-32 px-4 sm:px-6 z-10 overflow-hidden">
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
            <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.25em] text-[#39FF14]">Enterprise Engine Active — 500+ Pairs</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[3.2rem] sm:text-6xl md:text-8xl lg:text-9xl font-black text-center text-white tracking-tighter leading-[0.88] sm:leading-[0.85] mb-6 sm:mb-10 drop-shadow-2xl"
          >
            THE ALPHA <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-[#39FF14] to-emerald-800">TERMINAL.</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base sm:text-lg md:text-2xl text-slate-500 max-w-3xl text-center leading-relaxed mb-10 sm:mb-16 font-medium px-2 sm:px-0"
          >
            Institutional-grade crypto scanning. Combining multi-indicator confluence, real-time sentiment analysis, and professional strategy scoring.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto px-4 sm:px-0"
          >
            <Link 
              href="/register" 
              className="w-full sm:w-auto px-8 sm:px-12 py-4 sm:py-6 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-[0.2em] sm:tracking-[0.25em] shadow-[0_20px_60px_rgba(57,255,20,0.3)] hover:shadow-[0_20px_80px_rgba(57,255,20,0.5)] transition-all text-[12px] sm:text-[13px] active:scale-95 text-center"
            >
              Start Trading Now
            </Link>
            <Link
              href="/login"
              className="sm:hidden w-full text-center px-8 py-4 rounded-2xl border border-white/10 text-slate-300 font-black uppercase tracking-[0.2em] text-[12px] active:scale-95 transition-all"
            >
              Sign In
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── Desktop Preview Section ─── */}
      <section id="preview" className="relative px-4 sm:px-6 pb-20 sm:pb-32 md:pb-40 z-10">
        <div className="max-w-[1400px] mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: 'spring', damping: 20 }}
            className="relative p-1.5 sm:p-2 rounded-[24px] sm:rounded-[40px] bg-gradient-to-b from-white/10 to-transparent border border-white/10 shadow-[0_40px_80px_rgba(0,0,0,0.8)] sm:shadow-[0_80px_160px_rgba(0,0,0,0.9)] group"
          >
            <div className="bg-[#0A0E17] rounded-[18px] sm:rounded-[32px] overflow-hidden relative border border-white/5">
              <Image 
                src="/images/desktop_view.webp" 
                alt="RSIQ Pro Desktop Terminal" 
                width={2560} 
                height={1440}
                className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-700"
              />
              
              <div className="absolute top-4 sm:top-10 left-4 sm:left-10 p-3 sm:p-6 rounded-xl sm:rounded-2xl bg-black/60 backdrop-blur-xl border border-[#39FF14]/30 shadow-2xl hidden lg:block max-w-xs transition-transform group-hover:-translate-y-2">
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

              <div className="absolute bottom-4 sm:bottom-10 right-4 sm:right-10 p-3 sm:p-6 rounded-xl sm:rounded-2xl bg-black/60 backdrop-blur-xl border border-[#39FF14]/30 shadow-2xl hidden lg:block max-w-xs transition-transform group-hover:translate-y-2">
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
      <section id="logic" className="py-20 sm:py-32 md:py-40 border-y border-white/5 bg-white/[0.01] px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[400px] sm:w-[800px] h-[400px] sm:h-[800px] bg-[#39FF14]/5 blur-[160px] rounded-full pointer-events-none -mr-20 sm:-mr-40 -mt-20 sm:-mt-40" />
        
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-20 lg:gap-24 items-center">
            <div className="space-y-8 sm:space-y-12">
              <div className="space-y-3 sm:space-y-4">
                <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">The Intelligence Layer</h2>
                <p className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-[0.95]">
                  Engineered for <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Winning Execution.</span>
                </p>
              </div>

              <div className="space-y-6 sm:space-y-8">
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

            <div className="grid grid-cols-2 gap-4 sm:gap-6 relative">
              <StatBox value="+14% / -6%" label="Market Bias Delta" />
              <StatBox value="0.5ms" label="Engine Latency" highlight />
              <StatBox value="24/7" label="Live Uptime" />
              <StatBox value="500+" label="Pairs Tracked" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Mobile / PWA Experience Section ─── */}
      <section id="mobile" className="py-20 sm:py-32 md:py-40 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">

          {/* Section Header — always centered on mobile */}
          <div className="text-center mb-10 sm:mb-0 sm:hidden">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#39FF14] mb-3">Always Informed</p>
            <h3 className="text-3xl font-black text-white tracking-tighter leading-[0.95]">
              The Terminal in<br />Your Pocket.
            </h3>
          </div>

          <div className="flex flex-col xl:flex-row items-center gap-10 sm:gap-16 xl:gap-32">

            {/* Phone Mockup */}
            <div className="flex-shrink-0 w-full flex justify-center order-2 xl:order-1">
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative"
              >
                {/* Phone outer shell */}
                <div className="relative w-[240px] sm:w-[280px] md:w-[320px] xl:w-[360px]">
                  {/* Glow behind phone */}
                  <div className="absolute inset-0 -z-10 blur-[60px] bg-[#39FF14]/15 rounded-full scale-90 translate-y-10" />

                  {/* Phone frame */}
                  <div className="relative p-2.5 sm:p-3.5 rounded-[48px] sm:rounded-[56px] bg-gradient-to-b from-white/10 to-white/[0.03] border border-white/10 shadow-[0_36px_90px_rgba(0,0,0,0.75)]">
                    {/* Notch */}
                    <div className="absolute top-[18px] sm:top-[22px] left-1/2 -translate-x-1/2 w-20 sm:w-24 h-5 sm:h-6 rounded-full bg-[#05080F] border border-white/5 z-20 flex items-center justify-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
                    </div>

                    {/* Screen */}
                    <div className="bg-[#05080F] rounded-[38px] sm:rounded-[44px] overflow-hidden relative aspect-[9/19.5] border border-white/5">
                      <Image 
                        src="/images/mobile_view.webp" 
                        alt="RSIQ Pro Mobile View" 
                        width={1080} 
                        height={2280}
                        className="w-full h-full object-cover object-center"
                      />
                      {/* Screen glare overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent pointer-events-none" />
                    </div>

                    {/* Home indicator */}
                    <div className="absolute bottom-[14px] left-1/2 -translate-x-1/2 w-20 sm:w-24 h-1 bg-white/20 rounded-full" />

                    {/* Side buttons */}
                    <div className="absolute -right-[3px] top-24 w-[3px] h-10 bg-white/10 rounded-r-full" />
                    <div className="absolute -left-[3px] top-20 w-[3px] h-8 bg-white/10 rounded-l-full" />
                    <div className="absolute -left-[3px] top-32 w-[3px] h-8 bg-white/10 rounded-l-full" />
                  </div>

                  {/* PWA Badge — properly positioned, no overflow */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: 20 }}
                    whileInView={{ opacity: 1, scale: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="absolute -right-4 sm:-right-6 top-1/3 bg-[#39FF14] text-black rounded-2xl p-3 sm:p-3.5 shadow-[0_16px_40px_rgba(57,255,20,0.4)] z-20"
                  >
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <Smartphone size={18} className="sm:w-5 sm:h-5" />
                      <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] leading-tight">PWA<br/>NATIVE<br/>READY</span>
                    </div>
                  </motion.div>

                  {/* Stars badge */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    whileInView={{ opacity: 1, scale: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.55, duration: 0.5 }}
                    className="absolute -left-4 sm:-left-6 bottom-1/3 bg-[#0a0f1a] border border-white/15 text-white rounded-2xl px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-2xl z-20"
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={8} className="text-[#39FF14] fill-[#39FF14]" />
                        ))}
                      </div>
                    </div>
                    <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 mt-1">Pro Grade</p>
                  </motion.div>
                </div>
              </motion.div>
            </div>

            {/* Text + Features */}
            <div className="flex-1 order-1 xl:order-2 space-y-6 sm:space-y-10">
              {/* Desktop Header — hidden on mobile (shown above) */}
              <div className="hidden sm:block space-y-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">Always Informed</h2>
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-[0.95]">
                  The Terminal <br /> in Your Pocket.
                </h3>
              </div>

              <p className="text-sm sm:text-base lg:text-lg text-slate-500 font-medium leading-relaxed max-w-xl">
                Experience full terminal functionality on the go. Our PWA allows you to install RSIQ Pro as a native application with lightning-fast performance and no browser overhead.
              </p>

              {/* Feature Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-5 pt-2 sm:pt-4">
                <MobileFeature icon={<Bell size={16} />} text="Push Alerts" />
                <MobileFeature icon={<Download size={16} />} text="Installable PWA" />
                <MobileFeature icon={<ShieldCheck size={16} />} text="Biometric Ready" />
                <MobileFeature icon={<Wifi size={16} />} text="Offline Capable" />
              </div>

              {/* Inline CTA on mobile */}
              <div className="pt-2 sm:pt-4">
                <Link 
                  href="/register"
                  className="inline-flex items-center gap-3 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-[#39FF14] text-black font-black uppercase text-[11px] sm:text-[12px] tracking-[0.2em] shadow-[0_12px_40px_rgba(57,255,20,0.3)] hover:shadow-[0_16px_56px_rgba(57,255,20,0.5)] transition-all active:scale-95"
                >
                  Get Mobile Access
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Core Features Grid ─── */}
      <section id="features" className="py-20 sm:py-32 md:py-40 bg-white/[0.02] border-t border-white/5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-20 md:mb-24 space-y-3 sm:space-y-4">
            <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-[#39FF14]">Advanced Capabilities</h2>
            <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Everything for Professional Trading.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
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

      {/* ─── Services Section ─── */}
      <section id="services" className="py-20 sm:py-32 md:py-36 px-4 sm:px-6 border-t border-white/5 bg-[#060b14]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.45em] text-[#39FF14]">Mindscape Services</p>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black text-white tracking-tight">Build More Than A Scanner</h2>
            <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-3xl mx-auto">
              Turn RSIQ Pro into your growth engine with productized AI automation, SaaS engineering, and managed infrastructure from Mindscape Analytics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            <LeadServiceCard
              icon={<Cpu size={18} />}
              title="AI Agents & Voice"
              desc="Automate lead qualification, customer response, and bookings with agentic AI + voice systems."
              href={withUTM(MINDSCAPE_LINKS.aiGenAi, { content: 'landing_services_ai_voice' })}
            />
            <LeadServiceCard
              icon={<Layers size={18} />}
              title="SaaS Development"
              desc="High-performance Next.js SaaS builds with enterprise auth, billing, and multi-tenant architecture."
              href={withUTM(MINDSCAPE_LINKS.enterpriseSoftware, { content: 'landing_services_saas' })}
            />
            <LeadServiceCard
              icon={<Activity size={18} />}
              title="Cloud & Data Ops"
              desc="Managed cloud hosting, query optimization, backup automation, and long-term reliability engineering."
              href={withUTM(MINDSCAPE_LINKS.cloudInfrastructure, { content: 'landing_services_cloud_data' })}
            />
            <LeadServiceCard
              icon={<Handshake size={18} />}
              title="Automation Partnerships"
              desc="Monthly build-operate-optimize plans for teams shipping automation quickly without in-house overhead."
              href={withUTM(MINDSCAPE_LINKS.services, { content: 'landing_services_automation_partner' })}
            />
          </div>
        </div>
      </section>

      {/* ─── About Section ─── */}
      <section id="about" className="py-20 sm:py-28 md:py-32 px-4 sm:px-6 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-stretch">
          <div className="rounded-3xl border border-white/10 bg-[#0a0f1a] p-7 sm:p-10">
            <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">About Mindscape</p>
            <h3 className="mt-4 text-3xl sm:text-4xl font-black text-white tracking-tight">Systems-First Engineering Partner</h3>
            <p className="mt-5 text-sm sm:text-base text-slate-400 leading-relaxed">
              Mindscape Analytics builds AI systems that replace manual work. From sales automation and voice AI to full SaaS platforms and cloud operations, the team focuses on measurable business outcomes, not feature clutter.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="px-3 py-2 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">40-70% Cost Reduction</span>
              <span className="px-3 py-2 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">24/7 Operations</span>
              <span className="px-3 py-2 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Long-Term Managed Support</span>
            </div>
          </div>

          <div className="rounded-3xl border border-[#39FF14]/30 bg-[#101a12] p-7 sm:p-10">
            <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">Lead Actions</p>
            <h3 className="mt-4 text-3xl sm:text-4xl font-black text-white tracking-tight">Turn Interest Into Projects</h3>
            <p className="mt-5 text-sm sm:text-base text-slate-300 leading-relaxed">
              Running RSIQ Pro and need custom workflows, client automation, or white-label SaaS delivery? Use direct Mindscape channels below to open a strategy call or request a proposal.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <a
                href={withUTM(MINDSCAPE_LINKS.whatsappStrategyCall, { content: 'landing_about_strategy_call' })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em]"
              >
                <MessageCircle size={15} /> Book Strategy Call
              </a>
              <a
                href={withUTM(MINDSCAPE_LINKS.contact, { content: 'landing_about_request_proposal' })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-slate-100 text-[11px] font-black uppercase tracking-[0.2em]"
              >
                <Building2 size={15} /> Request Proposal
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Connect Section ─── */}
      <section id="connect" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-white/5 bg-[#05080F]">
        <div className="max-w-7xl mx-auto rounded-3xl border border-white/10 bg-[#0a0f1a] p-6 sm:p-8 md:p-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#39FF14]">Mindscape Analytics Connection</p>
              <h3 className="mt-3 text-2xl sm:text-3xl font-black text-white tracking-tight">Lead Pipeline Links</h3>
              <p className="mt-3 text-sm text-slate-400">Direct channels for SaaS builds, automation projects, managed cloud, and AI deployment engagements.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto">
              <a href={withUTM(MINDSCAPE_LINKS.about, { content: 'landing_connect_about' })} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 hover:border-[#39FF14]/40 hover:text-[#39FF14] transition-colors">About <ExternalLink size={14} /></a>
              <a href={withUTM(MINDSCAPE_LINKS.services, { content: 'landing_connect_services' })} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 hover:border-[#39FF14]/40 hover:text-[#39FF14] transition-colors">Services <ExternalLink size={14} /></a>
              <a href={withUTM(MINDSCAPE_LINKS.projects, { content: 'landing_connect_case_studies' })} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 hover:border-[#39FF14]/40 hover:text-[#39FF14] transition-colors">Case Studies <ExternalLink size={14} /></a>
              <a href={withUTM(MINDSCAPE_LINKS.linkedin, { content: 'landing_connect_linkedin' })} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/15 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 hover:border-[#39FF14]/40 hover:text-[#39FF14] transition-colors">LinkedIn <ExternalLink size={14} /></a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-28 sm:py-40 md:py-60 px-4 sm:px-6 relative overflow-hidden bg-gradient-to-b from-transparent to-[#0A0E17]">
        <div className="absolute inset-0 bg-[#39FF14]/[0.02] [mask-image:radial-gradient(circle_at_center,black,transparent)] pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center space-y-10 sm:space-y-16 relative z-10">
          <h2 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter leading-[0.88] sm:leading-[0.85]">READY FOR<br className="sm:hidden" /> THE ALPHA?</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 pt-4 sm:pt-10 px-4 sm:px-0">
            <Link 
              href="/register" 
              className="w-full sm:w-auto px-10 sm:px-16 py-5 sm:py-8 rounded-2xl sm:rounded-3xl bg-[#39FF14] text-black font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] shadow-[0_20px_60px_rgba(57,255,20,0.4)] hover:shadow-[0_40px_140px_rgba(57,255,20,0.6)] transition-all text-sm group text-center"
            >
              Create Your Terminal
              <ArrowUpRight size={18} className="inline ml-2 sm:ml-3 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </Link>
            <a
              href={withUTM(MINDSCAPE_LINKS.whatsappStrategyCall, { content: 'landing_final_cta_strategy_call' })}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-10 sm:px-10 py-5 sm:py-6 rounded-2xl border border-white/20 text-white font-black uppercase tracking-[0.2em] text-xs text-center"
            >
              Book Automation Call
            </a>
          </div>
          <div className="pt-20 sm:pt-40 opacity-20 flex flex-col items-center gap-3 sm:gap-4">
            <span className="text-base sm:text-xl font-black text-white">MINDSCAPE ANALYTICS LLC</span>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.8em] sm:tracking-[1.5em] text-slate-500">Global Terminal &copy; 2026</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function AnalysisItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="group border-l-2 border-white/10 pl-5 sm:pl-8 py-2 sm:py-3 hover:border-[#39FF14] transition-colors relative">
      <div className="absolute left-0 top-0 bottom-0 w-0 bg-gradient-to-r from-[#39FF14]/5 to-transparent group-hover:w-full transition-all duration-500" />
      <h4 className="text-white font-black uppercase tracking-widest text-[11px] sm:text-[12px] mb-1.5 sm:mb-2 relative z-10 group-hover:text-[#39FF14] transition-colors">{title}</h4>
      <p className="text-slate-500 text-[12px] sm:text-[13px] font-medium leading-relaxed relative z-10 group-hover:text-slate-400 transition-colors">{desc}</p>
    </div>
  );
}

function StatBox({ value, label, highlight = false }: { value: string; label: string; highlight?: boolean }) {
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

function MobileFeature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 group p-3 sm:p-0 rounded-xl sm:rounded-none bg-white/[0.03] sm:bg-transparent border border-white/5 sm:border-none">
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-[#39FF14] group-hover:border-[#39FF14]/40 transition-all flex-shrink-0">
        {icon}
      </div>
      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">{text}</span>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
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

function LeadServiceCard({
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
