import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getScreenerData } from '@/lib/screener-service';
import { sendPushNotificationWithRetry } from '@/lib/push-service';
import { getSymbolAlias } from '@/lib/symbol-utils';
import type { ScreenerEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minute max for deeper scans

// ⚠️ DEPRECATED: This route is no longer used for automatic alerts
// Alerts are now handled 100% client-side via ticker-worker.js for Vercel Free compatibility
// This endpoint remains available for manual testing only
//
// To test manually: POST /api/cron/check-alerts with Authorization: Bearer <CRON_SECRET>

// ── Zone-state persistence across cron invocations ──
// In-memory Map survives across invocations on the same serverless instance.
// On cold starts, we fall back to DB-based cooldown to avoid re-fire.
const zoneStateCache = new Map<string, string>(); // key: userId:symbol-timeframe → zone

/**
 * Dynamic hysteresis: prevents rapid zone-flipping when thresholds are close.
 * Mirrors the exact same logic in use-alert-engine.ts and ticker-worker.js.
 */
function computeHysteresis(overboughtThreshold: number, oversoldThreshold: number): number {
  const gap = Math.max(0, overboughtThreshold - oversoldThreshold);
  return Math.max(2, gap * 0.15);
}

/**
 * Determine RSI zone with hysteresis — matches the foreground/worker evaluator exactly.
 */
function getZoneWithHysteresis(
  val: number | null,
  obT: number,
  osT: number,
  previousZone: string | undefined,
): 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT' {
  if (val === null || val === undefined) return 'NEUTRAL';
  
  const isInverted = obT < osT;
  const hysteresis = computeHysteresis(obT, osT);
  const NEAR_BUFFER = 0.3;
  
  if (previousZone === 'OVERSOLD') {
    return isInverted
      ? (val < osT - hysteresis ? 'NEUTRAL' : 'OVERSOLD')
      : (val > osT + hysteresis ? 'NEUTRAL' : 'OVERSOLD');
  } else if (previousZone === 'OVERBOUGHT') {
    return isInverted
      ? (val > obT + hysteresis ? 'NEUTRAL' : 'OVERBOUGHT')
      : (val < obT - hysteresis ? 'NEUTRAL' : 'OVERBOUGHT');
  } else {
    // NEUTRAL or first-seen
    if (isInverted) {
      if (val >= osT - NEAR_BUFFER) return 'OVERSOLD';
      if (val <= obT + NEAR_BUFFER) return 'OVERBOUGHT';
    } else {
      if (val <= osT + NEAR_BUFFER) return 'OVERSOLD';
      if (val >= obT - NEAR_BUFFER) return 'OVERBOUGHT';
    }
  }
  return 'NEUTRAL';
}

// VERCEL CRON: Vercel automatically calls GET for cron jobs
export async function GET(request: Request) {
  return handleCronRequest(request);
}

// Support POST for manual triggers and external schedulers
export async function POST(request: Request) {
  return handleCronRequest(request);
}

