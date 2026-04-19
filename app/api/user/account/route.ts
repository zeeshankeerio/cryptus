import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveEntitlementsForUser } from "@/lib/entitlements";
import { AUTH_CONFIG } from "@/lib/config";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getSessionUser();
    if (ctx.error) {
      return ctx.error;
    }

    if (!ctx.user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Retrieve user details
    const user = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        coins: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Retrieve subscription details
    const subscriptions = await prisma.subscription.findMany({
      where: { referenceId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: {
        status: true,
        plan: true,
        periodEnd: true,
        trialEnd: true,
      },
    });

    const subscription = subscriptions[0] || null;

    // Calculate trial days remaining
    let trialDaysRemaining: number | null = null;
    const now = Date.now();
    const trialEndMs = user.createdAt.getTime() + AUTH_CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000;
    
    if (now < trialEndMs && (!subscription || subscription.status !== "active")) {
      const remainingMs = trialEndMs - now;
      trialDaysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    }

    // Determine subscription status
    let status: "trial" | "active" | "past_due" | "cancelled" | "none" = "none";
    
    if (subscription) {
      if (subscription.status === "active") {
        status = "active";
      } else if (subscription.status === "past_due") {
        status = "past_due";
      } else if (subscription.status === "canceled" || subscription.status === "cancelled") {
        status = "cancelled";
      } else if (subscription.status === "trialing") {
        status = "trial";
      }
    } else if (trialDaysRemaining !== null && trialDaysRemaining > 0) {
      status = "trial";
    }

    // Compute entitlements
    const entitlements = await resolveEntitlementsForUser({
      id: user.id,
      email: user.email,
      role: null,
      createdAt: user.createdAt,
      coins: user.coins,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
      subscription: {
        status,
        plan: subscription?.plan || null,
        periodEnd: subscription?.periodEnd?.toISOString() || null,
        trialDaysRemaining,
      },
      entitlements: {
        tier: entitlements.tier,
        isTrialing: entitlements.isTrialing,
        hasPaidAccess: entitlements.hasPaidAccess,
        maxRecords: entitlements.maxRecords,
        maxSymbols: entitlements.maxSymbols,
        features: entitlements.features,
      },
    });
  } catch (error) {
    console.error("[user/account] GET error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve account data" },
      { status: 500 }
    );
  }
}
