/**
 * Signal Helpers - Utility Functions for Signal Accuracy Improvements
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Purpose: Provide helper functions for improved signal accuracy without
 * modifying core indicator logic. All functions are pure and testable.
 *
 * Phase 1.1: Foundation helpers for correlation detection and diminishing returns
 */

// ── Types ──────────────────────────────────────────────────────

export interface IndicatorGroup {
  name: string;
  indicators: string[];
  scores: number[];
}

export interface SmartMoneyComponents {
  fundingSignal?: number;
  liquidationImbalance?: number;
  whaleDirection?: number;
  orderFlowPressure?: number;
  cvdSignal?: number;
}

export interface SuppressionResult {
  suppress: boolean;
  multiplier: number;
  reason: string;
}

export interface SmartMoneyBoostResult {
  boost: number;
  reasons: string[];
}

// ── Correlation Detection & Diminishing Returns ────────────────

/**
 * Groups indicators by correlation type.
 * Oscillators (RSI, Stoch, Williams %R, CCI) are highly correlated.
 * Trend indicators (MACD, EMA, ADX) measure similar aspects.
 * Volume indicators (OBV, VWAP, Volume Spike) confirm each other.
 *
 * @param params - Individual indicator scores
 * @returns Array of indicator groups with their scores
 */
export function groupCorrelatedIndicators(params: {
  rsiScore?: number;
  stochScore?: number;
  williamsRScore?: number;
  cciScore?: number;
  macdScore?: number;
  emaScore?: number;
  adxScore?: number;
  obvScore?: number;
  vwapScore?: number;
  volumeSpikeScore?: number;
  bbScore?: number;
}): IndicatorGroup[] {
  return [
    {
      name: 'oscillators',
      indicators: ['rsi', 'stoch', 'williamsR', 'cci', 'bb'],
      scores: [
        params.rsiScore || 0,
        params.stochScore || 0,
        params.williamsRScore || 0,
        params.cciScore || 0,
        params.bbScore || 0,
      ].filter(s => s !== 0),
    },
    {
      name: 'trend',
      indicators: ['macd', 'ema', 'adx'],
      scores: [
        params.macdScore || 0,
        params.emaScore || 0,
        params.adxScore || 0,
      ].filter(s => s !== 0),
    },
    {
      name: 'volume',
      indicators: ['obv', 'vwap', 'volumeSpike'],
      scores: [
        params.obvScore || 0,
        params.vwapScore || 0,
        params.volumeSpikeScore || 0,
      ].filter(s => s !== 0),
    },
  ];
}

/**
 * Applies diminishing returns to correlated indicator scores.
 * First signal gets 100% weight, second gets 50%, third gets 25%, etc.
 * This prevents score inflation when multiple correlated indicators agree.
 *
 * Example:
 *   - Single indicator: [80] → 80
 *   - Two correlated: [80, 80] → 80 + 40 = 120 (not 160)
 *   - Three correlated: [80, 80, 80] → 80 + 40 + 20 = 140 (not 240)
 *
 * @param scores - Array of indicator scores (can be positive or negative)
 * @returns Adjusted total score with diminishing returns applied
 */
export function applyDiminishingReturns(scores: number[]): number {
  if (scores.length === 0) return 0;
  
  // Sort by absolute value (strongest signals first)
  const sorted = scores
    .filter(s => s !== 0)
    .sort((a, b) => Math.abs(b) - Math.abs(a));
  
  if (sorted.length === 0) return 0;
  
  let total = sorted[0]; // First signal: 100% weight
  
  for (let i = 1; i < sorted.length; i++) {
    const weight = Math.pow(0.5, i); // 50%, 25%, 12.5%, 6.25%, ...
    total += sorted[i] * weight;
  }
  
  return total;
}

// ── Smart Suppression Logic ────────────────────────────────────

/**
 * Determines if a signal should be suppressed based on overbought/oversold
 * conditions and higher timeframe context.
 *
 * Key improvements over aggressive suppression:
 * - Only suppresses if ALSO fighting higher TF trend
 * - Allows overbought signals WITH 1h trend (momentum trades)
 * - Allows signals with volume spike confirmation
 * - Less harsh multiplier (0.70 vs 0.40)
 *
 * @param params - Signal context including RSI values and volume
 * @returns Suppression decision with multiplier and reason
 */
