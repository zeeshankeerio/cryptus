/**
 * Alert History API - Tasks 11.1, 11.3, 11.5, 11.7, 11.9
 * GET /api/alerts/history - filtered, paginated alert history
 * GET /api/alerts/history?export=csv - CSV export
 * GET /api/alerts/history?stats=1 - statistics
 * DELETE /api/alerts/history - bulk delete
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

const PAGE_SIZE = 50;

// ── GET /api/alerts/history ───────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);

    // ── Statistics mode (Requirement 8.5) ──
    if (searchParams.get('stats') === '1') {
      return getStatistics(userId);
    }

    // ── Build filter (Requirements 8.1, 8.2) ──
    const symbol = searchParams.get('symbol') ?? undefined;
    const exchange = searchParams.get('exchange') ?? undefined;
    const timeframe = searchParams.get('timeframe') ?? undefined;
    const type = searchParams.get('type') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const dateFrom = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
    const dateTo = searchParams.get('to') ? new Date(searchParams.get('to')!) : undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

    const where: any = { userId };
    if (symbol) where.symbol = symbol;
    if (exchange) where.exchange = exchange;
    if (timeframe) where.timeframe = timeframe;
    if (type) where.type = type;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }
    // Full-text search across symbol and type (Requirement 8.2)
    if (search) {
      where.OR = [
        { symbol: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
        { timeframe: { contains: search, mode: 'insensitive' } },
        { exchange: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ── CSV export mode (Requirement 8.4) ──
    if (searchParams.get('export') === 'csv') {
      const all = await prisma.alertLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // cap at 10k for CSV
      });
      const csv = buildCsv(all);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="alerts-${Date.now()}.csv"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      });
    }

    // ── Paginated results (Requirement 8.3) ──
    const [total, alerts] = await Promise.all([
      prisma.alertLog.count({ where }),
      prisma.alertLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return NextResponse.json({
      data: alerts,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[alerts-history-api] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── DELETE /api/alerts/history - bulk delete (Requirement 8.6) ───────────────
export async function DELETE(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const ids: string[] = body.ids ?? [];

    if (ids.length > 0) {
      // Delete specific IDs
      const result = await prisma.alertLog.deleteMany({
        where: { id: { in: ids }, userId },
      });
      return NextResponse.json({ deleted: result.count }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      });
    } else {
      // Delete all (clear history)
      const result = await prisma.alertLog.deleteMany({ where: { userId } });
      return NextResponse.json({ deleted: result.count }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      });
    }
  } catch (err) {
    console.error('[alerts-history-api] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── Statistics helper (Requirement 8.5) ──────────────────────────────────────
async function getStatistics(userId: string) {
  const where = { userId };
  const [byType, bySymbol, recent] = await Promise.all([
    prisma.alertLog.groupBy({
      by: ['type'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    }),
    prisma.alertLog.groupBy({
      by: ['symbol'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.alertLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { createdAt: true, symbol: true },
    }),
  ]);

  // Average time between alerts per symbol
  const symbolTimes: Record<string, number[]> = {};
  for (const a of recent) {
    const sym = a.symbol;
    const ts = a.createdAt.getTime();
    if (!symbolTimes[sym]) symbolTimes[sym] = [];
    symbolTimes[sym].push(ts);
  }

  const avgIntervals: Record<string, number> = {};
  for (const [sym, times] of Object.entries(symbolTimes)) {
    if (times.length < 2) continue;
    const sorted = [...times].sort((a, b) => a - b);
    let totalGap = 0;
    for (let i = 1; i < sorted.length; i++) totalGap += sorted[i] - sorted[i - 1];
    avgIntervals[sym] = Math.round(totalGap / (sorted.length - 1) / 1000); // seconds
  }

  return NextResponse.json({
    byType: Object.fromEntries(byType.map(r => [r.type, r._count.id])),
    topSymbols: Object.fromEntries(bySymbol.map(r => [r.symbol, r._count.id])),
    avgIntervalSeconds: avgIntervals,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}

// ── CSV builder (Requirement 8.4) ─────────────────────────────────────────────
function buildCsv(alerts: any[]): string {
  const headers = ['id', 'symbol', 'exchange', 'timeframe', 'type', 'value', 'createdAt'];
  const rows = alerts.map(a => [
    a.id,
    a.symbol,
    a.exchange ?? '',
    a.timeframe,
    a.type,
    a.value,
    a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  return [headers.join(','), ...rows].join('\r\n');
}
