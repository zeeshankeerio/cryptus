"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, User, Calendar, CreditCard, AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type SubscriptionStatus = "trial" | "active" | "past_due" | "cancelled" | "none";

type AccountData = {
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
  subscription: {
    status: SubscriptionStatus;
    plan: string | null;
    periodEnd: string | null;
    trialDaysRemaining: number | null;
  };
  entitlements: {
    tier: string;
    isTrialing: boolean;
    hasPaidAccess: boolean;
    maxRecords: number;
    maxSymbols: number;
    features: {
      enableAlerts: boolean;
      enableAdvancedIndicators: boolean;
      enableCustomSettings: boolean;
    };
  };
};

type BillingHistoryItem = {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  invoiceUrl: string | null;
  description: string;
};

export default function AccountPage() {
  const session = authClient.useSession();
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.data?.user) {
      setLoading(false);
      return;
    }

    const loadAccountData = async () => {
      try {
        const res = await fetch("/api/user/account", { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Failed to load account data");
          return;
        }
        const data = await res.json();
        setAccountData(data);

        // Load billing history if user has paid access
        if (data.entitlements.hasPaidAccess || data.subscription.status !== "none") {
          loadBillingHistory();
        }
      } catch (err) {
        console.error("Error loading account data:", err);
        setError("Failed to load account data");
      } finally {
        setLoading(false);
      }
    };

    const loadBillingHistory = async () => {
      setBillingLoading(true);
      try {
        const res = await fetch("/api/user/billing-history?limit=10", { cache: "no-store" });
        if (!res.ok) {
          setBillingError("Failed to load billing history");
          return;
        }
        const data = await res.json();
        setBillingHistory(data.history || []);
      } catch (err) {
        console.error("Error loading billing history:", err);
        setBillingError("Failed to load billing history");
      } finally {
        setBillingLoading(false);
      }
    };

    loadAccountData();
  }, [session.data?.user?.id]);

  const handleManageBilling = async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) {
        alert("Failed to open billing portal");
        return;
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Error opening billing portal:", err);
      alert("Failed to open billing portal");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#39FF14]" />
      </div>
    );
  }

  if (!session.data?.user) {
    return (
      <div className="min-h-screen bg-[#05080F] text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-rose-300" />
        <h1 className="text-3xl font-black">Authentication Required</h1>
        <p className="text-slate-400 max-w-md">Please log in to view your account.</p>
        <Link href="/login" className="text-[#39FF14] uppercase text-xs font-black tracking-[0.2em]">
          Go to Login
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#05080F] text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-rose-300" />
        <h1 className="text-3xl font-black">Error</h1>
        <p className="text-slate-400 max-w-md">{error}</p>
        <Link href="/terminal" className="text-[#39FF14] uppercase text-xs font-black tracking-[0.2em]">
          Back to Terminal
        </Link>
      </div>
    );
  }

  if (!accountData) {
    return null;
  }

  const getStatusBadge = (status: SubscriptionStatus) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/20 text-emerald-300";
      case "trial":
        return "bg-amber-500/20 text-amber-300";
      case "past_due":
        return "bg-rose-500/20 text-rose-300";
      case "cancelled":
        return "bg-slate-700 text-slate-400";
      default:
        return "bg-slate-700 text-slate-400";
    }
  };

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/terminal"
          className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-slate-500 hover:text-[#39FF14] uppercase"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Terminal
        </Link>

        <div className="mt-8 mb-8">
          <h1 className="text-4xl font-black text-white">Account</h1>
          <p className="text-sm text-slate-400 mt-2">Manage your subscription and account settings</p>
        </div>

        <div className="space-y-6">
          {/* User Info Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="h-5 w-5 text-[#39FF14]" />
              <h2 className="text-lg font-black text-white">Profile</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-1">Name</div>
                <div className="text-sm text-white">{accountData.user.name}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-1">Email</div>
                <div className="text-sm text-white">{accountData.user.email}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-1">Member Since</div>
                <div className="text-sm text-white">
                  {new Date(accountData.user.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Status Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="h-5 w-5 text-[#39FF14]" />
              <h2 className="text-lg font-black text-white">Subscription</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Status</div>
                <span
                  className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-md ${getStatusBadge(accountData.subscription.status)}`}
                >
                  {accountData.subscription.status}
                </span>
              </div>

              {accountData.subscription.plan && (
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Plan</div>
                  <div className="text-sm text-white capitalize">{accountData.subscription.plan}</div>
                </div>
              )}

              {accountData.subscription.periodEnd && (
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Renewal Date</div>
                  <div className="text-sm text-white">
                    {new Date(accountData.subscription.periodEnd).toLocaleDateString()}
                  </div>
                </div>
              )}

              {accountData.subscription.trialDaysRemaining !== null && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <div className="text-sm font-bold text-amber-300 mb-1">Trial Period</div>
                  <div className="text-xs text-amber-200">
                    {accountData.subscription.trialDaysRemaining} days remaining
                  </div>
                </div>
              )}

              {accountData.entitlements.isTrialing && (
                <Link
                  href="/subscription"
                  className="block w-full rounded-xl h-11 bg-[#39FF14] text-black font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center hover:bg-[#39FF14]/90 transition-colors"
                >
                  Upgrade to Premium
                </Link>
              )}

              {accountData.entitlements.hasPaidAccess && (
                <button
                  onClick={handleManageBilling}
                  className="w-full rounded-xl h-11 bg-slate-700 text-white font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-600 transition-colors"
                >
                  Manage Billing
                </button>
              )}
            </div>
          </div>

          {/* Entitlements Card */}
          <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <CreditCard className="h-5 w-5 text-[#39FF14]" />
              <h2 className="text-lg font-black text-white">Your Access</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#05080F]">
                <span className="text-sm text-slate-300">Max Records</span>
                <span className="text-sm font-bold text-white">{accountData.entitlements.maxRecords}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#05080F]">
                <span className="text-sm text-slate-300">Max Symbols</span>
                <span className="text-sm font-bold text-white">{accountData.entitlements.maxSymbols}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#05080F]">
                <span className="text-sm text-slate-300">Advanced Indicators</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-[0.15em] ${accountData.entitlements.features.enableAdvancedIndicators ? "text-emerald-300" : "text-slate-500"}`}
                >
                  {accountData.entitlements.features.enableAdvancedIndicators ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#05080F]">
                <span className="text-sm text-slate-300">Alerts</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-[0.15em] ${accountData.entitlements.features.enableAlerts ? "text-emerald-300" : "text-slate-500"}`}
                >
                  {accountData.entitlements.features.enableAlerts ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#05080F]">
                <span className="text-sm text-slate-300">Custom Settings</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-[0.15em] ${accountData.entitlements.features.enableCustomSettings ? "text-emerald-300" : "text-slate-500"}`}
                >
                  {accountData.entitlements.features.enableCustomSettings ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>

          {/* Billing History Card */}
          {(accountData.entitlements.hasPaidAccess || billingHistory.length > 0) && (
            <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-6">
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="h-5 w-5 text-[#39FF14]" />
                <h2 className="text-lg font-black text-white">Billing History</h2>
              </div>

              {billingLoading ? (
                <div className="text-xs text-slate-500 py-4">Loading billing history...</div>
              ) : billingError ? (
                <div className="text-xs text-rose-300 py-4">{billingError}</div>
              ) : billingHistory.length === 0 ? (
                <div className="text-xs text-slate-500 py-4">No billing history available.</div>
              ) : (
                <div className="space-y-2">
                  {billingHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-[#05080F] border border-white/10"
                    >
                      <div className="flex-1">
                        <div className="text-sm text-white font-bold">{item.description}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {new Date(item.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-white">${item.amount}</div>
                        <div
                          className={`text-[10px] uppercase tracking-[0.15em] mt-1 ${
                            item.status === "paid"
                              ? "text-emerald-300"
                              : item.status === "pending"
                                ? "text-amber-300"
                                : "text-rose-300"
                          }`}
                        >
                          {item.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
