"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AUTH_CONFIG } from "@/lib/config";

export interface Subscription {
  id: string;
  referenceId: string;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  plan?: string;
  stripeSubscriptionId?: string | null;
  trialEnd?: Date | string | number | null;
  periodEnd?: Date | string | number | null;
  invoiceRef?: string | null;
  renewalNotes?: string | null;
}

const SUPER_ADMIN_EMAIL = AUTH_CONFIG.SUPER_ADMIN_EMAIL;
const PAST_DUE_GRACE_MS = AUTH_CONFIG.PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

export function useSubscription() {
  const session = authClient.useSession();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrialing, setIsTrialing] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [serverHasActive, setServerHasActive] = useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const isSuperAdmin = session.data?.user?.email === SUPER_ADMIN_EMAIL;

  const refresh = () => setRefreshKey((x) => x + 1);

  useEffect(() => {
    let isCancelled = false;

    const runCheck = async () => {
      if (session.isPending) return;
      if (!session.data) {
        if (!isCancelled) setIsLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/subscription/status", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        if (isCancelled) return;

        if (data.isSuperAdmin) {
          setSubscription(null);
          setIsTrialing(false);
          setDaysLeft(null);
          setServerHasActive(true);
          setIsLoading(false);
          return;
        }

        setServerHasActive(!!data.hasActiveSubscription);

        if (data.subscription) {
          const sub = data.subscription as Subscription;
          setSubscription(sub);
          setIsTrialing(sub.status === "trialing");

          const endSource = sub.trialEnd || sub.periodEnd;
          if (endSource) {
            const end = new Date(endSource).getTime();
            const now = Date.now();
            const diff = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
            setDaysLeft(diff);
          } else {
            setDaysLeft(null);
          }
        } else {
          setSubscription(null);
          setIsTrialing(!!data.isTrialing);
          setDaysLeft(data.daysLeft ?? 0);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    runCheck();

    return () => {
      isCancelled = true;
    };
  }, [session.isPending, session.data?.user?.id, refreshKey]);

  const isPastDueInGrace =
    subscription?.status === "past_due" &&
    !!subscription?.periodEnd &&
    Date.now() <= new Date(subscription.periodEnd).getTime() + PAST_DUE_GRACE_MS;

  const hasActiveSubscription =
    isSuperAdmin ||
    (serverHasActive !== null
      ? serverHasActive
      : subscription?.status === "active" ||
        subscription?.status === "trialing" ||
        isPastDueInGrace ||
        (isTrialing && (daysLeft ?? 0) > 0));

  return {
    subscription,
    isLoading: isLoading || session.isPending,
    isTrialing: isSuperAdmin ? false : isTrialing,
    daysLeft: isSuperAdmin ? null : daysLeft,
    hasActiveSubscription,
    refresh,
  };
}
