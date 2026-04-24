/**
 * RSIQ Pro - Technical Indicators Library
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 * https://mindscapeanalytics.com/
 *
 * PROPRIETARY AND CONFIDENTIAL.
 * All functions operate on arrays of numeric values (close prices, volumes, etc.)
 */

import { calculateRsiSeries } from './rsi';
import { LRUCache } from './lru-cache';

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

// ── EMA (Exponential Moving Average) ────────────────────────────

export function calculateEma(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const k = 2 / (period + 1);
  const ema: number[] = [];

  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  ema.push(sum / period);

  for (let i = period; i < data.length; i++) {
    ema.push(data[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

/** Get latest EMA value, or null if not enough data. */
export function latestEma(data: number[], period: number): number | null {
  const ema = calculateEma(data, period);
  return ema.length > 0 ? round(ema[ema.length - 1]) : null;
}

/** Get latest EMA value AND state for live shadowing. */
export function latestEmaWithState(data: number[], period: number): { ema: number } | null {
  const ema = calculateEma(data, period);
  return ema.length > 0 ? { ema: round(ema[ema.length - 1]) } : null;
}

// ── EMA Cross detection ─────────────────────────────────────────

export function detectEmaCross(
  closes: number[],
  fastPeriod: number,
  slowPeriod: number,
): 'bullish' | 'bearish' | 'none' {
  const fast = calculateEma(closes, fastPeriod);
  const slow = calculateEma(closes, slowPeriod);

  if (slow.length < 2) return 'none';

  // Align: fast EMA is longer than slow, offset to compare at the same data point
  const align = fast.length - slow.length;

  const f1 = fast[align + slow.length - 2]; // previous fast, aligned to previous slow
  const f2 = fast[align + slow.length - 1]; // current fast, aligned to current slow
  const s1 = slow[slow.length - 2];          // previous slow
  const s2 = slow[slow.length - 1];          // current slow

  if (f1 === undefined || f2 === undefined || s1 === undefined || s2 === undefined) return 'none';

  // Crossover detection
  if (f1 <= s1 && f2 > s2) return 'bullish';
  if (f1 >= s1 && f2 < s2) return 'bearish';
  // Current trend (no fresh cross)
  if (f2 > s2) return 'bullish';
  if (f2 < s2) return 'bearish';
  return 'none';
}

// ── MACD ────────────────────────────────────────────────────────

export interface MacdResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export function calculateMacd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult | null {
  // Stability check: MACD needs at least slowPeriod + signalPeriod bars for a valid signal line.
  // We use 2x the slow period as a practical minimum for a stable, non-noisy signal.
  // (26*2 = 52 bars minimum — avoids the "signal line still forming" problem)
  if (closes.length < slowPeriod * 2) return null;

  const emaFast = calculateEma(closes, fastPeriod);
  const emaSlow = calculateEma(closes, slowPeriod);

  if (emaSlow.length < signalPeriod) return null;

  // MACD line = fast EMA - slow EMA (aligned)
  const offset = emaFast.length - emaSlow.length;
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  // Signal line = EMA of MACD line
  const signalLine = calculateEma(macdLine, signalPeriod);
  if (signalLine.length === 0) return null;

  return {
    macdLine: round(macdLine[macdLine.length - 1]),
    signalLine: round(signalLine[signalLine.length - 1]),
    histogram: round(macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1]),
  };
}

/** MACD with full state seeds for worker real-time shadowing. */
export function calculateMacdWithState(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { fastState: { ema: number }; slowState: { ema: number }; signalState: { ema: number }; histogram: number } | null {
  if (closes.length < slowPeriod * 2) return null;

  const emaFast = calculateEma(closes, fastPeriod);
  const emaSlow = calculateEma(closes, slowPeriod);

  if (emaSlow.length < signalPeriod) return null;

  const offset = emaFast.length - emaSlow.length;
  const macdLine: number[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    macdLine.push(emaFast[i + offset] - emaSlow[i]);
  }

  const signalLine = calculateEma(macdLine, signalPeriod);
  if (signalLine.length === 0) return null;

  const lastMacdLine = macdLine[macdLine.length-1];
  const lastSignalLine = signalLine[signalLine.length-1];

  return {
    fastState: { ema: round(emaFast[emaFast.length - 1]) },
    slowState: { ema: round(emaSlow[emaSlow.length - 1]) },
    signalState: { ema: round(lastSignalLine) },
    histogram: round(lastMacdLine - lastSignalLine)
  };
}

// ── Bollinger Bands ─────────────────────────────────────────────

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  /** 0 = at lower band, 0.5 = middle, 1 = at upper band */
  position: number;
}

export function calculateBollinger(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerResult | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  let variance = 0;
  for (const v of slice) variance += (v - mean) ** 2;
  const stdDev = Math.sqrt(variance / period);

  const upper = mean + stdDevMultiplier * stdDev;
  const lower = mean - stdDevMultiplier * stdDev;
  const current = closes[closes.length - 1];
  const range = upper - lower;
  // Clamp position to [0, 1] to handle outliers beyond the bands
  const pos = range > 0 ? Math.max(0, Math.min(1, (current - lower) / range)) : 0.5;

  return {
    upper: round(upper),
    middle: round(mean),
    lower: round(lower),
    position: round(pos),
  };
}

/** Bollinger Bands with state for worker shadowing. */
export function calculateBollingerWithState(
  data: number[],
  period = 20,
  stdDev = 2,
): { upper: number; lower: number; middle: number; position: number } | null {
  const res = calculateBollinger(data, period, stdDev);
  return res ? { upper: res.upper, lower: res.lower, middle: res.middle, position: res.position } : null;
}

// ── RSI (Relative Strength Index) ───────────────────────────────

export function calculateRsi(closes: number[], period = 14): number | null {
  const series = calculateRsiSeries(closes, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

// ── Stochastic RSI ──────────────────────────────────────────────

export interface StochRsiResult {
  k: number;
  d: number;
}

export function calculateStochRsi(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): StochRsiResult | null {
  // First compute RSI series
  if (closes.length < rsiPeriod + stochPeriod + kSmooth + dSmooth) return null;

  const rsiSeries: number[] = [];

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < rsiPeriod; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= rsiPeriod;
  avgLoss /= rsiPeriod;

  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  rsiSeries.push(firstRsi);

  for (let i = rsiPeriod; i < changes.length; i++) {
    const c = changes[i];
    if (c > 0) {
      avgGain = (avgGain * (rsiPeriod - 1) + c) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1)) / rsiPeriod;
    } else {
      avgGain = (avgGain * (rsiPeriod - 1)) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + Math.abs(c)) / rsiPeriod;
    }
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    rsiSeries.push(rsi);
  }

  if (rsiSeries.length < stochPeriod) return null;

  // Stochastic of RSI
  const stochRaw: number[] = [];
  for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
    const window = rsiSeries.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    stochRaw.push(max === min ? 50 : ((rsiSeries[i] - min) / (max - min)) * 100);
  }

  // K = SMA of stochRaw
  if (stochRaw.length < kSmooth) return null;
  const kValues: number[] = [];
  for (let i = kSmooth - 1; i < stochRaw.length; i++) {
    let sum = 0;
    for (let j = 0; j < kSmooth; j++) sum += stochRaw[i - j];
    kValues.push(sum / kSmooth);
  }

  // D = SMA of K
  if (kValues.length < dSmooth) return null;
  let dSum = 0;
  for (let i = kValues.length - dSmooth; i < kValues.length; i++) dSum += kValues[i];

  return {
    k: round(kValues[kValues.length - 1]),
    d: round(dSum / dSmooth),
  };
}

// ── VWAP (Volume-Weighted Average Price) ────────────────────────

export function calculateVwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): number | null {
  if (closes.length === 0 || highs.length === 0 || lows.length === 0 || volumes.length === 0) return null;

  let cumTPV = 0;
  let cumVol = 0;

  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
  }

  return cumVol > 0 ? round(cumTPV / cumVol) : null;
}

