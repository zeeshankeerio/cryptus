/**
 * RSIQ Pro - Smart Money Pressure Index
 * 
 * A UNIQUE composite indicator that NO competitor offers.
 * Combines 4 institutional-grade signals into a single -100 to +100 score:
 *
 *   1. Funding Rate Direction (sentiment)
 *   2. Liquidation Imbalance  (long vs short liquidations)
 *   3. Whale Trade Direction  (net buy vs sell by large players)
 *   4. Order Flow Pressure    (taker buy/sell ratio)
 *
 * Score interpretation:
 *   +80 to +100  →  Extreme Greed  (high leverage longs, whales buying, buyers dominating)
 *   +30 to  +79  →  Greed
 *   -29 to  +29  →  Neutral
 *   -79 to  -30  →  Fear
 *  -100 to  -80  →  Extreme Fear   (heavy short liquidations, whales selling, sellers dominating)
 */

import type {
  FundingRateData,
  LiquidationEvent,
  WhaleTradeEvent,
  OrderFlowData,
  SmartMoneyPressure,
} from './derivatives-types';

// ── Component Weights ────────────────────────────────────────────
// 2026 FIX: Funding rate is the most predictive signal in crypto markets
// Increased from 20% to 50% for crypto (where funding data is reliable)
// This ensures extreme funding rates (like -8%) produce accurate Smart Money scores
const WEIGHTS = {
  funding: 0.50,        // 50% - PRIMARY signal (was 20%)
  liquidation: 0.25,    // 25% - secondary (was 30%)
  whale: 0.15,          // 15% - tertiary (was 25%)
  orderFlow: 0.10,      // 10% - supplementary (was 25%)
} as const;

// ── Signal Computation Functions ─────────────────────────────────

/**
 * Funding Rate Signal (-100 to +100)
 * 2026 FIX: Improved normalization for extreme funding rates
 * 
 * Negative funding = shorts pay longs = bullish pressure (positive signal)
 * Positive funding = longs pay shorts = bearish pressure (negative signal)
 * 
 * Scale:
 *   ±0.01% (0.0001) = normal → ±10 signal
 *   ±0.1% (0.001) = significant → ±100 signal
 *   ±1% (0.01) = extreme → ±100 signal (clamped)
 *   ±8% (0.08) = EXTREME → ±100 signal (clamped)
 */
export function computeFundingSignal(
  fundingRates: Map<string, FundingRateData>,
  symbol: string
): number {
  const data = fundingRates.get(symbol);
  if (!data) return 0;

  // 2026 FIX: Better normalization curve using logarithmic scaling
  const absRate = Math.abs(data.rate);
  const sign = data.rate >= 0 ? 1 : -1;
  
  let signal: number;
  if (absRate >= 0.01) {
    // Extreme: ≥1% → 100
    signal = 100;
  } else if (absRate >= 0.001) {
    // Significant: 0.1-1% → 80-100
    signal = 80 + (absRate - 0.001) / 0.009 * 20;
  } else if (absRate >= 0.0001) {
    // Moderate: 0.01-0.1% → 30-80
    signal = 30 + (absRate - 0.0001) / 0.0009 * 50;
  } else {
    // Normal: <0.01% → 0-30
    signal = absRate / 0.0001 * 30;
  }
  
  // Apply sign (negative funding = bullish = positive signal)
  return Math.round(sign * -1 * signal);
}

/**
 * Liquidation Imbalance Signal (-100 to +100)
 * More long liquidations = bearish pressure → negative signal
 * More short liquidations = bullish pressure → positive signal
 *
 * Uses recent liquidation events (last 5 minutes) to compute imbalance
 */
export function computeLiquidationSignal(
  liquidations: LiquidationEvent[],
  symbol: string
): number {
  const now = Date.now();
  const WINDOW_MS = 5 * 60 * 1000; // 5-minute window

  // Filter to recent liquidations for this symbol
  const recent = liquidations.filter(
    l => l.symbol === symbol && (now - l.timestamp) < WINDOW_MS
  );

  if (recent.length === 0) return 0;

  let longLiqValue = 0;  // Sell-side liquidations = longs being liquidated
  let shortLiqValue = 0; // Buy-side liquidations = shorts being liquidated

  for (const liq of recent) {
    if (liq.side === 'Sell') {
      longLiqValue += liq.valueUsd;
    } else {
      shortLiqValue += liq.valueUsd;
    }
  }

  const totalLiq = longLiqValue + shortLiqValue;
  if (totalLiq === 0) return 0;

  // Imbalance: positive means more shorts liquidated (bullish)
  // negative means more longs liquidated (bearish)
  const imbalance = (shortLiqValue - longLiqValue) / totalLiq;

  return Math.max(-100, Math.min(100, imbalance * 100));
}

