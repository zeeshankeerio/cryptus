"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, Phone, MapPin } from 'lucide-react';

const MINDSCAPE_LINKS = {
  whatsappStrategyCall: "https://wa.me/13072106155"
};

// Simple UTM helper wrapper if needed, or just hardcode for footer
function withUTM(url: string, params: { content: string }) {
  const connector = url.includes('?') ? '&' : '?';
  return `${url}${connector}utm_source=rsiq_pro&utm_medium=landing&utm_content=${params.content}`;
}

export function Footer() {
  return (
    <div id="connect" className="relative group">
      {/* ??? Final CTA ??? */}
      <section className="py-24 sm:py-32 md:py-40 px-4 sm:px-6 relative overflow-hidden bg-gradient-to-b from-transparent to-[#0A0E17]">
        <div className="absolute inset-0 bg-[#39FF14]/[0.02] [mask-image:radial-gradient(circle_at_center,black,transparent)] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-10 sm:space-y-16 relative z-10">
          <h2 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter leading-[0.88] sm:leading-[0.85]">READY FOR<br className="sm:hidden" /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">THE ALPHA?</span></h2>
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

