"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';

interface LandingHeaderProps {
  session: any;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export function LandingHeader({ session, mobileMenuOpen, setMobileMenuOpen }: LandingHeaderProps) {
  return (
    <nav className="fixed top-6 sm:top-8 w-full z-[100] border-b border-white/5 bg-[#05080F]/95 backdrop-blur-2xl transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative w-9 h-9 sm:w-14 sm:h-14 overflow-hidden rounded-xl border border-[#39FF14]/20 shadow-lg shadow-[#39FF14]/10 bg-gradient-to-br from-[#39FF14]/10 to-transparent">
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
          <a href="#logic" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">The Logic</a>
          <a href="#pricing" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Pricing</a>
          <a href="#mobile" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Mobile</a>
          <Link href="/services" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Services</Link>
          <Link href="/about" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">About</Link>
          <Link href="/support" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Support</Link>
          <a href="#connect" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#39FF14] transition-colors">Connect</a>
        </div>

        {/* Desktop CTA + Mobile Menu Toggle */}
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href={session ? "/terminal" : "/login"} className="hidden sm:block text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">
            {session ? "Account" : "Login"}
          </Link>
          <Link
            href={session ? "/terminal" : "/register"}
            className="px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl bg-[#39FF14] text-black text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] shadow-xl shadow-[#39FF14]/20 hover:scale-105 active:scale-95 transition-all"
          >
            {session ? "Terminal" : "Launch"}
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
              <a href="#logic" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">The Logic</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Pricing</a>
              <a href="#mobile" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Mobile</a>
              <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Services</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">About</Link>
              <Link href="/support" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Support</Link>
              <a href="#connect" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-[#39FF14] hover:bg-white/5 transition-all">Connect</a>
              <div className="my-2 border-t border-white/5" />
              <Link href={session ? "/terminal" : "/login"} onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                {session ? "My Account" : "Login"}
              </Link>
              <Link href={session ? "/terminal" : "/register"} onClick={() => setMobileMenuOpen(false)} className="px-4 py-3.5 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em] text-center mt-1">
                {session ? "Enter Terminal" : "Start Free Trial"}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
