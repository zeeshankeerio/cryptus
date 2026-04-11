/**
 * Alert Template by ID — Task 10.2
 * DELETE and PATCH for individual templates.
 * POST /api/templates/:id/apply — apply template to symbols.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// ── DELETE /api/templates/:id ─────────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await prisma.alertTemplate.deleteMany({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[templates-api] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── PATCH /api/templates/:id ──────────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const template = await prisma.alertTemplate.updateMany({
      where: { id, userId: session.user.id },
      data: {
        name: body.name,
        description: body.description,
        rsi1mPeriod: body.rsi1mPeriod,
        rsi5mPeriod: body.rsi5mPeriod,
        rsi15mPeriod: body.rsi15mPeriod,
        rsi1hPeriod: body.rsi1hPeriod,
        overboughtThreshold: body.overboughtThreshold,
        oversoldThreshold: body.oversoldThreshold,
        alertOn1m: body.alertOn1m,
        alertOn5m: body.alertOn5m,
        alertOn15m: body.alertOn15m,
        alertOn1h: body.alertOn1h,
        priority: body.priority,
        sound: body.sound,
      },
    });

    return NextResponse.json({ updated: template.count });
  } catch (err) {
    console.error('[templates-api] PATCH error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
