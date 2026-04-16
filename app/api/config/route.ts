import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { resolveEntitlementsForUser } from '@/lib/entitlements';
import { getAllCoinConfigs, updateCoinConfig } from '@/lib/coin-config';
import { invalidateSymbolCache } from '@/lib/screener-service';

const ALERT_FIELDS = [
  'alertOn1m',
  'alertOn5m',
  'alertOn15m',
  'alertOn1h',
  'alertOnCustom',
  'alertConfluence',
  'alertOnStrategyShift',
  'alertOnLongCandle',
  'alertOnVolumeSpike',
] as const;

const CUSTOM_SETTING_FIELDS = [
  'rsi1mPeriod',
  'rsi5mPeriod',
  'rsi15mPeriod',
  'rsi1hPeriod',
  'overboughtThreshold',
  'oversoldThreshold',
  'longCandleThreshold',
  'volumeSpikeThreshold',
  'priority',
  'sound',
  'quietHoursEnabled',
  'quietHoursStart',
  'quietHoursEnd',
] as const;

// GAP-F1 FIX: GET now requires authentication
export async function GET(request: Request) {
  try {
    const { user } = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const configs = await getAllCoinConfigs(user.id);
    return NextResponse.json(Object.fromEntries(configs), {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[config-api] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user: sessionUser } = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlements = await resolveEntitlementsForUser(user);

    const body = await request.json();
    if (!body.symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const requestedAlertEnable = ALERT_FIELDS.some((field) => body[field] === true);
    if (!entitlements.features.enableAlerts && requestedAlertEnable) {
      return NextResponse.json(
        {
          error: 'Upgrade required to enable alerts.',
          errorCode: 'UPGRADE_REQUIRED_FEATURE',
          feature: 'alerts',
          entitlements,
        },
        { status: 403 },
      );
    }

    const hasCustomSettingMutation = CUSTOM_SETTING_FIELDS.some(
      (field) => Object.prototype.hasOwnProperty.call(body, field),
    );
    if (!entitlements.features.enableCustomSettings && hasCustomSettingMutation) {
      return NextResponse.json(
        {
          error: 'Upgrade required to edit custom settings.',
          errorCode: 'UPGRADE_REQUIRED_FEATURE',
          feature: 'custom-settings',
          entitlements,
        },
        { status: 403 },
      );
    }

    // Server-side enforcement: never persist enabled alerts for tiers without alert access.
    if (!entitlements.features.enableAlerts) {
      for (const field of ALERT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          body[field] = false;
        }
      }
    }

    // Inject authenticated userId and current exchange
    const updated = await updateCoinConfig({
      ...body,
      userId: sessionUser.id,
    });

    // Invalidate caches so the next fetch uses the fresh config
    invalidateSymbolCache(body.symbol);

    return NextResponse.json(updated, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[config-api] POST error:', err);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
