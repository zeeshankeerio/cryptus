"use client";

import React from 'react';
import { ExternalLink } from 'lucide-react';

const MINDSCAPE_LINKS = {
  about: "https://mindscapeanalytics.com",
  services: "https://mindscapeanalytics.com/services",
  projects: "https://mindscapeanalytics.com/projects",
  linkedin: "https://linkedin.com/company/mindscape-analytics"
};

function withUTM(url: string, params: { content: string }) {
  const connector = url.includes('?') ? '&' : '?';
  return `${url}${connector}utm_source=rsiq_pro&utm_medium=landing&utm_content=${params.content}`;
}

export function Connect() {
  return (
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
  );
}
