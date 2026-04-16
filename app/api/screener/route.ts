import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';
import { getSessionUser } from '@/lib/api-auth';
import { resolveEntitlementsForUser } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for 500-coin fetches on Vercel
export const preferredRegion = 'fra1'; // Non-US region to avoid Binance/Bybit IP blocks

// ── Accelerated Data Flow Caches — eliminates DB thrashing on high-frequency recalibrations ──
const SESSION_CACHE_TTL = 30_000;
const sessionCache = new Map<string, { data: any; expiresAt: number }>();

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
    
    // ── SMART TECH: Parallel Waterfall ──
    // Instead of waiting for the database session check, we start the heavy market data
    // fetch concurrently. This effectively hides the auth latency from the user.
    const exchange = ['binance', 'bybit', 'bybit-linear'].includes(rawExchange) ? rawExchange : 'binance';
    const smartMode = smart === null ? process.env.SMART_MODE_DEFAULT !== '0' : smart !== '0';
    const rsiPeriod = Math.min(Math.max(Number.isFinite(rawRsiPeriod) ? rawRsiPeriod : 14, 2), 50);
    const prioritySymbols = searchParams.get('prioritySymbols')?.split(',').filter(Boolean) ?? [];

    // Session cache lookup — reduces Prisma load on 5-second pollers
    const sessionId = request.headers.get('cookie') ?? 'anon';
    const cachedSession = sessionCache.get(sessionId);
    const now = Date.now();

    const fetchTask = getScreenerData(rawCount, { smartMode, rsiPeriod, search, prioritySymbols, exchange })
      .catch(err => {
        console.error('[screener-api] Fetch task failed:', err instanceof Error ? err.message : err);
        return { data: [], meta: { total: 0, fetchedAt: Date.now() } as any };
      });

    const authTask = (cachedSession && now < cachedSession.expiresAt) 
      ? Promise.resolve(cachedSession.data) 
      : getSessionUser()
          .then(async ctx => {
            const entitlements = await resolveEntitlementsForUser(ctx.user ?? null);
            const result = { user: ctx.user, entitlements };
            sessionCache.set(sessionId, { data: result, expiresAt: now + SESSION_CACHE_TTL });
            return result;
          })
          .catch(err => {
            console.error('[screener-api] Auth task failed (Fallback to Guest):', err instanceof Error ? err.message : err);
            // Fallback to guest entitlements instead of 502 crash
            return resolveEntitlementsForUser(null).then(ent => ({ user: null, entitlements: ent }));
          });

    const [result, authInfo] = await Promise.all([fetchTask, authTask]);
    const { user, entitlements } = authInfo;

    // ── Business Rule Hardening ──
    // If the trial is expired or login is missing, we still don't 502. 
    // We return a clean 401 or 403 as before.
    if (!user && !entitlements) {
      return NextResponse.json({ error: 'System busy. Please retry.' }, { status: 503 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please login.' }, { status: 401 });
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

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const key = user.id ? `user:${user.id}` : `anon:${ip}`;
    const burstLimit = user.id ? 40 : 12; // Relaxed burst for institutional speed
    const rate = takeRateLimitToken(key, burstLimit);
    
    if (!rate.ok) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } });
    }

    // Truncate result to entitlements if needed
    const count = Math.min(rawCount, entitlements.maxRecords);
    if (result.data.length > count) {
      result.data = result.data.slice(0, count);
    }

    if (result.data.length === 0) {
      return NextResponse.json({ error: 'Upstream timeout', data: [], meta: result.meta }, { status: 503 });
    }

    // Bandwidth optimization: Strip historicalCloses from response unless
    // explicitly requested via ?includeCloses=1 (used by Correlation Heatmap).
    // This saves ~250KB per response for 500-symbol fetches.
    const includeCloses = searchParams.get('includeCloses') === '1';
    if (!includeCloses) {
      for (const entry of result.data) {
        delete (entry as any).historicalCloses;
      }
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Accelerated-Flow': '1',
      },
    });
  } catch (err) {
    console.error('[screener-api] Unhandled error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 502 });
  }
}
