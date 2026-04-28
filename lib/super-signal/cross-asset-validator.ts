/**
 * RSIQ Pro - SUPER_SIGNAL Cross-Asset Confirmation Module
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Validates signals using correlated assets to avoid false signals from isolated price movements.
 * 
 * Asset-class routing:
 * - Metals (Gold, Silver, Copper): Use Gold + Silver + DXY correlation
 * - Crypto: Use BTC + ETH + USDT dominance + NASDAQ correlation
 * - Forex: Use major pairs correlation (EUR, GBP, JPY, AUD)
 * - Stocks/Index: Use SPX + NDAQ + sector ETFs
 */

import type { ComponentScore, SuperSignalInput, AssetClass } from './types';
import { getCachedCrossAssetPrice, setCachedCrossAssetPrice, getCachedComponentScore, setCachedComponentScore } from './cache';
import { getConfig } from './config';

// ── Correlated Asset Mapping ─────────────────────────────────────

/**
 * Get correlated assets for a given asset class.
 * Returns symbols that should move in correlation with the primary asset.
 */
function getCorrelatedAssets(assetClass: AssetClass, symbol: string): string[] {
  switch (assetClass) {
    case 'Metal':
      // Metals: Gold, Silver, DXY (inverse correlation)
      if (symbol.includes('XAU') || symbol.includes('GOLD') || symbol === 'PAXGUSDT') {
        return ['XAGUSD', 'DXY', 'EURUSDT']; // Silver, DXY, EUR (DXY proxy inverse)
      }
      if (symbol.includes('XAG') || symbol.includes('SILVER')) {
        return ['PAXGUSDT', 'DXY', 'EURUSDT']; // Gold, DXY, EUR
      }
      return ['PAXGUSDT', 'XAGUSD', 'DXY', 'EURUSDT']; // Default: Gold, Silver, DXY, EUR
      
    case 'Crypto':
      // Crypto: BTC, ETH, USDT dominance (inverse), NASDAQ (risk-on proxy)
      if (symbol === 'BTCUSDT') {
        return ['ETHUSDT', 'NASDAQ', 'NQ1!', 'SOLUSDT']; // Major macro + alt proxies
      }
      if (symbol === 'ETHUSDT') {
        return ['BTCUSDT', 'NASDAQ', 'NQ1!', 'SOLUSDT'];
      }
      return ['BTCUSDT', 'ETHUSDT', 'NASDAQ', 'NQ1!']; // Default macro-confirmed basket
      
    case 'Forex':
      // Forex: Major pairs correlation
      if (symbol.includes('EUR')) {
        return ['GBPUSDT', 'AUDUSDT']; // Risk-on currencies
      }
      if (symbol.includes('GBP')) {
        return ['EURUSDT', 'AUDUSDT'];
      }
      return ['EURUSDT', 'GBPUSDT']; // Default: EUR + GBP
      
    case 'Stocks':
    case 'Index':
      // Stocks/Index: SPX, NASDAQ, sector correlation
      return ['SPX', 'NDAQ']; // Major indices
      
    default:
      return [];
  }
}

// ── Signal Direction Extraction ──────────────────────────────────

/**
 * Extract directional signal from strategySignal.
 * Returns: 1 (bullish), -1 (bearish), 0 (neutral)
 */
function extractDirection(signal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'): number {
  switch (signal) {
    case 'strong-buy':
    case 'buy':
      return 1;
    case 'strong-sell':
    case 'sell':
      return -1;
    case 'neutral':
    default:
      return 0;
  }
}

// ── Directional Agreement Scoring ────────────────────────────────

/**
 * Compute directional agreement score based on correlated asset signals.
 * 
 * @param primaryDirection - Primary asset direction (1, -1, or 0)
 * @param correlatedDirections - Array of correlated asset directions
 * @param config - Configuration
 * @returns Agreement score (0-100)
 */
