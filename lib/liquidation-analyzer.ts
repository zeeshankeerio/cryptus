/**
 * RSIQ Pro - Liquidation Intelligence Analyzer
 * 
 * Provides institutional-grade liquidation analysis with actionable insights:
 * 1. Liquidation Momentum - Is liquidation pressure accelerating?
 * 2. Imbalance Severity - How one-sided is the liquidation flow?
 * 3. Price Impact Estimation - How much will price move?
 * 4. Reversal Signals - Is a reversal likely?
 * 5. Risk Assessment - Should you enter/exit positions?
 */

import type { LiquidationEvent } from './derivatives-types';

// ── Types ────────────────────────────────────────────────────────

export interface LiquidationStats {
  symbol: string;
  
  // Volume Stats (last 5 minutes)
  totalValue: number;           // Total USD liquidated
  longValue: number;            // Long liquidations (bearish)
  shortValue: number;           // Short liquidations (bullish)
  count: number;                // Number of liquidation events
  
  // Imbalance Analysis
  imbalance: number;            // -100 to +100 (negative = more longs liquidated)
  imbalanceLabel: 'Extreme Long Squeeze' | 'Long Squeeze' | 'Balanced' | 'Short Squeeze' | 'Extreme Short Squeeze';
  
  // Momentum Analysis
  momentum: 'Accelerating' | 'Steady' | 'Decelerating' | 'Stopped';
  momentumScore: number;        // 0-100 (higher = faster acceleration)
  
  // Size Analysis
  avgSize: number;              // Average liquidation size
  largestLiq: number;           // Largest single liquidation
  megaLiqCount: number;         // Count of $500K+ liquidations
  
  // Time Analysis
  frequency: number;            // Liquidations per minute
  lastLiqTime: number;          // Timestamp of most recent liquidation
  
  // Decision Indicators
  signal: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
  confidence: number;           // 0-100 (how confident is the signal)
  reasoning: string[];          // Array of reasons for the signal
  
  // Risk Metrics
  cascadeRisk: 'Low' | 'Medium' | 'High' | 'Extreme';
  priceImpact: number;          // Estimated % price impact
  volatilityRisk: 'Low' | 'Medium' | 'High';
  
  updatedAt: number;
}

export interface LiquidationHeatmapLevel {
  price: number;
  longValue: number;
  shortValue: number;
  totalValue: number;
  count: number;
  percentile: number;           // 0-100 (where this level ranks)
}

export interface LiquidationInsight {
  type: 'opportunity' | 'warning' | 'info';
  title: string;
  message: string;
  confidence: number;           // 0-100
  actionable: boolean;          // Can user act on this?
  timestamp: number;
}

// ── Constants ────────────────────────────────────────────────────

const ANALYSIS_WINDOW_MS = 5 * 60 * 1000;      // 5 minutes
const MOMENTUM_WINDOW_MS = 60 * 1000;          // 1 minute for momentum
const MEGA_LIQ_THRESHOLD = 500000;             // $500K+
const EXTREME_IMBALANCE_THRESHOLD = 70;        // 70%+ imbalance
const HIGH_IMBALANCE_THRESHOLD = 60;           // 60%+ imbalance

// ── Main Analysis Function ───────────────────────────────────────

/**
 * Analyze liquidations for a symbol and provide actionable insights
 */
