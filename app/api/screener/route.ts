import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for 500-coin fetches on Vercel

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCount = parseInt(searchParams.get('count') ?? '500', 10);
    const rawRsiPeriod = parseInt(searchParams.get('rsiPeriod') ?? '14', 10);
    const smart = searchParams.get('smart');
    const search = searchParams.get('search') ?? undefined;
    const exchange = searchParams.get('exchange') ?? 'binance';
    const smartMode = smart === null ? process.env.SMART_MODE_DEFAULT !== '0' : smart !== '0';
    
    // Sanitize parameters
    const count = Math.min(Math.max(Number.isFinite(rawCount) ? rawCount : 100, 10), 1200);
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

    const sMaxAge = count >= 600 ? 20 : count >= 300 ? 15 : 8;
    const swr = count >= 600 ? 180 : count >= 300 ? 120 : 60;

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
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
