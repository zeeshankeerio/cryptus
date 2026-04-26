/**
 * RSIQ Pro - Market Regime Classification Engine
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Classifies current market conditions into one of four regimes:
 *   - trending:  Strong directional move (ADX > 25, ATR expanding)
 *   - ranging:   Sideways consolidation (ADX < 20, BB narrowing)
 *   - volatile:  High volatility without clear direction (ATR spike + no trend)
 *   - breakout:  Transition from range to trend (ADX rising, BB squeeze release)
 *
 * Usage:
 *   The regime classification is used to dynamically adjust indicator weights
 *   in the confluence and strategy scoring engines:
 *     - Trending:  EMA/MACD weighted higher, oscillators dampened
 *     - Ranging:   Oscillators (RSI/StochRSI/Williams%R) weighted higher
 *     - Volatile:  All signals dampened, risk parameters widened
 *     - Breakout:  Volume confirmation weighted higher, momentum boosted
 *
 * This is a modular, additive enhancement. If the regime is not computed,
 * all existing logic continues to work unchanged.
 */

// ── Types ─────────────────────────────────────────────────────────

export type MarketRegime = 'trending' | 'ranging' | 'volatile' | 'breakout';

export interface RegimeClassification {
  regime: MarketRegime;
  confidence: number;   // 0-100
  details: string;
}

// ── Core Classification ──────────────────────────────────────────

/**
 * Classify the current market regime using ADX, ATR, and Bollinger Band width.
 *
 * @param adx - Average Directional Index (0-100). null if unavailable.
 * @param atr - Current ATR value
 * @param atrAvg - Average ATR over 20 periods (for normalization)
 * @param bbWidth - Bollinger Band width as fraction of price: (upper - lower) / middle
 * @param bbWidthAvg - Average BB width over 20 periods
 * @param volumeSpike - Whether current volume exceeds 2× average
 */
