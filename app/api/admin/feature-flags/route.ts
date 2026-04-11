import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/api-auth";
import { getFeatureFlags, updateFeatureFlags } from "@/lib/feature-flags";

const featureFlagsSchema = z.object({
  maxTrialRecords: z.number().int().min(50).max(500).optional(),
  maxSubscribedRecords: z.number().int().min(100).max(1000).optional(),
  allowTrialAlerts: z.boolean().optional(),
  allowTrialAdvancedIndicators: z.boolean().optional(),
  allowTrialCustomSettings: z.boolean().optional(),
});

export async function GET() {
  const ctx = await requireOwner();
  if (ctx.error) return ctx.error;

  const flags = await getFeatureFlags();
  return NextResponse.json({ flags });
}

export async function POST(request: Request) {
  const ctx = await requireOwner();
  if (ctx.error) return ctx.error;

  const payload = await request.json().catch(() => null);
  const parsed = featureFlagsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feature flag payload." }, { status: 400 });
  }

  const flags = await updateFeatureFlags(parsed.data);
  return NextResponse.json({ ok: true, flags });
}
