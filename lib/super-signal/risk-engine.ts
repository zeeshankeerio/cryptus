/**
 * RSIQ Pro - SUPER_SIGNAL Volatility-Adaptive Risk Engine
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Computes ATR-scaled stop losses and dynamic position sizing based on volatility.
 * Adapts risk parameters to current market conditions for optimal risk management.
 */

import type { ComponentScore, SuperSignalInput, AssetClass } from './types';
import { getCachedComponentScore, setCachedComponentScore } from './cache';
import { getConfig } from './config';

// ── ATR Multiplier Selection ─────────────────────────────────────

/**
 * Get asset-specific ATR multiplier for stop loss calculation.
 * Different asset classes have different volatility characteristics.
 */
function getAtrMultiplier(assetClass: AssetClass): number {
  const config = getConfig();
  return config.risk.atrMultipliers[assetClass] ?? 1.5;
}

// ── Stop Loss Computation ────────────────────────────────────────

/**
 * Compute ATR-scaled stop loss.
 * 
 * Formula: stopLoss = currentPrice ± (ATR × multiplier)
 * - For long positions: stopLoss = price - (ATR × multiplier)
 * - For short positions: stopLoss = price + (ATR × multiplier)
 * 
 * @param price - Current price
 * @param atr - Average True Range
 * @param multiplier - ATR multiplier (asset-specific)
 * @param direction - Trade direction (1 = long, -1 = short)
 * @returns Stop loss price
 */
function computeStopLoss(
  price: number,
  atr: number,
  multiplier: number,
  direction: number
): number {
  const offset = atr * multiplier;
  return direction > 0 ? price - offset : price + offset;
}

// ── Take Profit Computation ──────────────────────────────────────

/**
 * Compute take profit levels at specified risk-reward ratios.
 * 
 * @param price - Entry price
 * @param stopLoss - Stop loss price
 * @param ratios - Array of risk-reward ratios (e.g., [1.33, 2.0])
 * @param direction - Trade direction (1 = long, -1 = short)
 * @returns Array of take profit prices
 */
function computeTakeProfits(
  price: number,
  stopLoss: number,
  ratios: number[],
  direction: number
): number[] {
  const risk = Math.abs(price - stopLoss);
  return ratios.map(ratio => {
    const reward = risk * ratio;
    return direction > 0 ? price + reward : price - reward;
  });
}

// ── Position Sizing ──────────────────────────────────────────────

/**
 * Compute dynamic position size based on account risk.
 * 
 * Formula: positionSize = (accountBalance × riskPct) / (entryPrice - stopLoss)
 * 
 * Capped at maxPositionPct of account balance to prevent over-concentration.
 * 
 * @param accountBalance - Total account balance (optional)
 * @param riskPct - Risk percentage per trade (default: 1%)
 * @param entryPrice - Entry price
 * @param stopLoss - Stop loss price
 * @param maxPositionPct - Maximum position size as % of account (default: 10%)
 * @returns Position size in base currency units, or null if accountBalance not provided
 */
function computePositionSize(
  accountBalance: number | null,
  riskPct: number,
  entryPrice: number,
  stopLoss: number,
  maxPositionPct: number
): number | null {
  if (accountBalance === null || accountBalance <= 0) {
    return null;
  }
  
  const riskAmount = accountBalance * riskPct;
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  
  if (riskPerUnit === 0) {
    return null;
  }
  
  const positionSize = riskAmount / riskPerUnit;
  const maxPosition = accountBalance * maxPositionPct / entryPrice;
  
  return Math.min(positionSize, maxPosition);
}

// ── Risk Score Computation ────────────────────────────────────────

/**
 * Compute normalized risk score (0-100) based on current volatility.
 * 
 * Score interpretation:
 * - 0-30: Very high volatility (unfavorable risk, wide stops)
 * - 30-45: High volatility (elevated risk)
 * - 45-55: Normal volatility (neutral risk)
 * - 55-70: Low volatility (favorable risk, tight stops)
 * - 70-100: Very low volatility (very favorable risk)
 * 
 * Uses ATR ratio (current ATR / historical average) as volatility proxy.
 */
function computeRiskScore(atr: number | null, historicalCloses: number[] | undefined): number {
  if (atr === null || !historicalCloses || historicalCloses.length < 20) {
    return 50; // Neutral if insufficient data
  }
  
  // Compute historical ATR average (simplified: use price range as proxy)
  const recentPrices = historicalCloses.slice(-20);
  let sumRange = 0;
  
  for (let i = 1; i < recentPrices.length; i++) {
    sumRange += Math.abs(recentPrices[i] - recentPrices[i - 1]);
  }
  
  const avgRange = sumRange / (recentPrices.length - 1);
  const currentPrice = historicalCloses[historicalCloses.length - 1];
  
  if (avgRange === 0 || currentPrice === 0) {
    return 50;
  }
  
  // Normalize ATR as percentage of price
  const atrPct = (atr / currentPrice) * 100;
  const avgRangePct = (avgRange / currentPrice) * 100;
  
  // Compute ATR ratio
  const atrRatio = avgRangePct > 0 ? atrPct / avgRangePct : 1.0;
  
  // Map ATR ratio to risk score
  // Low ATR ratio (<0.8) = low volatility = high score (favorable)
  // High ATR ratio (>1.5) = high volatility = low score (unfavorable)
  if (atrRatio < 0.8) {
    const magnitude = (0.8 - atrRatio) / 0.8;
    return Math.round(60 + (magnitude * 40)); // 60-100
  } else if (atrRatio > 1.5) {
    const magnitude = Math.min((atrRatio - 1.5) / 1.5, 1.0);
    return Math.round(40 - (magnitude * 40)); // 0-40
  } else {
    // Normal volatility: 40-60
    const position = (atrRatio - 0.8) / 0.7;
    return Math.round(60 - (position * 20)); // 40-60
  }
}

