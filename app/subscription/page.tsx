"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Shield, Crown } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useSubscription } from "@/hooks/use-subscription";
import { AUTH_CONFIG } from "@/lib/config";
import { PaymentSentinel } from "@/components/payment-sentinel";

export default function SubscriptionPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [loadingCrypto, setLoadingCrypto] = useState<string | null>(null);
  const [sentinelOpen, setSentinelOpen] = useState(false);
  const [sentinelPlan, setSentinelPlan] = useState<string>("");
  const session = authClient.useSession();
  const { subscription, isTrialing, hasActiveSubscription, daysLeft } = useSubscription();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSubscriptionRequired(params.get("required") === "1");
  }, []);

  const isOwner =
    session.data?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
    (session.data?.user as { role?: string | null } | undefined)?.role === "owner";

  const handleSubscribe = async (plan: "monthly" | "yearly") => {
    setCheckoutMessage(null);

    if (!session.data?.user?.id) {
      setCheckoutMessage("Please sign in first.");
      return;
    }

    if (isTrialing) {
      setCheckoutMessage(
        `Your free trial is active${typeof daysLeft === "number" ? ` for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}` : ""}. Billing starts after trial ends.`,
      );
      return;
    }

    setLoadingPlan(plan);
    try {
      const preflightRes = await fetch("/api/subscription/checkout-ready", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const preflight = await preflightRes.json().catch(() => null) as {
        canCheckout?: boolean;
        message?: string;
      } | null;

      if (!preflightRes.ok || !preflight?.canCheckout) {
        setCheckoutMessage(preflight?.message || "Checkout is not available right now.");
        return;
      }

      const { error } = await authClient.subscription.upgrade({
        plan,
        annual: plan === "yearly",
        successUrl: `${window.location.origin}/subscription?success=true`,
        cancelUrl: `${window.location.origin}/subscription?cancelled=true`,
        disableRedirect: false,
        referenceId: session.data.user.id,
        customerType: "user",
      });

      if (error) {
        console.error("Subscription error:", error);
        const message =
          typeof error === "string"
            ? error
            : (error as { message?: string })?.message ||
              (error as { statusText?: string })?.statusText ||
              "Checkout could not be started right now. Please retry in a moment.";
        setCheckoutMessage(message);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setCheckoutMessage("Checkout is temporarily unavailable. Please retry in a minute.");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleCryptoSubscribe = async (plan: "monthly" | "yearly") => {
    setCheckoutMessage(null);
    if (!session.data?.user?.id) {
      setCheckoutMessage("Please sign in first.");
      return;
    }

    setSentinelPlan(plan);
    setSentinelOpen(true);
    setLoadingCrypto(plan);
    try {
      const res = await fetch("/api/subscription/nowpayments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Crypto checkout failed");

      if (data.url) {
        // Wait a small bit for the user to see the "Ready" state of the sentinel
        setTimeout(() => {
          window.location.href = data.url;
        }, 1800);
      }
    } catch (error: any) {
      setSentinelOpen(false);
      console.error("Crypto checkout error:", error);
      setCheckoutMessage(error.message || "Crypto payment is temporarily unavailable.");
    } finally {
      setLoadingCrypto(null);
    }
  };

  const getButtonText = (plan: "monthly" | "yearly") => {
    if (loadingPlan === plan) return "INITIALIZING...";

    if (subscription && subscription.plan === plan && subscription.status === "active") {
      return "CURRENT PLAN";
    }

    if (isTrialing) {
      if (typeof daysLeft === "number") {
        return `AVAILABLE IN ${daysLeft} DAY${daysLeft === 1 ? "" : "S"}`;
      }
      return "AVAILABLE AFTER TRIAL";
    }

    if (hasActiveSubscription) {
      return plan === "monthly" ? "ACTIVATE MONTHLY" : "ACTIVATE YEARLY";
    }

    return "SUBSCRIBE NOW";
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        alert(data.error || "Unable to open billing portal.");
        return;
      }
      window.location.href = data.url;
    } catch {
      alert("Unable to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-14">
      <div className="max-w-6xl mx-auto">
        <Link href="/terminal" className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-slate-500 hover:text-[#39FF14] uppercase">
          <ArrowLeft className="h-4 w-4" /> Back to Terminal
        </Link>

        <div className="mt-10 mb-16 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
              Subscription <span className="text-[#39FF14]">Control</span>
            </h1>
            <p className="mt-4 text-sm text-slate-400 max-w-2xl">
              Secure, enterprise-grade access management for RSIQ Pro. Start with a free trial,
              then retain uninterrupted global scanner access via monthly or yearly operational plans.
            </p>
          </div>
          {isOwner && (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-amber-100 text-xs font-bold tracking-wide uppercase flex items-center gap-2">
              <Crown className="h-4 w-4" /> Owner account (admin bypass enabled)
            </div>
          )}
        </div>

        {subscriptionRequired ? (
          <div className="mb-8 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 uppercase tracking-[0.15em] font-bold">
            Active subscription is required to access the terminal.
          </div>
        ) : null}

        {checkoutMessage ? (
          <div className="mb-8 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100 uppercase tracking-[0.15em] font-bold">
            {checkoutMessage}
          </div>
        ) : null}

        {isTrialing ? (
          <div className="mb-8 rounded-2xl border border-[#39FF14]/35 bg-[#39FF14]/10 px-4 py-3 text-xs text-[#b7ffab] uppercase tracking-[0.15em] font-bold">
            Trial active{typeof daysLeft === "number" ? `: ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining` : ""}. Payment is requested after day {AUTH_CONFIG.TRIAL_DAYS}.
          </div>
        ) : null}

        {subscription ? (
          <div className="mb-8 rounded-2xl border border-white/10 bg-[#0a0f1a] px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-black">Current Subscription</p>
              <p className="text-sm text-white mt-1">
                {subscription.plan || "unknown"} - {subscription.status}
              </p>
            </div>
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="h-10 rounded-xl border border-white/20 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200 disabled:opacity-50"
            >
              {portalLoading ? "Opening..." : "Manage Billing"}
            </button>
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-8">
          <PlanCard
            name="Monthly"
            price="$20"
            period="/month"
            note="Flexible maintenance plan"
            features={[
              "Real-time screener access",
              "Alerts and templates",
              "Manual renewal support",
              "Priority bug fixes",
            ]}
            loading={loadingPlan === "monthly"}
            onClick={() => handleSubscribe("monthly")}
            onCryptoClick={() => handleCryptoSubscribe("monthly")}
            disabled={isTrialing || !!loadingPlan || !!loadingCrypto || (subscription?.plan === "monthly" && subscription?.status === "active")}
            loadingCrypto={loadingCrypto === "monthly"}
            buttonText={getButtonText("monthly")}
          />

          <PlanCard
            name="Yearly"
            price="$200"
            period="/year"
            note="Best value for full-year operation"
            features={[
              "Everything in monthly",
              "Lower annual cost",
              "Stable long-term continuity",
              "Owner billing controls",
            ]}
            highlight
            loading={loadingPlan === "yearly"}
            onClick={() => handleSubscribe("yearly")}
            onCryptoClick={() => handleCryptoSubscribe("yearly")}
            disabled={isTrialing || !!loadingPlan || !!loadingCrypto || (subscription?.plan === "yearly" && subscription?.status === "active")}
            loadingCrypto={loadingCrypto === "yearly"}
            buttonText={getButtonText("yearly")}
          />
        </div>

        <div className="mt-12 text-xs text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
          <Shield className="h-4 w-4" /> Secure payments via Stripe & NOWPayments
        </div>
      </div>

      <PaymentSentinel 
        isOpen={sentinelOpen} 
        onClose={() => setSentinelOpen(false)} 
        plan={sentinelPlan}
      />
    </div>
  );
}

function PlanCard(props: {
  name: string;
  price: string;
  period: string;
  note: string;
  features: string[];
  highlight?: boolean;
  loading: boolean;
  disabled: boolean;
  buttonText: string;
  loadingCrypto?: boolean;
  onClick: () => void;
  onCryptoClick: () => void;
}) {
  return (
    <div className={`rounded-3xl border p-8 ${props.highlight ? "border-[#39FF14]/40 bg-[#0d1410]" : "border-white/10 bg-[#0a0f1a]"}`}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-black text-white">{props.name}</h3>
          <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em] mt-2">{props.note}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black text-white">{props.price}</p>
          <p className="text-xs text-slate-400">{props.period}</p>
        </div>
      </div>

      <ul className="mt-8 space-y-3">
        {props.features.map((feature) => (
          <li key={feature} className="text-sm text-slate-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#39FF14]" /> {feature}
          </li>
        ))}
      </ul>

      <button
        onClick={props.onClick}
        disabled={props.disabled}
        className={`mt-8 w-full rounded-xl py-4 text-[11px] font-black uppercase tracking-[0.2em] transition ${props.highlight ? "bg-[#39FF14] text-black hover:bg-[#30de10]" : "bg-white text-black hover:bg-slate-200"} disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
      >
        {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {props.buttonText}
      </button>

      <button
        onClick={props.onCryptoClick}
        disabled={props.disabled}
        className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white hover:bg-white/10 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {props.loadingCrypto ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Pay with Crypto (USDT, SOL, USDC)
      </button>
      
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <div className="px-2 py-1 rounded bg-white/5 border border-white/5 flex items-center gap-1.5 opacity-60">
          <img src="https://nowpayments.io/images/coins/usdt_bsc.svg" className="h-3 w-3" alt="USDT" />
          <span className="text-[8px] font-black tracking-widest uppercase">USDT (BSC)</span>
        </div>
        <div className="px-2 py-1 rounded bg-white/5 border border-white/5 flex items-center gap-1.5 opacity-60">
          <img src="https://nowpayments.io/images/coins/sol.svg" className="h-3 w-3" alt="SOL" />
          <span className="text-[8px] font-black tracking-widest uppercase">SOL (SOL)</span>
        </div>
        <div className="px-2 py-1 rounded bg-white/5 border border-white/5 flex items-center gap-1.5 opacity-60">
          <img src="https://nowpayments.io/images/coins/usdc.svg" className="h-3 w-3" alt="USDC" />
          <span className="text-[8px] font-black tracking-widest uppercase">USDC (SOLANA)</span>
        </div>
      </div>
    </div>
  );
}
