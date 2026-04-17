"use client";

import React from 'react';
import { Bot, Code2, Globe, Database } from 'lucide-react';
import { LeadServiceCard } from './LandingUI';

// Using constants from app/page.tsx or defined locally if needed
const MINDSCAPE_LINKS = {
  aiEmployee: "https://mindscapeanalytics.com/services/ai-employee",
  saasEngineering: "https://mindscapeanalytics.com/services/saas-engineering",
  globalInfrastructure: "https://mindscapeanalytics.com/services/global-infrastructure",
  automationSystems: "https://mindscapeanalytics.com/services/automation-systems"
};

export function Services() {
  return (
    <section id="services" className="py-20 sm:py-32 md:py-36 px-4 sm:px-6 border-t border-white/5 bg-[#060b14]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.45em] text-[#39FF14]">Mindscape Services</p>
          <h2 className="mt-4 text-3xl sm:text-5xl font-black text-white tracking-tight">Build <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-400">More Than A Scanner</span></h2>
          <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-3xl mx-auto">
            Turn RSIQ Pro into your growth engine with productized AI automation, SaaS engineering, and managed infrastructure from Mindscape Analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
          <LeadServiceCard
            icon={<Bot size={22} />}
            title="AI Employee"
            desc="Deploy custom AI agents that manage your trading communities, handle customer support, and automate documentation 24/7."
            href={MINDSCAPE_LINKS.aiEmployee}
          />
          <LeadServiceCard
            icon={<Code2 size={22} />}
            title="SaaS Engineering"
            desc="Scale your trading tools into enterprise-grade SaaS platforms. High-performance backends, clean UI, and secure billing."
            href={MINDSCAPE_LINKS.saasEngineering}
          />
          <LeadServiceCard
            icon={<Globe size={22} />}
            title="Infrastructure"
            desc="Global, low-latency node clusters and database architecture designed for high-frequency analytical workloads."
            href={MINDSCAPE_LINKS.globalInfrastructure}
          />
          <LeadServiceCard
            icon={<Database size={22} />}
            title="Automation"
            desc="Custom algorithmic trading systems, webhook integrations, and automated signal delivery pipelines."
            href={MINDSCAPE_LINKS.automationSystems}
          />
        </div>
      </div>
    </section>
  );
}