// ── Volume Spike Detection ──────────────────────────────────────

export function detectVolumeSpike(
  volumes: number[],
  lookback = 20,
  threshold = 2.0,
): boolean {
  if (volumes.length < lookback + 1) return false;

  const recent = volumes.slice(-lookback - 1, -1);
  if (recent.length === 0) return false;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const current = volumes[volumes.length - 1];

  return Number.isFinite(avg) && avg > 0 && Number.isFinite(current) && current >= avg * threshold;
}

/** Average height (High - Low) over N periods */
export function calculateAvgBarSize(highs: number[], lows: number[], period = 20): number | null {
  if (highs.length < period || lows.length < period) return null;
  const hSlice = highs.slice(-period);
  const lSlice = lows.slice(-period);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += (hSlice[i] - lSlice[i]);
  return round(sum / period);
}

/** Average volume over N periods */
export function calculateAvgVolume(volumes: number[], period = 20): number | null {
  if (volumes.length < period) return null;
  const slice = volumes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return round(sum / period);
}

// ── RSI Divergence ──────────────────────────────────────────────

function computeRsiSeries(closes: number[], period: number): number[] {
  const values: number[] = [];
  if (closes.length < period + 1) return values;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = 0; i < period; i++) values.push(50); // padding for alignment
  values.push(avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    if (c > 0) {
      avgGain = (avgGain * (period - 1) + c) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(c)) / period;
    }
    values.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return values;
}