export function analyzeLiquidations(
  symbol: string,
  liquidations: LiquidationEvent[],
  currentPrice?: number,
  volume24h?: number
): LiquidationStats {
  const now = Date.now();
  
  // Filter to recent liquidations for this symbol
  const recent = liquidations.filter(
    l => l.symbol === symbol && (now - l.timestamp) < ANALYSIS_WINDOW_MS
  );

  if (recent.length === 0) {
    return createEmptyStats(symbol, now);
  }

  // Sort by timestamp (oldest first)
  const sorted = recent.sort((a, b) => a.timestamp - b.timestamp);

  // ── Volume Stats ──
  let longValue = 0;
  let shortValue = 0;
  let largestLiq = 0;
  let megaLiqCount = 0;

  for (const liq of sorted) {
    if (liq.side === 'Sell') {
      longValue += liq.valueUsd;
    } else {
      shortValue += liq.valueUsd;
    }
    
    if (liq.valueUsd > largestLiq) {
      largestLiq = liq.valueUsd;
    }
    
    if (liq.valueUsd >= MEGA_LIQ_THRESHOLD) {
      megaLiqCount++;
    }
  }

  const totalValue = longValue + shortValue;
  const avgSize = totalValue / sorted.length;
  const frequency = (sorted.length / ANALYSIS_WINDOW_MS) * 60000; // per minute

  // ── Imbalance Analysis ──
  const imbalanceRatio = totalValue > 0 ? (shortValue - longValue) / totalValue : 0;
  const imbalance = Math.round(imbalanceRatio * 100);
  
  let imbalanceLabel: LiquidationStats['imbalanceLabel'];
  if (imbalance >= EXTREME_IMBALANCE_THRESHOLD) {
    imbalanceLabel = 'Extreme Short Squeeze';
  } else if (imbalance >= HIGH_IMBALANCE_THRESHOLD) {
    imbalanceLabel = 'Short Squeeze';
  } else if (imbalance <= -EXTREME_IMBALANCE_THRESHOLD) {
    imbalanceLabel = 'Extreme Long Squeeze';
  } else if (imbalance <= -HIGH_IMBALANCE_THRESHOLD) {
    imbalanceLabel = 'Long Squeeze';
  } else {
    imbalanceLabel = 'Balanced';
  }

  // ── Momentum Analysis ──
  const { momentum, momentumScore } = analyzeMomentum(sorted, now);

  // ── Decision Indicators ──
  const { signal, confidence, reasoning } = generateSignal(
    imbalance,
    momentum,
    momentumScore,
    megaLiqCount,
    totalValue,
    sorted
  );

  // ── Risk Metrics ──
  const cascadeRisk = assessCascadeRisk(sorted, totalValue, megaLiqCount, momentum);
  const priceImpact = estimatePriceImpact(totalValue, volume24h);
  const volatilityRisk = assessVolatilityRisk(frequency, avgSize, megaLiqCount);

  return {
    symbol,
    totalValue,
    longValue,
    shortValue,
    count: sorted.length,
    imbalance,
    imbalanceLabel,
    momentum,
    momentumScore,
    avgSize,
    largestLiq,
    megaLiqCount,
    frequency,
    lastLiqTime: sorted[sorted.length - 1].timestamp,
    signal,
    confidence,
    reasoning,
    cascadeRisk,
    priceImpact,
    volatilityRisk,
    updatedAt: now,
  };
}

// ── Helper Functions ─────────────────────────────────────────────

function createEmptyStats(symbol: string, now: number): LiquidationStats {
  return {
    symbol,
    totalValue: 0,
    longValue: 0,
    shortValue: 0,
    count: 0,
    imbalance: 0,
    imbalanceLabel: 'Balanced',
    momentum: 'Stopped',
    momentumScore: 0,
    avgSize: 0,
    largestLiq: 0,
    megaLiqCount: 0,
    frequency: 0,
    lastLiqTime: 0,
    signal: 'Neutral',
    confidence: 0,
    reasoning: ['No recent liquidations'],
    cascadeRisk: 'Low',
    priceImpact: 0,
    volatilityRisk: 'Low',
    updatedAt: now,
  };
}

/**
 * Analyze liquidation momentum (accelerating, steady, decelerating)
 */
function analyzeMomentum(
  sorted: LiquidationEvent[],
  now: number
): { momentum: LiquidationStats['momentum']; momentumScore: number } {
  if (sorted.length < 3) {
    return { momentum: 'Stopped', momentumScore: 0 };
  }

  // Split into two halves: first 2.5 min vs last 2.5 min
  const midpoint = sorted[0].timestamp + (ANALYSIS_WINDOW_MS / 2);
  const firstHalf = sorted.filter(l => l.timestamp < midpoint);
  const secondHalf = sorted.filter(l => l.timestamp >= midpoint);

  const firstHalfValue = firstHalf.reduce((sum, l) => sum + l.valueUsd, 0);
  const secondHalfValue = secondHalf.reduce((sum, l) => sum + l.valueUsd, 0);

  // Calculate momentum score (0-100)
  let momentumScore = 0;
  let momentum: LiquidationStats['momentum'] = 'Steady';

  if (secondHalfValue > firstHalfValue * 1.5) {
    momentum = 'Accelerating';
    momentumScore = Math.min(100, ((secondHalfValue / firstHalfValue) - 1) * 50);
  } else if (secondHalfValue < firstHalfValue * 0.5) {
    momentum = 'Decelerating';
    momentumScore = Math.min(100, ((firstHalfValue / secondHalfValue) - 1) * 50);
  } else if (secondHalfValue > firstHalfValue * 1.2) {
    momentum = 'Accelerating';
    momentumScore = 40;
  } else if (secondHalfValue < firstHalfValue * 0.8) {
    momentum = 'Decelerating';
    momentumScore = 40;
  } else {
    momentum = 'Steady';
    momentumScore = 20;
  }

  // Check if liquidations stopped recently (none in last minute)
  const lastMinute = sorted.filter(l => (now - l.timestamp) < 60000);
  if (lastMinute.length === 0 && sorted.length > 0) {
    momentum = 'Stopped';
    momentumScore = 0;
  }

  return { momentum, momentumScore };
}

