import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';
import { getSessionUser } from '@/lib/api-auth';
import { resolveEntitlementsForUser } from '@/lib/entitlements';
import type { TradingStyle } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for 500-coin fetches on Vercel
export const preferredRegion = 'fra1'; // Non-US region to avoid Binance/Bybit IP blocks

// ── Accelerated Data Flow Caches - eliminates DB thrashing on high-frequency recalibrations ──
const SESSION_CACHE_TTL = 30_000;
const sessionCache = new Map<string, { data: any; expiresAt: number }>();

const RATE_LIMIT_WINDOW_MS = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

// ── Thundering Herd Prevention ──
// Ensuring that 50 users hitting the API at once only trigger ONE exchange fetch.
const pendingFetches = new Map<string, Promise<any>>();

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
    const tradingStyle = (searchParams.get('tradingStyle') as TradingStyle) || 'intraday';

    // Session cache lookup - reduces Prisma load on 5-second pollers
    const sessionId = request.headers.get('cookie') ?? 'anon';
    const cachedSession = sessionCache.get(sessionId);
    const now = Date.now();

    const fetchKey = `${rawCount}:${rsiPeriod}:${exchange}:${smartMode}:${search}:${tradingStyle}:${prioritySymbols.join(',')}`;
    let fetchTask = pendingFetches.get(fetchKey);

    if (!fetchTask) {
      // ── Institutional Life-Cycle Hardening ──
      // Pass the request signal directly to the service. If the user disconnects or 
      // the request times out, all upstream kline fetches are immediately aborted.
      const screenerPromise = getScreenerData(rawCount, { 
        smartMode, rsiPeriod, search, prioritySymbols, exchange, tradingStyle 
      }, request.signal);
      
      fetchTask = screenerPromise
        .finally(() => {
          pendingFetches.delete(fetchKey);
        })
        .catch(err => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[screener-api] Fetch task failed (${exchange}):`, errMsg);
          return { data: [], meta: { total: 0, fetchedAt: Date.now() } as any };
        });
        
      pendingFetches.set(fetchKey, fetchTask);
    }

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
    // GUEST ACCESS: Allow unauthorized users to see a limited preview (Top 20)
    // This powers viral social sharing and public symbol pages.
    const isGuestQuery = !user && rawCount <= 20;

    if (!user && !isGuestQuery) {
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
    const key = user?.id ? `user:${user.id}` : `anon:${ip}`;
    const burstLimit = user?.id ? 40 : 12; // Relaxed burst for institutional speed
    const rate = takeRateLimitToken(key, burstLimit);
    
    if (!rate.ok) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } });
    }

    // Truncate result to entitlements if needed
    const count = Math.min(rawCount, entitlements.maxRecords);
    if (result.data.length > count) {
      result.data = result.data.slice(0, count);
    }

    // ── Partial Data Awareness ──
    // Instead of failing with 503, we return what we have (even if ticker-only).
    // The UI should display a "warming up" status based on indicatorCoveragePct.
    if (result.data.length === 0) {
      console.warn(`[screener-api] Returning empty set for ${exchange} (Upstream Unavailable)`);
    }

    // ── Bandwidth & Heatmap Optimization ──
    const includeCloses = searchParams.get('includeCloses') === '1';
    if (!includeCloses) {
      for (const entry of result.data) {
        if ('historicalCloses' in entry) {
          delete (entry as Record<string, unknown>).historicalCloses;
        }
      }
    }

    // ── Data Sanitization: ensure numeric fields are finite ──
    // Prevents NaN/Infinity from reaching the worker and corrupting RSI state
    for (const entry of result.data) {
      if (!Number.isFinite(entry.price) || entry.price <= 0) entry.price = 0;
      if (!Number.isFinite(entry.change24h)) entry.change24h = 0;
      if (!Number.isFinite(entry.volume24h)) entry.volume24h = 0;
      if (entry.rsi1m !== null && !Number.isFinite(entry.rsi1m)) entry.rsi1m = null;
      if (entry.rsi5m !== null && !Number.isFinite(entry.rsi5m)) entry.rsi5m = null;
      if (entry.rsi15m !== null && !Number.isFinite(entry.rsi15m)) entry.rsi15m = null;
      if (entry.rsi1h !== null && !Number.isFinite(entry.rsi1h)) entry.rsi1h = null;
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Accelerated-Flow': '1',
        'X-Auth-Mode': 'isFastPath' in authInfo ? 'fast-path' : 'secure-fallback',
      },
    });
  } catch (err) {
    console.error('[screener-api] Unhandled error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 502 });
  }
}
