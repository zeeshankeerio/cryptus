import { prisma } from './prisma';

export interface CoinConfig {
  id?: string;
  userId: string;
  symbol: string;
  exchange: string;
  rsi1mPeriod: number;
  rsi5mPeriod: number;
  rsi15mPeriod: number;
  rsi1hPeriod: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  alertOn1m: boolean;
  alertOn5m: boolean;
  alertOn15m: boolean;
  alertOn1h: boolean;
  alertOnCustom: boolean;
  alertConfluence: boolean;
  alertOnStrategyShift: boolean;
  alertOnLongCandle: boolean;
  alertOnVolumeSpike: boolean;
  longCandleThreshold: number;
  volumeSpikeThreshold: number;
  priority: string;
  sound: string;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

/**
 * Task 14.1: Normalize a raw DB config to ensure all new fields have sensible defaults.
 * Handles legacy rows that predate the priority/sound/quietHours columns.
 * Requirement: 14.2
 */
export function normalizeCoinConfig(raw: any): CoinConfig {
  return {
    id: raw.id,
    userId: raw.userId ?? '',
    symbol: raw.symbol ?? '',
    exchange: raw.exchange ?? 'binance',
    rsi1mPeriod: raw.rsi1mPeriod ?? 14,
    rsi5mPeriod: raw.rsi5mPeriod ?? 14,
    rsi15mPeriod: raw.rsi15mPeriod ?? 14,
    rsi1hPeriod: raw.rsi1hPeriod ?? 14,
    overboughtThreshold: raw.overboughtThreshold ?? 70,
    oversoldThreshold: raw.oversoldThreshold ?? 30,
    alertOn1m: raw.alertOn1m ?? false,
    alertOn5m: raw.alertOn5m ?? false,
    alertOn15m: raw.alertOn15m ?? false,
    alertOn1h: raw.alertOn1h ?? false,
    alertOnCustom: raw.alertOnCustom ?? false,
    alertConfluence: raw.alertConfluence ?? false,
    alertOnStrategyShift: raw.alertOnStrategyShift ?? false,
    alertOnLongCandle: raw.alertOnLongCandle ?? false,
    alertOnVolumeSpike: raw.alertOnVolumeSpike ?? false,
    longCandleThreshold: raw.longCandleThreshold ?? 5.0,
    volumeSpikeThreshold: raw.volumeSpikeThreshold ?? 5.0,
    // Task 14.1: New fields - default gracefully for legacy rows
    priority: raw.priority ?? 'medium',
    sound: raw.sound ?? 'default',
    quietHoursEnabled: raw.quietHoursEnabled ?? false,
    quietHoursStart: raw.quietHoursStart ?? 22,
    quietHoursEnd: raw.quietHoursEnd ?? 8,
  };
}

/**
 * Get all coin configs for a specific user.
 * Falls back to all configs (single-tenant compat) if userId is not provided.
 */
export async function getAllCoinConfigs(userId?: string): Promise<Map<string, CoinConfig>> {
  try {
    const configs = await prisma.coinConfig.findMany({
      where: userId ? { userId } : undefined,
    });
    const map = new Map<string, CoinConfig>();
    for (const c of configs) {
      map.set(c.symbol, c as CoinConfig);
    }
    return map;
  } catch (err) {
    console.error('[coin-config] Failed to fetch configs:', err);
    return new Map();
  }
}

export async function getCoinConfig(symbol: string, userId?: string): Promise<CoinConfig | null> {
  try {
    if (userId) {
      return await prisma.coinConfig.findUnique({
        where: { userId_symbol: { userId, symbol } },
      }) as CoinConfig | null;
    }
    // Single-tenant fallback: find first matching symbol
    return await prisma.coinConfig.findFirst({
      where: { symbol },
    }) as CoinConfig | null;
  } catch (err) {
    console.error(`[coin-config] Failed to fetch config for ${symbol}:`, err);
    return null;
  }
}

export async function updateCoinConfig(config: Partial<CoinConfig> & { symbol: string; userId: string }) {
  try {
    const data = {
      exchange: config.exchange ?? 'binance',
      rsi1mPeriod: config.rsi1mPeriod,
      rsi5mPeriod: config.rsi5mPeriod,
      rsi15mPeriod: config.rsi15mPeriod,
      rsi1hPeriod: config.rsi1hPeriod,
      overboughtThreshold: config.overboughtThreshold,
      oversoldThreshold: config.oversoldThreshold,
      alertOn1m: config.alertOn1m,
      alertOn5m: config.alertOn5m,
      alertOn15m: config.alertOn15m,
      alertOn1h: config.alertOn1h,
      alertOnCustom: config.alertOnCustom,
      alertConfluence: config.alertConfluence,
      alertOnStrategyShift: config.alertOnStrategyShift,
      alertOnLongCandle: config.alertOnLongCandle,
      alertOnVolumeSpike: config.alertOnVolumeSpike,
      longCandleThreshold: config.longCandleThreshold,
      volumeSpikeThreshold: config.volumeSpikeThreshold,
      priority: config.priority ?? 'medium',
      sound: config.sound ?? 'default',
      quietHoursEnabled: config.quietHoursEnabled ?? false,
      quietHoursStart: config.quietHoursStart ?? 22,
      quietHoursEnd: config.quietHoursEnd ?? 8,
    };

    return await prisma.coinConfig.upsert({
      where: { userId_symbol: { userId: config.userId, symbol: config.symbol } },
      update: data,
      create: {
        userId: config.userId,
        symbol: config.symbol,
        ...data,
      },
    });
  } catch (err) {
    console.error(`[coin-config] Failed to update config for ${config.symbol}:`, err);
    throw err;
  }
}
