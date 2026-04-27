/**
 * Signal Integration Tests - Phase 2: Correlation Penalty
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tests for correlation penalty integration with computeStrategyScore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeStrategyScore } from '../indicators';
import { SIGNAL_FEATURES } from '../defaults';

describe('Phase 2: Correlation Penalty Integration', () => {
  // Reset feature flags before each test
  beforeEach(() => {
    // TypeScript doesn't allow direct assignment to const, so we'll test both states
  });

  describe('Multiple Oscillators Agreement', () => {
    it('should reduce score when all oscillators are oversold (feature ON)', () => {
      // Setup: All oscillators oversold
      const params = {
        rsi1m: 20,
        rsi5m: 22,
        rsi15m: 25,
        rsi1h: 28,
        rsi4h: null,
        rsi1d: null,
        stochK: 15,
        stochD: 18,
        williamsR: -85,
        cci: -150,
        bbPosition: 0.05,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      // Test with feature OFF (baseline)
      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = false;
      const resultOff = computeStrategyScore(params);

      // Test with feature ON
      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const resultOn = computeStrategyScore(params);

      // Restore original state
      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Score should be lower with correlation penalty
      expect(resultOn.score).toBeLessThan(resultOff.score);
      expect(resultOn.score).toBeGreaterThan(0); // Still bullish
      expect(resultOn.reasons.some(r => r.includes('Correlation penalty applied'))).toBe(true);
    });

    it('should reduce score when all oscillators are overbought (feature ON)', () => {
      const params = {
        rsi1m: 80,
        rsi5m: 78,
        rsi15m: 75,
        rsi1h: 72,
        rsi4h: null,
        rsi1d: null,
        stochK: 85,
        stochD: 82,
        williamsR: -10,
        cci: 180,
        bbPosition: 0.95,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = false;
      const resultOff = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const resultOn = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Score magnitude should be lower with correlation penalty
      expect(Math.abs(resultOn.score)).toBeLessThan(Math.abs(resultOff.score));
      expect(resultOn.score).toBeLessThan(0); // Still bearish
    });
  });

  describe('Diverse Indicators', () => {
    it('should not significantly affect score when indicators are diverse', () => {
      // Setup: Different indicator types (not correlated)
      const params = {
        rsi1m: null,
        rsi5m: null,
        rsi15m: 25, // Oscillator oversold
        rsi1h: null,
        rsi4h: null,
        rsi1d: null,
        stochK: null,
        stochD: null,
        williamsR: null,
        cci: null,
        bbPosition: null,
        macdHistogram: 0.5, // Trend bullish
        emaCross: 'bullish' as const, // Trend bullish
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
        obvTrend: 'bullish' as const, // Volume bullish
        atr: 1000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = false;
      const resultOff = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const resultOn = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Score should be similar (no correlated indicators)
      const difference = Math.abs(resultOn.score - resultOff.score);
      expect(difference).toBeLessThan(10); // Allow small difference
      expect(resultOn.score).toBeGreaterThan(0); // Still bullish
    });
  });

  describe('Signal Direction Preservation', () => {
    it('should preserve bullish direction with correlation penalty', () => {
      const params = {
        rsi1m: 20,
        rsi5m: 22,
        rsi15m: 25,
        rsi1h: 28,
        rsi4h: null,
        rsi1d: null,
        stochK: 15,
        stochD: 18,
        williamsR: -85,
        cci: null,
        bbPosition: null,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const result = computeStrategyScore(params);
      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      expect(result.score).toBeGreaterThan(0); // Still bullish
      expect(['buy', 'strong-buy']).toContain(result.signal);
    });

    it('should preserve bearish direction with correlation penalty', () => {
      const params = {
        rsi1m: 80,
        rsi5m: 78,
        rsi15m: 75,
        rsi1h: 72,
        rsi4h: null,
        rsi1d: null,
        stochK: 85,
        stochD: 82,
        williamsR: -10,
        cci: null,
        bbPosition: null,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const result = computeStrategyScore(params);
      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      expect(result.score).toBeLessThan(0); // Still bearish
      expect(['sell', 'strong-sell']).toContain(result.signal);
    });
  });

  describe('Feature Flag Control', () => {
    it('should match baseline when feature flag is OFF', () => {
      const params = {
        rsi1m: 20,
        rsi5m: 22,
        rsi15m: 25,
        rsi1h: 28,
        rsi4h: null,
        rsi1d: null,
        stochK: 15,
        stochD: 18,
        williamsR: null,
        cci: null,
        bbPosition: null,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      // Ensure feature is OFF
      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = false;

      const result1 = computeStrategyScore(params);
      const result2 = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Should be deterministic
      expect(result1.score).toBe(result2.score);
      expect(result1.signal).toBe(result2.signal);
      expect(result1.reasons.some(r => r.includes('Correlation penalty'))).toBe(false);
    });

    it('should apply penalty when feature flag is ON', () => {
      const params = {
        rsi1m: 20,
        rsi5m: 22,
        rsi15m: 25,
        rsi1h: 28,
        rsi4h: null,
        rsi1d: null,
        stochK: 15,
        stochD: 18,
        williamsR: -85,
        cci: -150,
        bbPosition: 0.05,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;

      const result = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Should have correlation penalty message
      expect(result.reasons.some(r => r.includes('Correlation penalty applied'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined indicators gracefully', () => {
      const params = {
        rsi1m: null,
        rsi5m: null,
        rsi15m: null,
        rsi1h: null,
        rsi4h: null,
        rsi1d: null,
        stochK: null,
        stochD: null,
        williamsR: null,
        cci: null,
        bbPosition: null,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;

      expect(() => computeStrategyScore(params)).not.toThrow();

      const result = computeStrategyScore(params);
      expect(result.signal).toBe('neutral');

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;
    });

    it('should handle single indicator correctly', () => {
      const params = {
        rsi1m: null,
        rsi5m: null,
        rsi15m: 25, // Only one oscillator
        rsi1h: null,
        rsi4h: null,
        rsi1d: null,
        stochK: null,
        stochD: null,
        williamsR: null,
        cci: null,
        bbPosition: null,
        macdHistogram: null,
        emaCross: 'none' as const,
        vwapDiff: null,
        volumeSpike: false,
        price: 50000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useCorrelationPenalty;
      (SIGNAL_FEATURES as any).useCorrelationPenalty = false;
      const resultOff = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = true;
      const resultOn = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useCorrelationPenalty = originalFeatureState;

      // Single indicator should not be penalized
      expect(resultOn.score).toBe(resultOff.score);
    });
  });
});
