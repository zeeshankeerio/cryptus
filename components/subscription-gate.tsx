"use client";

/**
 * RSIQ Pro - Subscription Gate
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Protects the terminal with auth + subscription verification.
 * Handles: session loading, redirect to login, subscription checks.
 */

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useSubscription } from "@/hooks/use-subscription";
import { AUTH_CONFIG } from "@/lib/config";

const MAX_SESSION_RETRIES = 5; // More frequent, faster checks
const SESSION_RETRY_DELAY_MS = 250; // Ultra-fast hydration (250ms insted of 1.5s)

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const router = useRouter();
  const { hasActiveSubscription, isLoading: subLoading, refresh, daysLeft, isTrialing, isProcessingPayment } = useSubscription();
  const [sessionRetries, setSessionRetries] = useState(0);
  const hasRedirected = useRef(false);

  const isOwner =
    session.data?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
    (session.data?.user as { role?: string | null } | undefined)?.role === "owner";

  // ── Session Retry Logic ──
  // Sometimes sessions take a moment to hydrate (especially after login redirect).
  // We retry a few times before giving up and redirecting to login.
  useEffect(() => {
    if (session.isPending || session.data) return;
    if (hasRedirected.current) return;

    if (sessionRetries < MAX_SESSION_RETRIES) {
      const timer = setTimeout(() => {
        setSessionRetries(prev => prev + 1);
        // Force re-check session
        authClient.getSession();
      }, SESSION_RETRY_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // All retries exhausted - redirect to login
    hasRedirected.current = true;
    router.replace("/login");
  }, [session.isPending, session.data, sessionRetries, router]);

  // ── Loading State ──
  if (session.isPending || (subLoading && session.data)) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#39FF14]" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            {session.isPending ? "Authenticating..." : "Verifying Access..."}
          </p>
        </div>
      </div>
    );
  }

  // ── Session retry in progress ──
  if (!session.data && sessionRetries < MAX_SESSION_RETRIES) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#39FF14]" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            Synchronizing Session... ({sessionRetries + 1}/{MAX_SESSION_RETRIES})
          </p>
        </div>
      </div>
    );
  }

  // ── No session after retries (redirect happening) ──
  if (!session.data) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  // ── Access Granted ──
  if (isOwner || hasActiveSubscription) {
    return <>{children}</>;
  }

  // ── Finalizing Payment (Processing) ──
  if (isProcessingPayment) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center p-6 text-center">
        <div className="w-full max-w-lg rounded-3xl border border-[#39FF14]/20 bg-[#0a0f1a] p-8">
          <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center relative">
            <Loader2 className="h-8 w-8 text-[#39FF14] animate-spin" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight">Financial Handshake</h2>
          <p className="mt-4 text-sm text-slate-400 leading-relaxed">
            Your crypto transaction has been broadcasted. We are currently waiting for 
            <span className="text-white font-bold"> Network Confirmations</span> to finalize your RSIQ Pro access.
          </p>
          
          <div className="mt-10 p-4 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-[#39FF14] animate-pulse">
            Monitoring Blockchain Nodes...
          </div>
          
          <button 
            onClick={refresh}
            className="mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition underline underline-offset-4"
          >
            Force Re-verify Status
          </button>
        </div>
      </div>
    );
  }

  // ── Subscription Required ──
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0f1a] p-8 text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-400/30 flex items-center justify-center">
          <Lock className="h-7 w-7 text-rose-300" />
        </div>
        <h2 className="text-2xl font-black text-white">
          {isTrialing && daysLeft === 0 ? "Trial Expired" : "Subscription Required"}
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          {isTrialing && daysLeft === 0 
            ? "Your 14-day trial has concluded. Upgrade to a Pro plan to keep your access to the terminal and live signals."
            : "Your access window has ended. Subscribe to continue using the RSIQ terminal and live scanning features."}
        </p>
        {isTrialing && typeof daysLeft === "number" && daysLeft > 0 ? (
          <p className="mt-2 text-xs text-[#39FF14] uppercase tracking-[0.2em] font-black">
            Trial active: {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </p>
        ) : null}
        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="/subscription"
            className="h-11 rounded-xl bg-[#39FF14] text-black text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center"
          >
            Open Subscription Plans
          </Link>
          <button
            onClick={refresh}
            className="h-11 rounded-xl border border-white/15 text-slate-300 text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Check Again
          </button>
        </div>
      </div>
    </div>
  );
}