function computeAgreementScore(
  primaryDirection: number,
  correlatedDirections: number[],
  config: ReturnType<typeof getConfig>
): number {
  if (correlatedDirections.length === 0 || primaryDirection === 0) {
    return 50; // Neutral if no correlated data or no primary direction
  }
  
  // Count agreements
  let agreements = 0;
  let total = 0;
  
  for (const dir of correlatedDirections) {
    total++;
    if (dir === primaryDirection) {
      agreements++;
    } else if (dir === 0) {
      // Neutral counts as 0.5 agreement
      agreements += 0.5;
    }
  }
  
  const agreementRatio = total > 0 ? agreements / total : 0.5;
  const { agreementThreshold, disagreementThreshold } = config.crossAsset;
  
  // ── Direction-Aware Agreement Mapping ──
  // If primary is Bullish (+1): Agreement → High Score (70-100), Disagreement → Low Score (0-40)
  // If primary is Bearish (-1): Agreement → Low Score (0-30), Disagreement → High Score (60-100)
  
  if (primaryDirection > 0) {
    if (agreementRatio >= agreementThreshold) {
      const magnitude = (agreementRatio - agreementThreshold) / (1.0 - agreementThreshold);
      return Math.round(70 + (magnitude * 30)); // 70-100
    } else if (agreementRatio <= disagreementThreshold) {
      const magnitude = (disagreementThreshold - agreementRatio) / disagreementThreshold;
      return Math.round(40 - (magnitude * 40)); // 0-40
    } else {
      const range = agreementThreshold - disagreementThreshold;
      const position = (agreementRatio - disagreementThreshold) / range;
      return Math.round(40 + (position * 30)); // 40-70
    }
  } else {
    // Primary is Bearish
    if (agreementRatio >= agreementThreshold) {
      // High agreement with BEARISH signal → result should be low (0-30)
      const magnitude = (agreementRatio - agreementThreshold) / (1.0 - agreementThreshold);
      return Math.round(30 - (magnitude * 30)); // 30-0
    } else if (agreementRatio <= disagreementThreshold) {
      // High disagreement with BEARISH signal (i.e., others are bullish) → result should be high (60-100)
      const magnitude = (disagreementThreshold - agreementRatio) / disagreementThreshold;
      return Math.round(60 + (magnitude * 40)); // 60-100
    } else {
      // Moderate agreement with BEARISH signal
      const range = agreementThreshold - disagreementThreshold;
      const position = (agreementRatio - disagreementThreshold) / range;
      return Math.round(60 - (position * 30)); // 60-30
    }
  }
}

// ── Cross-Asset Validation ───────────────────────────────────────

/**
 * Validate signal using correlated assets.
 * 
 * Fetches signals from correlated assets and computes directional agreement.
 * High agreement = high confidence, low agreement = low confidence.
 * 
 * @param input - SuperSignalInput containing primary asset data
 * @param correlatedSignals - Map of correlated asset symbols to their signals (optional, for testing)
 * @returns ComponentScore with cross-asset confirmation score (0-100)
 */
export async function validateCrossAsset(
  input: SuperSignalInput,
  correlatedSignals?: Map<string, 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'>
): Promise<ComponentScore> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cached = getCachedComponentScore(input.symbol, 'crossAsset');
    if (cached) {
      return cached;
    }
    
    const config = getConfig();
    const { symbol, assetClass, strategySignal } = input;
    
    // Get correlated assets
    const correlatedAssets = getCorrelatedAssets(assetClass, symbol);
    
    if (correlatedAssets.length === 0) {
      // No correlated assets defined for this asset class
      return {
        score: 50,
        confidence: 0,
        error: 'No correlated assets defined',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Extract primary direction
    const primaryDirection = extractDirection(strategySignal);
    
    // Extract correlated directions
    const correlatedDirections: number[] = [];
    let availableAssets = 0;
    
    const effectiveSignals = correlatedSignals ?? input.correlatedSignals;

    for (const correlatedSymbol of correlatedAssets) {
      // Use provided signals (for testing) or fetch from cache
      let signal: 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell' | null = null;
      
      if (effectiveSignals) {
        signal = effectiveSignals.get(correlatedSymbol) ?? null;
      }
      
      if (signal) {
        availableAssets++;
        correlatedDirections.push(extractDirection(signal));
      } else {
        // Missing data: contribute neutral (0.5 weight)
        correlatedDirections.push(0);
      }
    }
    
    // Compute agreement score
    const score = computeAgreementScore(primaryDirection, correlatedDirections, config);
    
    // Compute confidence based on data availability
    const confidence = availableAssets > 0
      ? Math.round((availableAssets / correlatedAssets.length) * 100)
      : 0;
    
    const result: ComponentScore = {
      score,
      confidence,
      computeTimeMs: Date.now() - startTime,
    };
    
    // Cache result
    setCachedComponentScore(input.symbol, 'crossAsset', result);
    
    return result;
    
  } catch (error) {
    console.error('[super-signal] Cross-asset validation error:', error);
    return {
      score: 50,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      computeTimeMs: Date.now() - startTime,
    };
  }
}
