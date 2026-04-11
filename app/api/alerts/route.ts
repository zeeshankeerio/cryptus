import { NextResponse } from 'next/server';
import { createAlertLog, getRecentAlerts, clearAlertLogs } from '@/lib/alert-log';
import { auth } from '@/lib/auth';
import { resolveEntitlementsForUser } from '@/lib/entitlements';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const alerts = await getRecentAlerts(session.user.id);
    return NextResponse.json(alerts, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[alerts-api] GET error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlements = await resolveEntitlementsForUser(user);
    if (!entitlements.features.enableAlerts) {
      return NextResponse.json(
        {
          error: 'Upgrade required to create alerts.',
          errorCode: 'UPGRADE_REQUIRED_FEATURE',
          feature: 'alerts',
          entitlements,
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    if (!body.symbol || !body.timeframe || body.value === undefined || !body.type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const alert = await createAlertLog({
      userId: session.user.id,
      symbol: body.symbol,
      exchange: body.exchange,
      timeframe: body.timeframe,
      value: body.value,
      type: body.type,
    });
    return NextResponse.json(alert, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[alerts-api] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await clearAlertLogs(session.user.id);
    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[alerts-api] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