function findSwingLows(data: number[], tolerance = 3): number[] {
  const lows: number[] = [];
  for (let i = tolerance; i < data.length - tolerance; i++) {
    let isLow = true;
    for (let j = 1; j <= tolerance; j++) {
      if (data[i] > data[i - j] || data[i] > data[i + j]) { isLow = false; break; }
    }
    if (isLow) lows.push(i);
  }
  return lows;
}

function findSwingHighs(data: number[], tolerance = 3): number[] {
  const highs: number[] = [];
  for (let i = tolerance; i < data.length - tolerance; i++) {
    let isHigh = true;
    for (let j = 1; j <= tolerance; j++) {
      if (data[i] < data[i - j] || data[i] < data[i + j]) { isHigh = false; break; }
    }
    if (isHigh) highs.push(i);
  }
  return highs;
}

/**
 * Detect bullish or bearish RSI divergence.
 * Bullish: price makes lower lows while RSI makes higher lows (potential reversal up).
 * Bearish: price makes higher highs while RSI makes lower highs (potential reversal down).
 *
 * Tolerance is dynamic: wider for volatile assets (crypto), tighter for stable ones (forex).
 * This prevents false positives on high-volatility assets and missed signals on low-volatility ones.
 */
export function detectRsiDivergence(
  closes: number[],
  rsiPeriod = 14,
  lookback = 40,
): 'bullish' | 'bearish' | 'none' {
  if (closes.length < rsiPeriod + lookback) return 'none';

  const priceWindow = closes.slice(-lookback);
  const fullRsi = computeRsiSeries(closes.slice(-(rsiPeriod + lookback)), rsiPeriod);
  const rsiWindow = fullRsi.slice(-lookback);
  if (rsiWindow.length < lookback) return 'none';

  // Dynamic tolerance: based on price volatility (std dev of recent returns)
  // Low volatility (Forex/Metals) → tolerance=2, High volatility (Crypto) → tolerance=4
  const recentReturns = priceWindow.slice(1).map((p, i) => Math.abs(p - priceWindow[i]) / priceWindow[i]);
  const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  // Scale: 0.1% avg return → tolerance=2, 1%+ avg return → tolerance=5
  const tolerance = Math.max(2, Math.min(5, Math.round(avgReturn * 400)));

  // Bullish divergence: lower price lows + higher RSI lows
  const priceLows = findSwingLows(priceWindow, tolerance);
  if (priceLows.length >= 2) {
    const prev = priceLows[priceLows.length - 2];
    const curr = priceLows[priceLows.length - 1];
    if (priceWindow[curr] < priceWindow[prev] && rsiWindow[curr] > rsiWindow[prev] + 1) {
      return 'bullish';
    }
  }

  // Bearish divergence: higher price highs + lower RSI highs
  const priceHighs = findSwingHighs(priceWindow, tolerance);
  if (priceHighs.length >= 2) {
    const prev = priceHighs[priceHighs.length - 2];
    const curr = priceHighs[priceHighs.length - 1];
    if (priceWindow[curr] > priceWindow[prev] && rsiWindow[curr] < rsiWindow[prev] - 1) {
      return 'bearish';
    }
  }

  return 'none';
}

// ── Rate of Change (Momentum) ───────────────────────────────────

