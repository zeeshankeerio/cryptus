"use client";

import React from 'react';
import { MessageCircle, Building2 } from 'lucide-react';

const MINDSCAPE_LINKS = {
  whatsappStrategyCall: "https://wa.me/13072106155",
  contact: "mailto:contact@mindscapeanalytics.com"
};

function withUTM(url: string, params: { content: string }) {
  const connector = url.includes('?') ? '&' : '?';
  return `${url}${connector}utm_source=rsiq_pro&utm_medium=landing&utm_content=${params.content}`;
}

export function About() {
  return (
    <section id="about" className="py-20 sm:py-28 md:py-32 px-4 sm:px-6 border-t border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 items-stretch">
        <div className="rounded-3xl border border-white/10 bg-[#0a0f1a] p-7 sm:p-10">
          <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.4em] text-[#39FF14]">About Mindscape</p>
          <h3 className="mt-4 text-3xl sm:text-4xl font-black text-white tracking-tight">Systems-First <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Engineering Partner</span></h3>
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
          <h3 className="mt-4 text-3xl sm:text-4xl font-black text-white tracking-tight">Turn Interest <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">Into Projects</span></h3>
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
  );
}