export function shouldSuppressSignal(params: {
  normalized: number;
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  rsi1h: number | null;
  volumeSpike: boolean;
}): SuppressionResult {
  const rsiHighCount = [params.rsi1m, params.rsi5m, params.rsi15m]
    .filter(r => r != null && r > 75).length;
  const rsiLowCount = [params.rsi1m, params.rsi5m, params.rsi15m]
    .filter(r => r != null && r < 25).length;
  
  // Buy signal suppression
  if (params.normalized > 25 && rsiHighCount >= 2) {
    // Volume spike confirms momentum = allow (check first)
    if (params.volumeSpike) {
      return {
        suppress: false,
        multiplier: 1.0,
        reason: '✓ Overbought but volume confirms momentum',
      };
    }
    // Check if fighting 1h trend
    if (params.rsi1h !== null && params.rsi1h > 65) {
      // Fighting trend + overbought = suppress
      return {
        suppress: true,
        multiplier: 0.70,
        reason: '⚠ Buy dampened: overbought + 1h resistance',
      };
    }
    // Overbought but WITH trend = allow (momentum trade)
    if (params.rsi1h !== null && params.rsi1h < 55) {
      return {
        suppress: false,
        multiplier: 1.0,
        reason: '✓ Overbought but 1h trend supports',
      };
    }
  }
  
  // Sell signal suppression
  if (params.normalized < -25 && rsiLowCount >= 2) {
    // Volume spike confirms momentum = allow (check first)
    if (params.volumeSpike) {
      return {
        suppress: false,
        multiplier: 1.0,
        reason: '✓ Oversold but volume confirms momentum',
      };
    }
    // Check if fighting 1h trend
    if (params.rsi1h !== null && params.rsi1h < 35) {
      // Fighting trend + oversold = suppress
      return {
        suppress: true,
        multiplier: 0.70,
        reason: '⚠ Sell dampened: oversold + 1h support',
      };
    }
    // Oversold but WITH trend = allow (momentum trade)
    if (params.rsi1h !== null && params.rsi1h > 45) {
      return {
        suppress: false,
        multiplier: 1.0,
        reason: '✓ Oversold but 1h trend supports',
      };
    }
  }
  
  return { suppress: false, multiplier: 1.0, reason: '' };
}

// ── Smart Money Boost Calculation ──────────────────────────────

/**
 * Calculates component-aware Smart Money boost.
 * Base boost is 20%, with additional boosts for extreme conditions:
 * - Extreme funding rate: +10%
 * - Liquidation cascade: +10%
 * - Strong whale activity: +5%
 * - Extreme order flow: +5%
 * - CVD confirmation: +5%
 *
 * Maximum boost is capped at 40% to prevent over-reliance on derivatives data.
 *
 * @param score - Smart Money score (-100 to +100)
 * @param components - Individual Smart Money components
 * @returns Boost multiplier and detailed reasons
 */
export function calculateSmartMoneyBoost(
  score: number,
  components: SmartMoneyComponents
): SmartMoneyBoostResult {
  let boost = 0.20; // Base 20%
  const reasons: string[] = [];
  
  // Funding rate extreme: +10%
  if (components.fundingSignal !== undefined && Math.abs(components.fundingSignal) >= 80) {
    boost += 0.10;
    reasons.push('Extreme funding rate');
  }
  
  // Liquidation cascade: +10%
  if (components.liquidationImbalance !== undefined && Math.abs(components.liquidationImbalance) >= 70) {
    boost += 0.10;
    reasons.push('Liquidation cascade');
  }
  
  // Whale activity: +5%
  if (components.whaleDirection !== undefined && Math.abs(components.whaleDirection) >= 60) {
    boost += 0.05;
    reasons.push('Strong whale activity');
  }
  
  // Order flow extreme: +5%
  if (components.orderFlowPressure !== undefined && Math.abs(components.orderFlowPressure) >= 70) {
    boost += 0.05;
    reasons.push('Extreme order flow');
  }
  
  // CVD confirmation: +5%
  if (components.cvdSignal !== undefined && Math.abs(components.cvdSignal) >= 60) {
    boost += 0.05;
    reasons.push('CVD confirms');
  }
  
  return {
    boost: Math.min(0.40, boost), // Cap at 40%
    reasons,
  };
}