// ── Risk Engine ──────────────────────────────────────────────────

/**
 * Compute volatility-adaptive risk parameters and risk score.
 * 
 * Computes:
 * - ATR-scaled stop loss
 * - Take profit levels (1.33:1 and 2.0:1 risk-reward)
 * - Dynamic position sizing (if account balance provided)
 * - Normalized risk score (0-100)
 * 
 * @param input - SuperSignalInput containing price, ATR, and historical data
 * @param accountBalance - Optional account balance for position sizing
 * @returns ComponentScore with risk score and metadata
 */
export async function computeRisk(
  input: SuperSignalInput,
  accountBalance?: number | null
): Promise<ComponentScore> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cached = getCachedComponentScore(input.symbol, 'risk');
    if (cached) {
      return cached;
    }
    
    const config = getConfig();
    const { price, atr, assetClass, strategySignal, historicalCloses } = input;
    
    // Validate ATR data
    if (atr === null) {
      return {
        score: 50,
        confidence: 0,
        error: 'ATR data unavailable',
        computeTimeMs: Date.now() - startTime,
      };
    }
    
    // Get ATR multiplier for asset class
    const multiplier = getAtrMultiplier(assetClass);
    
    // Determine trade direction from strategy signal
    const direction = ['strong-buy', 'buy'].includes(strategySignal) ? 1 : -1;
    
    // Compute stop loss
    const stopLoss = computeStopLoss(price, atr, multiplier, direction);
    
    // Compute take profit levels
    const takeProfits = computeTakeProfits(price, stopLoss, [1.33, 2.0], direction);
    
    // Compute position size (if account balance provided)
    const positionSize = computePositionSize(
      accountBalance ?? null,
      config.risk.defaultRiskPct,
      price,
      stopLoss,
      config.risk.maxPositionPct
    );
    
    // Compute base risk score from ATR volatility
    let score = computeRiskScore(atr, historicalCloses);
    
    // ── Smart Money Risk Adjustment ──
    // When Smart Money derivatives data is available, adjust risk score:
    // - SM confirms Strategy direction → lower perceived risk (+5-15 score)
    // - SM contradicts Strategy direction → higher perceived risk (-5-15 score)
    // This ensures the Super Signal fusion engine reflects derivatives intelligence.
    if (input.smartMoneyScore !== undefined && input.smartMoneyScore !== null && Math.abs(input.smartMoneyScore) >= 20) {
      const smDirection = input.smartMoneyScore > 0 ? 1 : -1;
      const smMagnitude = Math.min(Math.abs(input.smartMoneyScore), 100) / 100; // 0-1
      
      if (smDirection === direction) {
        // Smart Money confirms Strategy → reduce risk (boost score)
        const boost = Math.round(smMagnitude * 15); // Up to +15
        score = Math.min(100, score + boost);
      } else {
        // Smart Money contradicts Strategy → increase risk (penalize score)
        const penalty = Math.round(smMagnitude * 15); // Up to -15
        score = Math.max(0, score - penalty);
      }
    }

    // Funding-rate penalty/boost: extreme positive funding implies crowded longs (higher downside risk),
    // extreme negative funding implies crowded shorts (higher squeeze risk for shorts).
    if (input.fundingRate !== undefined && input.fundingRate !== null) {
      const annualizedFundingPct = Math.abs(input.fundingRate) * 3 * 365 * 100;
      if (annualizedFundingPct >= 80) {
        const crowdedPenalty = Math.min(10, Math.round(annualizedFundingPct / 20));
        score = Math.max(0, score - crowdedPenalty);
      } else if (annualizedFundingPct >= 30) {
        score = Math.max(0, score - 4);
      }
    }

    // Order-flow confirmation: if flow aligns with strategy, reduce risk; else increase risk.
    if (input.orderFlowRatio !== undefined && input.orderFlowRatio !== null) {
      const buyPressure = input.orderFlowRatio;
      const flowDirection = buyPressure > 0.55 ? 1 : buyPressure < 0.45 ? -1 : 0;
      if (flowDirection !== 0) {
        if (flowDirection === direction) score = Math.min(100, score + 8);
        else score = Math.max(0, score - 8);
      }
    }
    
    const result: ComponentScore = {
      score,
      confidence: 100,
      computeTimeMs: Date.now() - startTime,
    };
    
    // Cache result
    setCachedComponentScore(input.symbol, 'risk', result);
    
    return result;
    
  } catch (error) {
    console.error('[super-signal] Risk engine error:', error);
    return {
      score: 50,
      confidence: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      computeTimeMs: Date.now() - startTime,
    };
  }
}