export function classifyRegime(params: {
  adx: number | null;
  atr: number | null;
  atrAvg: number | null;
  bbWidth: number | null;
  bbWidthAvg: number | null;
  volumeSpike: boolean;
  // 2026 FIX: Add price momentum context for accurate regime classification
  priceChange24h?: number | null;
  volumeRatio?: number | null; // current volume / avg volume
}): RegimeClassification {
  const { adx, atr, atrAvg, bbWidth, bbWidthAvg, volumeSpike, priceChange24h, volumeRatio } = params;

  // ── 2026 FIX: Momentum Override (HIGHEST PRIORITY) ──
  // Extreme price moves (>20% in 24h) ALWAYS indicate trending/breakout, not ranging
  // This prevents the bug where +42% moves are classified as "ranging"
  if (priceChange24h !== null && priceChange24h !== undefined && Math.abs(priceChange24h) > 20) {
    const direction = priceChange24h > 0 ? 'bullish' : 'bearish';
    const magnitude = Math.abs(priceChange24h);
    
    // Check if this is a breakout (with volume) or just trending
    if (volumeRatio !== null && volumeRatio !== undefined && volumeRatio > 2.0) {
      // High volume + extreme move = BREAKOUT
      const confidence = Math.min(95, 70 + Math.min(magnitude - 20, 25));
      return {
        regime: 'breakout',
        confidence: Math.round(confidence),
        details: `Extreme ${direction} breakout: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(1)}% in 24h with ${volumeRatio.toFixed(1)}× volume confirmation`,
      };
    } else {
      // Extreme move without volume = TRENDING (or low-volume pump)
      const confidence = Math.min(85, 60 + Math.min(magnitude - 20, 25));
      return {
        regime: 'trending',
        confidence: Math.round(confidence),
        details: `Strong ${direction} trend: ${priceChange24h > 0 ? '+' : ''}${priceChange24h.toFixed(1)}% in 24h (monitor for exhaustion)`,
      };
    }
  }

  // ── Data Sufficiency Check ──
  // Need at least ADX to make a meaningful classification
  if (adx === null) {
    return { regime: 'ranging', confidence: 20, details: 'Insufficient data for regime classification' };
  }

  // Normalized ATR: how current ATR compares to its recent average
  const atrRatio = (atr !== null && atrAvg !== null && atrAvg > 0) ? atr / atrAvg : 1.0;

  // Normalized BB width: current squeeze level
  const bbRatio = (bbWidth !== null && bbWidthAvg !== null && bbWidthAvg > 0) ? bbWidth / bbWidthAvg : 1.0;

  // ── Breakout Detection (highest priority) ──
  // ADX rising from low base + BB squeeze release + volume confirmation
  if (adx >= 20 && adx <= 35 && bbRatio > 1.3 && volumeSpike) {
    const confidence = Math.min(90, 50 + (adx - 20) * 2 + (bbRatio - 1.0) * 20);
    return {
      regime: 'breakout',
      confidence: Math.round(confidence),
      details: `ADX ${adx.toFixed(0)} rising from range, BB expanding ${bbRatio.toFixed(1)}×, volume confirmed`,
    };
  }

  // ── Volatile Regime ──
  // High ATR relative to average but no strong trend direction
  if (atrRatio > 1.5 && adx < 25) {
    const confidence = Math.min(85, 40 + (atrRatio - 1.0) * 30 + (25 - adx));
    return {
      regime: 'volatile',
      confidence: Math.round(confidence),
      details: `ATR ${atrRatio.toFixed(1)}× above average, ADX ${adx.toFixed(0)} (no trend) - high chop risk`,
    };
  }

  // ── Trending Regime ──
  // Strong ADX + ATR not collapsing
  if (adx > 25) {
    const trendStrength = adx > 40 ? 'very strong' : adx > 30 ? 'strong' : 'moderate';
    const confidence = Math.min(95, 50 + (adx - 25) * 1.5 + (atrRatio > 1.0 ? 10 : 0));
    return {
      regime: 'trending',
      confidence: Math.round(confidence),
      details: `ADX ${adx.toFixed(0)} (${trendStrength} trend), ATR ratio ${atrRatio.toFixed(1)}×`,
    };
  }

  // ── Ranging Regime (default) ──
  // Low ADX + potentially narrow BB
  const bbDetail = bbRatio < 0.8 ? ' (BB squeezing - breakout may be imminent)' : '';
  const confidence = Math.min(80, 40 + (20 - adx) * 2 + (bbRatio < 1.0 ? 10 : 0));
  return {
    regime: 'ranging',
    confidence: Math.round(Math.max(30, confidence)),
    details: `ADX ${adx.toFixed(0)} (no trend), market consolidating${bbDetail}`,
  };
}

// ── Indicator Weight Adjustments ─────────────────────────────────

/**
 * Returns multipliers for indicator categories based on market regime.
 * These can be applied to confluence/strategy scoring for dynamic adaptation.
 *
 * Example usage:
 *   const weights = getRegimeWeights(regime);
 *   oscillatorScore *= weights.oscillators;
 *   trendScore *= weights.trend;
 */
export function getRegimeWeights(regime: MarketRegime): {
  oscillators: number;  // RSI, StochRSI, Williams %R
  trend: number;        // EMA, MACD
  volume: number;       // OBV, Volume Spike
  momentum: number;     // ROC, Momentum
} {
  switch (regime) {
    case 'trending':
      return { oscillators: 0.7, trend: 1.3, volume: 1.0, momentum: 1.2 };
    case 'ranging':
      return { oscillators: 1.3, trend: 0.7, volume: 0.9, momentum: 0.8 };
    case 'volatile':
      return { oscillators: 0.8, trend: 0.8, volume: 1.2, momentum: 0.6 };
    case 'breakout':
      return { oscillators: 0.9, trend: 1.1, volume: 1.4, momentum: 1.3 };
  }
}
