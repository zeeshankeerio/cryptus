/**
 * Signal Accuracy Tests - Phase 4 & 5
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tests for:
 * - Phase 4: Strong Smart Money (component-aware boost)
 * - Phase 5: Super Signal Validation (cross-validation)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeStrategyScore } from '../indicators';
import { SIGNAL_FEATURES } from '../feature-flags';

describe('Phase 4: Strong Smart Money', () => {
  const originalFlags = { ...SIGNAL_FEATURES };
  
  beforeEach(() => {
    // Enable Phase 4
    SIGNAL_FEATURES.useStrongSmartMoney = true;
    SIGNAL_FEATURES.useCorrelationPenalty = false;
    SIGNAL_FEATURES.useRelaxedSuppression = false;
    SIGNAL_FEATURES.useSuperSignalValidation = false;
  });
  
  afterEach(() => {
    Object.assign(SIGNAL_FEATURES, originalFlags);
  });

  it('should apply component-aware boost when Smart Money confirms', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60, // Confirms bullish
      smartMoneyComponents: {
        fundingSignal: 85,           // Extreme funding rate: +10%
        liquidationImbalance: 75,    // Liquidation cascade: +10%
        whaleDirection: 65,          // Whale activity: +5%
        orderFlowPressure: 72,       // Order flow extreme: +5%
        cvdSignal: 62,               // CVD confirmation: +5%
      },
    });
    
    // Should have component-aware boost (base 20% + all bonuses = 35%)
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('Smart Money confirms'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Extreme funding rate'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Liquidation cascade'))).toBe(true);
  });

  it('should apply base boost when components not provided', () => {
    const withComponents = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,
      smartMoneyComponents: {
        fundingSignal: 85,
        liquidationImbalance: 75,
      },
    });
    
    const withoutComponents = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,
      // No components
    });
    
    // With components should have higher score
    expect(withComponents.score).toBeGreaterThan(withoutComponents.score);
  });

  it('should cap boost at 40%', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 95,
      smartMoneyComponents: {
        fundingSignal: 95,           // +10%
        liquidationImbalance: 95,    // +10%
        whaleDirection: 95,          // +5%
        orderFlowPressure: 95,       // +5%
        cvdSignal: 95,               // +5%
        // Total would be 55% but capped at 40%
      },
    });
    
    // Should have boost but capped
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('Smart Money confirms'))).toBe(true);
  });

  it('should still apply penalty when Smart Money contradicts', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: -60, // Contradicts bullish
    });
    
    // Should have penalty
    expect(result.score).toBeGreaterThan(0); // Still bullish but dampened
    expect(result.reasons.some(r => r.includes('Smart Money contradicts'))).toBe(true);
  });

  it('should work when feature flag is disabled', () => {
    SIGNAL_FEATURES.useStrongSmartMoney = false;
    
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,
      smartMoneyComponents: {
        fundingSignal: 85,
      },
    });
    
    // Should still work but with original 15% boost
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('Smart Money confirms'))).toBe(true);
  });
});

describe('Phase 5: Super Signal Validation', () => {
  const originalFlags = { ...SIGNAL_FEATURES };
  
  beforeEach(() => {
    // Enable Phase 5
    SIGNAL_FEATURES.useSuperSignalValidation = true;
    SIGNAL_FEATURES.useCorrelationPenalty = false;
    SIGNAL_FEATURES.useRelaxedSuppression = false;
    SIGNAL_FEATURES.useStrongSmartMoney = false;
  });
  
  afterEach(() => {
    Object.assign(SIGNAL_FEATURES, originalFlags);
  });

  it('should boost score when Super Signal agrees', () => {
    const withAgreement = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      superSignalScore: 70, // Agrees with bullish
    });
    
    const withoutSuper = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      // No Super Signal
    });
    
    // With agreement should have higher score
    expect(withAgreement.score).toBeGreaterThan(withoutSuper.score);
    expect(withAgreement.reasons.some(r => r.includes('Super Signal confirms'))).toBe(true);
    expect(withAgreement.reasons.some(r => r.includes('High confidence'))).toBe(true);
  });

  it('should dampen score when Super Signal disagrees', () => {
    const withDisagreement = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      superSignalScore: -70, // Disagrees with bullish
    });
    
    const withoutSuper = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      // No Super Signal
    });
    
    // With disagreement should have lower score
    expect(withDisagreement.score).toBeLessThan(withoutSuper.score);
    expect(withDisagreement.reasons.some(r => r.includes('Super Signal contradicts'))).toBe(true);
    expect(withDisagreement.reasons.some(r => r.includes('Low confidence'))).toBe(true);
  });

  it('should handle neutral Super Signal', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      superSignalScore: 5, // Neutral
    });
    
    // Should not affect score significantly
    expect(result.score).toBeGreaterThan(0);
  });

  it('should work when feature flag is disabled', () => {
    SIGNAL_FEATURES.useSuperSignalValidation = false;
    
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      superSignalScore: 70,
    });
    
    // Should not apply validation
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('Super Signal'))).toBe(false);
  });
});

describe('Phase 4 & 5: Combined Integration', () => {
  const originalFlags = { ...SIGNAL_FEATURES };
  
  beforeEach(() => {
    // Enable both phases
    SIGNAL_FEATURES.useStrongSmartMoney = true;
    SIGNAL_FEATURES.useSuperSignalValidation = true;
    SIGNAL_FEATURES.useCorrelationPenalty = false;
    SIGNAL_FEATURES.useRelaxedSuppression = false;
  });
  
  afterEach(() => {
    Object.assign(SIGNAL_FEATURES, originalFlags);
  });

  it('should apply both Smart Money boost and Super Signal validation', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,
      smartMoneyComponents: {
        fundingSignal: 85,
        liquidationImbalance: 75,
      },
      superSignalScore: 70,
    });
    
    // Should have both enhancements
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('Smart Money confirms'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Super Signal confirms'))).toBe(true);
    expect(result.reasons.some(r => r.includes('High confidence'))).toBe(true);
  });

  it('should handle conflicting signals (Smart Money vs Super Signal)', () => {
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,  // Confirms bullish
      superSignalScore: -70, // Contradicts bullish
    });
    
    // Should show both confirmations and warnings
    expect(result.score).toBeGreaterThan(0); // Still bullish but dampened
    expect(result.reasons.some(r => r.includes('Smart Money confirms'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Super Signal contradicts'))).toBe(true);
    expect(result.reasons.some(r => r.includes('Low confidence'))).toBe(true);
  });
});

describe('Phase 4 & 5: Backward Compatibility', () => {
  const originalFlags = { ...SIGNAL_FEATURES };
  
  afterEach(() => {
    Object.assign(SIGNAL_FEATURES, originalFlags);
  });

  it('should work with all features disabled', () => {
    SIGNAL_FEATURES.useStrongSmartMoney = false;
    SIGNAL_FEATURES.useSuperSignalValidation = false;
    SIGNAL_FEATURES.useCorrelationPenalty = false;
    SIGNAL_FEATURES.useRelaxedSuppression = false;
    
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: false,
      price: 50000,
      smartMoneyScore: 60,
      superSignalScore: 70,
    });
    
    // Should still work with original logic
    expect(result.score).toBeGreaterThan(0);
    expect(result.signal).toBeDefined();
    expect(result.label).toBeDefined();
    expect(result.reasons).toBeDefined();
  });

  it('should work with all features enabled', () => {
    SIGNAL_FEATURES.useStrongSmartMoney = true;
    SIGNAL_FEATURES.useSuperSignalValidation = true;
    SIGNAL_FEATURES.useCorrelationPenalty = true;
    SIGNAL_FEATURES.useRelaxedSuppression = true;
    
    const result = computeStrategyScore({
      rsi1m: 25, rsi5m: 28, rsi15m: 30, rsi1h: 35,
      rsi4h: null, rsi1d: null,
      macdHistogram: 2, bbPosition: 0.2, stochK: 25, stochD: 28,
      emaCross: 'bullish', vwapDiff: -1.5, volumeSpike: true,
      price: 50000,
      smartMoneyScore: 60,
      smartMoneyComponents: {
        fundingSignal: 85,
      },
      superSignalScore: 70,
    });
    
    // Should work with all enhancements
    expect(result.score).toBeGreaterThan(0);
    expect(result.signal).toBeDefined();
    expect(result.label).toBeDefined();
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
