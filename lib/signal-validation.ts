/**
 * Signal Validation - Cross-validation with Super Signal
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Purpose: Validate Strategy signals against Super Signal to reduce
 * conflicting signals and improve overall accuracy.
 *
 * Phase 1.1: Super Signal validation logic
 */

// ── Types ──────────────────────────────────────────────────────

export interface ValidationResult {
  multiplier: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

// ── Super Signal Validation ────────────────────────────────────

/**
 * Validates Strategy score against Super Signal score.
 * 
 * Agreement: Boosts confidence and score (up to 15%)
 * Disagreement: Dampens score and lowers confidence (up to 30% penalty)
 * 
 * This prevents situations where Strategy says "Strong Buy" but
 * Super Signal says "Sell", reducing user confusion.
 *
 * @param strategyScore - Normalized strategy score (-100 to +100)
 * @param superSignalScore - Super Signal score (-100 to +100)
 * @returns Validation result with multiplier, confidence, and reason
 */
export function validateWithSuperSignal(
  strategyScore: number,
  superSignalScore: number | undefined
): ValidationResult {
  if (superSignalScore === undefined) {
    return {
      multiplier: 1.0,
      confidence: 'medium',
      reason: '',
    };
  }
  
  // Super Signal arrives as 0-100, but logic expects -100 to +100
  // Remap 0-100 to -100 to +100 (where 50 is 0)
  const normalizedSuper = (superSignalScore - 50) * 2;
  
  const stratDirection = strategyScore > 0 ? 'bullish' : strategyScore < 0 ? 'bearish' : 'neutral';
  const superDirection = normalizedSuper > 0 ? 'bullish' : normalizedSuper < 0 ? 'bearish' : 'neutral';
  
  // Both neutral = no validation needed
  if (stratDirection === 'neutral' || superDirection === 'neutral') {
    return {
      multiplier: 1.0,
      confidence: 'medium',
      reason: '',
    };
  }
  
  // Agreement: Boost confidence
  if (stratDirection === superDirection) {
    // Calculate agreement strength based on minimum of both scores
    const agreement = Math.min(
      Math.abs(strategyScore),
      Math.abs(superSignalScore)
    ) / 100;
    
    return {
      multiplier: 1.0 + (agreement * 0.15), // Up to 15% boost
      confidence: 'high',
      reason: '✓ Super Signal confirms',
    };
  }
  
  // Disagreement: Dampen + warn
  const disagreement = Math.abs(strategyScore - superSignalScore) / 200;
  
  return {
    multiplier: 1.0 - (disagreement * 0.30), // Up to 30% penalty
    confidence: 'low',
    reason: '⚠ Super Signal contradicts - use caution',
  };
}
