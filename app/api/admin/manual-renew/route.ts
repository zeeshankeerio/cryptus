import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const manualRenewSchema = z.object({
  userId: z.string().trim().min(1),
  plan: z.enum(["monthly", "yearly"]),
  invoiceRef: z.string().trim().min(1),
  renewalNotes: z.string().trim().max(500).optional(),
  periodEnd: z.string(),
});

export async function POST(request: Request) {
  const ctx = await requireOwner();
  if (ctx.error) return ctx.error;

  const payload = await request.json().catch(() => null);
  const parsed = manualRenewSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, plan, invoiceRef, renewalNotes, periodEnd } = parsed.data;

  if (isNaN(Date.parse(periodEnd))) {
    return NextResponse.json({ error: "periodEnd must be a valid ISO date string" }, { status: 400 });
  }

  const [yyyy, mm, dd] = periodEnd.split("-").map(Number);
  const periodEndDate = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));

  if (Number.isNaN(periodEndDate.getTime())) {
    return NextResponse.json({ error: "periodEnd is not a valid date" }, { status: 400 });
  }

  if (periodEndDate <= new Date()) {
    return NextResponse.json({ error: "periodEnd must be a future date" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await prisma.subscription.findFirst({
    where: { referenceId: userId },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: "active",
        plan,
        billingInterval: plan === "yearly" ? "year" : "month",
        periodStart: now,
        periodEnd: periodEndDate,
        cancelAtPeriodEnd: false,
        endedAt: null,
        canceledAt: null,
        cancelAt: null,
        invoiceRef: invoiceRef.trim(),
        renewalNotes: renewalNotes?.trim() || null,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Subscription for ${targetUser.email} renewed until ${periodEndDate.toDateString()}.`,
      subscriptionId: existing.id,
    });
  }

  const created = await prisma.subscription.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      referenceId: userId,
      plan,
      billingInterval: plan === "yearly" ? "year" : "month",
      status: "active",
      periodStart: now,
      periodEnd: periodEndDate,
      invoiceRef: invoiceRef.trim(),
      renewalNotes: renewalNotes?.trim() || null,
    },
  });

  return NextResponse.json({
    ok: true,
    message: `Manual subscription created for ${targetUser.email}.`,
    subscriptionId: created.id,
  });
}
