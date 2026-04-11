/**
 * Apply Template to Symbols — Task 10.2
 * POST /api/templates/:id/apply
 * Body: { symbols: string[], exchange?: string }
 * Requirements: 7.7, 10.3
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const symbols: string[] = body.symbols ?? [];
    const exchange: string = body.exchange ?? 'binance';

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array is required' }, { status: 400 });
    }

    // Fetch the template (must belong to this user)
    const template = await prisma.alertTemplate.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Apply template to all symbols in a single transaction — Requirement 10.3
    const results = await prisma.$transaction(
      symbols.map((symbol) =>
        prisma.coinConfig.upsert({
          where: { userId_symbol: { userId: session.user.id, symbol } },
          update: {
            exchange,
            rsi1mPeriod: template.rsi1mPeriod,
            rsi5mPeriod: template.rsi5mPeriod,
            rsi15mPeriod: template.rsi15mPeriod,
            rsi1hPeriod: template.rsi1hPeriod,
            overboughtThreshold: template.overboughtThreshold,
            oversoldThreshold: template.oversoldThreshold,
            alertOn1m: template.alertOn1m,
            alertOn5m: template.alertOn5m,
            alertOn15m: template.alertOn15m,
            alertOn1h: template.alertOn1h,
            priority: template.priority,
            sound: template.sound,
          },
          create: {
            userId: session.user.id,
            symbol,
            exchange,
            rsi1mPeriod: template.rsi1mPeriod,
            rsi5mPeriod: template.rsi5mPeriod,
            rsi15mPeriod: template.rsi15mPeriod,
            rsi1hPeriod: template.rsi1hPeriod,
            overboughtThreshold: template.overboughtThreshold,
            oversoldThreshold: template.oversoldThreshold,
            alertOn1m: template.alertOn1m,
            alertOn5m: template.alertOn5m,
            alertOn15m: template.alertOn15m,
            alertOn1h: template.alertOn1h,
            priority: template.priority,
            sound: template.sound,
          },
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      applied: results.length,
      templateName: template.name,
    });
  } catch (err) {
    console.error('[templates-api] apply error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