/** Price rate of change over N periods, expressed as percentage. */
export function calculateROC(closes: number[], period = 10): number | null {
  if (closes.length < period + 1) return null;
  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 1 - period];
  if (!Number.isFinite(previous) || previous === 0) return null;
  return round(((current - previous) / previous) * 100);
}

// ── Multi-Timeframe Confluence ──────────────────────────────────

export interface ConfluenceResult {
  score: number;   // -100 to +100
  label: string;
}

/** Measures how many indicators and timeframes agree on direction. */
export function calculateConfluence(params: {
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  rsi1h: number | null;
  macdHistogram: number | null;
  emaCross: 'bullish' | 'bearish' | 'none';
  stochK: number | null;
  bbPosition: number | null;
}): ConfluenceResult {
  let bullish = 0;
  let bearish = 0;
  let total = 0;

  // Graduated RSI zone scoring — wider gradient for better signal quality
  const checkRsi = (rsi: number | null, w: number) => {
    if (rsi === null) return;
    total += w;
    // Deep oversold/overbought = full weight, approaching = partial
    if (rsi <= 20) bullish += w;
    else if (rsi <= 30) bullish += w * 0.8;
    else if (rsi <= 40) bullish += w * 0.3;
    else if (rsi >= 80) bearish += w;
    else if (rsi >= 70) bearish += w * 0.8;
    else if (rsi >= 60) bearish += w * 0.3;
  };

  checkRsi(params.rsi1m, 0.5);
  checkRsi(params.rsi5m, 1);
  checkRsi(params.rsi15m, 2.0);
  checkRsi(params.rsi1h, 3.0);

  if (params.macdHistogram !== null) {
    total += 1.5;
    if (params.macdHistogram > 0) bullish += 1.5;
    else bearish += 1.5;
  }
  if (params.emaCross !== 'none') {
    total += 1.5;
    if (params.emaCross === 'bullish') bullish += 1.5;
    else bearish += 1.5;
  }
  if (params.stochK !== null) {
    total += 1;
    if (params.stochK < 20) bullish += 1;
    else if (params.stochK < 30) bullish += 0.6;
    else if (params.stochK > 80) bearish += 1;
    else if (params.stochK > 70) bearish += 0.6;
  }
  if (params.bbPosition !== null) {
    total += 1;
    if (params.bbPosition < 0.15) bullish += 1;
    else if (params.bbPosition < 0.3) bullish += 0.5;
    else if (params.bbPosition > 0.85) bearish += 1;
    else if (params.bbPosition > 0.7) bearish += 0.5;
  }

  if (total === 0) return { score: 0, label: 'No Data' };

  let raw = ((bullish - bearish) / total) * 100;

  // ── TFA Reward: Multi-Timeframe Institutional Alignment ──
  // If 15m and 1h agree on direction, boost the confluence score by 10%
  const is15mBullish = params.rsi15m !== null && params.rsi15m < 50;
  const is1hBullish = params.rsi1h !== null && params.rsi1h < 50;
  const is15mBearish = params.rsi15m !== null && params.rsi15m > 50;
  const is1hBearish = params.rsi1h !== null && params.rsi1h > 50;

  if (is15mBullish && is1hBullish && raw > 0) raw *= 1.15;
  if (is15mBearish && is1hBearish && raw < 0) raw *= 1.15;

  const score = Math.round(Math.max(-100, Math.min(100, raw)));

  let label: string;
  if (score >= 60) label = 'Strong Bullish';
  else if (score >= 25) label = 'Bullish';
  else if (score <= -60) label = 'Strong Bearish';
  else if (score <= -25) label = 'Bearish';
  else label = 'Mixed';

  return { score, label };
}

// ── Strategy Scoring ────────────────────────────────────────────

export type StrategySignal = 'strong-buy' | 'buy' | 'neutral' | 'sell' | 'strong-sell';

export interface StrategyResult {
  score: number;        // -100 to +100
  signal: StrategySignal;
  label: string;
  reasons: string[];    // key factors driving the score
}

/**
 * Composite strategy scoring.
 * Weighs multiple indicators to produce a single buy/sell score.
 */
