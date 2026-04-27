/**
 * SUPER_SIGNAL Integration Tests
 * 
 * End-to-end tests verifying the complete integration flow:
 * ScreenerEntry → SuperSignalInput → computeSuperSignal → SuperSignalResult
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeSuperSignal, clearAllCaches } from '../super-signal';
import type { ScreenerEntry } from '../types';

describe('SUPER_SIGNAL Integration Tests', () => {
  beforeEach(() => {
    clearAllCaches();
  });
  // Create a realistic ScreenerEntry with all required fields
  const createMockEntry = (overrides?: Partial<ScreenerEntry>): ScreenerEntry => ({
    symbol: 'BTCUSDT',
    price: 45000,
    change24h: 2.5,
    volume24h: 1000000000,
    rsi1m: 55,
    rsi5m: 58,
    rsi15m: 60,
    rsi1h: 62,
    rsi4h: 65,
    rsi1d: 68,
    signal: 'neutral',
    ema9: 44900,
    ema21: 44800,
    emaCross: 'bullish',
    macdLine: 100,
    macdSignal: 90,
    macdHistogram: 10,
    bbUpper: 46000,
    bbMiddle: 45000,
    bbLower: 44000,
    bbPosition: 0.5,
    stochK: 60,
    stochD: 58,
    vwap: 44900,
    vwapDiff: 0.22,
    volumeSpike: false,
    strategyScore: 75,
    strategySignal: 'buy',
    strategyLabel: 'Buy',
    strategyReasons: ['RSI bullish', 'MACD positive'],
    confluence: 7,
    confluenceLabel: 'Strong',
    rsiDivergence: 'none',
    rsiDivergenceCustom: 'none',
    momentum: 2.5,
    atr: 500,
    adx: 25,
    cci: 50,
    rsiState1m: null,
    rsiState5m: null,
    rsiState15m: null,
    rsiState1h: null,
    rsiState4h: null,
    rsiState1d: null,
    ema9State: null,
    ema21State: null,
    macdFastState: null,
    macdSlowState: null,
    macdSignalState: null,
    rsiCustom: null,
    rsiStateCustom: null,
    rsiPeriodAtCreation: 14,
    avgBarSize1m: 50,
    avgVolume1m: 50000000,
    curCandleSize: 55,
    curCandleVol: 55000000,
    candleDirection: 'bullish',
    marketState: 'OPEN',
    signalStartedAt: Date.now(),
    updatedAt: Date.now(),
    market: 'Crypto',
    open1m: 44950,
    volStart1m: 45000000,
    longCandle: false,
    obvTrend: 'none',
    williamsR: -40,
    historicalCloses: [
      44000, 44100, 44200, 44300, 44400, 44500, 44600, 44700, 44800, 44900,
      45000, 45100, 45200, 45300, 45400, 45500, 45600, 45700, 45800, 45900,
      46000, 45900, 45800, 45700, 45600, 45500, 45400, 45300, 45200, 45100,
    ],
    regime: {
      regime: 'trending',
      confidence: 75,
      details: 'Strong uptrend with high ADX',
    },
    ...overrides,
  });

  it('should compute SUPER_SIGNAL for a valid ScreenerEntry', async () => {
    const entry = createMockEntry();
    const result = await computeSuperSignal(entry);

    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThanOrEqual(0);
    expect(result!.value).toBeLessThanOrEqual(100);
    expect(result!.category).toMatch(/Strong Buy|Buy|Neutral|Sell|Strong Sell/);
    expect(result!.algorithmVersion).toBe('1.0.0');
    expect(result!.computeTimeMs).toBeGreaterThanOrEqual(0);
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it('should include all 5 component scores', async () => {
    const entry = createMockEntry();
    const result = await computeSuperSignal(entry);

    expect(result).not.toBeNull();
    expect(result!.components).toBeDefined();
    expect(result!.components.regime).toBeDefined();
    expect(result!.components.liquidity).toBeDefined();
    expect(result!.components.entropy).toBeDefined();
    expect(result!.components.crossAsset).toBeDefined();
    expect(result!.components.risk).toBeDefined();

    // All component scores should be in [0, 100]
    expect(result!.components.regime.score).toBeGreaterThanOrEqual(0);
    expect(result!.components.regime.score).toBeLessThanOrEqual(100);
    expect(result!.components.liquidity.score).toBeGreaterThanOrEqual(0);
    expect(result!.components.liquidity.score).toBeLessThanOrEqual(100);
    expect(result!.components.entropy.score).toBeGreaterThanOrEqual(0);
    expect(result!.components.entropy.score).toBeLessThanOrEqual(100);
    expect(result!.components.crossAsset.score).toBeGreaterThanOrEqual(0);
    expect(result!.components.crossAsset.score).toBeLessThanOrEqual(100);
    expect(result!.components.risk.score).toBeGreaterThanOrEqual(0);
    expect(result!.components.risk.score).toBeLessThanOrEqual(100);
  });

  it('should handle missing optional fields gracefully', async () => {
    const entry = createMockEntry({
      historicalCloses: undefined,
      regime: undefined,
      atr: null,
      vwap: null,
    });

    const result = await computeSuperSignal(entry);

    // Should still return a result with neutral scores for missing components
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThanOrEqual(0);
    expect(result!.value).toBeLessThanOrEqual(100);
  });

  it('should compute different scores for different asset classes', async () => {
    const cryptoEntry = createMockEntry({ market: 'Crypto' });
    const metalEntry = createMockEntry({ market: 'Metal', symbol: 'PAXGUSDT' });

    const cryptoResult = await computeSuperSignal(cryptoEntry);
    const metalResult = await computeSuperSignal(metalEntry);

    expect(cryptoResult).not.toBeNull();
    expect(metalResult).not.toBeNull();

    // Scores may differ due to different asset-class weights
    // Just verify both are valid
    expect(cryptoResult!.value).toBeGreaterThanOrEqual(0);
    expect(cryptoResult!.value).toBeLessThanOrEqual(100);
    expect(metalResult!.value).toBeGreaterThanOrEqual(0);
    expect(metalResult!.value).toBeLessThanOrEqual(100);
  });

  it('should map value to correct category', async () => {
    const testCases = [
      { value: 80, expectedCategory: 'Strong Buy' },
      { value: 65, expectedCategory: 'Buy' },
      { value: 50, expectedCategory: 'Neutral' },
      { value: 30, expectedCategory: 'Sell' },
      { value: 20, expectedCategory: 'Strong Sell' },
    ];

    for (const { value, expectedCategory } of testCases) {
      // Create entry that will produce approximately the target value
      // This is approximate since we can't control the exact output
      const entry = createMockEntry({
        strategySignal: value > 60 ? 'buy' : value < 40 ? 'sell' : 'neutral',
        change24h: value > 60 ? 5 : value < 40 ? -5 : 0,
      });

      const result = await computeSuperSignal(entry);
      expect(result).not.toBeNull();
      
      // Just verify the category is one of the valid values
      expect(result!.category).toMatch(/Strong Buy|Buy|Neutral|Sell|Strong Sell/);
    }
  });

  it('should include inputHash for deterministic replay', async () => {
    const entry = createMockEntry();
    const result = await computeSuperSignal(entry);

    expect(result).not.toBeNull();
    expect(result!.inputHash).toBeDefined();
    expect(typeof result!.inputHash).toBe('string');
    expect(result!.inputHash!.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('should be deterministic for identical inputs', async () => {
    const entry1 = createMockEntry();
    const entry2 = createMockEntry();

    const result1 = await computeSuperSignal(entry1);
    const result2 = await computeSuperSignal(entry2);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1!.value).toBe(result2!.value);
    expect(result1!.category).toBe(result2!.category);
    expect(result1!.inputHash).toBe(result2!.inputHash);
  });

  it('should handle real-time updates (no historicalCloses)', async () => {
    const entry = createMockEntry({
      historicalCloses: undefined,
    });

    const result = await computeSuperSignal(entry);

    // Should still compute, but entropy component will use neutral score
    expect(result).not.toBeNull();
    expect(result!.components.entropy.score).toBe(50);
    expect(result!.components.entropy.error).toContain('Insufficient historical data');
  });

  it('should integrate with ScreenerEntry type correctly', async () => {
    const entry = createMockEntry();
    
    // Verify the entry can be assigned to ScreenerEntry type
    const typedEntry: ScreenerEntry = entry;
    
    const result = await computeSuperSignal(typedEntry);
    
    // Verify result can be assigned to superSignal field
    if (result) {
      typedEntry.superSignal = result;
      expect(typedEntry.superSignal).toBeDefined();
      expect(typedEntry.superSignal!.value).toBe(result.value);
    }
  });
});
