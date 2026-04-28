/**
 * SUPER_SIGNAL Backtesting Engine
 * 
 * Replays historical ScreenerEntry snapshots through computeSuperSignal()
 * and evaluates performance against actual price movements.
 */

import type { ScreenerEntry } from '../types';
import type { SuperSignalResult, SuperSignalCategory } from './types';
import { computeSuperSignal } from './index';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  symbol: string;
  timestamp: number;
  entryPrice: number;
  exitPrice: number;
  signal: SuperSignalCategory;
  signalValue: number;
  pnlPercent: number;
  holdingPeriodBars: number;
  regime?: string;
  assetClass: string;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  avgHoldingPeriodBars: number;
}

export interface BacktestResult {
  overall: BacktestMetrics;
  byAssetClass: Record<string, BacktestMetrics>;
  byRegime: Record<string, BacktestMetrics>;
  bySignal: Record<SuperSignalCategory, BacktestMetrics>;
  trades: BacktestTrade[];
  startDate: number;
  endDate: number;
  totalBars: number;
}

export interface AdaptiveThresholdRecommendation {
  strongBuy: number;
  buy: number;
  neutral: number;
  sell: number;
  generatedAt: number;
  nextRetrainAt: number;
}

export interface BacktestOptions {
  holdingPeriodBars?: number; // Default: 20 bars (20 minutes for 1m data)
  minTradesPerCategory?: number; // Minimum trades to consider category valid
  riskFreeRate?: number; // Annual risk-free rate for Sharpe calculation (default: 0.02)
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Computation
// ─────────────────────────────────────────────────────────────────────────────

function computeMetrics(trades: BacktestTrade[], riskFreeRate = 0.02): BacktestMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      totalReturnPercent: 0,
      sharpeRatio: 0,
      maxDrawdownPercent: 0,
      profitFactor: 0,
      avgHoldingPeriodBars: 0,
    };
  }

  const winningTrades = trades.filter((t) => t.pnlPercent > 0);
  const losingTrades = trades.filter((t) => t.pnlPercent <= 0);

  const totalReturn = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length)
    : 0;

  // Sharpe Ratio (annualized)
  const returns = trades.map((t) => t.pnlPercent / 100);
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  
  // Annualize: assuming 1m bars, 1440 bars/day, 365 days/year
  const barsPerYear = 1440 * 365;
  const avgHoldingPeriod = trades.reduce((sum, t) => sum + t.holdingPeriodBars, 0) / trades.length;
  const tradesPerYear = barsPerYear / avgHoldingPeriod;
  const annualizedReturn = avgReturn * tradesPerYear;
  const annualizedStdDev = stdDev * Math.sqrt(tradesPerYear);
  const sharpeRatio = annualizedStdDev > 0
    ? (annualizedReturn - riskFreeRate) / annualizedStdDev
    : 0;

  // Maximum Drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  for (const trade of trades) {
    cumulative += trade.pnlPercent;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Profit Factor
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
    avgWinPercent: avgWin,
    avgLossPercent: avgLoss,
    totalReturnPercent: totalReturn,
    sharpeRatio,
    maxDrawdownPercent: maxDrawdown,
    profitFactor,
    avgHoldingPeriodBars: avgHoldingPeriod,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Backtesting Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run backtest on historical ScreenerEntry snapshots.
 * 
 * @param snapshots - Array of historical ScreenerEntry snapshots (chronological order)
 * @param options - Backtesting options
 * @returns BacktestResult with performance metrics
 */
export async function runBacktest(
  snapshots: ScreenerEntry[],
  options: BacktestOptions = {}
): Promise<BacktestResult> {
  const {
    holdingPeriodBars = 20, // 20 minutes for 1m data
    minTradesPerCategory = 5,
    riskFreeRate = 0.02,
  } = options;

  const trades: BacktestTrade[] = [];
  const startDate = snapshots[0]?.updatedAt || Date.now();
  const endDate = snapshots[snapshots.length - 1]?.updatedAt || Date.now();

  // Process each snapshot
  for (let i = 0; i < snapshots.length - holdingPeriodBars; i++) {
    const entry = snapshots[i];
    
    // Compute SUPER_SIGNAL for this entry
    const superSignal = await computeSuperSignal(entry);
    
    if (!superSignal) continue;

    // Look ahead to get exit price
    const exitEntry = snapshots[i + holdingPeriodBars];
    if (!exitEntry) continue;

    const entryPrice = entry.price;
    const exitPrice = exitEntry.price;
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

    // Adjust PnL based on signal direction
    let adjustedPnl = pnlPercent;
    if (superSignal.category === 'Strong Sell' || superSignal.category === 'Sell') {
      adjustedPnl = -pnlPercent; // Short position
    } else if (superSignal.category === 'Neutral') {
      adjustedPnl = 0; // No position
    }

    trades.push({
      symbol: entry.symbol,
      timestamp: entry.updatedAt || Date.now(),
      entryPrice,
      exitPrice,
      signal: superSignal.category,
      signalValue: superSignal.value,
      pnlPercent: adjustedPnl,
      holdingPeriodBars,
      regime: (superSignal.components.regime as any).regime,
      assetClass: entry.market || 'Crypto',
    });
  }

  // Compute overall metrics
  const overall = computeMetrics(trades, riskFreeRate);

  // Compute metrics by asset class
  const byAssetClass: Record<string, BacktestMetrics> = {};
  const assetClasses = [...new Set(trades.map((t) => t.assetClass))];
  for (const assetClass of assetClasses) {
    const assetTrades = trades.filter((t) => t.assetClass === assetClass);
    if (assetTrades.length >= minTradesPerCategory) {
      byAssetClass[assetClass] = computeMetrics(assetTrades, riskFreeRate);
    }
  }

  // Compute metrics by regime
  const byRegime: Record<string, BacktestMetrics> = {};
  const regimes = [...new Set(trades.map((t) => t.regime).filter(Boolean))] as string[];
  for (const regime of regimes) {
    const regimeTrades = trades.filter((t) => t.regime === regime);
    if (regimeTrades.length >= minTradesPerCategory) {
      byRegime[regime] = computeMetrics(regimeTrades, riskFreeRate);
    }
  }

  // Compute metrics by signal category
  const bySignal: Record<SuperSignalCategory, BacktestMetrics> = {} as any;
  const signals: SuperSignalCategory[] = ['Strong Buy', 'Buy', 'Neutral', 'Sell', 'Strong Sell'];
  for (const signal of signals) {
    const signalTrades = trades.filter((t) => t.signal === signal);
    if (signalTrades.length >= minTradesPerCategory) {
      bySignal[signal] = computeMetrics(signalTrades, riskFreeRate);
    }
  }

  return {
    overall,
    byAssetClass,
    byRegime,
    bySignal,
    trades,
    startDate,
    endDate,
    totalBars: snapshots.length,
  };
}