async function handleCronRequest(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[cron-alerts:${requestId}] Starting background check...`);

  try {
    // 1. Authenticate the Cron request
    // Vercel Cron sends Authorization header automatically
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // For Vercel Cron, the auth header format is: Bearer <CRON_SECRET>
    // For external schedulers, require explicit Bearer token
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn(`[cron-alerts:${requestId}] Unauthorized attempt.`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const hasVapid = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
    console.log(`[cron-alerts:${requestId}] VAPID keys present: ${hasVapid}`);

    // 2. Fetch all alert-enabled coin configurations (grouped by userId)
    const configs = await prisma.coinConfig.findMany({
      where: {
        OR: [
          { alertOn1m: true },
          { alertOn5m: true },
          { alertOn15m: true },
          { alertOn1h: true },
          { alertOnCustom: true },
          { alertConfluence: true },
          { alertOnStrategyShift: true },
        ],
      },
    });

    console.log(`[cron-alerts:${requestId}] Active configurations: ${configs.length}`);
    if (configs.length === 0) {
      return NextResponse.json({ success: true, message: 'No active alerts to monitor.' });
    }

    // 3. Group configs by exchange for exchange-aware scanning
    const configsByExchange = new Map<string, typeof configs>();
    for (const config of configs) {
      const exchange = (config as any).exchange || 'binance';
      const list = configsByExchange.get(exchange) || [];
      list.push(config);
      configsByExchange.set(exchange, list);
    }

    // 4. Fetch 3-minute cooldown and latest zone states from DB (consistent across cold starts)
    const THREE_MINUTES_AGO = new Date(Date.now() - 3 * 60 * 1000);
    const recentAlerts = await prisma.alertLog.findMany({
      where: { createdAt: { gte: THREE_MINUTES_AGO } }
    });
    const cooldownMap = new Map<string, boolean>();
    recentAlerts.forEach(a => {
      const uid = a.userId || 'global';
      cooldownMap.set(`${a.symbol}-${a.timeframe}`, true);
      cooldownMap.set(`${uid}:${a.symbol}-${a.timeframe}`, true);
      if (a.exchange && a.type) {
        cooldownMap.set(`${a.symbol}:${a.exchange}:${a.timeframe}:${a.type}`, true);
        cooldownMap.set(`${uid}:${a.symbol}:${a.exchange}:${a.timeframe}:${a.type}`, true);
      }
    });

    // Task 16.1: Cold-start recovery. Fetch the single absolute latest alert for each symbol 
    // to populate the transition cache if it's currently empty.
    const latestAlertsAcrossTime = await prisma.alertLog.findMany({
      where: {
        symbol: { in: configs.map(c => c.symbol) },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['symbol', 'timeframe', 'type'], // Get latest of each type
      take: configs.length * 5, // Approximate coverage for all timeframes
    });

    latestAlertsAcrossTime.forEach(a => {
      const uid = a.userId || 'global';
      const stateKey = `${uid}:${a.symbol}-${a.timeframe}`;
      if (!zoneStateCache.has(stateKey)) {
        // Only prime the cache if we don't have a fresher in-memory state
        zoneStateCache.set(stateKey, a.type);
      }
    });

    console.log(`[cron-alerts:${requestId}] Recent alerts in cooldown: ${recentAlerts.length}, Cache primed from DB: ${latestAlertsAcrossTime.length}`);

    const triggeredAlerts: any[] = [];

    // 5. Scan each exchange independently
    for (const [exchange, exchangeConfigs] of configsByExchange) {
      const alertSymbols = exchangeConfigs.map(c => c.symbol);
      
      console.log(`[cron-alerts:${requestId}] Fetching data for ${exchange}: ${alertSymbols.length} symbols`);
      
      let screenerResponse;
      try {
        screenerResponse = await getScreenerData(500, {
          smartMode: false,
          prioritySymbols: alertSymbols,
          exchange,
        });
      } catch (err) {
        console.error(`[cron-alerts:${requestId}] Failed to fetch ${exchange} data:`, err);
        continue; // Skip this exchange, try others
      }

      const dataMap = new Map<string, ScreenerEntry>(
        screenerResponse.data.map((d: ScreenerEntry) => [d.symbol, d])
      );

      // 6. Evaluate each config with proper hysteresis
      for (const config of exchangeConfigs) {
        const entry = dataMap.get(config.symbol);
        if (!entry) continue;

        const userId = (config as any).userId || 'global';
        const alias = getSymbolAlias(config.symbol);
        const obT = config.overboughtThreshold;
        const osT = config.oversoldThreshold;

        // GAP-B2 FIX: Timeframe labels now match foreground/worker convention exactly
        const timeframes = [
          { label: '1m', val: entry.rsi1m, enabled: config.alertOn1m },
          { label: '5m', val: entry.rsi5m, enabled: config.alertOn5m },
          { label: '15m', val: entry.rsi15m, enabled: config.alertOn15m },
          { label: '1h', val: entry.rsi1h, enabled: config.alertOn1h },
          { label: 'Custom', val: entry.rsiCustom, enabled: config.alertOnCustom },
        ];

        // GAP-A2 FIX: Zone-state tracking with hysteresis (matches foreground evaluator)
        const currentZones = new Map<string, 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT'>();
        for (const tf of timeframes) {
          if (!tf.enabled || tf.val === null) continue;
          const stateKey = `${userId}:${config.symbol}-${tf.label}`;
          const previousZone = zoneStateCache.get(stateKey);
          const zone = getZoneWithHysteresis(tf.val, obT, osT, previousZone);
          currentZones.set(tf.label, zone);
        }

        const triggered: any[] = [];
        
        for (const tf of timeframes) {
          if (!tf.enabled) continue;
          const zone = currentZones.get(tf.label);
          if (!zone || zone === 'NEUTRAL') {
            const stateKey = `${userId}:${config.symbol}-${tf.label}`;
            zoneStateCache.set(stateKey, 'NEUTRAL');
            continue;
          }

          const stateKey = `${userId}:${config.symbol}-${tf.label}`;
          const previousZone = zoneStateCache.get(stateKey);
          
          // Only alert on TRANSITION into a zone (not on staying in zone)
          const isFirstSeen = previousZone === undefined || previousZone === 'NEUTRAL';
          
          if (isFirstSeen) {
            // Check Cooldown (uses normalized labels now — matches foreground)
            const cooldownKey = `${config.symbol}-${tf.label}`;
            const tenantCooldownKey = `${userId}:${config.symbol}-${tf.label}`;
            if (cooldownMap.has(tenantCooldownKey) || cooldownMap.has(cooldownKey)) {
              zoneStateCache.set(stateKey, zone);
              continue;
            }

            // Check Confluence if required
            if (config.alertConfluence) {
              const hasOtherInZone = timeframes.some(other =>
                other.label !== tf.label && other.enabled && currentZones.get(other.label) === zone
              );
              if (!hasOtherInZone) {
                zoneStateCache.set(stateKey, zone);
                continue;
              }
            }

            triggered.push({
              type: zone,
              timeframe: tf.label,
              value: tf.val,
            });
          }
          zoneStateCache.set(stateKey, zone);
        }

        // Strategy Shift detection
        if (config.alertOnStrategyShift &&
          (entry.strategySignal === 'strong-buy' || entry.strategySignal === 'strong-sell')) {
          const stratKey = `${userId}:${config.symbol}-STRAT`;
          const prevStrat = zoneStateCache.get(stratKey);
          const currentStrat = entry.strategySignal;

          if (prevStrat !== undefined && prevStrat !== currentStrat) {
            const cooldownKey = `${config.symbol}-STRAT`;
            const tenantCooldownKey = `${userId}:${config.symbol}-STRAT`;
            if (!cooldownMap.has(tenantCooldownKey) && !cooldownMap.has(cooldownKey)) {
              triggered.push({
                type: currentStrat === 'strong-buy' ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL',
                timeframe: 'STRATEGY',
                value: entry.strategyScore,
              });
            }
          }
          zoneStateCache.set(stratKey, currentStrat);
        }

        if (triggered.length > 0) {
          triggeredAlerts.push({
            symbol: config.symbol,
            alias,
            exchange,
            userId,
            alerts: triggered,
          });
        }
      }
    }

    console.log(`[cron-alerts:${requestId}] Triggered alerts: ${triggeredAlerts.length}`);

    if (triggeredAlerts.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Scan complete. No new alerts triggered for ${configs.length} configs.`,
        exchanges: Array.from(configsByExchange.keys()),
      });
    }

    // 7. Fetch Subscriptions and Send Pushes (per-user if multi-tenant)
    const subscriptions = await prisma.pushSubscription.findMany();
    console.log(`[cron-alerts:${requestId}] Found ${subscriptions.length} push subscriptions.`);

    let pushCount = 0;
    for (const alertInfo of triggeredAlerts) {
      for (const alert of alertInfo.alerts) {
        const isBuy = alert.type === 'OVERSOLD' || alert.type === 'STRATEGY_STRONG_BUY';
        const typeLabel = isBuy ? 'BUY' : 'SELL';
        const exchangeLabel = alertInfo.exchange.charAt(0).toUpperCase() + alertInfo.exchange.slice(1);
        
        const payload = {
          title: `${alertInfo.alias} ${typeLabel}`,
          body: alert.timeframe === 'STRATEGY'
            ? `[${exchangeLabel}] Strategy score: ${alert.value.toFixed(0)}`
            : `[${exchangeLabel}] ${alert.timeframe} RSI reached ${alert.value.toFixed(1)}`,
          exchange: alertInfo.exchange,
          symbol: alertInfo.symbol,
        };

        // Log to DB for cooldown tracking across invocations
        await prisma.alertLog.create({
          data: {
            userId: alertInfo.userId && alertInfo.userId !== 'global' ? alertInfo.userId : undefined,
            symbol: alertInfo.symbol,
            exchange: alertInfo.exchange,
            timeframe: alert.timeframe,
            value: alert.value,
            type: alert.type,
          }
        });

        // Send push to relevant subscriptions
        // For multi-tenant: filter by userId. For single-tenant: send to all.
        const targetSubs = alertInfo.userId && alertInfo.userId !== 'global'
          ? subscriptions.filter(s => s.userId === alertInfo.userId)
          : subscriptions;

        for (const sub of targetSubs) {
          try {
            const res = await sendPushNotificationWithRetry(sub, payload);
            if (res.success) pushCount++;
            if (res.expired) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            }
          } catch (e) {
            console.error(`[cron-alerts:${requestId}] Individual push error:`, e);
          }
        }
      }
    }

    console.log(`[cron-alerts:${requestId}] Finished. Sent ${pushCount} notifications.`);
    return NextResponse.json({
      success: true,
      triggeredCount: triggeredAlerts.length,
      notificationsSent: pushCount,
      hasVapid,
      exchanges: Array.from(configsByExchange.keys()),
    });

  } catch (err: any) {
    console.error(`[cron-alerts:${requestId}] Fatal error:`, err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
