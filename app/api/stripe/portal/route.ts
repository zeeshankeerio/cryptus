import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSessionUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY for billing portal.");
}

const stripeClient = new Stripe(stripeSecretKey, {
  apiVersion: "2025-11-17.clover" as any,
});

export async function POST() {
  const ctx = await getSessionUser();
  if (ctx.error) return ctx.error;

  const { user } = ctx;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latestSub = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      stripeCustomerId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      stripeCustomerId: true,
    },
  });

  if (!latestSub?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer found for this account." },
      { status: 400 },
    );
  }

  const returnUrl = `${
    process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000"
  }/subscription`;

  const portal = await stripeClient.billingPortal.sessions.create({
    customer: latestSub.stripeCustomerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: portal.url });
}
