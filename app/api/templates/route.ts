/**
 * Alert Templates API - Task 10.2
 * CRUD operations for alert configuration templates.
 * Requirements: 7.6, 7.7
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// ── GET /api/templates - list all templates for the user ──────────────────────
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const templates = await prisma.alertTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(templates);
  } catch (err) {
    console.error('[templates-api] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ── POST /api/templates - create a new template ───────────────────────────────
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const template = await prisma.alertTemplate.create({
      data: {
        userId: session.user.id,
        name: body.name,
        description: body.description ?? null,
        rsi1mPeriod: body.rsi1mPeriod ?? 14,
        rsi5mPeriod: body.rsi5mPeriod ?? 14,
        rsi15mPeriod: body.rsi15mPeriod ?? 14,
        rsi1hPeriod: body.rsi1hPeriod ?? 14,
        overboughtThreshold: body.overboughtThreshold ?? 70,
        oversoldThreshold: body.oversoldThreshold ?? 30,
        alertOn1m: body.alertOn1m ?? false,
        alertOn5m: body.alertOn5m ?? false,
        alertOn15m: body.alertOn15m ?? false,
        alertOn1h: body.alertOn1h ?? false,
        priority: body.priority ?? 'medium',
        sound: body.sound ?? 'default',
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error('[templates-api] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
