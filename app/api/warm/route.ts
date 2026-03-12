import { NextResponse } from 'next/server';
import { getScreenerData } from '@/lib/screener-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const warmSecret = process.env.WARM_SECRET;
  const cronSecret = process.env.CRON_SECRET;

  // If no secret is configured, keep it open for local/dev convenience.
  if (!warmSecret && !cronSecret) return true;

  const customHeader = request.headers.get('x-warm-secret');
  if (warmSecret && customHeader === warmSecret) return true;

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if ((warmSecret && token === warmSecret) || (cronSecret && token === cronSecret)) {
      return true;
    }
  }

  return false;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const counts = [100, 300, 500];

  for (const count of counts) {
    try {
      await getScreenerData(count, { smartMode: true });
    } catch (err) {
      console.warn(`[warm] failed for count=${count}:`, err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    ok: true,
    warmed: counts,
    durationMs: Date.now() - startedAt,
  });
}
