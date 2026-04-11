import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUTH_CONFIG } from "@/lib/config";

type SubscriptionStatusRef = {
  status: string | null;
  endedAt: Date | null;
  periodEnd: Date | null;
};

export async function getSessionUser() {
  const activeHeaders = await headers();
  const session = await auth.api.getSession({ headers: activeHeaders });

  if (!session) {
    return { session: null, user: null, error: unauthorized() };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  if (!user) {
    return { session: null, user: null, error: unauthorized() };
  }

  return { session, user, error: null };
}

export async function requireOwner() {
  const ctx = await getSessionUser();
  if (ctx.error) return ctx;

  const isOwner =
    ctx.user?.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL ||
    ctx.user?.role === "owner";

  if (!isOwner) {
    return { ...ctx, error: forbidden() };
  }

  return ctx;
}

export async function checkSubscription(
  session: { user: { email: string; id: string } },
  referenceId: string,
) {
  if (session.user.email === AUTH_CONFIG.SUPER_ADMIN_EMAIL) {
    return { ok: true };
  }

  const subs = await prisma.subscription.findMany({
    where: { referenceId },
    orderBy: { updatedAt: "desc" },
    select: { status: true, endedAt: true, periodEnd: true },
  }) as SubscriptionStatusRef[];

  const statusPriority: Record<string, number> = { active: 0, trialing: 1, past_due: 2 };
  const subscription = subs.length > 0
    ? subs.sort((a, b) => {
      const pa = statusPriority[a.status ?? ""] ?? 99;
      const pb = statusPriority[b.status ?? ""] ?? 99;
      return pa - pb;
    })[0]
    : null;

  if (subscription) {
    const isActive = subscription.status === "active";
    const isTrialing = subscription.status === "trialing";
    const isPastDue = subscription.status === "past_due";

    const now = Date.now();
    const hasEnded = subscription.endedAt && subscription.endedAt.getTime() < now;
    const periodEndMs = subscription.periodEnd ? new Date(subscription.periodEnd).getTime() : null;
    const graceMs = AUTH_CONFIG.PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

    const activeButExpired =
      isActive && !!periodEndMs && !Number.isNaN(periodEndMs) && periodEndMs < now;

    const withinPastDueGrace =
      isPastDue && !!periodEndMs && !Number.isNaN(periodEndMs) && now <= periodEndMs + graceMs;

    if (((isActive && !activeButExpired) || isTrialing || withinPastDueGrace) && !hasEnded) {
      return { ok: true, subscription };
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: referenceId },
    select: { createdAt: true },
  });

  if (user) {
    const createdAt = user.createdAt.getTime();
    const trialMs = AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() < createdAt + trialMs) {
      return { ok: true, subscription: { status: "trialing", virtual: true } };
    }
  }

  return {
    ok: false,
    error: NextResponse.json(
      {
        error: subscription
          ? `Your subscription status is ${subscription.status}. Please update billing information.`
          : "No active subscription found. Please subscribe to continue.",
      },
      { status: 402 },
    ),
  };
}

export function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized", statusCode: 401 }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ success: false, error: "Forbidden", statusCode: 403 }, { status: 403 });
}
