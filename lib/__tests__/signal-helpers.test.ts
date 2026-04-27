/**
 * Signal Helpers - Unit Tests
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tests for signal accuracy helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  applyDiminishingReturns,
  groupCorrelatedIndicators,
  shouldSuppressSignal,
  calculateSmartMoneyBoost,
} from '../signal-helpers';

describe('Signal Helpers', () => {
  describe('applyDiminishingReturns', () => {
    it('should return 0 for empty array', () => {
      expect(applyDiminishingReturns([])).toBe(0);
    });

    it('should return full weight for single indicator', () => {
      expect(applyDiminishingReturns([80])).toBe(80);
    });

    it('should apply 50% weight to second indicator', () => {
      const result = applyDiminishingReturns([80, 80]);
      expect(result).toBe(120); // 80 + 40
    });

    it('should apply 25% weight to third indicator', () => {
      const result = applyDiminishingReturns([80, 80, 80]);
      expect(result).toBe(140); // 80 + 40 + 20
    });

    it('should handle negative scores correctly', () => {
      const result = applyDiminishingReturns([-80, -80]);
      expect(result).toBe(-120); // -80 + -40
    });

    it('should handle mixed positive and negative scores', () => {
      const result = applyDiminishingReturns([80, -60]);
      // Sorted by absolute value: [80, -60]
      // 80 + (-60 * 0.5) = 80 - 30 = 50
      expect(result).toBe(50);
    });

    it('should sort by absolute value (strongest first)', () => {
      const result = applyDiminishingReturns([40, 80, 60]);
      // Sorted: [80, 60, 40]
      // 80 + 30 + 10 = 120
      expect(result).toBe(120);
    });

    it('should filter out zero scores', () => {
      const result = applyDiminishingReturns([80, 0, 80, 0]);
      expect(result).toBe(120); // Only [80, 80] counted
    });

    it('should handle four correlated indicators', () => {
      const result = applyDiminishingReturns([80, 80, 80, 80]);
      // 80 + 40 + 20 + 10 = 150
      expect(result).toBe(150);
    });
  });

  describe('groupCorrelatedIndicators', () => {
    it('should group oscillators correctly', () => {
      const groups = groupCorrelatedIndicators({
        rsiScore: 80,
        stochScore: 75,
        williamsRScore: 70,
        cciScore: 65,
        bbScore: 60,
      });

      const oscillatorGroup = groups.find(g => g.name === 'oscillators');
      expect(oscillatorGroup).toBeDefined();
      expect(oscillatorGroup?.scores).toEqual([80, 75, 70, 65, 60]);
    });

    it('should group trend indicators correctly', () => {
      const groups = groupCorrelatedIndicators({
        macdScore: 60,
        emaScore: 55,
        adxScore: 50,
      });

      const trendGroup = groups.find(g => g.name === 'trend');
      expect(trendGroup).toBeDefined();
      expect(trendGroup?.scores).toEqual([60, 55, 50]);
    });

    it('should group volume indicators correctly', () => {
      const groups = groupCorrelatedIndicators({
        obvScore: 40,
        vwapScore: 35,
        volumeSpikeScore: 30,
      });

      const volumeGroup = groups.find(g => g.name === 'volume');
      expect(volumeGroup).toBeDefined();
      expect(volumeGroup?.scores).toEqual([40, 35, 30]);
    });

    it('should filter out zero scores', () => {
      const groups = groupCorrelatedIndicators({
        rsiScore: 80,
        stochScore: 0,
        williamsRScore: 70,
      });

      const oscillatorGroup = groups.find(g => g.name === 'oscillators');
      expect(oscillatorGroup?.scores).toEqual([80, 70]);
    });

    it('should handle undefined scores', () => {
      const groups = groupCorrelatedIndicators({
        rsiScore: 80,
        // stochScore undefined
        williamsRScore: 70,
      });

      const oscillatorGroup = groups.find(g => g.name === 'oscillators');
      expect(oscillatorGroup?.scores).toEqual([80, 70]);
    });
  });

  describe('shouldSuppressSignal', () => {
    it('should suppress overbought buy signal fighting 1h resistance', () => {
      const result = shouldSuppressSignal({
        normalized: 65,
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 68,
        volumeSpike: false,
      });

      expect(result.suppress).toBe(true);
      expect(result.multiplier).toBe(0.70);
      expect(result.reason).toContain('overbought + 1h resistance');
    });

    it('should allow overbought buy signal with 1h trend support', () => {
      const result = shouldSuppressSignal({
        normalized: 65,
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 48, // Below 55 = bullish trend
        volumeSpike: false,
      });

      expect(result.suppress).toBe(false);
      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toContain('1h trend supports');
    });

    it('should allow overbought buy signal with volume spike', () => {
      const result = shouldSuppressSignal({
        normalized: 65,
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 68,
        volumeSpike: true,
      });

      expect(result.suppress).toBe(false);
      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toContain('volume confirms momentum');
    });

    it('should suppress oversold sell signal fighting 1h support', () => {
      const result = shouldSuppressSignal({
        normalized: -65,
        rsi1m: 22,
        rsi5m: 24,
        rsi15m: 26,
        rsi1h: 32,
        volumeSpike: false,
      });

      expect(result.suppress).toBe(true);
      expect(result.multiplier).toBe(0.70);
      expect(result.reason).toContain('oversold + 1h support');
    });

    it('should allow oversold sell signal with 1h trend support', () => {
      const result = shouldSuppressSignal({
        normalized: -65,
        rsi1m: 22,
        rsi5m: 24,
        rsi15m: 26,
        rsi1h: 52, // Above 45 = bearish trend
        volumeSpike: false,
      });

      expect(result.suppress).toBe(false);
      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toContain('1h trend supports');
    });

    it('should not suppress when only 1 TF is overbought', () => {
      const result = shouldSuppressSignal({
        normalized: 65,
        rsi1m: 78,
        rsi5m: 65,
        rsi15m: 60,
        rsi1h: 68,
        volumeSpike: false,
      });

      expect(result.suppress).toBe(false);
    });

    it('should not suppress neutral signals', () => {
      const result = shouldSuppressSignal({
        normalized: 15,
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 68,
        volumeSpike: false,
      });

      expect(result.suppress).toBe(false);
    });
  });

  describe('calculateSmartMoneyBoost', () => {
    it('should return base 20% boost with no extreme components', () => {
      const result = calculateSmartMoneyBoost(50, {
        fundingSignal: 50,
        liquidationImbalance: 50,
        whaleDirection: 50,
        orderFlowPressure: 50,
      });

      expect(result.boost).toBe(0.20);
      expect(result.reasons).toHaveLength(0);
    });

    it('should add 10% for extreme funding rate', () => {
      const result = calculateSmartMoneyBoost(50, {
        fundingSignal: 85,
      });

      expect(result.boost).toBeCloseTo(0.30, 2); // 20% + 10%
      expect(result.reasons).toContain('Extreme funding rate');
    });

    it('should add 10% for liquidation cascade', () => {
      const result = calculateSmartMoneyBoost(50, {
        liquidationImbalance: 75,
      });

      expect(result.boost).toBeCloseTo(0.30, 2); // 20% + 10%
      expect(result.reasons).toContain('Liquidation cascade');
    });

    it('should add 5% for strong whale activity', () => {
      const result = calculateSmartMoneyBoost(50, {
        whaleDirection: 65,
      });

      expect(result.boost).toBe(0.25); // 20% + 5%
      expect(result.reasons).toContain('Strong whale activity');
    });

    it('should add 5% for extreme order flow', () => {
      const result = calculateSmartMoneyBoost(50, {
        orderFlowPressure: 75,
      });

      expect(result.boost).toBe(0.25); // 20% + 5%
      expect(result.reasons).toContain('Extreme order flow');
    });

    it('should add 5% for CVD confirmation', () => {
      const result = calculateSmartMoneyBoost(50, {
        cvdSignal: 65,
      });

      expect(result.boost).toBe(0.25); // 20% + 5%
      expect(result.reasons).toContain('CVD confirms');
    });

    it('should cap boost at 40%', () => {
      const result = calculateSmartMoneyBoost(50, {
        fundingSignal: 85,
        liquidationImbalance: 75,
        whaleDirection: 65,
        orderFlowPressure: 75,
        cvdSignal: 65,
      });

      expect(result.boost).toBe(0.40); // Capped at 40%
      expect(result.reasons).toHaveLength(5);
    });

    it('should handle negative component values', () => {
      const result = calculateSmartMoneyBoost(-50, {
        fundingSignal: -85,
        liquidationImbalance: -75,
      });

      expect(result.boost).toBe(0.40); // 20% + 10% + 10%
      expect(result.reasons).toHaveLength(2);
    });

    it('should handle undefined components', () => {
      const result = calculateSmartMoneyBoost(50, {});

      expect(result.boost).toBe(0.20);
      expect(result.reasons).toHaveLength(0);
    });
  });
});
