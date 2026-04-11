import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api-auth";
import { resolveEntitlementsForUser } from "@/lib/entitlements";

export async function GET() {
  const ctx = await getSessionUser();
  const entitlements = await resolveEntitlementsForUser(ctx.user ?? null);

  return NextResponse.json({
    entitlements,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}