export function computeStrategyScore(params: {
  rsi1m: number | null;
  rsi5m: number | null;
  rsi15m: number | null;
  rsi1h: number | null;
  macdHistogram: number | null;
  bbPosition: number | null;
  stochK: number | null;
  stochD: number | null;
  emaCross: 'bullish' | 'bearish' | 'none';
  vwapDiff: number | null;
  volumeSpike: boolean;
  price: number;
  confluence?: number;
  rsiDivergence?: 'bullish' | 'bearish' | 'none';
  momentum?: number | null;
  rsiCrossover?: 'bullish_reversal' | 'bearish_reversal' | 'none';
  market?: 'Crypto' | 'Metal' | 'Forex' | 'Index' | 'Stocks';
  adx?: number | null;
  enabledIndicators?: {
    rsi?: boolean;
    macd?: boolean;
    bb?: boolean;
    stoch?: boolean;
    ema?: boolean;
    vwap?: boolean;
    confluence?: boolean;
    divergence?: boolean;
    momentum?: boolean;
  };
}): StrategyResult {
  let score = 0;
  
  // ── Asset-Aware Volatility Calibration ──
  let volatilityMultiplier = 1.0;
  if (params.market === 'Forex') volatilityMultiplier = 5.0;
  else if (params.market === 'Index' || params.market === 'Stocks') volatilityMultiplier = 2.5;
  else if (params.market === 'Metal') volatilityMultiplier = 1.5;
  let factors = 0;
  const reasons: string[] = [];
  const enabled = params.enabledIndicators || {
    rsi: true, macd: true, bb: true, stoch: true, ema: true, vwap: true, confluence: true, divergence: true, momentum: true
  };

  // ── Asset-Specific RSI Zone Calibration ──
  // Different asset classes have different RSI characteristics.
  // Forex: RSI rarely hits extremes → use tighter zones (35/65)
  // Metals/Indices: Moderate → use standard-tight (25/75)
  // Crypto: High volatility → use wide zones (20/80) — default
  let rsiDeepOS = 20, rsiOS = 30, rsiOB = 70, rsiDeepOB = 80;
  if (params.market === 'Forex') {
    rsiDeepOS = 25; rsiOS = 35; rsiOB = 65; rsiDeepOB = 75;
  } else if (params.market === 'Metal' || params.market === 'Index' || params.market === 'Stocks') {
    rsiDeepOS = 22; rsiOS = 32; rsiOB = 68; rsiDeepOB = 78;
  }

  // RSI scoring (higher weight for longer timeframes)
  const rsiScore = (rsi: number | null, weight: number, tf: string) => {
    if (rsi === null || enabled.rsi === false) return;
    factors += weight;
    if (rsi <= rsiDeepOS) { score += 100 * weight; reasons.push(`RSI ${tf} (${rsi.toFixed(1)}) deep oversold`); }
    else if (rsi <= rsiOS) { score += 70 * weight; if (weight >= 1) reasons.push(`RSI ${tf} (${rsi.toFixed(1)}) oversold`); }
    else if (rsi <= 40) score += 30 * weight;
    else if (rsi <= 60) score += 0;
    else if (rsi <= rsiOB) score -= 30 * weight;
    else if (rsi <= rsiDeepOB) { score -= 70 * weight; if (weight >= 1) reasons.push(`RSI ${tf} (${rsi.toFixed(1)}) overbought`); }
    else { score -= 100 * weight; reasons.push(`RSI ${tf} (${rsi.toFixed(1)}) deep overbought`); }
  };

  rsiScore(params.rsi1m, 0.5, '1m');
  rsiScore(params.rsi5m, 1, '5m');
  rsiScore(params.rsi15m, 1.5, '15m');
  rsiScore(params.rsi1h, 2.5, '1h');

  // MACD histogram
  if (params.macdHistogram !== null && params.price > 0 && enabled.macd !== false) {
    factors += 1.5;
    const hPct = (params.macdHistogram / params.price) * 100;
    if (hPct > 0) {
      score += Math.min(hPct * 200, 100) * 1.5;
      if (hPct * 200 > 40) reasons.push('MACD bullish');
    } else {
      score += Math.max(hPct * 200, -100) * 1.5;
      if (hPct * 200 < -40) reasons.push('MACD bearish');
    }
  }

  // Bollinger position
  if (params.bbPosition !== null && enabled.bb !== false) {
    factors += 1;
    const bp = params.bbPosition;
    if (bp <= 0.1) { score += 80 * 1; reasons.push(`Near lower BB (${bp.toFixed(2)})`); }
    else if (bp <= 0.25) score += 40 * 1;
    else if (bp >= 0.9) { score -= 80 * 1; reasons.push(`Near upper BB (${bp.toFixed(2)})`); }
    else if (bp >= 0.75) score -= 40 * 1;
  }

  // Stochastic RSI with K/D crossover confirmation
  if (params.stochK !== null && params.stochD !== null && enabled.stoch !== false) {
    factors += 1;
    if (params.stochK < 20 && params.stochD < 20) { score += 80 * 1; reasons.push(`StochRSI (${params.stochK.toFixed(0)}) oversold`); }
    else if (params.stochK < 30) score += 40 * 1;
    else if (params.stochK > 80 && params.stochD > 80) { score -= 80 * 1; reasons.push(`StochRSI (${params.stochK.toFixed(0)}) overbought`); }
    else if (params.stochK > 70) score -= 40 * 1;
    // K/D Crossover Confirmation: bullish cross (K > D) in oversold zone is high-conviction
    if (params.stochK > params.stochD && params.stochK < 30) {
      score += 35;
      reasons.push('StochRSI bullish cross in oversold');
    } else if (params.stochK < params.stochD && params.stochK > 70) {
      score -= 35;
      reasons.push('StochRSI bearish cross in overbought');
    }
    // Standard crossover in neutral zone (weaker signal)
    else if (params.stochK > params.stochD && params.stochK < 50) score += 15;
    else if (params.stochK < params.stochD && params.stochK > 50) score -= 15;
  }

  // EMA cross
  if (params.emaCross !== 'none' && enabled.ema !== false) {
    factors += 1.5;
    score += (params.emaCross === 'bullish' ? 60 : -60) * 1.5;
    reasons.push(params.emaCross === 'bullish' ? 'Bullish EMA cross' : 'Bearish EMA cross');
  }

  // VWAP
  if (params.vwapDiff !== null && enabled.vwap !== false) {
    factors += 1.0; // Increased from 0.5
    const scaledVwapDiff = params.vwapDiff * volatilityMultiplier;
    if (scaledVwapDiff < -2) { score += 40 * 1.0; if (scaledVwapDiff < -3) reasons.push(`Below VWAP (${params.vwapDiff.toFixed(2)}%)`); }
    else if (scaledVwapDiff > 2) { score -= 40 * 1.0; if (scaledVwapDiff > 3) reasons.push(`Above VWAP (${params.vwapDiff.toFixed(2)}%)`); }
  }

  // Volume spike: additive factor (not multiplicative) to prevent inflating already-high scores
  if (params.volumeSpike) {
    factors += 0.5;
    const volBoost = score > 0 ? 30 : score < 0 ? -30 : 0;
    score += volBoost * 0.5;
    if (volBoost !== 0) reasons.push('Volume spike confirms direction');
  }

  // ── Intelligence signals ──

  // Multi-TF confluence
  if (params.confluence !== undefined && Math.abs(params.confluence) >= 20 && enabled.confluence !== false) {
    factors += 2.5; // Increased from 2.0
    score += params.confluence * 2.5; 
    if (params.confluence >= 50) reasons.push('Institutional multi-TF confluence (Strong Bullish)');
    else if (params.confluence >= 20) reasons.push('Multi-TF bullish alignment');
    else if (params.confluence <= -50) reasons.push('Institutional multi-TF confluence (Strong Bearish)');
    else if (params.confluence <= -20) reasons.push('Multi-TF bearish alignment');
  }

  // RSI crossover
  if (params.rsiCrossover && params.rsiCrossover !== 'none' && enabled.rsi !== false) {
    factors += 1.5; // Increased from 1.0
    if (params.rsiCrossover === 'bullish_reversal') {
      score += 70 * 1.5;
      reasons.push('Bullish RSI reversal trend');
    } else {
      score -= 70 * 1.5;
      reasons.push('Bearish RSI reversal trend');
    }
  }

  // RSI divergence (Rebalanced: weight 2.0, score 75 — significant but not dominant)
  if (params.rsiDivergence && params.rsiDivergence !== 'none' && enabled.divergence !== false) {
    factors += 2.0; 
    if (params.rsiDivergence === 'bullish') {
      score += 75 * 2.0;
      reasons.push('Bullish RSI Divergence');
    } else {
      score -= 75 * 2.0;
      reasons.push('Bearish RSI Divergence');
    }
  }

  // Momentum
  if (params.momentum !== undefined && params.momentum !== null && Math.abs(params.momentum * volatilityMultiplier) > 0.5 && enabled.momentum !== false) {
    factors += 0.5;
    const scaledMomentum = params.momentum * volatilityMultiplier;
    const mScore = Math.max(-60, Math.min(60, scaledMomentum * 15));
    score += mScore * 0.5;
    if (scaledMomentum > 3) reasons.push('Strong institutional momentum (Up)');
    else if (scaledMomentum < -3) reasons.push('Strong institutional momentum (Down)');
  }

  // ── TFA TREND GUARD (v2) ──────────────────────────────────────────
  // Non-overlapping thresholds: <45 = bullish, >55 = bearish, 45-55 = neutral (no boost).
  // Counter-trend signals receive a 30% penalty to filter noise.
  if (params.rsi1h !== null) {
    const is1hBullishTrend = params.rsi1h < 45;  // Clear bullish: RSI below 45
    const is1hBearishTrend = params.rsi1h > 55;  // Clear bearish: RSI above 55
    
    // Trend-aligned boost (15%)
    if (score > 0 && is1hBullishTrend) {
      score *= 1.15; 
      reasons.push('1h Trend-aligned (Bullish)');
    }
    if (score < 0 && is1hBearishTrend) {
      score *= 1.15;
      reasons.push('1h Trend-aligned (Bearish)');
    }
    // Counter-trend penalty (30% dampening)
    if (score > 0 && is1hBearishTrend) {
      score *= 0.70;
      reasons.push('⚠ Counter-trend (1h bearish)');
    }
    if (score < 0 && is1hBullishTrend) {
      score *= 0.70;
      reasons.push('⚠ Counter-trend (1h bullish)');
    }
  }

  // ── ADX MARKET CONTEXT ──────────────────────────────────────────
  // ADX measures trend strength. <20 = choppy/ranging, >30 = strong trend.
  // Dampen signals in choppy markets, amplify in trending markets.
  if (params.adx !== undefined && params.adx !== null && params.adx > 0) {
    if (params.adx < 20) {
      score *= 0.75;
      reasons.push('ADX choppy market (signals dampened)');
    } else if (params.adx > 30) {
      score *= 1.10;
      reasons.push('ADX strong trend');
    }
  }

  // Final validation guard: normalized score
  let normalized = factors > 0 ? score / factors : 0;
  
  // ── Minimum Evidence Guard ──
  // Require >= 4 factors for any non-neutral signal to prevent low-evidence noise.
  if (factors < 4.0) {
    normalized *= 0.50; // Aggressive dampening — insufficient evidence
    if (factors < 2.5) {
      normalized = Math.max(-15, Math.min(15, normalized)); // Force near-neutral
    }
  } else if (factors < 5.0 && Math.abs(normalized) > 60) {
    normalized *= 0.75; // Moderate dampening for borderline evidence
  }
  
  normalized = Number.isFinite(normalized) ? Math.round(Math.max(-100, Math.min(100, normalized))) : 0;

  // ── Multi-TF RSI Agreement Gate for Strong Signals ──
  // Require at least 3 of 4 RSI timeframes to agree on direction for Strong.
  // This prevents "Strong Buy" when only one timeframe is deeply oversold while others are neutral.
  const rsiDirections = [
    params.rsi1m !== null ? (params.rsi1m < 45 ? 'buy' : params.rsi1m > 55 ? 'sell' : 'neutral') : null,
    params.rsi5m !== null ? (params.rsi5m < 45 ? 'buy' : params.rsi5m > 55 ? 'sell' : 'neutral') : null,
    params.rsi15m !== null ? (params.rsi15m < 45 ? 'buy' : params.rsi15m > 55 ? 'sell' : 'neutral') : null,
    params.rsi1h !== null ? (params.rsi1h < 45 ? 'buy' : params.rsi1h > 55 ? 'sell' : 'neutral') : null,
  ].filter(d => d !== null);
  const buyAgreement = rsiDirections.filter(d => d === 'buy').length;
  const sellAgreement = rsiDirections.filter(d => d === 'sell').length;
  const availableTFs = rsiDirections.length;
  const hasMultiTFBuyAgreement = availableTFs >= 3 && buyAgreement >= 3;
  const hasMultiTFSellAgreement = availableTFs >= 3 && sellAgreement >= 3;

  let signal: StrategySignal;
  let label: string;
  if (normalized >= 55 && hasMultiTFBuyAgreement) { signal = 'strong-buy'; label = 'Strong Buy'; }
  else if (normalized >= 55) { signal = 'buy'; label = 'Buy'; reasons.push('Downgraded: insufficient TF agreement for Strong'); }
  else if (normalized >= 25) { signal = 'buy'; label = 'Buy'; }
  else if (normalized <= -55 && hasMultiTFSellAgreement) { signal = 'strong-sell'; label = 'Strong Sell'; }
  else if (normalized <= -55) { signal = 'sell'; label = 'Sell'; reasons.push('Downgraded: insufficient TF agreement for Strong'); }
  else if (normalized <= -25) { signal = 'sell'; label = 'Sell'; }
  else { signal = 'neutral'; label = 'Neutral'; }

  return { score: normalized, signal, label, reasons };
}