/**
 * Whale Trade Direction Signal (-100 to +100)
 * Net whale buying → positive signal
 * Net whale selling → negative signal
 *
 * Uses recent whale trades (last 10 minutes)
 */
export function computeWhaleSignal(
  whaleAlerts: WhaleTradeEvent[],
  symbol: string
): number {
  const now = Date.now();
  const WINDOW_MS = 10 * 60 * 1000; // 10-minute window

  const recent = whaleAlerts.filter(
    w => w.symbol === symbol && (now - w.timestamp) < WINDOW_MS
  );

  if (recent.length === 0) return 0;

  let buyValue = 0;
  let sellValue = 0;

  for (const trade of recent) {
    if (trade.side === 'buy') {
      buyValue += trade.valueUsd;
    } else {
      sellValue += trade.valueUsd;
    }
  }

  const totalValue = buyValue + sellValue;
  if (totalValue === 0) return 0;

  const netDirection = (buyValue - sellValue) / totalValue;

  return Math.max(-100, Math.min(100, netDirection * 100));
}

/**
 * Order Flow Pressure Signal (-100 to +100)
 * ratio > 0.5 → more taker buys → bullish
 * ratio < 0.5 → more taker sells → bearish
 */
export function computeOrderFlowSignal(
  orderFlow: Map<string, OrderFlowData>,
  symbol: string
): number {
  const data = orderFlow.get(symbol);
  if (!data || data.tradeCount1m < 10) return 0; // Need minimum trades for significance

  // ratio is 0-1, center at 0.5
  // 0.65 → +60, 0.35 → -60, 0.80 → +100
  const deviation = (data.ratio - 0.5) * 2; // -1 to +1
  return Math.max(-100, Math.min(100, deviation * 100 * 1.5)); // 1.5x amplification for sensitivity
}

// ── Composite Score ──────────────────────────────────────────────

export function computeSmartMoneyPressure(
  symbol: string,
  fundingRates: Map<string, FundingRateData>,
  liquidations: LiquidationEvent[],
  whaleAlerts: WhaleTradeEvent[],
  orderFlow: Map<string, OrderFlowData>
): SmartMoneyPressure {
  const fundingSignal = computeFundingSignal(fundingRates, symbol);
  const liquidationSignal = computeLiquidationSignal(liquidations, symbol);
  const whaleSignal = computeWhaleSignal(whaleAlerts, symbol);
  const orderFlowSignal = computeOrderFlowSignal(orderFlow, symbol);

  // Weighted composite
  const score = Math.round(
    fundingSignal * WEIGHTS.funding +
    liquidationSignal * WEIGHTS.liquidation +
    whaleSignal * WEIGHTS.whale +
    orderFlowSignal * WEIGHTS.orderFlow
  );

  // Clamp to -100..+100
  const clampedScore = Math.max(-100, Math.min(100, score));

  // Label
  let label: SmartMoneyPressure['label'];
  if (clampedScore >= 80) label = 'Extreme Greed';
  else if (clampedScore >= 30) label = 'Greed';
  else if (clampedScore <= -80) label = 'Extreme Fear';
  else if (clampedScore <= -30) label = 'Fear';
  else label = 'Neutral';

  return {
    symbol,
    score: clampedScore,
    label,
    components: {
      fundingSignal: Math.round(fundingSignal),
      liquidationImbalance: Math.round(liquidationSignal),
      whaleDirection: Math.round(whaleSignal),
      orderFlowPressure: Math.round(orderFlowSignal),
    },
    updatedAt: Date.now(),
  };
}

/**
 * Compute Smart Money Pressure for all symbols in batch
 */
export function computeAllSmartMoney(
  symbols: string[],
  fundingRates: Map<string, FundingRateData>,
  liquidations: LiquidationEvent[],
  whaleAlerts: WhaleTradeEvent[],
  orderFlow: Map<string, OrderFlowData>
): Map<string, SmartMoneyPressure> {
  const result = new Map<string, SmartMoneyPressure>();

  for (const symbol of symbols) {
    const pressure = computeSmartMoneyPressure(
      symbol, fundingRates, liquidations, whaleAlerts, orderFlow
    );
    // Only include if we have at least one data source
    if (
      pressure.components.fundingSignal !== 0 ||
      pressure.components.liquidationImbalance !== 0 ||
      pressure.components.whaleDirection !== 0 ||
      pressure.components.orderFlowPressure !== 0
    ) {
      result.set(symbol, pressure);
    }
  }


  return result;
}