/**
 * Generate trading signal based on liquidation analysis
 */
function generateSignal(
  imbalance: number,
  momentum: LiquidationStats['momentum'],
  momentumScore: number,
  megaLiqCount: number,
  totalValue: number,
  sorted: LiquidationEvent[]
): { signal: LiquidationStats['signal']; confidence: number; reasoning: string[] } {
  const reasoning: string[] = [];
  let signalScore = 0; // -100 to +100
  let confidence = 0;

  // ── Factor 1: Imbalance Direction (Primary) ──
  // More shorts liquidated = bullish (price going up, shorts getting rekt)
  // More longs liquidated = bearish (price going down, longs getting rekt)
  if (Math.abs(imbalance) >= EXTREME_IMBALANCE_THRESHOLD) {
    signalScore += imbalance * 0.8; // 80% weight for extreme imbalance
    confidence += 40;
    if (imbalance > 0) {
      reasoning.push(`Extreme short squeeze: ${Math.abs(imbalance)}% shorts liquidated`);
    } else {
      reasoning.push(`Extreme long squeeze: ${Math.abs(imbalance)}% longs liquidated`);
    }
  } else if (Math.abs(imbalance) >= HIGH_IMBALANCE_THRESHOLD) {
    signalScore += imbalance * 0.6; // 60% weight for high imbalance
    confidence += 30;
    if (imbalance > 0) {
      reasoning.push(`Short squeeze: ${Math.abs(imbalance)}% shorts liquidated`);
    } else {
      reasoning.push(`Long squeeze: ${Math.abs(imbalance)}% longs liquidated`);
    }
  } else {
    signalScore += imbalance * 0.3; // 30% weight for moderate imbalance
    confidence += 10;
    reasoning.push('Balanced liquidations');
  }

  // ── Factor 2: Momentum (Secondary) ──
  if (momentum === 'Accelerating') {
    // Accelerating liquidations = trend continuation likely
    signalScore *= 1.2; // Amplify signal
    confidence += 20;
    reasoning.push('Liquidations accelerating - trend may continue');
  } else if (momentum === 'Decelerating') {
    // Decelerating liquidations = potential reversal
    signalScore *= 0.7; // Dampen signal
    confidence += 15;
    reasoning.push('Liquidations slowing - potential reversal');
  } else if (momentum === 'Stopped') {
    // Stopped = reversal likely
    signalScore *= -0.5; // Reverse signal
    confidence += 25;
    reasoning.push('Liquidations stopped - reversal likely');
  }

  // ── Factor 3: Mega Liquidations (Tertiary) ──
  if (megaLiqCount >= 3) {
    confidence += 15;
    reasoning.push(`${megaLiqCount} mega liquidations ($500K+) - high conviction`);
  } else if (megaLiqCount >= 1) {
    confidence += 10;
    reasoning.push(`${megaLiqCount} mega liquidation(s) detected`);
  }

  // ── Factor 4: Total Volume (Significance) ──
  if (totalValue >= 5000000) {
    confidence += 15;
    reasoning.push(`$${(totalValue / 1000000).toFixed(1)}M liquidated - significant event`);
  } else if (totalValue >= 1000000) {
    confidence += 10;
    reasoning.push(`$${(totalValue / 1000000).toFixed(1)}M liquidated`);
  } else {
    confidence -= 10; // Low volume = low confidence
    reasoning.push('Low liquidation volume - weak signal');
  }

  // ── Factor 5: Reversal Detection ──
  // If liquidations stopped after extreme imbalance, strong reversal signal
  if (momentum === 'Stopped' && Math.abs(imbalance) >= EXTREME_IMBALANCE_THRESHOLD) {
    signalScore *= -1.5; // Strong reversal
    confidence += 20;
    reasoning.push('REVERSAL SIGNAL: Extreme liquidations stopped abruptly');
  }

  // ── Convert Score to Signal ──
  let signal: LiquidationStats['signal'];
  if (signalScore >= 60) {
    signal = 'Strong Buy';
  } else if (signalScore >= 30) {
    signal = 'Buy';
  } else if (signalScore <= -60) {
    signal = 'Strong Sell';
  } else if (signalScore <= -30) {
    signal = 'Sell';
  } else {
    signal = 'Neutral';
  }

  // Clamp confidence to 0-100
  confidence = Math.max(0, Math.min(100, confidence));

  return { signal, confidence, reasoning };
}

