/**
 * Health Check Endpoint - Task 12.6
 * GET /api/health
 * Returns system health status, database connectivity, VAPID status, and metrics.
 * Requirements: 11.6
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVapidStatus } from '@/lib/push-service';
import { metricsCollector } from '@/lib/metrics-collector';

export const dynamic = 'force-dynamic';

async function checkDatabase(): Promise<{ status: 'ok' | 'error'; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'error', latencyMs: Date.now() - start, error: err.message };
  }
}

function checkVapid(): { status: 'ok' | 'error' | 'warning'; initialized: boolean; hasKeys: boolean } {
  const { initialized, hasKeys } = getVapidStatus();
  return {
    status: initialized && hasKeys ? 'ok' : hasKeys ? 'warning' : 'error',
    initialized,
    hasKeys,
  };
}

async function checkActiveSubscriptions(): Promise<{ count: number }> {
  try {
    const count = await prisma.pushSubscription.count();
    return { count };
  } catch {
    return { count: 0 };
  }
}

export async function GET() {
  const [database, subscriptions] = await Promise.all([
    checkDatabase(),
    checkActiveSubscriptions(),
  ]);

  const vapid = checkVapid();
  const metrics = metricsCollector.getMetrics();

  const checks = {
    database,
    vapid,
    subscriptions,
    cache: {
      status: 'ok' as const,
      latencyEntries: metrics.latency,
      cacheHitRate: metrics.cache.hitRate,
    },
  };

  const isHealthy = database.status === 'ok';
  const status = isHealthy ? 'healthy' : 'degraded';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      uptime: metrics.uptime,
      checks,
      metrics: {
        latency: metrics.latency,
        cache: metrics.cache,
        api: metrics.api,
        alerts: metrics.alerts,
        errors: {
          total: metrics.errors.total,
          // Only expose last 5 errors in health check (not full buffer)
          recent: metrics.errors.recent.slice(-5).map(e => ({
            message: e.message,
            timestamp: e.timestamp,
            context: e.context,
          })),
        },
      },
    },
    { status: isHealthy ? 200 : 503 },
  );
}
