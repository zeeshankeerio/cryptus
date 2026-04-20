"use client";

import React, { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { MarketTicker } from '@/components/landing/Ticker';
import { LandingHeader } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { TerminalPreview } from '@/components/landing/Preview';
import { IntelligenceHub } from '@/components/landing/IntelligenceHub';
import { LogicSection } from '@/components/landing/LogicSection';
import { MobileExperience } from '@/components/landing/MobileExperience';
import { ProfessionalEdge } from '@/components/landing/ProfessionalEdge';
import { Roadmap } from '@/components/landing/Roadmap';
import { Services } from '@/components/landing/Services';
import { Pricing } from '@/components/landing/Pricing';
import { About } from '@/components/landing/About';
import { Connect } from '@/components/landing/Connect';
import { Affiliate } from '@/components/landing/Affiliate';
import { Footer } from '@/components/landing/Footer';
import { ProfitGap } from '@/components/landing/ProfitGap';

export default function LandingPage() {
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-300 selection:bg-[#39FF14]/30 selection:text-white overflow-x-hidden font-sans">
      {/* ─── Global Market Pulse Ticker ─── */}
      <MarketTicker />

      {/* ─── Grid Overlay ─── */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(57,255,20,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(57,255,20,0.03)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black,transparent)] pointer-events-none z-0" />

      {/* ─── Header ─── */}
      <LandingHeader 
        session={session} 
        mobileMenuOpen={mobileMenuOpen} 
        setMobileMenuOpen={setMobileMenuOpen} 
      />

      <main className="relative z-10">
        {/* ─── Hero Section ─── */}
        <Hero session={session} />

        {/* ─── Pulse Preview ─── */}
        <TerminalPreview />

        {/* ─── Market Intelligence ─── */}
        <IntelligenceHub />

        {/* ─── The Profit Gap / ROI ─── */}
        <ProfitGap />

        {/* ─── The Logic ─── */}
        <LogicSection />

        {/* ─── Mobile PWA ─── */}
        <MobileExperience />

        {/* ─── Professional Edge (Consolidated) ─── */}
        <ProfessionalEdge />

        {/* ─── Vision/Roadmap ─── */}
        <Roadmap />

        {/* ─── Services ─── */}
        <Services />

        {/* ─── Pricing ─── */}
        <Pricing />

        {/* ─── About Hub ─── */}
        <About />

        {/* ─── Ecosystem Links ─── */}
        <Connect />

        {/* ─── Collaboration ─── */}
        <Affiliate />

        {/* ─── Final CTA & Footer ─── */}
        <Footer />
      </main>
    </div>
  );
}
