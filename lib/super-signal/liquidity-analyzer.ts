/**
 * RSIQ Pro - SUPER_SIGNAL Liquidity Intelligence Module
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Detects institutional order flow via VWAP deviation and volume profile imbalance.
 * Identifies liquidity zones where smart money is accumulating or distributing.
 */

import type { ComponentScore, SuperSignalInput } from './types';
import { getCachedComponentScore, setCachedComponentScore } from './cache';
import { getConfig } from './config';

// ── VWAP Deviation Analysis ──────────────────────────────────────

/**
 * Compute VWAP deviation as percentage of current price.
 * 
 * Interpretation:
 * - Deviation > +2%: Price above VWAP (potential distribution zone, bearish)
 * - Deviation < -2%: Price below VWAP (potential accumulation zone, bullish)
 * - Deviation near 0%: Price at fair value (neutral)
 */
function computeVwapDeviation(price: number, vwap: number | null): number | null {
  if (vwap === null || vwap === 0) return null;
  return ((price - vwap) / vwap) * 100;
}

// ── Volume Profile Imbalance ─────────────────────────────────────

/**
 * Compute volume profile imbalance by comparing current volume to average.
 * 
 * Uses price direction (change24h) to infer buy/sell pressure:
 * - Positive change + high volume = buy pressure
 * - Negative change + high volume = sell pressure
 * 
 * Returns imbalance ratio: 0.0 (all sell) to 1.0 (all buy)
 */
function computeVolumeImbalance(
  avgVolume: number | null,
  curVolume: number | null,
  priceChange: number
): number | null {
  if (avgVolume === null || curVolume === null || avgVolume === 0) return null;
  
  const volumeRatio = curVolume / avgVolume;
  
  // If volume is below average, imbalance is neutral (0.5)
  if (volumeRatio < 1.0) return 0.5;
  
  // Scale imbalance by price direction and volume ratio
  // Positive change → buy pressure (>0.5), negative → sell pressure (<0.5)
  const directionBias = priceChange > 0 ? 1 : priceChange < 0 ? -1 : 0;
  const imbalanceMagnitude = Math.min((volumeRatio - 1.0) / 2.0, 0.5); // Cap at 0.5
  
  return 0.5 + (directionBias * imbalanceMagnitude);
}

// ── Liquidity Score Computation ──────────────────────────────────

/**
 * Compute normalized liquidity score (0-100).
 * 
 * Score interpretation:
 * - 0-30: Strong sell pressure (distribution, bearish)
 * - 30-45: Weak sell pressure
 * - 45-55: Neutral (balanced order flow)
 * - 55-70: Weak buy pressure
 * - 70-100: Strong buy pressure (accumulation, bullish)
 * 
 * Combines:
 * 1. VWAP deviation (40% weight): Price vs fair value
 * 2. Volume imbalance (60% weight): Buy/sell pressure
 */
function computeLiquidityScore(
  vwapDeviation: number | null,
  volumeImbalance: number | null,
  config: ReturnType<typeof getConfig>,
  trendBias: number = 0
): number {
  let score = 50; // Start neutral
  
  // VWAP deviation component (40% weight)
  if (vwapDeviation !== null) {
    const { vwapDeviationThreshold } = config.liquidity;
    
    if (vwapDeviation < -vwapDeviationThreshold) {
      // Price significantly below VWAP
      const magnitude = Math.min(Math.abs(vwapDeviation) / vwapDeviationThreshold, 2.0);
      
      if (trendBias < 0) {
        // In a strong bear trend, being below VWAP is NOT necessarily bullish accumulation.
        // It's often just trend continuation. We dampen the bullishness.
        score -= magnitude * 5; // Slight bearish bias
      } else {
        // In a bull or neutral trend, below VWAP = accumulation zone (bullish)
        score += magnitude * 20; 
      }
    } else if (vwapDeviation > vwapDeviationThreshold) {
      // Price significantly above VWAP
      const magnitude = Math.min(vwapDeviation / vwapDeviationThreshold, 2.0);
      
      if (trendBias > 0) {
        // In a strong bull trend, being above VWAP is trend continuation.
        score += magnitude * 5; // Slight bullish bias
      } else {
        // In a bear or neutral trend, above VWAP = distribution zone (bearish)
        score -= magnitude * 20;
      }
    } else {
      // Price near VWAP → neutral, slight adjustment based on trend
      score += (vwapDeviation / vwapDeviationThreshold) * (trendBias !== 0 ? 5 : -10);
    }
  }
  
  // Volume imbalance component (60% weight)
  if (volumeImbalance !== null) {
    const { volumeImbalanceThreshold } = config.liquidity;
    
    if (volumeImbalance > volumeImbalanceThreshold) {
      // Strong buy pressure
      const magnitude = (volumeImbalance - 0.5) * 2; // 0.0 to 1.0
      score += magnitude * 30; // +0 to +30
    } else if (volumeImbalance < (1.0 - volumeImbalanceThreshold)) {
      // Strong sell pressure
      const magnitude = (0.5 - volumeImbalance) * 2; // 0.0 to 1.0
      score -= magnitude * 30; // -0 to -30
    } else {
      // Moderate imbalance
      score += (volumeImbalance - 0.5) * 20; // -10 to +10
    }
  }
  
  // Clamp to [0, 100]
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── Liquidity Analysis ───────────────────────────────────────────

/**
 * Analyze liquidity conditions and compute normalized liquidity score.
 * 
 * Detects:
 * - Liquidity zones (VWAP deviation > threshold)
 * - Institutional order flow (volume imbalance > threshold)
 * - Smart money accumulation/distribution patterns
 * 
 * @param input - SuperSignalInput containing price, VWAP, and volume data
 * @returns ComponentScore with liquidity score (0-100)
 */
export async function analyzeLiquidity(input: SuperSignalInput): Promise<ComponentScore> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cached = getCachedComponentScore(input.symbol, 'liquidity');
    if (cached) {
      return cached;
    }
    
    const config = getConfig();
    const { price, vwap, avgVolume1m, curCandleVol, change24h } = input;
    
    // Compute VWAP deviation
    const vwapDeviation = computeVwapDeviation(price, vwap);
    
    // Compute volume imbalance
    const volumeImbalance = computeVolumeImbalance(avgVolume1m, curCandleVol, change24h);
    
    // Check if we have sufficient data
    if (vwapDeviation === null && volumeImbalance === null) {
      return {
        score: 50,
        confidence: 0,
        error: 'VWAP and volume data unavailable',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Compute liquidity score with trend bias
    const trendBias = change24h > 0 ? 1 : change24h < 0 ? -1 : 0;
    const score = computeLiquidityScore(vwapDeviation, volumeImbalance, config, trendBias);
    
    // Compute confidence based on data availability
    let confidence = 0;
    if (vwapDeviation !== null) confidence += 50;
    if (volumeImbalance !== null) confidence += 50;
    
    const result: ComponentScore = {
      score,
      confidence,
      computeTimeMs: Date.now() - startTime,
    };
    
    // Cache result
    setCachedComponentScore(input.symbol, 'liquidity', result);
    
    return result;
    
  } catch (error) {
    console.error('[super-signal] Liquidity analysis error:', error);
    return {
      score: 50,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      computeTimeMs: Date.now() - startTime,
    };
  }
}
