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
