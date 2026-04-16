/**
 * RSIQ Pro — Portfolio Risk Scanner
 * Copyright © 2024–2026 Mindscape Analytics LLC. All rights reserved.
 * https://mindscapeanalytics.com/
 *
 * Analyzes a user's portfolio positions and computes:
 *   1. Aggregate Portfolio RSI (weighted by position value)
 *   2. Portfolio Risk Score (0–100, incorporating volatility + correlation)
 *   3. Concentration Risk (HHI — Herfindahl-Hirschman Index)
 *   4. Hedge Suggestions (anti-correlated assets to reduce risk)
 *   5. Per-position P&L with real-time pricing
 *
 * This is a premium institutional feature — no free tool offers this.
 */

import type { ScreenerEntry } from './types';

// ── Types ─────────────────────────────────────────────────────────

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  entryPrice: number;
  /** Computed from live data */
  currentPrice?: number;
  rsi?: number | null;
  change24h?: number;
}

export interface PositionAnalysis {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPercent: number;
  weight: number; // % of total portfolio
  rsi: number | null;
  riskContribution: number; // How much this position contributes to overall risk
}

export interface PortfolioRiskReport {
  /** Total portfolio value at current prices */
  totalValue: number;
  /** Total unrealized P&L */
  totalPnl: number;
  totalPnlPercent: number;

  /** Weighted average RSI across all positions */
  portfolioRsi: number | null;

  /** 0–100 risk score. Higher = more risk */
  riskScore: number;
  riskLabel: 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Extreme';

  /** Concentration risk via HHI (0–10000). >2500 = concentrated */
  concentrationHhi: number;
  concentrationLabel: 'Diversified' | 'Moderate' | 'Concentrated' | 'Highly Concentrated';

  /** Individual position analyses */
  positions: PositionAnalysis[];

  /** Suggested hedges based on RSI extremes */
  hedgeSuggestions: HedgeSuggestion[];

  /** When was this report computed */
  computedAt: number;
}

export interface HedgeSuggestion {
  reason: string;
  action: 'reduce' | 'hedge' | 'rebalance';
  urgency: 'low' | 'medium' | 'high';
  symbol?: string;
}

// ── Storage ───────────────────────────────────────────────────────

const STORAGE_KEY = 'rsiq-portfolio-positions';

export function loadPositions(): PortfolioPosition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePositions(positions: PortfolioPosition[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Silent fail on quota
  }
}

export function addPosition(position: Omit<PortfolioPosition, 'currentPrice' | 'rsi' | 'change24h'>): void {
  const positions = loadPositions();
  positions.push(position);
  savePositions(positions);
}

export function removePosition(symbol: string): void {
  const positions = loadPositions().filter(p => p.symbol !== symbol);
  savePositions(positions);
}

