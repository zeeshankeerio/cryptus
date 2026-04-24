/**
 * RSI calculation using Wilder's smoothing method.
 * Requires at least (period + 1) close prices.
 */
export function calculateRsi(closes: number[], period: number = 14): number | null {
  if (closes.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss over first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    if (c > 0) avgGain += c;
    else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining changes
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    if (c > 0) {
      avgGain = (avgGain * (period - 1) + c) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(c)) / period;
    }
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return Math.round(Math.max(0, Math.min(100, rsi)) * 1e8) / 1e8;
}

/** Returns the full RSI historical series for trend and crossover analysis. */
export function calculateRsiSeries(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return [];

  const rsiSeries: number[] = [];
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const firstRsi = avgLoss === 0 ? 100 : Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + avgGain / avgLoss))) * 100) / 100;
  rsiSeries.push(firstRsi);

  // Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    if (c > 0) {
      avgGain = (avgGain * (period - 1) + c) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(c)) / period;
    }
    const r = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    rsiSeries.push(Math.round(Math.max(0, Math.min(100, r)) * 100) / 100);
  }

  return rsiSeries;
}

/** Detects if RSI recently crossed back inside from an extreme zone (Reversal). */
export function detectRsiCrossover(rsiSeries: number[], upper = 80, lower = 20): 'bullish_reversal' | 'bearish_reversal' | 'none' {
  if (rsiSeries.length < 3) return 'none';
  
  const curr = rsiSeries[rsiSeries.length - 1];
  const prev = rsiSeries[rsiSeries.length - 2];
  const prev2 = rsiSeries[rsiSeries.length - 3];

  // Bullish Reversal: RSI was below 30 and just crossed back above it
  if ((prev < lower || prev2 < lower) && curr >= lower) return 'bullish_reversal';
  
  // Bearish Reversal: RSI was above 70 and just crossed back below it
  if ((prev > upper || prev2 > upper) && curr <= upper) return 'bearish_reversal';

  return 'none';
}

// ── RSI State (for incremental client-side updates) ─────────────

export interface RsiState {
  avgGain: number;
  avgLoss: number;
  lastClose: number;
}

/**
 * Calculate RSI and return internal Wilder smoothing state.
 * The state enables client-side real-time RSI approximation via WebSocket prices.
 * MUST use only fully-closed candles (`closes.slice(0, -1)`) so the live price 
 * applies correctly as the *current* forming candle rather than a *new* candle.
 */
export function calculateRsiWithState(closes: number[], period: number = 14): RsiState | null {
  if (closes.length < period + 2) return null; // Need enough for period + 1 closed candles

  const closedCloses = closes.slice(0, -1);
  const changes: number[] = [];
  for (let i = 1; i < closedCloses.length; i++) {
    changes.push(closedCloses[i] - closedCloses[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const c = changes[i];
    if (c > 0) avgGain += c;
    else avgLoss += Math.abs(c);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const c = changes[i];
    if (c > 0) {
      avgGain = (avgGain * (period - 1) + c) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(c)) / period;
    }
  }

  return { avgGain, avgLoss, lastClose: closedCloses[closedCloses.length - 1] };
}

/**
 * Approximate RSI from a previous state + new live price.
 * Used client-side with WebSocket prices for real-time RSI updates.
 * Performs one Wilder smoothing step using the price delta.
 */
export function approximateRsi(
  state: RsiState,
  livePrice: number,
  period: number = 14,
): number {
  const change = livePrice - state.lastClose;
  let avgGain: number;
  let avgLoss: number;

  if (change > 0) {
    avgGain = (state.avgGain * (period - 1) + change) / period;
    avgLoss = (state.avgLoss * (period - 1)) / period;
  } else {
    avgGain = (state.avgGain * (period - 1)) / period;
    avgLoss = (state.avgLoss * (period - 1) + Math.abs(change)) / period;
  }

  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + rs))) * 1e8) / 1e8;
}
/**
 * Approximate EMA from a previous EMA value + new live price.
 * Used for real-time trend updates.
 */
export function approximateEma(
  prevEma: number,
  livePrice: number,
  period: number = 9,
): number {
  const alpha = 2 / (period + 1);
  return livePrice * alpha + prevEma * (1 - alpha);
}
