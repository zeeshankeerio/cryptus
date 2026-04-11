import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  banned: z.boolean(),
  reason: z.string().trim().max(250).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireOwner();
  if (ctx.error) return ctx.error;

  const { userId } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = statusSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  if (ctx.user?.id === userId && parsed.data.banned) {
    return NextResponse.json({ error: "You cannot suspend your own owner account." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      banned: parsed.data.banned,
      banReason: parsed.data.banned ? parsed.data.reason || "Suspended by owner" : null,
      banExpires: null,
    },
    select: {
      id: true,
      banned: true,
      banReason: true,
    },
  });

  return NextResponse.json({
    ok: true,
    user: updated,
  });
}
