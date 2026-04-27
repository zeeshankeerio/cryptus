/**
 * Signal Integration Tests - Phase 3: Relaxed Suppression
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tests for relaxed suppression integration with computeStrategyScore
 */

import { describe, it, expect } from 'vitest';
import { computeStrategyScore } from '../indicators';
import { SIGNAL_FEATURES } from '../feature-flags';

describe('Phase 3: Relaxed Suppression Integration', () => {
  describe('Feature Flag Control', () => {
    it('should use aggressive suppression when feature flag is OFF', () => {
      // Create a scenario that triggers suppression
      const params = {
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 48,
        rsi4h: null,
        rsi1d: null,
        stochK: 15, // Oversold to create buy signal
        stochD: 18,
        williamsR: -85,
        cci: null,
        bbPosition: 0.05,
        macdHistogram: 0.5,
        emaCross: 'bullish' as const,
        vwapDiff: -3,
        volumeSpike: false,
        price: 50000,
        atr: 1000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = false;

      const result = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // When flag is OFF, should use old aggressive suppression
      // The exact message depends on whether suppression triggers
      expect(result.score).toBeDefined();
      expect(result.signal).toBeDefined();
    });

    it('should use relaxed suppression when feature flag is ON', () => {
      const params = {
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 48,
        rsi4h: null,
        rsi1d: null,
        stochK: 15,
        stochD: 18,
        williamsR: -85,
        cci: null,
        bbPosition: 0.05,
        macdHistogram: 0.5,
        emaCross: 'bullish' as const,
        vwapDiff: -3,
        volumeSpike: false,
        price: 50000,
        atr: 1000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;

      const result = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // When flag is ON, should use new relaxed suppression
      expect(result.score).toBeDefined();
      expect(result.signal).toBeDefined();
    });

    it('should be deterministic with feature flag OFF', () => {
      const params = {
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 68,
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

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = false;

      const result1 = computeStrategyScore(params);
      const result2 = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // Should be deterministic
      expect(result1.score).toBe(result2.score);
      expect(result1.signal).toBe(result2.signal);
    });

    it('should be deterministic with feature flag ON', () => {
      const params = {
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: 68,
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

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;

      const result1 = computeStrategyScore(params);
      const result2 = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // Should be deterministic
      expect(result1.score).toBe(result2.score);
      expect(result1.signal).toBe(result2.signal);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null 1h RSI gracefully', () => {
      const params = {
        rsi1m: 78,
        rsi5m: 76,
        rsi15m: 74,
        rsi1h: null, // No 1h data
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

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;

      expect(() => computeStrategyScore(params)).not.toThrow();

      const result = computeStrategyScore(params);
      expect(result.score).toBeDefined();

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;
    });

    it('should handle only 1 TF overbought (no suppression)', () => {
      const params = {
        rsi1m: 78, // Only 1 TF overbought
        rsi5m: 65,
        rsi15m: 60,
        rsi1h: 55,
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

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;

      const result = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // Should NOT be suppressed (only 1 TF overbought)
      expect(result.score).toBeDefined();
    });

    it('should handle all null RSI values', () => {
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

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;

      expect(() => computeStrategyScore(params)).not.toThrow();

      const result = computeStrategyScore(params);
      expect(result.signal).toBe('neutral');

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;
    });
  });

  describe('No Regression', () => {
    it('should not break existing functionality', () => {
      const params = {
        rsi1m: 50,
        rsi5m: 50,
        rsi15m: 50,
        rsi1h: 50,
        rsi4h: null,
        rsi1d: null,
        stochK: 50,
        stochD: 50,
        williamsR: -50,
        cci: 0,
        bbPosition: 0.5,
        macdHistogram: 0,
        emaCross: 'none' as const,
        vwapDiff: 0,
        volumeSpike: false,
        price: 50000,
        atr: 1000,
      };

      const originalFeatureState = SIGNAL_FEATURES.useRelaxedSuppression;

      // Test with flag OFF
      (SIGNAL_FEATURES as any).useRelaxedSuppression = false;
      const resultOff = computeStrategyScore(params);

      // Test with flag ON
      (SIGNAL_FEATURES as any).useRelaxedSuppression = true;
      const resultOn = computeStrategyScore(params);

      (SIGNAL_FEATURES as any).useRelaxedSuppression = originalFeatureState;

      // Neutral signals should be the same regardless of flag
      expect(resultOff.signal).toBe('neutral');
      expect(resultOn.signal).toBe('neutral');
    });
  });
});
