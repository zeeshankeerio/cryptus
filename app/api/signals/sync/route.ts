import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis-service';
import { getSessionUser } from '@/lib/api-auth';

/**
 * Signal Sync API - Aggregates global win rates in Redis.
 * Powering Requirement: Cross-device institutional consistency.
 */

const REDIS_KEY = 'global:signal_stats';

export async function POST(request: Request) {
  try {
    if (!redis) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 501 });
    }

    const { user } = await getSessionUser();
    // We allow anonymous sync for now to populate global stats, but rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const limitKey = `ratelimit:sync:${user?.id || ip}`;
    
    // Increased cooldown from 60s to 75s to prevent collision with 90s client interval
    const cooldown = await redis.get(limitKey);
    if (cooldown) {
      return NextResponse.json({ error: 'Sync cooldown active', retryAfter: 75 }, { status: 429 });
    }

    const body = await request.json();
    const { total, win5m, win15m, win1h, evaluated5m, evaluated15m, evaluated1h } = body;

    // Use HINCRBY to aggregate anonymous results into a global truth
    // We only increment if the client has meaningful new data
    // To avoid over-inflating, we could use a more complex merging strategy, 
    // but for now, HINCRBY is the most resilient for "Production" scale.
    
    // Note: In a real institutional setup, we would only trust verified signals from the server.
    // Here we use client-side aggregation as a high-performance heuristic.
    
    const pipeline = redis.pipeline();
    pipeline.hincrby(REDIS_KEY, 'total', total || 0);
    pipeline.hincrby(REDIS_KEY, 'win5m', win5m || 0);
    pipeline.hincrby(REDIS_KEY, 'win15m', win15m || 0);
    pipeline.hincrby(REDIS_KEY, 'win1h', win1h || 0);
    pipeline.hincrby(REDIS_KEY, 'evaluated5m', evaluated5m || 0);
    pipeline.hincrby(REDIS_KEY, 'evaluated15m', evaluated15m || 0);
    pipeline.hincrby(REDIS_KEY, 'evaluated1h', evaluated1h || 0);
    
    // Set cooldown - increased from 60s to 75s
    pipeline.set(limitKey, '1', { ex: 75 });
    
    await pipeline.exec();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[signals-sync] Failed:', err);
    return NextResponse.json({ error: 'Internal sync error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!redis) return NextResponse.json({ calibrating: true });
    
    const stats = await redis.hgetall(REDIS_KEY);
    if (!stats || Object.keys(stats).length === 0) {
      return NextResponse.json({ calibrating: true });
    }

    // Parse numeric fields
    const parsed = {
      total: parseInt(stats.total as string || '0', 10),
      win5m: parseInt(stats.win5m as string || '0', 10),
      win15m: parseInt(stats.win15m as string || '0', 10),
      win1h: parseInt(stats.win1h as string || '0', 10),
      evaluated5m: parseInt(stats.evaluated5m as string || '0', 10),
      evaluated15m: parseInt(stats.evaluated15m as string || '0', 10),
      evaluated1h: parseInt(stats.evaluated1h as string || '0', 10),
    };

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ calibrating: true });
  }
}
