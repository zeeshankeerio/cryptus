import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription } = await request.json();
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }

    // Upsert subscription using endpoint as unique key
    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId: session.user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return NextResponse.json({ success: true, id: saved.id }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[push-subscription] POST error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[push-subscription] DELETE error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
