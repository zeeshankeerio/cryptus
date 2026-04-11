import Link from "next/link";
import { Cpu, Layers, Activity, MessageCircle, ArrowRight } from "lucide-react";
import { MINDSCAPE_LINKS, withUTM } from "@/lib/mindscape-links";

const services = [
  {
    title: "AI Agents & Voice Automation",
    detail: "Deploy autonomous sales and support workflows for lead capture, qualification, and scheduling.",
    href: MINDSCAPE_LINKS.aiGenAi,
    icon: Cpu,
  },
  {
    title: "SaaS Application Engineering",
    detail: "Design and ship secure, scalable SaaS products with modern full-stack architecture and billing-ready flows.",
    href: MINDSCAPE_LINKS.enterpriseSoftware,
    icon: Layers,
  },
  {
    title: "Managed Cloud & Data Ops",
    detail: "Operate mission-critical infrastructure with performance tuning, backups, monitoring, and maintenance.",
    href: MINDSCAPE_LINKS.cloudInfrastructure,
    icon: Activity,
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-14">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="text-[11px] uppercase tracking-[0.2em] font-black text-slate-500 hover:text-[#39FF14]">
          Back to RSIQ Pro
        </Link>

        <div className="mt-8 mb-12">
          <p className="text-[10px] uppercase tracking-[0.35em] font-black text-[#39FF14]">Mindscape Services</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black text-white tracking-tight">SaaS, Automation, and AI Delivery</h1>
          <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-3xl">
            Use the same engineering team behind RSIQ Pro to launch your own SaaS application, workflow automation,
            or AI-based client operations system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div key={service.title} className="rounded-3xl border border-white/10 bg-[#0a0f1a] p-6 sm:p-7">
                <div className="w-11 h-11 rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14]">
                  <Icon size={18} />
                </div>
                <h2 className="mt-5 text-xl font-black text-white tracking-tight">{service.title}</h2>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed">{service.detail}</p>
                <a
                  href={withUTM(service.href, { content: `services_card_${service.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` })}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 text-[#39FF14] text-[11px] font-black uppercase tracking-[0.2em]"
                >
                  Learn More <ArrowRight size={14} />
                </a>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-3xl border border-[#39FF14]/30 bg-[#101a12] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.35em] font-black text-[#39FF14]">Start A Project</p>
            <p className="mt-2 text-base sm:text-lg text-white font-bold">Need a SaaS app or automation system for your business?</p>
          </div>
          <a
            href={withUTM(MINDSCAPE_LINKS.whatsappStrategyCall, { content: "services_strategy_call" })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em]"
          >
            <MessageCircle size={15} /> Book Strategy Call
          </a>
        </div>
      </div>
    </div>
  );
}
