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
import { RSI_DEFAULTS, INDICATOR_DEFAULTS, STRATEGY_DEFAULTS, RSI_ZONES, TF_WEIGHTS, type TradingStyle } from './defaults';
import { getRegimeWeights, type MarketRegime } from './market-regime';

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
  // (26*2 = 52 bars minimum - avoids the "signal line still forming" problem)
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
      // Relevance Gate: Bullish divergence is only actionable if the market isn't already overbought.
      if (rsiWindow[rsiWindow.length - 1] < 60) return 'bullish';
    }
  }

  // Bearish divergence: higher price highs + lower RSI highs
  const priceHighs = findSwingHighs(priceWindow, tolerance);
  if (priceHighs.length >= 2) {
    const prev = priceHighs[priceHighs.length - 2];
    const curr = priceHighs[priceHighs.length - 1];
    if (priceWindow[curr] > priceWindow[prev] && rsiWindow[curr] < rsiWindow[prev] - 1) {
      // Relevance Gate: Bearish divergence is only actionable if the market isn't already oversold.
      if (rsiWindow[rsiWindow.length - 1] > 40) return 'bearish';
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

  // Graduated RSI zone scoring - wider gradient for better signal quality
  const checkRsi = (rsi: number | null, w: number) => {
    if (rsi === null) return;
    total += w;
    const { deepOS, os, ob, deepOB } = RSI_ZONES.Crypto;
    // Deep oversold/overbought = full weight, approaching = partial
    if (rsi <= deepOS) bullish += w;
    else if (rsi <= os) bullish += w * 0.8;
    else if (rsi <= 40) bullish += w * 0.3;
    else if (rsi >= deepOB) bearish += w;
    else if (rsi >= ob) bearish += w * 0.8;
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

// ── OBV (On-Balance Volume) ──────────────────────────────────────

/**
 * On-Balance Volume measures buying/selling pressure via cumulative volume flow.
 * When OBV is rising while price is falling → bullish divergence (smart money accumulating).
 * When OBV is falling while price is rising → bearish divergence (distribution).
 *
 * Returns the OBV trend direction by comparing a fast EMA(5) vs slow EMA(13) of OBV.
 * This is a proven institutional-grade volume confirmation indicator.
 */
export function calculateOBV(
  closes: number[],
  volumes: number[],
  fastPeriod = 5,
  slowPeriod = 13,
): { trend: 'bullish' | 'bearish' | 'none'; value: number } | null {
  if (closes.length < slowPeriod + 2 || volumes.length < slowPeriod + 2) return null;
  if (closes.length !== volumes.length) return null;

  // Build cumulative OBV series
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }

  // EMA of OBV for smooth trend detection
  const obvFast = calculateEma(obv, fastPeriod);
  const obvSlow = calculateEma(obv, slowPeriod);

  if (obvFast.length < 2 || obvSlow.length < 2) return null;

  const align = obvFast.length - obvSlow.length;
  const fastCurr = obvFast[align + obvSlow.length - 1];
  const slowCurr = obvSlow[obvSlow.length - 1];

  const lastObv = obv[obv.length - 1];

  // Trend: fast EMA above slow = bullish volume pressure
  if (fastCurr > slowCurr) return { trend: 'bullish', value: round(lastObv) };
  if (fastCurr < slowCurr) return { trend: 'bearish', value: round(lastObv) };
  return { trend: 'none', value: round(lastObv) };
}

// ── Williams %R ─────────────────────────────────────────────────

/**
 * Williams %R: momentum oscillator measuring overbought/oversold conditions.
 * Range: -100 (oversold) to 0 (overbought).
 * Complementary to StochRSI - uses raw price range rather than RSI values.
 *
 * Institutional usage:
 *   < -80 = oversold zone (potential buy)
 *   > -20 = overbought zone (potential sell)
 *   Crossovers through -50 confirm trend changes.
 *
 * Higher win rate than StochRSI in ranging/mean-reverting markets.
 */
export function calculateWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  if (highs.length < period || lows.length < period || closes.length < period) return null;

  const hSlice = highs.slice(-period);
  const lSlice = lows.slice(-period);
  const highestHigh = Math.max(...hSlice);
  const lowestLow = Math.min(...lSlice);
  const currentClose = closes[closes.length - 1];

  const range = highestHigh - lowestLow;
  if (range === 0) return -50; // Flat market → neutral

  const wr = ((highestHigh - currentClose) / range) * -100;
  return round(Math.max(-100, Math.min(0, wr)));
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
  rsi4h: number | null;
  rsi1d: number | null;
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
  atr?: number | null;
  obvTrend?: 'bullish' | 'bearish' | 'none';
  williamsR?: number | null;
  cci?: number | null;
  /** Smart Money Pressure Index score (-100 to +100). When significant, influences strategy direction. */
  smartMoneyScore?: number | null;
  /** Hidden divergence signal (continuation patterns). */
  hiddenDivergence?: 'hidden-bullish' | 'hidden-bearish' | 'none';
  /** Market regime for dynamic weight adjustment. */
  regime?: MarketRegime;
  /** User's selected trading horizon for style-adaptive weighting. */
  tradingStyle?: TradingStyle;
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
    obv?: boolean;
    williamsR?: boolean;
    cci?: boolean;
  };
}): StrategyResult {
  let score = 0;
  
  // ── Regime-Aware Dynamic Weights ──
  const rw = params.regime ? getRegimeWeights(params.regime) : { oscillators: 1.0, trend: 1.0, volume: 1.0, momentum: 1.0 };
  
  // ── Style-Aware Timeframe Weights ──
  // Default to 'intraday' if not specified.
  const tw = TF_WEIGHTS[params.tradingStyle || 'intraday'];
  
  // ── Asset-Aware Volatility Calibration ──
  let volatilityMultiplier = 1.0;
  if (params.market === 'Forex') volatilityMultiplier = 5.0;
  else if (params.market === 'Index' || params.market === 'Stocks') volatilityMultiplier = 2.5;
  else if (params.market === 'Metal') volatilityMultiplier = 1.5;

  // ── Session-Aware Quality Multiplier ──
  // Dampen signals outside peak liquidity hours for session-based markets.
  let sessionQuality = 1.0;
  if (params.market === 'Forex' || params.market === 'Metal') {
    const hour = new Date().getUTCHours();
    const isLondon = hour >= 8 && hour <= 16;
    const isNY = hour >= 13 && hour <= 21;
    if (!isLondon && !isNY) sessionQuality = 0.35; // Dead zone
    else if (isLondon && isNY) sessionQuality = 1.2; // Peak overlap boost
  }
  let factors = 0;
  const reasons: string[] = [];
  const enabled = params.enabledIndicators || INDICATOR_DEFAULTS;

  // ── Asset-Specific RSI Zone Calibration ──
  // Different asset classes have different RSI characteristics.
  const market = params.market || 'Crypto';
  const zones = RSI_ZONES[market] || RSI_ZONES.Crypto;
  let { deepOS: rsiDeepOS, os: rsiOS, ob: rsiOB, deepOB: rsiDeepOB } = zones;

  // RSI scoring (higher weight for longer timeframes)
  // Regime-aware: oscillator weight applied to all RSI sub-scores
  const rsiScore = (rsi: number | null, weight: number, tf: string) => {
    if (rsi === null || enabled.rsi === false) return;
    factors += weight;
    const effectiveWeight = weight * rw.oscillators;
    if (rsi <= rsiDeepOS) { score += 100 * effectiveWeight; reasons.push(`RSI ${tf} (${rsi.toFixed(0)}) deeply oversold`); }
    else if (rsi <= rsiOS) { score += 80 * effectiveWeight; reasons.push(`RSI ${tf} (${rsi.toFixed(0)}) oversold`); }
    else if (rsi >= rsiDeepOB) { score -= 100 * effectiveWeight; reasons.push(`RSI ${tf} (${rsi.toFixed(0)}) deeply overbought`); }
    else if (rsi >= rsiOB) { score -= 80 * effectiveWeight; reasons.push(`RSI ${tf} (${rsi.toFixed(0)}) overbought`); }
    else if (rsi < 45) score += 30 * effectiveWeight;
    else if (rsi > 55) score -= 30 * effectiveWeight;
  };

  rsiScore(params.rsi1m, tw.rsi1m, '1m');
  rsiScore(params.rsi5m, tw.rsi5m, '5m');
  rsiScore(params.rsi15m, tw.rsi15m, '15m');
  rsiScore(params.rsi1h, tw.rsi1h, '1h');
  rsiScore(params.rsi4h, tw.rsi4h, '4h');
  rsiScore(params.rsi1d, tw.rsi1d, '1d');

  // MACD histogram - ATR-relative scaling for consistent behavior across all price levels
  // 2026 fix: Price-relative scaling breaks on high/low priced assets.
  // ATR-normalized MACD measures histogram significance against actual volatility.
  if (params.macdHistogram != null && enabled.macd !== false) {
    const macdWeight = tw.macd * rw.trend;
    factors += macdWeight;
    
    // Use ATR for normalization if available, else fall back to price-relative
    let macdNorm: number;
    if (params.atr != null && params.atr > 0) {
      // Histogram as fraction of ATR - 1.0 = histogram equals one ATR (very strong)
      macdNorm = Math.abs(params.macdHistogram) / params.atr;
      macdNorm = Math.min(macdNorm * 80, 100); // Scale: 0.625 ATR → 50 points, 1.25 ATR → 100 points
      
      if (params.macdHistogram > 0) {
        score += macdNorm * macdWeight * sessionQuality;
        if (macdNorm > 40) reasons.push('MACD bullish momentum');
      } else {
        score -= macdNorm * macdWeight * sessionQuality;
        if (macdNorm > 40) reasons.push('MACD bearish momentum');
      }
    } else {
      // Fallback: percentage of price (legacy behavior, improved scaling)
      const histogramWeight = macdWeight * sessionQuality;
      const normHist = (params.macdHistogram / (params.atr || params.price * 0.005)) * 1000;
      score += normHist * histogramWeight;
    }
  }

  // Bollinger position - regime: oscillator weight (mean-reversion signal category)
  if (params.bbPosition != null && enabled.bb !== false) {
    factors += 1;
    const bbW = 1.0 * rw.oscillators * sessionQuality;
    const bp = params.bbPosition;
    if (bp <= 0.1) { score += 80 * bbW; reasons.push(`Near lower BB (${bp.toFixed(2)})`); }
    else if (bp <= 0.25) score += 40 * bbW;
    else if (bp >= 0.9) { score -= 80 * bbW; reasons.push(`Near upper BB (${bp.toFixed(2)})`); }
    else if (bp >= 0.75) score -= 40 * bbW;
  }

  // Stochastic RSI with K/D crossover confirmation
  // 2026 fix: K/D crossover now properly adds to `factors` divisor to prevent score inflation
  if (params.stochK != null && params.stochD != null && enabled.stoch !== false) {
    factors += 1;
    const stochW = 1.0 * rw.oscillators * sessionQuality; // regime-scaled for stoch base
    if (params.stochK < 20 && params.stochD < 20) { score += 80 * stochW; reasons.push(`StochRSI (${params.stochK.toFixed(0)}) oversold`); }
    else if (params.stochK < 30) score += 40 * stochW;
    else if (params.stochK > 80 && params.stochD > 80) { score -= 80 * stochW; reasons.push(`StochRSI (${params.stochK.toFixed(0)}) overbought`); }
    else if (params.stochK > 70) score -= 40 * stochW;
    // K/D Crossover Confirmation - properly weighted with factors to prevent inflation
    if (params.stochK > params.stochD && params.stochK < 30) {
      factors += 0.5;
      score += 70 * 0.5 * rw.oscillators * sessionQuality; // regime-scaled
      reasons.push('StochRSI bullish cross in oversold');
    } else if (params.stochK < params.stochD && params.stochK > 70) {
      factors += 0.5;
      score -= 70 * 0.5 * rw.oscillators * sessionQuality;
      reasons.push('StochRSI bearish cross in overbought');
    }
    // Standard crossover in neutral zone (weaker signal)
    else if (params.stochK > params.stochD && params.stochK < 50) {
      factors += 0.25;
      score += 60 * 0.25 * rw.oscillators * sessionQuality;
    } else if (params.stochK < params.stochD && params.stochK > 50) {
      factors += 0.25;
      score -= 60 * 0.25 * rw.oscillators * sessionQuality;
    }
  }

  // EMA cross - regime: trend weight
  if (params.emaCross !== 'none' && enabled.ema !== false) {
    const emaWeight = tw.ema * rw.trend * sessionQuality;
    factors += tw.ema;
    score += (params.emaCross === 'bullish' ? 60 : -60) * emaWeight;
    reasons.push(params.emaCross === 'bullish' ? 'Bullish EMA cross' : 'Bearish EMA cross');
  }

  // VWAP - regime: volume weight
  if (params.vwapDiff !== null && enabled.vwap !== false) {
    factors += 1.0;
    const volW = 1.0 * rw.volume * sessionQuality;
    const scaledVwapDiff = params.vwapDiff * volatilityMultiplier;
    if (scaledVwapDiff < -2) { score += 40 * volW; if (scaledVwapDiff < -3) reasons.push(`Below VWAP (${params.vwapDiff.toFixed(2)}%)`); }
    else if (scaledVwapDiff > 2) { score -= 40 * volW; if (scaledVwapDiff > 3) reasons.push(`Above VWAP (${params.vwapDiff.toFixed(2)}%)`); }
  }

  // Volume spike: additive factor (not multiplicative) to prevent inflating already-high scores
  // Regime: volume weight
  if (params.volumeSpike) {
    factors += 0.5;
    const volW = 0.5 * rw.volume * sessionQuality;
    const volBoost = score > 0 ? 30 : score < 0 ? -30 : 0;
    score += volBoost * volW;
    if (volBoost !== 0) reasons.push('Volume spike confirms direction');
  }

  // ── Intelligence signals ──

  // Multi-TF confluence
  // Multi-TF confluence - regime: trend weight (confluence reflects cross-TF trend agreement)
  if (params.confluence !== undefined && Math.abs(params.confluence) >= 20 && enabled.confluence !== false) {
    factors += 2.5;
    const confW = 2.5 * rw.trend * sessionQuality;
    score += params.confluence * confW;
    if (params.confluence >= 50) reasons.push('Institutional multi-TF confluence (Strong Bullish)');
    else if (params.confluence >= 20) reasons.push('Multi-TF bullish alignment');
    else if (params.confluence <= -50) reasons.push('Institutional multi-TF confluence (Strong Bearish)');
    else if (params.confluence <= -20) reasons.push('Multi-TF bearish alignment');
  }

  // RSI crossover
  if (params.rsiCrossover && params.rsiCrossover !== 'none' && enabled.rsi !== false) {
    factors += 1.5; // Increased from 1.0
    if (params.rsiCrossover === 'bullish_reversal') {
      score += 70 * 1.5 * sessionQuality;
      reasons.push('Bullish RSI reversal trend');
    } else {
      score -= 70 * 1.5 * sessionQuality;
      reasons.push('Bearish RSI reversal trend');
    }
  }

  // RSI divergence (Style-adaptive weighting)
  if (params.rsiDivergence && params.rsiDivergence !== 'none' && enabled.divergence !== false) {
    const divWeight = tw.divergenceBonus;
    factors += divWeight; 
    if (params.rsiDivergence === 'bullish') {
      score += 75 * divWeight * sessionQuality;
      reasons.push('Bullish RSI Divergence');
    } else {
      score -= 75 * divWeight * sessionQuality;
      reasons.push('Bearish RSI Divergence');
    }
  }

  // Momentum - regime: momentum weight
  if (params.momentum !== undefined && params.momentum !== null && Math.abs(params.momentum * volatilityMultiplier) > 0.5 && enabled.momentum !== false) {
    factors += 0.5;
    const momW = 0.5 * rw.momentum;
    const scaledMomentum = params.momentum * volatilityMultiplier;
    const mScore = Math.max(-60, Math.min(60, scaledMomentum * 15));
    score += mScore * momW;
    if (scaledMomentum > 3) reasons.push('Strong institutional momentum (Up)');
    else if (scaledMomentum < -3) reasons.push('Strong institutional momentum (Down)');
  }

  // ── OBV (On-Balance Volume) - Volume Trend Confirmation ──
  // Regime: volume weight applied
  if (params.obvTrend && params.obvTrend !== 'none' && enabled.obv !== false) {
    factors += 1.5;
    const volW = 1.5 * rw.volume;
    if (params.obvTrend === 'bullish') {
      score += 55 * volW;
      reasons.push('OBV volume trend bullish (accumulation)');
    } else {
      score -= 55 * volW;
      reasons.push('OBV volume trend bearish (distribution)');
    }
  }

  // ── CCI (Commodity Channel Index) ──
  // Institutional standard for trend reversal and persistence.
  // Regime: trend weight; weight increased for Metal/Forex.
  if (params.cci !== null && params.cci !== undefined && (enabled.cci !== false || params.market === 'Metal' || params.market === 'Forex')) {
    const cciBaseW = 1.2;
    const marketW = (params.market === 'Metal' || params.market === 'Forex') ? 1.8 : 1.0;
    const cciW = cciBaseW * marketW * rw.trend * sessionQuality;
    factors += (cciBaseW * marketW);
    
    if (params.cci >= 200) { score -= 100 * cciW; reasons.push(`CCI (${params.cci.toFixed(0)}) extreme overbought`); }
    else if (params.cci >= 100) { score -= 60 * cciW; reasons.push(`CCI (${params.cci.toFixed(0)}) overbought`); }
    else if (params.cci <= -200) { score += 100 * cciW; reasons.push(`CCI (${params.cci.toFixed(0)}) extreme oversold`); }
    else if (params.cci <= -100) { score += 60 * cciW; reasons.push(`CCI (${params.cci.toFixed(0)}) oversold`); }
  }

  // ── Williams %R - Complementary Oscillator ──
  // Regime: oscillator weight applied
  if (params.williamsR !== null && params.williamsR !== undefined && enabled.williamsR !== false) {
    factors += 0.8;
    const oscW = 0.8 * rw.oscillators;
    if (params.williamsR <= -85) {
      score += 80 * oscW;
      reasons.push(`Williams %R (${params.williamsR.toFixed(0)}) deeply oversold`);
    } else if (params.williamsR <= -70) {
      score += 45 * oscW;
    } else if (params.williamsR >= -15) {
      score -= 80 * oscW;
      reasons.push(`Williams %R (${params.williamsR.toFixed(0)}) deeply overbought`);
    } else if (params.williamsR >= -30) {
      score -= 45 * oscW;
    }
  }

  // ── TFA TREND GUARD (v2) ──────────────────────────────────────────
  // Non-overlapping thresholds: <45 = bullish, >55 = bearish, 45-55 = neutral (no boost).
  // Counter-trend signals receive a 30% penalty to filter noise.
  if (params.rsi1h !== null) {
    const is1hBullishTrend = params.rsi1h < 45;  // Clear bullish: RSI below 45
    const is1hBearishTrend = params.rsi1h > 55;  // Clear bearish: RSI above 55
    
    // Trend-aligned boost
    if (score > 0 && is1hBullishTrend) {
      score *= STRATEGY_DEFAULTS.trendAlignedBoost; 
      reasons.push('1h Trend-aligned (Bullish)');
    }
    if (score < 0 && is1hBearishTrend) {
      score *= STRATEGY_DEFAULTS.trendAlignedBoost;
      reasons.push('1h Trend-aligned (Bearish)');
    }
    // Counter-trend penalty
    if (score > 0 && is1hBearishTrend) {
      score *= STRATEGY_DEFAULTS.counterTrendPenalty;
      reasons.push('⚠ Counter-trend (1h bearish)');
    }
    if (score < 0 && is1hBullishTrend) {
      score *= STRATEGY_DEFAULTS.counterTrendPenalty;
      reasons.push('⚠ Counter-trend (1h bullish)');
    }
  }

  // ── SMART MONEY PRESSURE INTEGRATION ────────────────────────────
  // Derivatives data (funding rate, liquidations, whale trades, order flow).
  // When significant (|score| >= 30), it confirms or contradicts direction.
  if (params.smartMoneyScore !== undefined && params.smartMoneyScore !== null && Math.abs(params.smartMoneyScore) >= 30) {
    const smDirection = params.smartMoneyScore > 0 ? 'bullish' : 'bearish';
    const scoreDirection = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';

    if (scoreDirection !== 'neutral') {
      if (smDirection === scoreDirection) {
        // Confirmation: Smart Money agrees with technical signal → boost
        score *= 1.15;
        factors += 1.5;
        reasons.push(`🐋 Smart Money confirms (${params.smartMoneyScore > 0 ? '+' : ''}${params.smartMoneyScore})`);
      } else {
        // Contradiction: Smart Money disagrees → penalty + caution
        score *= 0.80;
        reasons.push(`⚠ Smart Money contradicts (${params.smartMoneyScore > 0 ? '+' : ''}${params.smartMoneyScore})`);
      }
    } else {
      // Neutral technical signal but strong Smart Money → add directional bias
      const smBias = params.smartMoneyScore > 0 ? 10 : -10;
      score += smBias * volatilityMultiplier;
      factors += 1.0;
      reasons.push(`🐋 Smart Money bias (${params.smartMoneyScore > 0 ? '+' : ''}${params.smartMoneyScore})`);
    }
  }

  // ── HIDDEN DIVERGENCE (Continuation) ────────────────────────────
  // Lower weight than regular divergence - continuation, not reversal
  // Regime: momentum weight; volatility-scaled for asset class
  if (params.hiddenDivergence && params.hiddenDivergence !== 'none' && enabled.divergence !== false) {
    const hiddenDivWeight = tw.divergenceBonus * 0.75;
    factors += hiddenDivWeight;
    const hiddenW = hiddenDivWeight * rw.momentum;
    if (params.hiddenDivergence === 'hidden-bullish') {
      score += 20 * volatilityMultiplier * hiddenW;
      reasons.push('📊 Hidden bullish divergence (trend continuation)');
    } else {
      score -= 20 * volatilityMultiplier * hiddenW;
      reasons.push('📊 Hidden bearish divergence (trend continuation)');
    }
  }

  // ── ADX MARKET CONTEXT ──────────────────────────────────────────
  // ADX measures trend strength. <20 = choppy/ranging, >30 = strong trend.
  // Dampen signals in choppy markets, amplify in trending markets.
  if (params.adx !== undefined && params.adx !== null && params.adx > 0) {
    if (params.adx < 20) {
      score *= STRATEGY_DEFAULTS.adxChoppyDampen;
      reasons.push('ADX choppy market (signals dampened)');
    } else if (params.adx > 30) {
      score *= STRATEGY_DEFAULTS.adxTrendBoost;
      reasons.push('ADX strong trend');
    }
  }

  // Final validation guard: normalized score
  let normalized = factors > 0 ? score / factors : 0;
  
  // ── Accuracy Pivot Guard (Institutional Sanity & Stop-Loss) ──
  // 1. TF-Resistance Guard: Dampen if fighting higher TF extremes without volume confirmation
  if (!params.volumeSpike) {
    if (normalized > 40 && params.rsi1h !== null && params.rsi1h > 65) {
      normalized *= 0.65;
      reasons.push('Score dampened: Overbought resistance on 1h TF');
    } else if (normalized < -40 && params.rsi1h !== null && params.rsi1h < 35) {
      normalized *= 0.65;
      reasons.push('Score dampened: Oversold support on 1h TF');
    }
  }

  // 2. Overbought/Oversold Suppression: prevent "False Green" at peaks
  const rsiHighCount = [params.rsi1m, params.rsi5m, params.rsi15m].filter(r => r != null && r > 75).length;
  const rsiLowCount = [params.rsi1m, params.rsi5m, params.rsi15m].filter(r => r != null && r < 25).length;
  
  if (normalized > 25 && rsiHighCount >= 2) {
    normalized = Math.min(24, normalized * 0.4);
    reasons.push('⚠ Buy suppressed: extreme overbought state');
  }
  if (normalized < -25 && rsiLowCount >= 2) {
    normalized = Math.max(-24, normalized * 0.4);
    reasons.push('⚠ Sell suppressed: deeply oversold state');
  }

  // 3. Evidence Guard: Force neutrality for low-confidence data
  if (factors < STRATEGY_DEFAULTS.minFactorsForSignal) {
    normalized *= 0.50;
    if (factors < 2.5) normalized = Math.max(-15, Math.min(15, normalized));
  } else if (factors < 5.0 && Math.abs(normalized) > 60) {
    normalized *= 0.75;
  }
  
  normalized = Number.isFinite(normalized) ? Math.round(Math.max(-100, Math.min(100, normalized))) : 0;

  // ── Multi-TF RSI Agreement Gate for Strong Signals ──
  // Require at least 3 of 4 RSI timeframes to agree on direction for Strong.
  // This prevents "Strong Buy" when only one timeframe is deeply oversold while others are neutral.
  // 2026 FIX: Use asset-specific zones instead of hardcoded 45/55 thresholds
  const buyThreshold = rsiOS + 15; // e.g., Crypto: 30+15=45, Forex: 35+15=50
  const sellThreshold = rsiOB - 15; // e.g., Crypto: 70-15=55, Forex: 65-15=50
  
  const rsiDirections = [
    params.rsi1m !== null ? (params.rsi1m < buyThreshold ? 'buy' : params.rsi1m > sellThreshold ? 'sell' : 'neutral') : null,
    params.rsi5m !== null ? (params.rsi5m < buyThreshold ? 'buy' : params.rsi5m > sellThreshold ? 'sell' : 'neutral') : null,
    params.rsi15m !== null ? (params.rsi15m < buyThreshold ? 'buy' : params.rsi15m > sellThreshold ? 'sell' : 'neutral') : null,
    params.rsi1h !== null ? (params.rsi1h < buyThreshold ? 'buy' : params.rsi1h > sellThreshold ? 'sell' : 'neutral') : null,
  ].filter(d => d !== null);
  const buyAgreement = rsiDirections.filter(d => d === 'buy').length;
  const sellAgreement = rsiDirections.filter(d => d === 'sell').length;
  const availableTFs = rsiDirections.length;
  const hasMultiTFBuyAgreement = availableTFs >= 3 && buyAgreement >= 3;
  const hasMultiTFSellAgreement = availableTFs >= 3 && sellAgreement >= 3;

  // ── 2026 Tuned Thresholds ──
  let signal: StrategySignal;
  let label: string;
  if (normalized >= STRATEGY_DEFAULTS.strongThreshold && hasMultiTFBuyAgreement) { signal = 'strong-buy'; label = 'S Buy'; }
  else if (normalized >= STRATEGY_DEFAULTS.strongThreshold) { signal = 'buy'; label = 'Buy'; reasons.push('Downgraded: insufficient TF agreement for Strong'); }
  else if (normalized >= STRATEGY_DEFAULTS.actionThreshold) { signal = 'buy'; label = 'Buy'; }
  else if (normalized <= -STRATEGY_DEFAULTS.strongThreshold && hasMultiTFSellAgreement) { signal = 'strong-sell'; label = 'S Sell'; }
  else if (normalized <= -STRATEGY_DEFAULTS.strongThreshold) { signal = 'sell'; label = 'Sell'; reasons.push('Downgraded: insufficient TF agreement for Strong'); }
  else if (normalized <= -STRATEGY_DEFAULTS.actionThreshold) { signal = 'sell'; label = 'Sell'; }
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
  overbought: number = RSI_DEFAULTS.overbought,
  oversold: number = RSI_DEFAULTS.oversold
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

// ── ATR-Based Risk Parameters ───────────────────────────────────

export interface RiskParameters {
  /** Suggested stop loss price */
  stopLoss: number;
  /** Conservative take profit (1.33:1 R:R) */
  takeProfit1: number;
  /** Aggressive take profit (2:1 R:R) */
  takeProfit2: number;
  /** Risk-reward ratio for TP1 */
  riskRewardRatio: number;
  /** ATR value used for calculation */
  atrUsed: number;
  /** ATR multiplier used for stop */
  atrMultiplier: number;
}

/**
 * Compute institutional-grade risk parameters based on ATR.
 *
 * Stop Loss: price ± (ATR × multiplier) depending on direction
 * Take Profit 1: 1.33:1 R:R (conservative)
 * Take Profit 2: 2.0:1 R:R (aggressive)
 *
 * The ATR multiplier adapts to the asset class:
 *   Crypto: 1.5 (wider stops for high volatility)
 *   Forex:  1.0 (tighter stops, lower ATR)
 *   Metals: 1.2 (moderate)
 *   Stocks: 1.3 (moderate-high)
 *
 * @param price - Current asset price
 * @param atr - Average True Range value
 * @param direction - Trade direction ('buy' or 'sell')
 * @param market - Asset class for multiplier calibration
 */
export function computeRiskParameters(
  price: number,
  atr: number,
  direction: 'buy' | 'sell',
  market: 'Crypto' | 'Metal' | 'Forex' | 'Index' | 'Stocks' = 'Crypto',
): RiskParameters {
  // Asset-class-aware ATR multiplier
  const multiplierMap: Record<string, number> = {
    Crypto: 1.5,
    Forex: 1.0,
    Metal: 1.2,
    Index: 1.3,
    Stocks: 1.3,
  };
  const atrMult = multiplierMap[market] ?? 1.5;
  const riskDistance = atr * atrMult;

  if (direction === 'buy') {
    const stopLoss = round(price - riskDistance);
    const takeProfit1 = round(price + riskDistance * 1.33);
    const takeProfit2 = round(price + riskDistance * 2.0);
    return {
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskRewardRatio: round(1.33),
      atrUsed: round(atr),
      atrMultiplier: atrMult,
    };
  } else {
    const stopLoss = round(price + riskDistance);
    const takeProfit1 = round(price - riskDistance * 1.33);
    const takeProfit2 = round(price - riskDistance * 2.0);
    return {
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskRewardRatio: round(1.33),
      atrUsed: round(atr),
      atrMultiplier: atrMult,
    };
  }
}

// ── Hidden (Continuation) Divergence ────────────────────────────

/**
 * Detect hidden RSI divergence (continuation signals).
 *
 * Hidden Bullish: Price makes HIGHER low, RSI makes LOWER low
 *   → Trend continuation UP (hidden strength)
 *
 * Hidden Bearish: Price makes LOWER high, RSI makes HIGHER high
 *   → Trend continuation DOWN (hidden weakness)
 *
 * These are institutional-grade continuation patterns with higher
 * win rates than regular divergence in trending markets.
 */
export function detectHiddenDivergence(
  closes: number[],
  rsiPeriod = 14,
  lookback = 40,
): 'hidden-bullish' | 'hidden-bearish' | 'none' {
  if (closes.length < rsiPeriod + lookback) return 'none';

  const priceWindow = closes.slice(-lookback);
  const fullRsi = computeRsiSeries(closes.slice(-(rsiPeriod + lookback)), rsiPeriod);
  const rsiWindow = fullRsi.slice(-lookback);
  if (rsiWindow.length < lookback) return 'none';

  // Dynamic tolerance based on volatility (same as regular divergence)
  const recentReturns = priceWindow.slice(1).map((p, i) => Math.abs(p - priceWindow[i]) / priceWindow[i]);
  const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const tolerance = Math.max(2, Math.min(5, Math.round(avgReturn * 400)));

  // Hidden Bullish: price makes higher low, RSI makes lower low
  const priceLows = findSwingLows(priceWindow, tolerance);
  if (priceLows.length >= 2) {
    const prev = priceLows[priceLows.length - 2];
    const curr = priceLows[priceLows.length - 1];
    if (priceWindow[curr] > priceWindow[prev] && rsiWindow[curr] < rsiWindow[prev] - 1) {
      return 'hidden-bullish';
    }
  }

  // Hidden Bearish: price makes lower high, RSI makes higher high
  const priceHighs = findSwingHighs(priceWindow, tolerance);
  if (priceHighs.length >= 2) {
    const prev = priceHighs[priceHighs.length - 2];
    const curr = priceHighs[priceHighs.length - 1];
    if (priceWindow[curr] < priceWindow[prev] && rsiWindow[curr] > rsiWindow[prev] + 1) {
      return 'hidden-bearish';
    }
  }

  return 'none';
}

// ── Fibonacci Retracement Levels ────────────────────────────────

export interface FibonacciLevels {
  /** The swing high used for calculation */
  swingHigh: number;
  /** The swing low used for calculation */
  swingLow: number;
  /** 23.6% retracement */
  level236: number;
  /** 38.2% retracement (key support/resistance) */
  level382: number;
  /** 50.0% retracement (psychological level) */
  level500: number;
  /** 61.8% retracement (golden ratio - strongest level) */
  level618: number;
  /** 78.6% retracement (deep pullback) */
  level786: number;
}

/**
 * Calculate Fibonacci retracement levels from a swing high and low.
 *
 * These levels serve as institutional-grade support/resistance zones.
 * The 61.8% (golden ratio) level is the strongest reversal zone.
 *
 * Usage: Display as horizontal lines on charts, or check if current price
 * is near a fib level for confluence with RSI/MACD signals.
 *
 * @param closes - Price series to auto-detect swing points
 * @param lookback - Number of candles to search for swing high/low
 */
export function calculateFibonacciLevels(
  closes: number[],
  lookback = 50,
): FibonacciLevels | null {
  if (closes.length < lookback) return null;

  const window = closes.slice(-lookback);
  const swingHigh = Math.max(...window);
  const swingLow = Math.min(...window);

  if (swingHigh === swingLow) return null; // Flat market

  const range = swingHigh - swingLow;

  return {
    swingHigh: round(swingHigh),
    swingLow: round(swingLow),
    level236: round(swingHigh - range * 0.236),
    level382: round(swingHigh - range * 0.382),
    level500: round(swingHigh - range * 0.500),
    level618: round(swingHigh - range * 0.618),
    level786: round(swingHigh - range * 0.786),
  };
}

// ── Rolling ATR Average (for Regime Classification) ──────────────

/**
 * Compute the average ATR over a rolling lookback window.
 * This is the `atrAvg` parameter required by `classifyRegime()` to distinguish
 * trending vs volatile regimes. Without it, the ratio always defaults to 1.0
 * which makes trending/volatile detection impossible.
 *
 * @param highs   - High price series
 * @param lows    - Low price series
 * @param closes  - Close price series
 * @param atrPeriod - ATR smoothing period (default 14)
 * @param lookback  - Number of ATR values to average (default 20)
 */
export function computeRollingAtrAverage(
  highs: number[],
  lows: number[],
  closes: number[],
  atrPeriod = 14,
  lookback = 20,
): number | null {
  // Need enough data: atrPeriod bars for first ATR + lookback additional bars
  if (highs.length < atrPeriod + lookback + 1) return null;

  const atrSeries: number[] = [];
  for (let i = highs.length - lookback; i < highs.length; i++) {
    // Each window needs atrPeriod+1 bars (ATR requires previous close)
    const slice_h = highs.slice(i - atrPeriod, i + 1);
    const slice_l = lows.slice(i - atrPeriod, i + 1);
    const slice_c = closes.slice(i - atrPeriod, i + 1);
    const atr = calculateATR(slice_h, slice_l, slice_c, atrPeriod);
    if (atr !== null) atrSeries.push(atr);
  }

  if (atrSeries.length === 0) return null;
  return round(atrSeries.reduce((a, b) => a + b, 0) / atrSeries.length);
}

// ── Rolling BB Width Average (for Regime Classification) ─────────

/**
 * Compute the average Bollinger Band width (normalized by middle band) over
 * a rolling lookback window. Required by `classifyRegime()` for squeeze detection.
 *
 * BB Width = (upper - lower) / middle
 * A ratio < 0.8 of its average signals a BB Squeeze → imminent breakout.
 *
 * @param closes  - Close price series
 * @param period  - Bollinger Band period (default 20)
 * @param lookback - Number of BB width values to average (default 20)
 */
export function computeRollingBbWidthAverage(
  closes: number[],
  period = 20,
  lookback = 20,
): number | null {
  if (closes.length < period + lookback) return null;

  const widths: number[] = [];
  for (let i = closes.length - lookback; i < closes.length; i++) {
    if (i < period - 1) continue;
    // Compute BB on the exact `period` candles ending at index i
    const slice = closes.slice(i - period + 1, i + 1);
    const bb = calculateBollinger(slice, period);
    if (bb && bb.middle > 0) {
      widths.push((bb.upper - bb.lower) / bb.middle);
    }
  }

  if (widths.length === 0) return null;
  return round(widths.reduce((a, b) => a + b, 0) / widths.length);
}

// ── CCI (Commodity Channel Index) ────────────────────────────────

/**
 * Commodity Channel Index: a momentum oscillator designed specifically for
 * commodity and metals markets (hence "Commodity" in the name).
 *
 * Unlike RSI (bounded 0-100), CCI is unbounded:
 *   > +200  →  Extreme overbought (strong trend, momentum buy)
 *   +100 to +200 → Overbought / trend continuation
 *   -100 to +100 → Neutral range
 *   -100 to -200 → Oversold / trend continuation
 *   < -200  →  Extreme oversold (strong trend, momentum sell)
 *
 * CCI crossovers of ±100 generate institutional-grade entry signals.
 * Particularly effective for Gold, Silver, Oil, and Copper where trend
 * persistence is higher than crypto. Standard institutional period: 20.
 *
 * Formula: CCI = (Typical Price - SMA(TP, n)) / (0.015 × MeanDeviation)
 */
export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20,
): number | null {
  if (highs.length < period || lows.length < period || closes.length < period) return null;

  // Calculate Typical Prices for the period window
  const typicalPrices: number[] = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
  }

  // Mean of typical prices
  const mean = typicalPrices.reduce((a, b) => a + b, 0) / period;

  // Mean Deviation (not std dev - CCI specifically uses mean absolute deviation)
  const meanDeviation = typicalPrices.reduce((a, b) => a + Math.abs(b - mean), 0) / period;

  if (meanDeviation === 0) return 0;

  const currentTP = typicalPrices[typicalPrices.length - 1];
  // 0.015 is the standard Lambert constant that normalizes ~70-80% of values to ±100
  return round((currentTP - mean) / (0.015 * meanDeviation));
}