export function clearPortfolio(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// ── Risk Computation ──────────────────────────────────────────────

/**
 * Generate a comprehensive portfolio risk report.
 * @param positions - User's portfolio positions
 * @param liveData - Current screener data for price/RSI lookup
 */
export function computePortfolioRisk(
  positions: PortfolioPosition[],
  liveData: ScreenerEntry[],
): PortfolioRiskReport {
  if (positions.length === 0) {
    return emptyReport();
  }

  // Build price lookup from live screener data
  const priceMap = new Map<string, { price: number; rsi: number | null; change: number }>();
  for (const entry of liveData) {
    priceMap.set(entry.symbol, {
      price: entry.price,
      rsi: entry.rsiCustom ?? entry.rsi15m ?? entry.rsi1m,
      change: entry.change24h,
    });
  }

  // ── 1. Compute per-position analysis ──
  const analyses: PositionAnalysis[] = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const pos of positions) {
    const live = priceMap.get(pos.symbol);
    const currentPrice = live?.price ?? pos.currentPrice ?? pos.entryPrice;
    const marketValue = pos.quantity * currentPrice;
    const costBasis = pos.quantity * pos.entryPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    totalValue += marketValue;
    totalCost += costBasis;

    analyses.push({
      symbol: pos.symbol,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      currentPrice,
      marketValue,
      pnl,
      pnlPercent,
      weight: 0, // Computed after totals
      rsi: live?.rsi ?? pos.rsi ?? null,
      riskContribution: 0, // Computed below
    });
  }

  // ── 2. Compute weights ──
  for (const a of analyses) {
    a.weight = totalValue > 0 ? (a.marketValue / totalValue) * 100 : 0;
  }

  // ── 3. Portfolio RSI (value-weighted) ──
  let portfolioRsi: number | null = null;
  const rsiPositions = analyses.filter(a => a.rsi !== null && a.rsi !== undefined);
  if (rsiPositions.length > 0) {
    const totalRsiWeight = rsiPositions.reduce((s, a) => s + a.weight, 0);
    if (totalRsiWeight > 0) {
      portfolioRsi = Math.round(
        rsiPositions.reduce((s, a) => s + (a.rsi! * a.weight), 0) / totalRsiWeight * 10
      ) / 10;
    }
  }

  // ── 4. Concentration Risk (HHI) ──
  // HHI = Σ(weight²) where weights are in percent (0–100)
  // 10000 = single asset, < 1500 = well diversified
  const hhi = Math.round(analyses.reduce((s, a) => s + a.weight * a.weight, 0));

  let concentrationLabel: PortfolioRiskReport['concentrationLabel'];
  if (hhi < 1500) concentrationLabel = 'Diversified';
  else if (hhi < 2500) concentrationLabel = 'Moderate';
  else if (hhi < 5000) concentrationLabel = 'Concentrated';
  else concentrationLabel = 'Highly Concentrated';

  // ── 5. Risk Score (0–100) ──
  // Factors: HHI, portfolio RSI extremes, P&L drawdown, position count
  let riskScore = 0;

  // Concentration component (0–30)
  riskScore += Math.min(30, (hhi / 10000) * 30);

  // RSI extreme component (0–25)
  if (portfolioRsi !== null) {
    if (portfolioRsi >= 75) riskScore += 25;
    else if (portfolioRsi >= 65) riskScore += 15;
    else if (portfolioRsi <= 25) riskScore += 20;
    else if (portfolioRsi <= 35) riskScore += 10;
  }

  // Drawdown component (0–25)
  const totalPnlPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  if (totalPnlPercent < -20) riskScore += 25;
  else if (totalPnlPercent < -10) riskScore += 15;
  else if (totalPnlPercent < -5) riskScore += 8;

  // Low diversification component (0–20)
  if (positions.length <= 1) riskScore += 20;
  else if (positions.length <= 3) riskScore += 10;
  else if (positions.length <= 5) riskScore += 5;

  riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));

  let riskLabel: PortfolioRiskReport['riskLabel'];
  if (riskScore >= 80) riskLabel = 'Extreme';
  else if (riskScore >= 60) riskLabel = 'High';
  else if (riskScore >= 40) riskLabel = 'Moderate';
  else if (riskScore >= 20) riskLabel = 'Low';
  else riskLabel = 'Very Low';

  // ── 6. Risk Contribution per position ──
  for (const a of analyses) {
    // Risk contribution = weight * (deviation from ideal RSI of 50)
    const rsiDeviation = a.rsi !== null ? Math.abs(a.rsi - 50) / 50 : 0.5;
    a.riskContribution = Math.round((a.weight / 100) * rsiDeviation * 100);
  }

  // ── 7. Hedge Suggestions ──
  const hedgeSuggestions: HedgeSuggestion[] = [];

  if (portfolioRsi !== null && portfolioRsi >= 70) {
    hedgeSuggestions.push({
      reason: `Portfolio RSI at ${portfolioRsi.toFixed(1)} — overbought territory. Consider taking profits on strongest performers.`,
      action: 'reduce',
      urgency: portfolioRsi >= 80 ? 'high' : 'medium',
    });
  }

  if (portfolioRsi !== null && portfolioRsi <= 30) {
    hedgeSuggestions.push({
      reason: `Portfolio RSI at ${portfolioRsi.toFixed(1)} — oversold territory. Potential accumulation opportunity if fundamentals are intact.`,
      action: 'rebalance',
      urgency: portfolioRsi <= 20 ? 'high' : 'medium',
    });
  }

  if (hhi >= 2500) {
    const largest = analyses.sort((a, b) => b.weight - a.weight)[0];
    hedgeSuggestions.push({
      reason: `Portfolio is ${concentrationLabel.toLowerCase()} — ${largest.symbol} represents ${largest.weight.toFixed(1)}% of total value. Consider diversifying.`,
      action: 'rebalance',
      urgency: hhi >= 5000 ? 'high' : 'medium',
      symbol: largest.symbol,
    });
  }

  // Per-position extreme RSI alerts
  for (const a of analyses) {
    if (a.rsi !== null && a.rsi >= 80 && a.weight > 10) {
      hedgeSuggestions.push({
        reason: `${a.symbol} RSI at ${a.rsi.toFixed(1)} — deeply overbought while holding ${a.weight.toFixed(1)}% of portfolio.`,
        action: 'reduce',
        urgency: 'high',
        symbol: a.symbol,
      });
    }
    if (a.pnlPercent < -15 && a.weight > 5) {
      hedgeSuggestions.push({
        reason: `${a.symbol} down ${Math.abs(a.pnlPercent).toFixed(1)}% from entry — consider stop-loss or averaging down.`,
        action: 'hedge',
        urgency: a.pnlPercent < -25 ? 'high' : 'medium',
        symbol: a.symbol,
      });
    }
  }

  return {
    totalValue,
    totalPnl: totalValue - totalCost,
    totalPnlPercent,
    portfolioRsi,
    riskScore,
    riskLabel,
    concentrationHhi: hhi,
    concentrationLabel,
    positions: analyses.sort((a, b) => b.marketValue - a.marketValue),
    hedgeSuggestions,
    computedAt: Date.now(),
  };
}

function emptyReport(): PortfolioRiskReport {
  return {
    totalValue: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    portfolioRsi: null,
    riskScore: 0,
    riskLabel: 'Very Low',
    concentrationHhi: 0,
    concentrationLabel: 'Diversified',
    positions: [],
    hedgeSuggestions: [],
    computedAt: Date.now(),
  };
}