/**
 * Assess cascade risk based on liquidation patterns
 */
function assessCascadeRisk(
  sorted: LiquidationEvent[],
  totalValue: number,
  megaLiqCount: number,
  momentum: LiquidationStats['momentum']
): LiquidationStats['cascadeRisk'] {
  let riskScore = 0;

  // Factor 1: Total volume
  if (totalValue >= 10000000) riskScore += 40;
  else if (totalValue >= 5000000) riskScore += 30;
  else if (totalValue >= 1000000) riskScore += 20;

  // Factor 2: Mega liquidations
  if (megaLiqCount >= 5) riskScore += 30;
  else if (megaLiqCount >= 3) riskScore += 20;
  else if (megaLiqCount >= 1) riskScore += 10;

  // Factor 3: Momentum
  if (momentum === 'Accelerating') riskScore += 30;
  else if (momentum === 'Steady') riskScore += 10;

  if (riskScore >= 80) return 'Extreme';
  if (riskScore >= 60) return 'High';
  if (riskScore >= 30) return 'Medium';
  return 'Low';
}

/**
 * Estimate price impact percentage
 */
function estimatePriceImpact(
  liquidationValue: number,
  volume24h?: number
): number {
  if (!volume24h || volume24h === 0) {
    // Fallback: rough estimate based on liquidation size
    if (liquidationValue >= 10000000) return 2.0; // $10M+ = ~2% impact
    if (liquidationValue >= 5000000) return 1.0;  // $5M+ = ~1% impact
    if (liquidationValue >= 1000000) return 0.5;  // $1M+ = ~0.5% impact
    return 0.1;
  }

  // More accurate: liquidation value as % of 24h volume
  const impact = (liquidationValue / volume24h) * 100;
  return Math.min(5.0, impact); // Cap at 5%
}

/**
 * Assess volatility risk based on liquidation frequency and size
 */
function assessVolatilityRisk(
  frequency: number,
  avgSize: number,
  megaLiqCount: number
): LiquidationStats['volatilityRisk'] {
  let riskScore = 0;

  // Factor 1: Frequency (liquidations per minute)
  if (frequency >= 5) riskScore += 40;
  else if (frequency >= 3) riskScore += 30;
  else if (frequency >= 1) riskScore += 20;

  // Factor 2: Average size
  if (avgSize >= 500000) riskScore += 30;
  else if (avgSize >= 100000) riskScore += 20;
  else if (avgSize >= 50000) riskScore += 10;

  // Factor 3: Mega liquidations
  if (megaLiqCount >= 3) riskScore += 30;
  else if (megaLiqCount >= 1) riskScore += 20;

  if (riskScore >= 70) return 'High';
  if (riskScore >= 40) return 'Medium';
  return 'Low';
}

/**
 * Generate liquidation heatmap (price levels with liquidation clusters)
 */
