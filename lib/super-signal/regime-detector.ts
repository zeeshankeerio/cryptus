/**
 * RSIQ Pro - SUPER_SIGNAL Regime Detection Module
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Classifies market conditions (trending, ranging, volatile, squeeze/breakout)
 * and maps to a normalized 0-100 regime score for SUPER_SIGNAL fusion.
 */

import { classifyRegime, type MarketRegime, type RegimeClassification } from '../market-regime';
import type { ComponentScore, SuperSignalInput } from './types';
import { getCachedComponentScore, setCachedComponentScore } from './cache';
import { getConfig } from './config';

// ── Regime Score Mapping ──────────────────────────────────────────

/**
 * Map regime classification to a normalized 0-100 score.
 * 
 * Score interpretation:
 * - 0-25: Strong bearish regime (volatile, no trend, high risk)
 * - 25-40: Weak bearish regime (ranging, consolidation)
 * - 40-60: Neutral regime (mixed signals, no clear direction)
 * - 60-75: Weak bullish regime (early trend formation, breakout potential)
 * - 75-100: Strong bullish regime (strong trending, high confidence)
 * 
 * Regime-specific scoring:
 * - trending: Bullish bias (score > 50), scaled by confidence
 * - ranging: Neutral (score ≈ 50), slight bearish bias (consolidation before move)
 * - volatile: Dampened toward neutral (score → 50), risk-off signal
 * - breakout: Directional boost (score > 60 or < 40), scaled by confidence
 */
function mapRegimeToScore(classification: RegimeClassification, directionBias: number = 0): number {
  const { regime, confidence } = classification;
  
  // Confidence scaling: 0-100 → 0.0-1.0
  const confidenceScale = confidence / 100;
  
  switch (regime) {
    case 'trending':
      // Trending = directional bias, scaled by confidence
      if (directionBias >= 0) {
        // Bullish bias: Base 65, up to 95
        return Math.round(65 + (confidenceScale * 30));
      } else {
        // Bearish bias: Base 35, down to 5
        return Math.round(35 - (confidenceScale * 30));
      }
      
    case 'ranging':
      // Ranging = neutral with slight bias based on direction
      if (directionBias >= 0) {
        return Math.round(50 + (confidenceScale * 10)); // 50-60
      } else {
        return Math.round(50 - (confidenceScale * 10)); // 40-50
      }
      
    case 'volatile':
      // Volatile = risk-off, dampen toward neutral
      return Math.round(50 - (directionBias * confidenceScale * 10));
      
    case 'breakout':
      // Breakout = strong directional signal
      if (directionBias >= 0) {
        return Math.round(75 + (confidenceScale * 25)); // 75-100
      } else {
        return Math.round(25 - (confidenceScale * 25)); // 0-25
      }
      
    default:
      return 50;
  }
}

// ── Regime Detection ──────────────────────────────────────────────

/**
 * Detect market regime and compute normalized regime score.
 * 
 * Uses existing `classifyRegime()` from lib/market-regime.ts with
 * volatility-clustering algorithm (ADX + ATR + BB width).
 * 
 * @param input - SuperSignalInput containing price, volume, and indicator data
 * @returns ComponentScore with regime score (0-100) and confidence
 */
export async function detectRegime(input: SuperSignalInput): Promise<ComponentScore> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cached = getCachedComponentScore(input.symbol, 'regime');
    if (cached) {
      return cached;
    }
    
    // If regime is already computed in ScreenerEntry, use it
    if (input.regime) {
      const directionBias = input.change24h > 0 ? 1 : input.change24h < 0 ? -1 : 0;
      const score = mapRegimeToScore(input.regime, directionBias);
      const result: ComponentScore = {
        score,
        confidence: input.regime.confidence,
        computeTimeMs: Date.now() - startTime,
      };
      
      setCachedComponentScore(input.symbol, 'regime', result);
      return result;
    }
    
    // Otherwise, compute regime using volatility-clustering
    const { adx, atr, bbUpper, bbMiddle, bbLower, avgVolume1m, curCandleVol, change24h } = input;
    
    // Validate required data
    if (adx === null) {
      return {
        score: 50,
        confidence: 0,
        error: 'ADX data unavailable',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Compute rolling ATR average (simplified: use current ATR as proxy)
    const atrAvg = atr !== null ? atr * 0.9 : null; // Assume current ATR is ~10% above average
    
    // Compute BB width and average
    let bbWidth: number | null = null;
    let bbWidthAvg: number | null = null;
    
    if (bbUpper !== null && bbLower !== null && bbMiddle !== null && bbMiddle > 0) {
      bbWidth = (bbUpper - bbLower) / bbMiddle;
      bbWidthAvg = bbWidth * 0.95; // Assume current width is ~5% above average
    }
    
    // Volume spike detection
    const volumeSpike = avgVolume1m !== null && curCandleVol !== null && avgVolume1m > 0
      ? curCandleVol >= avgVolume1m * 2.0
      : false;
    
    // Volume ratio for momentum override
    const volumeRatio = avgVolume1m !== null && curCandleVol !== null && avgVolume1m > 0
      ? curCandleVol / avgVolume1m
      : null;
    
    // Determine direction bias for scoring
    const directionBias = change24h > 0 ? 1 : change24h < 0 ? -1 : 0;

    // Call existing classifyRegime()
    const classification = classifyRegime({
      adx,
      atr,
      atrAvg,
      bbWidth,
      bbWidthAvg,
      volumeSpike,
      priceChange24h: change24h,
      volumeRatio,
    });
    
    // Map to 0-100 score with direction bias
    const score = mapRegimeToScore(classification, directionBias);
    
    const result: ComponentScore = {
      score,
      confidence: classification.confidence,
      computeTimeMs: Date.now() - startTime,
    };
    
    // Cache result
    setCachedComponentScore(input.symbol, 'regime', result);
    
    return result;
    
  } catch (error) {
    console.error('[super-signal] Regime detection error:', error);
    return {
      score: 50,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      computeTimeMs: Date.now() - startTime,
    };
  }
}
