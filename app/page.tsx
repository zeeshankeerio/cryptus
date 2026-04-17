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
  ChevronRight,
  Gauge,
  CircleDollarSign,
  Globe,
  Coins,
  Mail,
  Phone,
  MapPin,
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
      {/* ─── Global Market Pulse Ticker ─── */}
      <div className="fixed top-0 w-full z-[110] bg-[#39FF14] text-black h-8 flex items-center overflow-hidden border-b border-black/10">
        <div className="animate-marquee whitespace-nowrap flex items-center gap-12 font-black text-[10px] uppercase tracking-widest px-4">
          {[...Array(10)].map((_, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-2">
                <Coins size={12} />
                <span>BTC/USD $96,442.20 <span className="text-emerald-700 opacity-80">+2.4%</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Globe size={12} />
                <span>XAU/USD $2,742.15 <span className="text-red-700 opacity-80">-0.1%</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CircleDollarSign size={12} />
                <span>EUR/USD 1.0542 <span className="text-emerald-700 opacity-80">+0.04%</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Gauge size={12} />
                <span>MARKET VOLATILITY: EXTREME</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ─── Grid Overlay ─── */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent)] pointer-events-none z-0" />

      {/* ─── Header ─── */}
      <nav className="fixed top-8 w-full z-[100] border-b border-white/5 bg-[#05080F]/95 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-11 h-11 sm:w-14 sm:h-14 overflow-hidden rounded-xl border border-[#39FF14]/20 shadow-lg shadow-[#39FF14]/10 bg-gradient-to-br from-[#39FF14]/10 to-transparent">
              <Image 
                src="/logo/rsiq-mindscapeanalytics.png" 
                alt="RSIQ Pro | Institutional Crypto Terminal" 
                fill
                priority
                loading="eager"
                className="object-cover scale-110"
              />
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
            <Link href="/services" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Services</Link>
            <Link href="/about" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">About</Link>
            <a href="#connect" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Connect</a>
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
                <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Services</Link>
                <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">About</Link>
                <a href="#connect" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Connect</a>
                <div className="my-2 border-t border-white/5" />
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-white/5 transition-all">Login</Link>
                <Link href="/register" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3.5 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em] text-center mt-1">Start Free Trial</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-24 sm:pt-32 md:pt-36 pb-12 sm:pb-20 md:pb-24 px-4 sm:px-6 z-10 overflow-hidden">
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
            <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.25em] text-[#39FF14]">Enterprise Engine Active — 500+ Live Symbols (Crypto, Forex, Gold & Silver)</span>
          </motion.div>

          <div className="flex flex-col items-center">
            <motion.h1 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[3.2rem] sm:text-6xl md:text-8xl lg:text-9xl font-black text-center text-white tracking-tighter leading-[0.88] sm:leading-[0.85] mb-4 drop-shadow-2xl"
            >
              THE ALPHA <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-[#39FF14] to-emerald-800">TERMINAL.</span>
            </motion.h1>
            
            <h2 className="text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[#39FF14] mb-10 sm:mb-16">The Global Crypto Market Scanner for Professional Traders</h2>
          </div>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm sm:text-base md:text-xl text-slate-400 max-w-4xl text-center leading-relaxed mb-10 sm:mb-12 font-medium px-2 sm:px-0"
          >
            <strong className="text-white">Stop missing critical setups.</strong> Retail traders lose their edge by manually checking charts. RSIQ Pro solves this by instantly scanning <span className="text-[#39FF14]">500+ assets in real-time</span>. Get institution-grade alerts, <strong>verified historical win-rates</strong>, and <span className="text-white">AI-generated signal narratives</span> instantly formatted for 1-click sharing.
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
                  href="/register" 
                  className="w-full px-8 py-5 sm:py-7 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-[0.25em] shadow-[0_20px_60px_rgba(57,255,20,0.3)] hover:shadow-[0_20px_80px_rgba(57,255,20,0.5)] transition-all text-[12px] sm:text-[14px] active:scale-95 text-center group"
                >
                  Launch Terminal
                  <ChevronRight size={18} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/login"
                  className="w-full text-center px-8 py-4 rounded-2xl border border-white/10 bg-white/[0.02] text-slate-300 font-black uppercase tracking-[0.2em] text-[11px] active:scale-95 transition-all backdrop-blur-sm"
                >
                  Sign In to Desk
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

      {/* ─── Desktop Preview Section (The Pulse) ─── */}
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

      {/* ─── Global Real-Time Intelligence (TradingView) ─── */}
      <section className="py-20 sm:py-32 bg-white/[0.01] border-y border-white/5 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">Live Market Pulse</h2>
             <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Unified Multi-Asset Authority.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-3xl border border-white/10 bg-[#0A0E17] h-[400px] overflow-hidden relative group">
               <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-white">BTC / USD - REAL-TIME</span>
               </div>
               <iframe 
                 src="https://s.tradingview.com/embed-widget/mini-symbol-overview/?locale=en#%7B%22symbol%22%3A%22BINANCE%3ABTCUSDT%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22dateRange%22%3A%221D%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22autosize%22%3Atrue%7D" 
                 className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity mt-8 border-none pointer-events-none" 
               />
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0A0E17] h-[400px] overflow-hidden relative group">
               <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-white">GOLD / USD - REAL-TIME</span>
               </div>
               <iframe 
                 src="https://s.tradingview.com/embed-widget/mini-symbol-overview/?locale=en#%7B%22symbol%22%3A%22OANDA%3AXAUUSD%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22dateRange%22%3A%221D%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22autosize%22%3Atrue%7D" 
                 className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity mt-8 border-none pointer-events-none" 
               />
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0A0E17] h-[400px] overflow-hidden relative group">
               <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-white">EUR / USD - REAL-TIME</span>
               </div>
               <iframe 
                 src="https://s.tradingview.com/embed-widget/mini-symbol-overview/?locale=en#%7B%22symbol%22%3A%22FX%3AEURUSD%22%2C%22width%22%3A%22100%25%22%2C%22height%22%3A%22100%25%22%2C%22dateRange%22%3A%221D%22%2C%22colorTheme%22%3A%22dark%22%2C%22isTransparent%22%3Atrue%2C%22autosize%22%3Atrue%7D" 
                 className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity mt-8 border-none pointer-events-none" 
               />
            </div>
          </div>
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
                <p className="text-slate-400 text-sm sm:text-base leading-relaxed mt-4 max-w-md">
                  <strong className="text-slate-200">The Problem:</strong> Information Fragmentation. Most traders lose because they are forced to synthesize 5+ disconnected tools while the market moves instantly.<br/><br/>
                  <strong className="text-[#39FF14]">The Solution:</strong> A Unified Command Center. We merge real-time liquidation flux, institutional indicators, and smart money footprints into a single low-latency decision engine.
                </p>
              </div>

              <div className="space-y-6 sm:space-y-8">
                <AnalysisItem 
                  title="59-Second Alpha Edge" 
                  desc="Don't wait for candles to close. Our Neural Engine calculates 'Approximated Indicators' tick-by-tick, giving you up to a minute of lead-time over standard screeners." 
                />
                <AnalysisItem 
                  title="Signal Win Rate Tracker" 
                  desc="Stop guessing. Our system backtests and tracks the exact historical win rate of every signal pattern globally, displaying verifiable accuracy ratios to build ultimate conviction." 
                />
                <AnalysisItem 
                  title="Viral Signal Narration" 
                  desc="Every signal generates an institutional-grade, human-readable narrative explaining WHY the setup is valid (e.g., 'RSI oversold + Bullish MACD cross')." 
                />
                <AnalysisItem 
                  title="One-Click Signal Sharing" 
                  desc="Instantly capture and share premium setup cards with your community on X, Telegram, or Discord. Elevate your status with our verified, branded signal images." 
                />
                <AnalysisItem 
                  title="Heatmap Correlation Matrix" 
                  desc="Quantify cross-asset dependency. Instantly track how BTC movements systematically correlate with ETH, Gold, and DXY in real-time to hedge sophisticated portfolios." 
                />
                <AnalysisItem 
                  title="Adaptive Load Shedding" 
                  desc="In extreme high-volatility environments, the engine intelligently downshifts generic UI repaints to prioritize raw data fidelity, ensuring zero connection loss." 
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

            {/* Highly Polished Mobile Mockup Image */}
            <div className="flex-shrink-0 w-full flex justify-center order-2 xl:order-1 relative px-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="relative group"
              >
                {/* Dynamic Aura */}
                <div className="absolute -inset-20 -z-10 bg-[radial-gradient(circle_at_center,rgba(57,255,20,0.15),transparent_70%)] blur-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                
                <div className="relative w-[280px] sm:w-[320px] md:w-[420px] xl:w-[480px]">
                  {/* Premium Shadow Casting */}
                  <div className="absolute inset-x-10 bottom-0 h-10 bg-black/40 blur-[40px] rounded-full scale-x-150 translate-y-20 opacity-50" />
                  
                  <Image 
                    src="/images/rsi-mindscapeanalytics.png" 
                    alt="RSIQ Pro Mobile Terminal" 
                    width={1200} 
                    height={2400}
                    className="w-full h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.9)] relative z-10"
                    priority
                  />

                  {/* Glassmorph Badges */}
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -right-6 top-[20%] bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl z-20 hidden md:block"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center">
                        <Smartphone className="text-[#39FF14]" size={20} />
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">PWA Native</span>
                    </div>
                  </motion.div>

                  <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute -left-6 bottom-[25%] bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl z-20 hidden md:block"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={10} className="text-[#39FF14] fill-[#39FF14]" />
                        ))}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Institutional</span>
                    </div>
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

      {/* ─── Who Is This For (Target Audiences) ─── */}
      <section className="py-20 sm:py-32 md:py-40 border-t border-white/5 bg-[#05080F] px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-[#39FF14]/5 blur-[140px] rounded-full pointer-events-none -ml-64 opacity-50" />
        <div className="max-w-7xl mx-auto relative">
          <div className="text-center mb-16 sm:mb-24 space-y-4">
             <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14]">The Professional Spectrum</h2>
             <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Engineered for the Top 1%.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <PersonaCard 
              icon={<Zap className="text-[#39FF14]" />}
              role="The Scalper"
              needs="Absolute speed. Whale alerts. Zero-latency liquidation tracking for micro-entries."
              impact="Captures alpha in the milliseconds before the retail crowd reacts."
            />
            <PersonaCard 
              icon={<ShieldCheck className="text-emerald-400" />}
              role="The Fund Manager"
              needs="HHI Index tracking. Neural risk matrix. Diversification armor for high-capital portfolios."
              impact="Protects enterprise assets during volatility cascades."
            />
            <PersonaCard 
              icon={<MessageCircle className="text-blue-400" />}
              role="The Elite Provider"
              needs="Signal Narration. Instant X/Discord generation. High-aesthetic dashboards for streams."
              impact="Scales community trust with institutional-grade data transparency."
            />
          </div>
        </div>
      </section>

      {/* ─── Core Features Grid ─── */}
      <section id="features" className="py-20 sm:py-32 md:py-40 bg-white/[0.02] border-t border-white/5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-20 md:mb-24 space-y-3 sm:space-y-4">
            <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-[#39FF14]">RSI & MACD Crypto Scanner</h2>
            <h3 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Everything for Professional Trading.</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            <FeatureCard 
              icon={<Zap />} 
              title="Global Market Reach" 
              desc="Simultaneously track 500+ active symbols including Top Crypto pairs, premier Forex pairs, and precious metals like Gold (XAU) and Silver (XAG)." 
            />
            <FeatureCard 
              icon={<BarChart3 />} 
              title="Confluence Strategy" 
              desc="Never trade a single indicator again. Our engine combines 5+ technical signals for a unified decision score." 
            />
            <FeatureCard 
              icon={<Bell />} 
              title="Real-Time Alerts" 
              desc="Get instant push notifications and desktop sound alerts the second a setup aligns with your exact custom parameters." 
            />
            <FeatureCard 
              icon={<Cpu />} 
              title="Deep Customization" 
              desc="Input your custom RSI period, define unique thresholds, and isolate volatile markets to match your exact trading style." 
            />
            <FeatureCard 
              icon={<LineChart />} 
              title="MACD + EMA Integration" 
              desc="Full trend analysis built-in. EMA Golden/Death crosses and MACD histograms integrated into the main scanner." 
            />
            <FeatureCard 
              icon={<Layers />} 
              title="Multi-Timeframe Sync" 
              desc="Track 1m, 5m, 15m, and 1h intervals simultaneously. Align your micro entries with higher timeframe macro dominance." 
            />
          </div>
        </div>
      </section>

      {/* ─── Coming Soon Section ─── */}
      <section className="py-20 sm:py-32 md:py-40 border-t border-white/5 bg-[#05080F] px-4 sm:px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 sm:mb-20 space-y-3 sm:space-y-4">
            <h2 className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] sm:tracking-[0.5em] text-amber-400">Future Roadmap</h2>
            <p className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tighter">Expanding the Alpha Edge.</p>
            <p className="text-slate-400 text-sm sm:text-base max-w-2xl mx-auto mt-4 font-medium">We are continuously pushing the boundaries of retail trading technology. Here is what is deploying next to your terminal.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <FeatureCard 
              icon={<Cpu />} 
              title="Autonomous Webhooks" 
              desc="Connect RSIQ Pro directly to your broker or algorithmic trading bots via customizable JSON webhook triggers. Completely automate your execution." 
            />
            <FeatureCard 
              icon={<LineChart />} 
              title="Advanced Flow & Options Insights" 
              desc="Incorporate dark pool prints, options delta exposure, and institutional orderbook flow directly into the scanning confluence logic." 
            />
            <FeatureCard 
              icon={<Handshake />} 
              title="Alpha Syndicates" 
              desc="Share your customized screening layouts and trigger conditions with your community through private generated share-links." 
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

      {/* ─── Affiliates & Collaboration ─── */}
      <section id="affiliate" className="py-20 sm:py-32 bg-gradient-to-b from-[#05080F] to-[#0A0E17] border-t border-white/5 relative overflow-hidden px-4 sm:px-6">
        <div className="absolute top-1/2 left-1/2 w-full max-w-3xl h-[400px] bg-[#39FF14]/5 blur-[120px] rounded-full pointer-events-none transform -translate-x-1/2 -translate-y-1/2" />
        
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="p-8 sm:p-16 rounded-[4rem] bg-white/[0.02] border border-white/5 shadow-2xl flex flex-col items-center text-center group">
            <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-white mb-8 border border-white/10 shadow-lg group-hover:scale-110 group-hover:border-[#39FF14]/30 group-hover:text-[#39FF14] transition-all duration-500">
              <Handshake size={32} />
            </div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-[#39FF14] mb-4">Strategic Partnerships</h2>
            <h3 className="text-4xl sm:text-6xl font-black text-white tracking-tighter mb-6">Open for Collaboration.</h3>
            <p className="text-slate-400 text-sm sm:text-lg max-w-2xl mx-auto mb-10 sm:mb-14 leading-relaxed font-medium">
              We are actively looking for elite traders, fund managers, and community leaders to join our exclusive affiliate network. Bring institutional-grade tools to your audience and earn high-tier revenue share.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <a 
                href="mailto:partners@mindscapeanalytics.com"
                className="w-full sm:w-auto px-10 py-5 sm:py-6 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all text-xs text-center shadow-xl hover:scale-105"
              >
                Apply as Affiliate
              </a>
              <a 
                href="mailto:contact@mindscapeanalytics.com"
                className="w-full sm:w-auto px-10 py-5 sm:py-6 rounded-2xl border border-white/20 text-white font-black uppercase tracking-[0.2em] hover:bg-white/5 transition-all text-xs text-center hover:scale-105"
              >
                Contact for Synergy
              </a>
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
          <div className="pt-20 sm:pt-32 opacity-60 flex justify-center gap-6">
            <a href="mailto:info@mindscapeanalytics.com" className="p-3 bg-white/5 rounded-full border border-white/10 hover:border-[#39FF14]/50 hover:text-[#39FF14] transition-all hover:scale-110" aria-label="Email Mindscape Analytics">
              <Mail size={18} />
            </a>
            <a href="tel:+13072106155" className="p-3 bg-white/5 rounded-full border border-white/10 hover:border-[#39FF14]/50 hover:text-[#39FF14] transition-all hover:scale-110" aria-label="Call Mindscape Analytics">
              <Phone size={18} />
            </a>
            <a href="https://maps.google.com/?q=Sheridan,+WY,+US" target="_blank" rel="noreferrer" className="p-3 bg-white/5 rounded-full border border-white/10 hover:border-[#39FF14]/50 hover:text-[#39FF14] transition-all hover:scale-110" aria-label="Mindscape Analytics Headquarters">
              <MapPin size={18} />
            </a>
          </div>
          <div className="pt-8 opacity-20 flex flex-col items-center gap-3 sm:gap-4">
            <span className="text-base sm:text-xl font-black text-white">MINDSCAPE ANALYTICS LLC</span>
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 hover:[&_a]:text-[#39FF14] [&_a]:transition-colors">
              <Link href="/legal/terms">Terms</Link>
              <span className="text-white/20">•</span>
              <Link href="/legal/privacy">Privacy</Link>
            </div>
            <p className="max-w-2xl text-center text-[9px] text-slate-500 uppercase tracking-wider font-bold leading-relaxed mt-4 px-4 border border-white/5 bg-white/[0.01] rounded-xl p-4">
              <strong>Risk Disclaimer:</strong> RSIQ Pro is an analytical aggregation tool and does not provide financial advice. Trading inherently involves extreme risk, and you may lose some or all of your initial investment. Past performance of any system, methodology, or indicator is not indicative of future results.
            </p>
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.8em] sm:tracking-[1.5em] text-slate-500 mt-4">Global Terminal &copy; 2026</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function PersonaCard({ icon, role, needs, impact }: { icon: React.ReactNode; role: string; needs: string; impact: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="p-8 sm:p-10 rounded-[32px] bg-white/[0.02] border border-white/10 hover:border-white/20 transition-all flex flex-col"
    >
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-8">
        {React.cloneElement(icon as React.ReactElement<any>, { size: 24 })}
      </div>
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">TARGET PERSONA</h4>
      <h3 className="text-2xl font-black text-white tracking-tight mb-4">{role}</h3>
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
