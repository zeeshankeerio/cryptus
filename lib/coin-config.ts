import { prisma } from './prisma';

export interface CoinConfig {
  symbol: string;
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
}

export async function getAllCoinConfigs(): Promise<Map<string, CoinConfig>> {
  try {
    const configs = await prisma.coinConfig.findMany();
    const map = new Map<string, CoinConfig>();
    for (const c of configs) {
      map.set(c.symbol, c);
    }
    return map;
  } catch (err) {
    console.error('[coin-config] Failed to fetch configs:', err);
    return new Map();
  }
}

export async function getCoinConfig(symbol: string): Promise<CoinConfig | null> {
  try {
    return await prisma.coinConfig.findUnique({
      where: { symbol },
    });
  } catch (err) {
    console.error(`[coin-config] Failed to fetch config for ${symbol}:`, err);
    return null;
  }
}

export async function updateCoinConfig(config: Partial<CoinConfig> & { symbol: string }) {
  try {
    // 2026 Resilience: Explicitly map fields to prevent crashes from UI-only state (like alertPush247)
    const data = {
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
    };

    return await prisma.coinConfig.upsert({
      where: { symbol: config.symbol },
      update: data,
      create: {
        symbol: config.symbol,
        ...data,
      },
    });
  } catch (err) {
    console.error(`[coin-config] Failed to update config for ${config.symbol}:`, err);
    throw err;
  }
}
