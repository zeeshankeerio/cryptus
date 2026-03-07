import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = Math.min(
      Math.max(parseInt(searchParams.get('count') ?? '100', 10) || 100, 10),
      500,
    );

    const result = await getScreenerData(count);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 's-maxage=15, stale-while-revalidate=30',
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
