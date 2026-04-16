/**
 * RSIQ Pro — Correlation Heatmap Engine
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 * https://mindscapeanalytics.com/
 *
 * Computes real-time Pearson correlation coefficients between assets.
 * Supports cross-asset class correlation (Crypto ↔ Forex ↔ Metals ↔ Stocks).
 *
 * Algorithm:
 *   Pearson's r = Σ((xi - x̄)(yi - ȳ)) / √(Σ(xi - x̄)² · Σ(yi - ȳ)²)
 *   where xi/yi are % price changes over aligned time windows.
 *
 * Output:
 *   - NxN correlation matrix with -1.0 to +1.0 values
 *   - Strength labels (Strong Positive, Weak Negative, etc.)
 *   - Top correlated/anti-correlated pairs for insights
 */

// ── Types ─────────────────────────────────────────────────────────

export interface CorrelationPair {
  symbolA: string;
  symbolB: string;
  coefficient: number; // -1.0 to +1.0
  strength: CorrelationStrength;
  direction: 'positive' | 'negative' | 'neutral';
}

export type CorrelationStrength =
  | 'very-strong'   // |r| >= 0.8
  | 'strong'        // |r| >= 0.6
  | 'moderate'      // |r| >= 0.4
  | 'weak'          // |r| >= 0.2
  | 'negligible';   // |r| < 0.2

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][]; // NxN matrix of correlation coefficients
  pairs: CorrelationPair[]; // All unique pairs sorted by |coefficient|
  topPositive: CorrelationPair[]; // Top 5 most positively correlated
  topNegative: CorrelationPair[]; // Top 5 most negatively correlated (hedging opportunities)
  computedAt: number;
}

export interface AssetReturns {
  symbol: string;
  returns: number[]; // Array of % returns (e.g., 1-minute returns)
}

// ── Helpers ───────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function classifyStrength(r: number): CorrelationStrength {
  const abs = Math.abs(r);
  if (abs >= 0.8) return 'very-strong';
  if (abs >= 0.6) return 'strong';
  if (abs >= 0.4) return 'moderate';
  if (abs >= 0.2) return 'weak';
  return 'negligible';
}

/**
 * Compute Pearson correlation coefficient between two return series.
 * Returns null if insufficient data (< 10 aligned data points).
 */
function pearsonCorrelation(x: number[], y: number[]): number | null {
  // Align to shortest series
  const n = Math.min(x.length, y.length);
  if (n < 10) return null;

  // Use only the last `n` values (aligned)
  const xAligned = x.slice(-n);
  const yAligned = y.slice(-n);

  const xMean = mean(xAligned);
  const yMean = mean(yAligned);

  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (let i = 0; i < n; i++) {
    const dx = xAligned[i] - xMean;
    const dy = yAligned[i] - yMean;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }

  const denominator = Math.sqrt(xVariance * yVariance);
  if (denominator === 0) return 0; // No variance = no correlation

  return Math.max(-1, Math.min(1, numerator / denominator));
}

// ── Core Functions ────────────────────────────────────────────────

/**
 * Convert price series to return series (% changes).
 * This normalizes price levels so BTC ($60k) can be compared with DOGE ($0.15).
 */
export function pricesToReturns(closes: number[]): number[] {
  if (closes.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  return returns;
}

/**
 * Compute the full NxN correlation matrix for the given assets.
 * Each asset must provide its return series (use `pricesToReturns` to convert from closes).
 */
export function computeCorrelationMatrix(assets: AssetReturns[]): CorrelationMatrix {
  const n = assets.length;
  const symbols = assets.map(a => a.symbol);

  // Initialize NxN matrix with 1.0 on diagonal
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0; // Self-correlation is always 1.0
    for (let j = i + 1; j < n; j++) {
      const r = pearsonCorrelation(assets[i].returns, assets[j].returns);
      const coeff = r ?? 0;
      matrix[i][j] = coeff;
      matrix[j][i] = coeff; // Symmetric

      pairs.push({
        symbolA: symbols[i],
        symbolB: symbols[j],
        coefficient: Math.round(coeff * 100) / 100,
        strength: classifyStrength(coeff),
        direction: coeff > 0.05 ? 'positive' : coeff < -0.05 ? 'negative' : 'neutral',
      });
    }
  }

  // Sort pairs by absolute correlation (strongest first)
  pairs.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  const topPositive = pairs
    .filter(p => p.direction === 'positive')
    .slice(0, 5);

  const topNegative = pairs
    .filter(p => p.direction === 'negative')
    .slice(0, 5);

  return {
    symbols,
    matrix,
    pairs,
    topPositive,
    topNegative,
    computedAt: Date.now(),
  };
}

/**
 * Get a human-readable color for a correlation coefficient.
 * Used by the UI heatmap component.
 */
export function getCorrelationColor(r: number): string {
  if (r >= 0.8) return 'bg-emerald-500';
  if (r >= 0.6) return 'bg-emerald-500/70';
  if (r >= 0.4) return 'bg-emerald-500/40';
  if (r >= 0.2) return 'bg-emerald-500/20';
  if (r > -0.2) return 'bg-slate-700/50';
  if (r > -0.4) return 'bg-rose-500/20';
  if (r > -0.6) return 'bg-rose-500/40';
  if (r > -0.8) return 'bg-rose-500/70';
  return 'bg-rose-500';
}

/**
 * Get text color for a correlation coefficient for readability.
 */
export function getCorrelationTextColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.6) return 'text-white';
  if (abs >= 0.3) return 'text-slate-200';
  return 'text-slate-400';
}
