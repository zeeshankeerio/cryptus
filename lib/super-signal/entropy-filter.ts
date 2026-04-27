/**
 * RSIQ Pro - SUPER_SIGNAL Entropy Filter Module
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Uses Shannon entropy to distinguish structured price movements from random noise.
 * High entropy = random/noisy moves (low confidence)
 * Low entropy = structured/trending moves (high confidence)
 */

import type { ComponentScore, SuperSignalInput } from './types';
import { getCachedEntropy, setCachedEntropy } from './cache';
import { getConfig } from './config';

// ── Pre-computed Log2 Lookup Table ───────────────────────────────

/**
 * Pre-computed log2 lookup table for performance optimization.
 * Avoids repeated Math.log2() calls during entropy computation.
 * 
 * Range: 0.001 to 1.0 in 0.001 steps (1000 entries)
 */
const LOG2_LOOKUP: Map<number, number> = new Map();

function initLog2Lookup() {
  if (LOG2_LOOKUP.size > 0) return; // Already initialized
  
  for (let i = 1; i <= 1000; i++) {
    const p = i / 1000;
    LOG2_LOOKUP.set(p, Math.log2(p));
  }
}

function fastLog2(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 0;
  
  // Round to nearest 0.001
  const rounded = Math.round(p * 1000) / 1000;
  const cached = LOG2_LOOKUP.get(rounded);
  
  if (cached !== undefined) return cached;
  
  // Fallback to Math.log2 for values outside lookup range
  return Math.log2(p);
}

// Initialize lookup table on module load
initLog2Lookup();

// ── Price Return Discretization ──────────────────────────────────

/**
 * Discretize price returns into N buckets for entropy computation.
 * 
 * @param returns - Array of price returns (percent changes)
 * @param numBuckets - Number of buckets (default: 10)
 * @returns Probability distribution array
 */
function discretizeReturns(returns: number[], numBuckets: number): number[] {
  if (returns.length === 0) return [];
  
  // Find min/max returns
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const range = maxReturn - minReturn;
  
  // Handle edge case: all returns identical
  if (range === 0) {
    const probs = new Array(numBuckets).fill(0);
    probs[Math.floor(numBuckets / 2)] = 1.0; // All mass in center bucket
    return probs;
  }
  
  // Assign each return to a bucket
  const bucketCounts = new Array(numBuckets).fill(0);
  const bucketWidth = range / numBuckets;
  
  for (const ret of returns) {
    const bucketIndex = Math.min(
      Math.floor((ret - minReturn) / bucketWidth),
      numBuckets - 1
    );
    bucketCounts[bucketIndex]++;
  }
  
  // Convert counts to probabilities
  const total = returns.length;
  return bucketCounts.map(count => count / total);
}

// ── Shannon Entropy Computation ──────────────────────────────────

/**
 * Compute Shannon entropy of a probability distribution.
 * 
 * Formula: H = -Σ p(x) * log2(p(x))
 * 
 * @param probabilities - Probability distribution (must sum to 1.0)
 * @returns Entropy value (0.0 to log2(N))
 */
function computeShannonEntropy(probabilities: number[]): number {
  let entropy = 0;
  
  for (const p of probabilities) {
    if (p > 0) {
      entropy -= p * fastLog2(p);
    }
  }
  
  return entropy;
}

// ── Entropy Score Computation ─────────────────────────────────────

/**
 * Compute normalized entropy score (0-100).
 * 
 * Score interpretation:
 * - 0-20: Very high entropy (random noise, no structure)
 * - 20-40: High entropy (noisy, low confidence)
 * - 40-60: Moderate entropy (mixed signals)
 * - 60-80: Low entropy (structured, high confidence)
 * - 80-100: Very low entropy (strong structure, very high confidence)
 * 
 * Formula: EntropyScore = (1 - normalizedEntropy) * 100
 * where normalizedEntropy = H / log2(numBuckets)
 */
function computeEntropyScore(
  historicalCloses: number[],
  windowSize: number,
  numBuckets: number
): { score: number; entropy: number } | null {
  // Validate window size
  if (historicalCloses.length < windowSize) {
    return null;
  }
  
  // Extract rolling window
  const window = historicalCloses.slice(-windowSize);
  
  // Compute price returns (percent changes)
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    const ret = (window[i] - window[i - 1]) / window[i - 1];
    if (Number.isFinite(ret)) {
      returns.push(ret);
    }
  }
  
  // Handle edge case: insufficient returns
  if (returns.length < 5) {
    return null;
  }
  
  // Discretize returns into buckets
  const probabilities = discretizeReturns(returns, numBuckets);
  
  // Compute Shannon entropy
  const entropy = computeShannonEntropy(probabilities);
  
  // Normalize entropy to [0, 1]
  const maxEntropy = Math.log2(numBuckets);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  
  // Convert to score: low entropy = high score (high confidence)
  const score = Math.round((1 - normalizedEntropy) * 100);
  
  return { score, entropy: normalizedEntropy };
}

// ── Entropy Filter ────────────────────────────────────────────────

/**
 * Filter price movements using Shannon entropy.
 * 
 * Distinguishes structured (low entropy) from random (high entropy) moves.
 * Used to filter out noise and focus on high-confidence signals.
 * 
 * @param input - SuperSignalInput containing historical price data
 * @returns ComponentScore with entropy score (0-100)
 */
export async function filterEntropy(input: SuperSignalInput): Promise<ComponentScore> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cachedEntropy = getCachedEntropy(input.symbol);
    const config = getConfig();
    const directionBias = input.change24h > 0 ? 1 : input.change24h < 0 ? -1 : 0;

    if (cachedEntropy !== null) {
      const rawScore = Math.round((1 - cachedEntropy) * 100);
      // Map raw confidence score (0-100) to directional score (0-100)
      // High confidence + Bullish bias → 100
      // High confidence + Bearish bias → 0
      const directionalScore = Math.round(50 + (directionBias * (rawScore / 2)));
      
      return {
        score: directionalScore,
        confidence: 100,
        computeTimeMs: Date.now() - startTime,
      };
    }
    const { historicalCloses } = input;
    
    // Validate historical data
    if (!historicalCloses || historicalCloses.length < config.entropy.minWindowSize) {
      return {
        score: 50,
        confidence: 0,
        error: 'Insufficient historical data for entropy computation',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Compute entropy score
    const result = computeEntropyScore(
      historicalCloses,
      config.entropy.windowSize,
      config.entropy.numBuckets
    );
    
    if (!result) {
      return {
        score: 50,
        confidence: 0,
        error: 'Entropy computation failed',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Cache entropy value
    setCachedEntropy(input.symbol, result.entropy);
    
    // Map raw confidence score (0-100) to directional score (0-100)
    // Low entropy = high rawScore. Directional bias scales this around 50.
    const directionalScore = Math.round(50 + (directionBias * (result.score / 2)));
    
    const componentScore: ComponentScore = {
      score: directionalScore,
      confidence: 100,
      computeTimeMs: Date.now() - startTime,
    };
    
    return componentScore;
    
  } catch (error) {
    console.error('[super-signal] Entropy filter error:', error);
    return {
      score: 50,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      computeTimeMs: Date.now() - startTime,
    };
  }
}
