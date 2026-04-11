import Link from "next/link";
import { Building2, MessageCircle, Globe2, ArrowRight } from "lucide-react";
import { MINDSCAPE_LINKS, withUTM } from "@/lib/mindscape-links";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-14">
      <div className="max-w-5xl mx-auto">
        <Link href="/" className="text-[11px] uppercase tracking-[0.2em] font-black text-slate-500 hover:text-[#39FF14]">
          Back to RSIQ Pro
        </Link>

        <div className="mt-8 rounded-3xl border border-white/10 bg-[#0a0f1a] p-8 sm:p-12">
          <p className="text-[10px] uppercase tracking-[0.35em] font-black text-[#39FF14]">About Mindscape Analytics</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black text-white tracking-tight">AI Systems Partner For Serious Operators</h1>
          <p className="mt-5 text-sm sm:text-base text-slate-400 leading-relaxed max-w-3xl">
            Mindscape Analytics engineers AI-first platforms that replace manual processes with intelligent systems.
            RSIQ Pro is one deployment in a larger product and automation portfolio including SaaS applications,
            lead-generation agents, voice automation, and managed cloud infrastructure.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Methodology</p>
              <p className="mt-2 text-sm text-slate-200">Strategy, build, secure deployment, and continuous optimization.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Delivery Model</p>
              <p className="mt-2 text-sm text-slate-200">Project-based execution plus monthly managed support options.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400">Focus</p>
              <p className="mt-2 text-sm text-slate-200">Revenue-impacting systems and production-grade infrastructure.</p>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <a
              href={withUTM(MINDSCAPE_LINKS.contact, { content: "about_request_proposal" })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em]"
            >
              <Building2 size={15} /> Request Proposal
            </a>
            <a
              href={withUTM(MINDSCAPE_LINKS.whatsappStrategyCall, { content: "about_strategy_call" })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-[11px] font-black uppercase tracking-[0.2em]"
            >
              <MessageCircle size={15} /> Book Strategy Call
            </a>
            <a
              href={withUTM(MINDSCAPE_LINKS.about, { content: "about_corporate_site" })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/20 text-[11px] font-black uppercase tracking-[0.2em]"
            >
              <Globe2 size={15} /> Corporate Site
            </a>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link href="/services" className="inline-flex items-center gap-2 text-[#39FF14] text-xs font-black uppercase tracking-[0.2em]">
            View Services <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
