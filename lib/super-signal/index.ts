/**
 * RSIQ Pro - SUPER_SIGNAL Main Orchestrator
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Main entry point for SUPER_SIGNAL computation.
 * Provides fail-safe orchestration with graceful degradation.
 */

import type { ScreenerEntry } from '../types';
import type { SuperSignalResult, SuperSignalInput } from './types';
import { computeSuperSignal as fuseSuperSignal } from './fusion-engine';
import { getConfig } from './config';

// ── ScreenerEntry to SuperSignalInput Conversion ─────────────────

/**
 * Convert ScreenerEntry to SuperSignalInput.
 * Extracts only the fields needed for SUPER_SIGNAL computation.
 */
function convertToInput(
  entry: ScreenerEntry,
  correlatedSignals?: Map<string, 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'>
): SuperSignalInput {
  return {
    symbol: entry.symbol,
    price: entry.price,
    assetClass: entry.market,
    rsi1m: entry.rsi1m,
    rsi5m: entry.rsi5m,
    rsi15m: entry.rsi15m,
    rsi1h: entry.rsi1h,
    rsi4h: entry.rsi4h,
    rsi1d: entry.rsi1d,
    atr: entry.atr,
    adx: entry.adx,
    vwap: entry.vwap,
    vwapDiff: entry.vwapDiff,
    volume24h: entry.volume24h,
    avgVolume1m: entry.avgVolume1m,
    curCandleVol: entry.curCandleVol,
    bbUpper: entry.bbUpper,
    bbMiddle: entry.bbMiddle,
    bbLower: entry.bbLower,
    change24h: entry.change24h,
    strategySignal: entry.strategySignal,
    smartMoneyScore: entry.smartMoneyScore ?? null,
    fundingRate: entry.fundingRate ?? null,
    orderFlowRatio: entry.orderFlowRatio ?? null,
    historicalCloses: entry.historicalCloses,
    regime: entry.regime,
    correlatedSignals,
  };
}

// ── Main Orchestrator ─────────────────────────────────────────────

/**
 * Compute SUPER_SIGNAL for a given ScreenerEntry.
 * 
 * Main orchestration function with fail-safe behavior:
 * - Converts ScreenerEntry to SuperSignalInput
 * - Calls fusion engine to compute SUPER_SIGNAL
 * - Returns null on failure (graceful degradation)
 * - Existing strategySignal always preserved
 * 
 * @param entry - ScreenerEntry with all indicator data
 * @returns SuperSignalResult or null if computation fails
 */
export async function computeSuperSignal(
  entry: ScreenerEntry,
  options?: {
    correlatedSignals?: Map<string, 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell'>;
    abortSignal?: AbortSignal;
  }
): Promise<SuperSignalResult | null> {
  try {
    const config = getConfig();
    
    // Check if SUPER_SIGNAL is enabled
    if (!config.enabled) {
      return null;
    }
    
    // Convert to input format
    const input = convertToInput(entry, options?.correlatedSignals);
    
    // Compute SUPER_SIGNAL
    const result = await fuseSuperSignal(input, options?.abortSignal);
    
    return result;
    
  } catch (error) {
    console.error('[super-signal] Orchestrator error:', error);
    return null;
  }
}

// ── Re-export Types ───────────────────────────────────────────────

export type { SuperSignalResult, ComponentScores, SuperSignalCategory } from './types';
export { getConfig, reloadConfig, resetToDefaults } from './config';
export { clearAllCaches, invalidateSymbolCache, getCacheStats, logCacheStats } from './cache';
