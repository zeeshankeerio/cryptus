import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';
import { getSessionUser } from '@/lib/api-auth';
import { resolveEntitlementsForUser } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for 500-coin fetches on Vercel
export const preferredRegion = 'fra1'; // Non-US region to avoid Binance/Bybit IP blocks

const RATE_LIMIT_WINDOW_MS = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function takeRateLimitToken(key: string, limit: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, retryAfterSec: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return {
    ok: true,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCount = parseInt(searchParams.get('count') ?? '500', 10);
    const rawRsiPeriod = parseInt(searchParams.get('rsiPeriod') ?? '14', 10);
    const smart = searchParams.get('smart');
    const search = searchParams.get('search') ?? undefined;
    const rawExchange = searchParams.get('exchange') ?? 'binance';
    // Validate exchange to prevent arbitrary API calls — only these 3 are supported
    const VALID_EXCHANGES = ['binance', 'bybit', 'bybit-linear'] as const;
    const exchange = VALID_EXCHANGES.includes(rawExchange as any) ? rawExchange : 'binance';
    const smartMode = smart === null ? process.env.SMART_MODE_DEFAULT !== '0' : smart !== '0';
    
    // Resolve user entitlements before allowing heavy record counts.
    const userCtx = await getSessionUser();
    const entitlements = await resolveEntitlementsForUser(userCtx.user ?? null);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const key = userCtx.user?.id ? `user:${userCtx.user.id}` : `anon:${ip}`;
    const burstLimit = userCtx.user?.id ? 30 : 12;
    const rate = takeRateLimitToken(key, burstLimit);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please retry shortly.' },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(rate.retryAfterSec),
          },
        },
      );
    }

    if (rawCount > entitlements.maxRecords) {
      return NextResponse.json(
        {
          error: `Upgrade required for ${rawCount} records. Current plan allows up to ${entitlements.maxRecords}.`,
          errorCode: 'UPGRADE_REQUIRED',
          requestedCount: rawCount,
          entitlements,
        },
        { status: 403 },
      );
    }

    // Sanitize parameters
    const count = Math.min(
      Math.max(Number.isFinite(rawCount) ? rawCount : entitlements.maxRecords, 10),
      Math.max(10, entitlements.maxRecords),
    );
    const prioritySymbols = searchParams.get('prioritySymbols')?.split(',').filter(Boolean) ?? [];
    const rsiPeriod = Math.min(Math.max(Number.isFinite(rawRsiPeriod) ? rawRsiPeriod : 14, 2), 50);

    const result = await getScreenerData(count, { smartMode, rsiPeriod, search, prioritySymbols, exchange });

    // Return 503 if the service returned zero data (upstream failure)
    if (result.data.length === 0) {
      return NextResponse.json(
        { error: 'No data available — upstream API may be temporarily unreachable', data: [], meta: result.meta },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' },
        },
      );
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[screener-api] Unhandled error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 502, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' } },
    );
  }
}
