"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Search, UserRound, Crown, Calendar, FileText } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AUTH_CONFIG } from "@/lib/config";

type FeatureFlags = {
  maxTrialRecords: number;
  maxSubscribedRecords: number;
  allowTrialAlerts: boolean;
  allowTrialAdvancedIndicators: boolean;
  allowTrialCustomSettings: boolean;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  createdAt: string;
  banned: boolean | null;
  banReason?: string | null;
  subscription: {
    id: string;
    status: string;
    plan: string;
    periodEnd: string | null;
    invoiceRef: string | null;
    renewalNotes: string | null;
  } | null;
};

export default function AdminPage() {
  const session = authClient.useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [manualUserId, setManualUserId] = useState("");
  const [manualPlan, setManualPlan] = useState<"monthly" | "yearly">("monthly");
  const [manualInvoiceRef, setManualInvoiceRef] = useState("");
  const [manualPeriodEnd, setManualPeriodEnd] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [statusLoadingUserId, setStatusLoadingUserId] = useState<string | null>(null);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(false);

  const isOwner =
    session.data?.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
    (session.data?.user as { role?: string | null } | undefined)?.role === "owner";

  const loadUsers = async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (!res.ok) {
      setUsers([]);
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
  };

  const loadFeatureFlags = async () => {
    setFlagsLoading(true);
    try {
      const res = await fetch("/api/admin/feature-flags", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setFlags(data.flags || null);
    } finally {
      setFlagsLoading(false);
    }
  };

  useEffect(() => {
    if (!session.data || !isOwner) {
      setLoading(false);
      return;
    }

    const init = async () => {
      try {
        await Promise.all([loadUsers(), loadFeatureFlags()]);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [session.data?.user?.id, isOwner]);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  const handleManualRenew = async () => {
    if (!manualUserId || !manualInvoiceRef || !manualPeriodEnd) {
      alert("User, invoice reference and end date are required.");
      return;
    }

    setManualLoading(true);
    try {
      const res = await fetch("/api/admin/manual-renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: manualUserId,
          plan: manualPlan,
          invoiceRef: manualInvoiceRef,
          renewalNotes: manualNotes,
          periodEnd: manualPeriodEnd,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Manual renew failed.");
        return;
      }

      alert("Manual renewal applied.");
      setManualInvoiceRef("");
      setManualNotes("");
      setManualPeriodEnd("");

      await loadUsers();
    } finally {
      setManualLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, banned: boolean) => {
    setStatusLoadingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banned: !banned,
          reason: !banned ? "Suspended by owner" : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update user status.");
        return;
      }

      await loadUsers();
    } finally {
      setStatusLoadingUserId(null);
    }
  };

  const saveFeatureFlags = async (patch: Partial<FeatureFlags>) => {
    if (!flags) return;
    const next = { ...flags, ...patch };
    setFlags(next);

    const res = await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to save feature flags.");
      await loadFeatureFlags();
      return;
    }

    setFlags(data.flags);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05080F] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#39FF14]" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#05080F] text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Crown className="h-12 w-12 text-amber-300" />
        <h1 className="text-3xl font-black">Owner Access Required</h1>
        <p className="text-slate-400 max-w-md">This panel is restricted to the owner account for user visibility and manual renewal operations.</p>
        <Link href="/terminal" className="text-[#39FF14] uppercase text-xs font-black tracking-[0.2em]">Back to terminal</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-12">
      <div className="max-w-7xl mx-auto">
        <Link href="/terminal" className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-slate-500 hover:text-[#39FF14] uppercase">
          <ArrowLeft className="h-4 w-4" /> Back to Terminal
        </Link>

        <div className="mt-8 mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-black text-white">Owner Admin Panel</h1>
            <p className="text-sm text-slate-400 mt-2">Users, status visibility, and manual renew from the proven StoxiFy flow.</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mt-2">Registered users: {users.length}</p>
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-amber-200 bg-amber-200/10 border border-amber-200/30 rounded-xl px-3 py-2">
            Owner only
          </div>
        </div>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
          <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 pl-10 pr-4 text-sm text-white"
                />
              </div>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map((user) => (
                <div key={user.id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-white font-bold">
                      <UserRound className="h-4 w-4 text-[#39FF14]" />
                      {user.name}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{user.email}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em] mt-2">Role: {user.role || "user"}</p>
                    {user.banned ? (
                      <p className="text-[10px] text-rose-300 uppercase tracking-[0.1em] mt-1">
                        Suspended{user.banReason ? `: ${user.banReason}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-md ${user.subscription?.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-200"}`}>
                      {user.subscription?.status || "no-sub"}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-2">{user.subscription?.plan || "-"}</p>
                    <p className="text-[10px] text-slate-500 mt-1 flex items-center justify-end gap-1"><Calendar className="h-3 w-3" /> {user.subscription?.periodEnd ? new Date(user.subscription.periodEnd).toLocaleDateString() : "-"}</p>
                    <button
                      onClick={() => toggleUserStatus(user.id, !!user.banned)}
                      disabled={statusLoadingUserId === user.id}
                      className={`mt-3 h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.15em] ${user.banned ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"} disabled:opacity-50`}
                    >
                      {statusLoadingUserId === user.id
                        ? "Updating..."
                        : user.banned
                          ? "Reactivate"
                          : "Suspend"}
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-500">No users found.</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-5 h-fit">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#39FF14]" /> Manual Renew
              </h2>
              <p className="text-xs text-slate-400 mt-2">Owner can apply off-Stripe renewals directly.</p>

              <div className="mt-4 space-y-3">
                <select
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                >
                  <option value="">Select user</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>

                <select
                  value={manualPlan}
                  onChange={(e) => setManualPlan(e.target.value as "monthly" | "yearly")}
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>

                <input
                  value={manualInvoiceRef}
                  onChange={(e) => setManualInvoiceRef(e.target.value)}
                  placeholder="Invoice ref"
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                />

                <input
                  type="date"
                  value={manualPeriodEnd}
                  onChange={(e) => setManualPeriodEnd(e.target.value)}
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                />

                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  className="w-full bg-[#05080F] border border-white/10 rounded-xl px-3 py-2 text-sm min-h-24"
                />

                <button
                  onClick={handleManualRenew}
                  disabled={manualLoading}
                  className="w-full rounded-xl h-11 bg-[#39FF14] text-black font-black text-[11px] uppercase tracking-[0.2em] disabled:opacity-50"
                >
                  {manualLoading ? "Applying..." : "Apply Renewal"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0a0f1a] p-5 h-fit">
              <h2 className="text-lg font-black text-white">Trial Feature Flags</h2>
              <p className="text-xs text-slate-400 mt-2">Control trial limits and feature access in real time.</p>

              {flagsLoading && !flags ? (
                <div className="mt-4 text-xs text-slate-500">Loading flags...</div>
              ) : null}

              {flags ? (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Max Trial Records</label>
                    <input
                      type="number"
                      min={100}
                      max={500}
                      value={flags.maxTrialRecords}
                      onChange={(e) => saveFeatureFlags({ maxTrialRecords: Number(e.target.value) })}
                      className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Max Subscribed Records</label>
                    <input
                      type="number"
                      min={100}
                      max={1000}
                      value={flags.maxSubscribedRecords}
                      onChange={(e) => saveFeatureFlags({ maxSubscribedRecords: Number(e.target.value) })}
                      className="w-full bg-[#05080F] border border-white/10 rounded-xl h-11 px-3 text-sm"
                    />
                  </div>

                  {[
                    { key: "allowTrialAlerts", label: "Allow Trial Alerts" },
                    { key: "allowTrialAdvancedIndicators", label: "Allow Trial Advanced Indicators" },
                    { key: "allowTrialCustomSettings", label: "Allow Trial Custom Settings" },
                  ].map((flag) => (
                    <button
                      key={flag.key}
                      onClick={() =>
                        saveFeatureFlags({ [flag.key]: !(flags as any)[flag.key] } as Partial<FeatureFlags>)
                      }
                      className="w-full h-11 rounded-xl border border-white/10 px-3 text-left text-sm flex items-center justify-between"
                    >
                      <span>{flag.label}</span>
                      <span className={`text-[10px] uppercase tracking-[0.15em] ${(flags as any)[flag.key] ? "text-emerald-300" : "text-slate-500"}`}>
                        {(flags as any)[flag.key] ? "Enabled" : "Disabled"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
