import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for 500-coin fetches on Vercel

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = Math.min(
      Math.max(parseInt(searchParams.get('count') ?? '100', 10) || 100, 10),
      500,
    );

    const result = await getScreenerData(count);
    // Aggressive CDN caching — stale-first logic on the server already
    // returns cached data instantly, so the CDN layer adds a second shield.
    const sMaxAge = count >= 300 ? 15 : 8;
    const swr = count >= 300 ? 120 : 60;

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
      },
    });
  } catch (err) {
    console.error('Screener API error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch screener data' },
      { status: 502 },
    );
  }
}
