import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/api-auth";

export async function GET() {
  const ctx = await requireOwner();
  if (ctx.error) return ctx.error;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        banned: true,
        banReason: true,
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            plan: true,
            periodEnd: true,
            invoiceRef: true,
            renewalNotes: true,
            stripeSubscriptionId: true,
            updatedAt: true,
          },
        },
      },
    });

    const data = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      banned: user.banned,
      banReason: user.banReason,
      subscription: user.subscriptions[0] || null,
    }));

    return NextResponse.json({ users: data, total: data.length });
  } catch (error: any) {
    if (error?.code !== "P2021") throw error;

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        banned: true,
        banReason: true,
      },
    });

    const data = users.map((user) => ({
      ...user,
      subscription: null,
    }));

    return NextResponse.json({
      users: data,
      total: data.length,
      warning: "Subscription table missing. Run migrations to enable subscription visibility.",
    });
  }
}