/**
 * Compare SUPER_SIGNAL performance against existing strategySignal.
 * 
 * @param snapshots - Historical ScreenerEntry snapshots
 * @param options - Backtesting options
 * @returns Comparison metrics
 */
export async function compareSignals(
  snapshots: ScreenerEntry[],
  options: BacktestOptions = {}
): Promise<{
  superSignal: BacktestResult;
  strategySignal: BacktestMetrics;
  outperformance: number;
  recommendation: 'use-super-signal' | 'use-strategy-signal' | 'needs-tuning';
}> {
  const {
    holdingPeriodBars = 20,
    riskFreeRate = 0.02,
  } = options;

  // Run SUPER_SIGNAL backtest
  const superSignalResult = await runBacktest(snapshots, options);

  // Compute strategySignal performance
  const strategyTrades: BacktestTrade[] = [];
  for (let i = 0; i < snapshots.length - holdingPeriodBars; i++) {
    const entry = snapshots[i];
    const exitEntry = snapshots[i + holdingPeriodBars];
    if (!exitEntry) continue;

    const entryPrice = entry.price;
    const exitPrice = exitEntry.price;
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

    // Adjust PnL based on strategySignal direction
    let adjustedPnl = pnlPercent;
    if (entry.strategySignal === 'strong-sell' || entry.strategySignal === 'sell') {
      adjustedPnl = -pnlPercent;
    } else if (entry.strategySignal === 'neutral') {
      adjustedPnl = 0;
    }

    strategyTrades.push({
      symbol: entry.symbol,
      timestamp: entry.updatedAt || Date.now(),
      entryPrice,
      exitPrice,
      signal: 'Neutral', // Placeholder
      signalValue: entry.strategyScore,
      pnlPercent: adjustedPnl,
      holdingPeriodBars,
      assetClass: entry.market || 'Crypto',
    });
  }

  const strategyMetrics = computeMetrics(strategyTrades, riskFreeRate);

  // Calculate outperformance
  const outperformance = superSignalResult.overall.winRate - strategyMetrics.winRate;

  // Recommendation
  let recommendation: 'use-super-signal' | 'use-strategy-signal' | 'needs-tuning';
  if (outperformance > 0.10) {
    recommendation = 'use-super-signal';
  } else if (outperformance < -0.10) {
    recommendation = 'use-strategy-signal';
  } else {
    recommendation = 'needs-tuning';
  }

  return {
    superSignal: superSignalResult,
    strategySignal: strategyMetrics,
    outperformance,
    recommendation,
  };
}

/**
 * Suggest adaptive threshold bands from recent SUPER_SIGNAL distribution.
 * Designed to be run on a monthly cadence with 3-5 years of historical snapshots.
 */
export function recommendAdaptiveThresholds(
  snapshots: ScreenerEntry[],
  nowTs: number = Date.now()
): AdaptiveThresholdRecommendation {
  const values = snapshots
    .map((s) => s.superSignal?.value)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);

  const percentile = (p: number): number => {
    if (values.length === 0) return 50;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * p)));
    return values[idx];
  };

  const sell = Math.round(percentile(0.2));
  const neutral = Math.round(percentile(0.4));
  const buy = Math.round(percentile(0.6));
  const strongBuy = Math.round(percentile(0.8));

  return {
    strongBuy: Math.max(buy + 1, strongBuy),
    buy: Math.max(neutral + 1, buy),
    neutral: Math.max(sell + 1, neutral),
    sell: Math.max(1, sell),
    generatedAt: nowTs,
    nextRetrainAt: nowTs + 30 * 24 * 60 * 60 * 1000,
  };
}
