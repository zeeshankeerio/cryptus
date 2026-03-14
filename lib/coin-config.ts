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
    return await prisma.coinConfig.upsert({
      where: { symbol: config.symbol },
      update: config,
      create: {
        symbol: config.symbol,
        rsi1mPeriod: config.rsi1mPeriod ?? 14,
        rsi5mPeriod: config.rsi5mPeriod ?? 14,
        rsi15mPeriod: config.rsi15mPeriod ?? 14,
        rsi1hPeriod: config.rsi1hPeriod ?? 14,
        overboughtThreshold: config.overboughtThreshold ?? 70,
        oversoldThreshold: config.oversoldThreshold ?? 30,
        alertOn1m: config.alertOn1m ?? false,
        alertOn5m: config.alertOn5m ?? false,
        alertOn15m: config.alertOn15m ?? false,
        alertOn1h: config.alertOn1h ?? false,
        alertOnCustom: config.alertOnCustom ?? false,
        alertConfluence: config.alertConfluence ?? false,
        alertOnStrategyShift: config.alertOnStrategyShift ?? false,
      },
    });
  } catch (err) {
    console.error(`[coin-config] Failed to update config for ${config.symbol}:`, err);
    throw err;
  }
}
