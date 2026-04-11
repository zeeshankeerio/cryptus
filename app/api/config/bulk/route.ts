/**
 * Bulk Configuration Operations — Task 10.4
 * POST /api/config/bulk
 * Requirements: 10.2, 10.3, 10.5, 10.6
 *
 * Body:
 *   action: 'enable' | 'disable' | 'delete' | 'update'
 *   symbols: string[]
 *   updates?: Partial<CoinConfig>  (for 'update' action)
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { resolveEntitlementsForUser } from '@/lib/entitlements';

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

export interface BulkOperationResult {
  success: boolean;
  action: string;
  processed: number;
  failed: number;
  errors: string[];
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const entitlements = await resolveEntitlementsForUser(user);

    const body = await request.json();
    const { action, symbols, updates } = body as {
      action: 'enable' | 'disable' | 'delete' | 'update';
      symbols: string[];
      updates?: Record<string, any>;
    };

    if (!action || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'action and symbols[] are required' }, { status: 400 });
    }

    if (!entitlements.features.enableAlerts && action === 'enable') {
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

    if (action === 'update' && updates) {
      const hasCustomSettingMutation = CUSTOM_SETTING_FIELDS.some((field) =>
        Object.prototype.hasOwnProperty.call(updates, field),
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

      const requestedAlertEnable = ALERT_FIELDS.some((field) => updates[field] === true);
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
    }

    const userId = session.user.id;
    const errors: string[] = [];
    let processed = 0;

    // ── Execute in a single transaction for atomicity (Requirement 10.2, 10.6) ──
    try {
      await prisma.$transaction(async (tx) => {
        switch (action) {
          case 'enable': {
            // Enable all timeframe alerts for selected symbols
            const result = await tx.coinConfig.updateMany({
              where: { userId, symbol: { in: symbols } },
              data: {
                alertOn1m: true,
                alertOn5m: true,
                alertOn15m: true,
                alertOn1h: true,
              },
            });
            processed = result.count;
            break;
          }

          case 'disable': {
            // Disable all alerts for selected symbols
            const result = await tx.coinConfig.updateMany({
              where: { userId, symbol: { in: symbols } },
              data: {
                alertOn1m: false,
                alertOn5m: false,
                alertOn15m: false,
                alertOn1h: false,
                alertOnCustom: false,
                alertOnStrategyShift: false,
                alertOnLongCandle: false,
                alertOnVolumeSpike: false,
              },
            });
            processed = result.count;
            break;
          }

          case 'delete': {
            // Delete configs for selected symbols
            const result = await tx.coinConfig.deleteMany({
              where: { userId, symbol: { in: symbols } },
            });
            processed = result.count;
            break;
          }

          case 'update': {
            if (!updates || Object.keys(updates).length === 0) {
              throw new Error('updates object is required for update action');
            }
            // Strip any fields that shouldn't be bulk-updated
            const safeUpdates = { ...updates };
            delete safeUpdates.id;
            delete safeUpdates.userId;
            delete safeUpdates.symbol;
            delete safeUpdates.createdAt;

            const result = await tx.coinConfig.updateMany({
              where: { userId, symbol: { in: symbols } },
              data: safeUpdates,
            });
            processed = result.count;
            break;
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      });
    } catch (txErr: any) {
      // Transaction failed — report as partial failure (Requirement 10.6)
      errors.push(txErr.message ?? 'Transaction failed');
      return NextResponse.json({
        success: false,
        action,
        processed: 0,
        failed: symbols.length,
        errors,
      } satisfies BulkOperationResult, {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      });
    }

    return NextResponse.json({
      success: true,
      action,
      processed,
      failed: symbols.length - processed,
      errors,
    } satisfies BulkOperationResult, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    console.error('[bulk-config-api] error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