// ── ATR (Average True Range) ────────────────────────────────────

/**
 * Average True Range: measures volatility over `period` bars.
 * Higher ATR = more volatile market (useful for stop-loss sizing).
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hc, lc));
  }

  if (trueRanges.length < period) return null;

  // Initial ATR = simple average of first `period` TRs
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trueRanges[i];
  atr /= period;

  // Wilder's smoothing for rest
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return round(atr);
}

// ── ADX (Average Directional Index) ─────────────────────────────

/**
 * ADX measures trend strength (0-100).
 * > 25 = trending market, < 20 = ranging/choppy market.
 * Does NOT indicate direction - only strength.
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  const minLen = period * 2 + 1;
  if (highs.length < minLen || lows.length < minLen || closes.length < minLen) return null;

  // 1. Calculate +DM, -DM, and TR series
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));
  }

  if (tr.length < period) return null;

  // 2. Wilder's smoothed +DM14, -DM14, TR14
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;
  let smoothTR = 0;

  for (let i = 0; i < period; i++) {
    smoothPlusDM += plusDM[i];
    smoothMinusDM += minusDM[i];
    smoothTR += tr[i];
  }

  const dxSeries: number[] = [];

  // First DX
  if (smoothTR > 0) {
    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;
    const diSum = plusDI + minusDI;
    if (diSum > 0) dxSeries.push(Math.abs(plusDI - minusDI) / diSum * 100);
  }

  for (let i = period; i < tr.length; i++) {
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];
    smoothTR = smoothTR - (smoothTR / period) + tr[i];

    if (smoothTR > 0) {
      const plusDI = (smoothPlusDM / smoothTR) * 100;
      const minusDI = (smoothMinusDM / smoothTR) * 100;
      const diSum = plusDI + minusDI;
      if (diSum > 0) dxSeries.push(Math.abs(plusDI - minusDI) / diSum * 100);
    }
  }

  if (dxSeries.length < period) return null;

  // 3. ADX = Wilder's smoothed average of DX
  let adx = 0;
  for (let i = 0; i < period; i++) adx += dxSeries[i];
  adx /= period;

  for (let i = period; i < dxSeries.length; i++) {
    adx = (adx * (period - 1) + dxSeries[i]) / period;
  }

  return round(Math.max(0, Math.min(100, adx)));
}

// ── Utility ─────────────────────────────────────────────────────

/**
 * Derive signal from RSI value and thresholds.
 * Supports contrarian (inverted) mode where overbought < oversold (e.g., OB=30, OS=70).
 */
export function deriveSignal(
  rsi: number | null,
  overbought: number = 80,
  oversold: number = 20
): 'oversold' | 'overbought' | 'neutral' {
  if (rsi === null) return 'neutral';
  
  const isInverted = overbought < oversold;
  if (isInverted) {
    // Contrarian: OB=30, OS=70 → oversold when RSI ≥ 70, overbought when RSI ≤ 30
    if (rsi >= oversold) return 'oversold';
    if (rsi <= overbought) return 'overbought';
  } else {
    // Standard: OB=70, OS=30 → oversold when RSI < 30, overbought when RSI > 70
    if (rsi < oversold) return 'oversold';
    if (rsi > overbought) return 'overbought';
  }
  return 'neutral';
}



