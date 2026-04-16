/**
 * Mindscape Analytics — Signal Narration Engine™
 *
 * Generates institutional-grade, human-readable explanations for strategy signals.
 * This is a UNIQUE feature that no competitor offers. Each narration is designed
 * to be screenshot-friendly and shareable, driving viral growth.
 *
 * Architecture:
 *   Input:  ScreenerEntry (or subset of indicator data)
 *   Output: SignalNarration { headline, reasons[], conviction, emoji }
 *
 * The narration engine analyzes all available indicators and composes a coherent
 * market narrative — similar to what a senior analyst would write in a morning brief.
 */

import type { ScreenerEntry } from './types';

// ── Output Types ─────────────────────────────────────────────────

export interface SignalNarration {
  /** One-line headline, e.g. "High-Conviction Bullish Setup" */
  headline: string;
  /** Ordered list of supporting reasons with emoji bullets */
  reasons: string[];
  /** 0–100 conviction score (higher = more indicators agree) */
  conviction: number;
  /** Visual conviction label */
  convictionLabel: 'Weak' | 'Moderate' | 'Strong' | 'Very Strong' | 'Maximum';
  /** Summary emoji for quick scanning */
  emoji: string;
  /** Compact one-liner for sharing */
  shareLine: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function rsiZone(rsi: number | null): string | null {
  if (rsi === null) return null;
  if (rsi <= 20) return 'deeply oversold';
  if (rsi <= 30) return 'oversold';
  if (rsi <= 40) return 'approaching oversold';
  if (rsi >= 80) return 'deeply overbought';
  if (rsi >= 70) return 'overbought';
  if (rsi >= 60) return 'approaching overbought';
  return null; // Neutral — not interesting enough to narrate
}

function formatNum(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(decimals);
}

// ── Core Narration Engine ────────────────────────────────────────

export function generateSignalNarration(entry: ScreenerEntry): SignalNarration {
  const reasons: string[] = [];
  let bullishPoints = 0;
  let bearishPoints = 0;
  let totalPoints = 0;

  // ── 1. RSI Analysis (Multi-timeframe) ──
  const rsiValues = [
    { label: '1m', val: entry.rsi1m },
    { label: '15m', val: entry.rsi15m },
    { label: '1h', val: entry.rsi1h },
  ].filter(r => r.val !== null);

  const oversoldCount = rsiValues.filter(r => r.val !== null && r.val <= 30).length;
  const overboughtCount = rsiValues.filter(r => r.val !== null && r.val >= 70).length;

  if (oversoldCount >= 2) {
    reasons.push(`📉 RSI oversold across ${oversoldCount} timeframes (${rsiValues.filter(r => r.val !== null && r.val <= 30).map(r => `${r.label}: ${formatNum(r.val)}`).join(', ')})`);
    bullishPoints += oversoldCount * 12;
    totalPoints += oversoldCount * 12;
  } else if (overboughtCount >= 2) {
    reasons.push(`📈 RSI overbought across ${overboughtCount} timeframes (${rsiValues.filter(r => r.val !== null && r.val >= 70).map(r => `${r.label}: ${formatNum(r.val)}`).join(', ')})`);
    bearishPoints += overboughtCount * 12;
    totalPoints += overboughtCount * 12;
  } else if (entry.rsiCustom !== null) {
    const zone = rsiZone(entry.rsiCustom);
    if (zone) {
      const isBullish = entry.rsiCustom <= 40;
      reasons.push(`${isBullish ? '📉' : '📈'} RSI(14) is ${zone} at ${formatNum(entry.rsiCustom)}`);
      if (isBullish) bullishPoints += 10; else bearishPoints += 10;
      totalPoints += 10;
    }
  }

  // ── 2. EMA Cross ──
  if (entry.emaCross === 'bullish') {
    reasons.push('🔀 EMA 9/21 bullish crossover — short-term momentum shifting up');
    bullishPoints += 15;
    totalPoints += 15;
  } else if (entry.emaCross === 'bearish') {
    reasons.push('🔀 EMA 9/21 bearish crossover — short-term momentum fading');
    bearishPoints += 15;
    totalPoints += 15;
  }

  // ── 3. MACD ──
  if (entry.macdHistogram !== null && entry.macdHistogram !== 0) {
    const macdStrength = Math.abs(entry.macdHistogram);
    if (entry.macdHistogram > 0) {
      reasons.push(`📊 MACD histogram positive (${formatNum(entry.macdHistogram, 4)}) — bullish momentum${macdStrength > 0.1 ? ' accelerating' : ''}`);
      bullishPoints += 10;
    } else {
      reasons.push(`📊 MACD histogram negative (${formatNum(entry.macdHistogram, 4)}) — bearish momentum${macdStrength > 0.1 ? ' accelerating' : ''}`);
      bearishPoints += 10;
    }
    totalPoints += 10;
  }

  // ── 4. Bollinger Bands Position ──
  if (entry.bbPosition !== null) {
    if (entry.bbPosition <= 0.1) {
      reasons.push('📏 Price at lower Bollinger Band — potential bounce zone');
      bullishPoints += 8;
      totalPoints += 8;
    } else if (entry.bbPosition >= 0.9) {
      reasons.push('📏 Price at upper Bollinger Band — potential resistance');
      bearishPoints += 8;
      totalPoints += 8;
    }
  }

  // ── 5. Stochastic RSI ──
  if (entry.stochK !== null && entry.stochD !== null) {
    if (entry.stochK <= 20 && entry.stochD <= 20) {
      reasons.push(`⚡ Stochastic RSI deeply oversold (K: ${formatNum(entry.stochK)}, D: ${formatNum(entry.stochD)})`);
      bullishPoints += 8;
      totalPoints += 8;
    } else if (entry.stochK >= 80 && entry.stochD >= 80) {
      reasons.push(`⚡ Stochastic RSI deeply overbought (K: ${formatNum(entry.stochK)}, D: ${formatNum(entry.stochD)})`);
      bearishPoints += 8;
      totalPoints += 8;
    }
  }

  // ── 6. RSI Divergence ──
  if (entry.rsiDivergence === 'bullish') {
    reasons.push('🔄 Bullish RSI divergence detected — price making lower lows but RSI making higher lows');
    bullishPoints += 18;
    totalPoints += 18;
  } else if (entry.rsiDivergence === 'bearish') {
    reasons.push('🔄 Bearish RSI divergence detected — price making higher highs but RSI making lower highs');
    bearishPoints += 18;
    totalPoints += 18;
  }

  // ── 7. Volume Spike ──
  if (entry.volumeSpike) {
    reasons.push('🔊 Abnormal volume spike detected — institutional activity likely');
    totalPoints += 12;
    // Volume spike direction depends on price action
    if (entry.candleDirection === 'bullish') bullishPoints += 12;
    else if (entry.candleDirection === 'bearish') bearishPoints += 12;
  }

  // ── 8. VWAP Deviation ──
  if (entry.vwapDiff !== null && Math.abs(entry.vwapDiff) > 1) {
    if (entry.vwapDiff < -1) {
      reasons.push(`💰 Trading ${formatNum(Math.abs(entry.vwapDiff))}% below VWAP — potential value zone`);
      bullishPoints += 6;
    } else {
      reasons.push(`💰 Trading ${formatNum(entry.vwapDiff)}% above VWAP — extended from fair value`);
      bearishPoints += 6;
    }
    totalPoints += 6;
  }

  // ── Compose Headline & Conviction ──
  const netBias = bullishPoints - bearishPoints;
  const maxPossible = Math.max(totalPoints, 1);
  const conviction = Math.min(100, Math.round((Math.abs(netBias) / maxPossible) * 100 + (totalPoints > 30 ? 20 : 0)));

  let convictionLabel: SignalNarration['convictionLabel'];
  if (conviction >= 85) convictionLabel = 'Maximum';
  else if (conviction >= 65) convictionLabel = 'Very Strong';
  else if (conviction >= 45) convictionLabel = 'Strong';
  else if (conviction >= 25) convictionLabel = 'Moderate';
  else convictionLabel = 'Weak';

  let headline: string;
  let emoji: string;

  if (netBias > 20) {
    headline = conviction >= 65 ? 'High-Conviction Bullish Setup' : 'Bullish Setup Forming';
    emoji = conviction >= 65 ? '🟢🔥' : '🟢';
  } else if (netBias < -20) {
    headline = conviction >= 65 ? 'High-Conviction Bearish Setup' : 'Bearish Pressure Building';
    emoji = conviction >= 65 ? '🔴🔥' : '🔴';
  } else if (totalPoints > 20) {
    headline = 'Mixed Signals — Consolidation Phase';
    emoji = '🟡';
  } else {
    headline = 'Neutral — Awaiting Catalyst';
    emoji = '⚪';
  }

  // If no reasons were generated, provide a neutral baseline
  if (reasons.length === 0) {
    reasons.push('📊 All indicators within normal ranges — no actionable signals');
  }

  // ── Compose Share Line ──
  const topReason = reasons[0]?.replace(/^[^\s]+\s/, '') || 'Neutral';
  const shareLine = `${emoji} ${headline} | ${topReason} | Conviction: ${conviction}% (${convictionLabel})`;

  return {
    headline,
    reasons,
    conviction,
    convictionLabel,
    emoji,
    shareLine,
  };
}
