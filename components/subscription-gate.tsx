"use client";

import Link from "next/link";
import { Loader2, Lock, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useSubscription } from "@/hooks/use-subscription";
import { AUTH_CONFIG } from "@/lib/config";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const { hasActiveSubscription, isLoading, refresh, daysLeft, isTrialing } = useSubscription();

  const isOwner =
    session.data?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
    (session.data?.user as { role?: string | null } | undefined)?.role === "owner";

  if (isLoading || session.isPending) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#39FF14]" />
      </div>
    );
  }

  if (!session.data) return null;

  if (isOwner || hasActiveSubscription) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0f1a] p-8 text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-400/30 flex items-center justify-center">
          <Lock className="h-7 w-7 text-rose-300" />
        </div>
        <h2 className="text-2xl font-black text-white">Subscription Required</h2>
        <p className="mt-3 text-sm text-slate-400">
          Your access window has ended. Subscribe to continue using the RSIQ terminal and live scanning features.
        </p>
        {isTrialing && typeof daysLeft === "number" ? (
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