export function generateLiquidationHeatmap(
  symbol: string,
  liquidations: LiquidationEvent[],
  currentPrice: number,
  bucketSizePercent: number = 0.5 // 0.5% price buckets
): LiquidationHeatmapLevel[] {
  const now = Date.now();
  const recent = liquidations.filter(
    l => l.symbol === symbol && (now - l.timestamp) < 60 * 60 * 1000 // Last hour
  );

  if (recent.length === 0) return [];

  // Create price buckets
  const bucketSize = currentPrice * (bucketSizePercent / 100);
  const buckets = new Map<number, LiquidationHeatmapLevel>();

  for (const liq of recent) {
    const bucket = Math.round(liq.price / bucketSize) * bucketSize;
    const existing = buckets.get(bucket) || {
      price: bucket,
      longValue: 0,
      shortValue: 0,
      totalValue: 0,
      count: 0,
      percentile: 0,
    };

    if (liq.side === 'Sell') {
      existing.longValue += liq.valueUsd;
    } else {
      existing.shortValue += liq.valueUsd;
    }
    existing.totalValue += liq.valueUsd;
    existing.count += 1;

    buckets.set(bucket, existing);
  }

  // Convert to array and calculate percentiles
  const levels = Array.from(buckets.values()).sort((a, b) => b.price - a.price);
  const maxValue = Math.max(...levels.map(l => l.totalValue));

  for (const level of levels) {
    level.percentile = (level.totalValue / maxValue) * 100;
  }

  return levels;
}

/**
 * Generate actionable insights from liquidation data
 */
export function generateLiquidationInsights(
  stats: LiquidationStats,
  currentPrice?: number
): LiquidationInsight[] {
  const insights: LiquidationInsight[] = [];
  const now = Date.now();

  // Insight 1: Extreme Imbalance Opportunity
  if (stats.imbalanceLabel === 'Extreme Short Squeeze' && stats.momentum === 'Accelerating') {
    insights.push({
      type: 'opportunity',
      title: 'Strong Bullish Signal',
      message: `Extreme short squeeze with ${stats.megaLiqCount} mega liquidations. Price likely to continue upward.`,
      confidence: stats.confidence,
      actionable: true,
      timestamp: now,
    });
  } else if (stats.imbalanceLabel === 'Extreme Long Squeeze' && stats.momentum === 'Accelerating') {
    insights.push({
      type: 'opportunity',
      title: 'Strong Bearish Signal',
      message: `Extreme long squeeze with ${stats.megaLiqCount} mega liquidations. Price likely to continue downward.`,
      confidence: stats.confidence,
      actionable: true,
      timestamp: now,
    });
  }

  // Insight 2: Reversal Warning
  if (stats.momentum === 'Stopped' && Math.abs(stats.imbalance) >= EXTREME_IMBALANCE_THRESHOLD) {
    insights.push({
      type: 'warning',
      title: 'Potential Reversal',
      message: `Liquidations stopped after ${stats.imbalanceLabel.toLowerCase()}. Reversal likely.`,
      confidence: 75,
      actionable: true,
      timestamp: now,
    });
  }

  // Insight 3: Cascade Risk Warning
  if (stats.cascadeRisk === 'Extreme' || stats.cascadeRisk === 'High') {
    insights.push({
      type: 'warning',
      title: `${stats.cascadeRisk} Cascade Risk`,
      message: `$${(stats.totalValue / 1000000).toFixed(1)}M liquidated in 5 minutes. Expect high volatility.`,
      confidence: 85,
      actionable: false,
      timestamp: now,
    });
  }

  // Insight 4: Low Confidence Warning
  if (stats.confidence < 30 && stats.signal !== 'Neutral') {
    insights.push({
      type: 'info',
      title: 'Low Confidence Signal',
      message: 'Liquidation volume too low for reliable signal. Wait for more data.',
      confidence: stats.confidence,
      actionable: false,
      timestamp: now,
    });
  }

  // Insight 5: High Volatility Warning
  if (stats.volatilityRisk === 'High') {
    insights.push({
      type: 'warning',
      title: 'High Volatility Expected',
      message: `${stats.frequency.toFixed(1)} liquidations/min. Use tight stop losses.`,
      confidence: 70,
      actionable: true,
      timestamp: now,
    });
  }

  return insights;
}

/**
 * Batch analyze liquidations for multiple symbols
 */
export function analyzeAllLiquidations(
  symbols: string[],
  liquidations: LiquidationEvent[],
  prices?: Map<string, number>,
  volumes?: Map<string, number>
): Map<string, LiquidationStats> {
  const result = new Map<string, LiquidationStats>();

  for (const symbol of symbols) {
    const price = prices?.get(symbol);
    const volume = volumes?.get(symbol);
    const stats = analyzeLiquidations(symbol, liquidations, price, volume);
    
    if (stats.count > 0) {
      result.set(symbol, stats);
    }
  }

  return result;
}
