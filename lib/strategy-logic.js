/**
 * Institutional Liquidity & Market Structure Logic
 * Optimized for RSIQ Pro - 2026 Cycle
 * 
 * This file is the SINGLE SOURCE OF TRUTH for core strategy logic.
 * It is designed to be usable in both Node.js (main thread) and Browser (Workers).
 */

// ── Liquidity & Structure ───────────────────────────────────────

/**
 * Detects liquidity pools (Equal Highs/Lows) and Sweeps.
 */
export function detectLiquiditySweeps(highs, lows, closes, lookback = 60) {
  if (highs.length < lookback) return { bsl: null, ssl: null, sweep: 'none' };
  const windowHighs = highs.slice(-lookback);
  const windowLows = lows.slice(-lookback);
  const currentPrice = closes[closes.length - 1];
  const bsl = Math.max(...windowHighs);
  const ssl = Math.min(...windowLows);
  let sweep = 'none';
  const recentLow = Math.min(...lows.slice(-2));
  if (recentLow < ssl && currentPrice > ssl) sweep = 'bullish';
  const recentHigh = Math.max(...highs.slice(-2));
  if (recentHigh > bsl && currentPrice < bsl) sweep = 'bearish';
  return { bsl, ssl, sweep };
}

// ── Signal Helpers ──────────────────────────────────────────────

/**
 * Applies diminishing returns to correlated indicator scores.
 */
export function applyDiminishingReturns(scores) {
  if (!scores || scores.length === 0) return 0;
  const sorted = [...scores].filter(s => s !== 0).sort((a, b) => Math.abs(b) - Math.abs(a));
  if (sorted.length === 0) return 0;
  let total = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    total += sorted[i] * Math.pow(0.5, i);
  }
  return total;
}

/**
 * Groups indicators by correlation type.
 */
export function groupCorrelatedIndicators(params) {
  return [
    {
      name: 'oscillators',
      scores: [params.rsi || 0, params.stoch || 0, params.williamsR || 0, params.cci || 0, params.bb || 0].filter(s => s !== 0)
    },
    {
      name: 'trend',
      scores: [params.macd || 0, params.ema || 0].filter(s => s !== 0)
    },
    {
      name: 'volume',
      scores: [params.obv || 0, params.vwap || 0, params.volumeSpikeScore || 0].filter(s => s !== 0)
    }
  ];
}

/**
 * Smart Suppression Logic
 */
export function shouldSuppressSignal(params) {
  const { normalized, rsi1m, rsi5m, rsi15m, rsi1h, volumeSpike } = params;
  const rsiHighCount = [rsi1m, rsi5m, rsi15m].filter(r => r != null && r > 75).length;
  const rsiLowCount = [rsi1m, rsi5m, rsi15m].filter(r => r != null && r < 25).length;

  if (normalized > 25 && rsiHighCount >= 2) {
    if (volumeSpike) return { suppress: false, multiplier: 1.0, reason: '✓ Overbought confirmed by volume' };
    if (rsi1h !== null && rsi1h > 65) return { suppress: true, multiplier: 0.70, reason: '⚠ Buy dampened: 1h resistance' };
    if (rsi1h !== null && rsi1h < 55) return { suppress: false, multiplier: 1.0, reason: '✓ Overbought with 1h trend' };
  }
  if (normalized < -25 && rsiLowCount >= 2) {
    if (volumeSpike) return { suppress: false, multiplier: 1.0, reason: '✓ Oversold confirmed by volume' };
    if (rsi1h !== null && rsi1h < 35) return { suppress: true, multiplier: 0.70, reason: '⚠ Sell dampened: 1h support' };
    if (rsi1h !== null && rsi1h > 45) return { suppress: false, multiplier: 1.0, reason: '✓ Oversold with 1h trend' };
  }
  return { suppress: false, multiplier: 1.0, reason: '' };
}

// ── Main Engine ─────────────────────────────────────────────────

/**
 * Unified Institutional Scoring Engine
 */
export function calculateInstitutionalScore(params, config) {
  let score = 0;
  const reasons = [];
  const checklist = {
    liquiditySweep: false,
    bosConfirmed: false,
    volumeExpansion: false,
    zoneAlignment: false,
    momentumFlow: false
  };

  const {
    macdHistogram, bbPosition, emaCross, vwapDiff, volumeSpike, momentum,
    regime, obvTrend, smartMoneyScore, structure
  } = params;

  // STEP 1: Market State Classification
  const state = regime === 'trending' ? 'TRENDING' : regime === 'ranging' ? 'RANGING' : 'TRANSITION';
  if (state === 'RANGING') { score -= 2; reasons.push('Ranging market (-2)'); }

  // STEP 2: Zone Detection
  const zoneAligned = (bbPosition && (bbPosition <= 0.1 || bbPosition >= 0.9)) || (vwapDiff && Math.abs(vwapDiff) > 1);
  if (zoneAligned) { score += 1; checklist.zoneAlignment = true; reasons.push('Zone Alignment (+1)'); }

  // STEP 3: Liquidity Analysis (MANDATORY)
  const sweep = structure?.sweep || 'none';
  if (sweep !== 'none') {
    score += 2;
    checklist.liquiditySweep = true;
    reasons.push(`Liquidity Sweep: ${sweep} (+2)`);
  }

  // STEP 4: Momentum & Flow Validation
  if (volumeSpike) {
    score += 2;
    checklist.volumeExpansion = true;
    reasons.push('Volume Expansion (+2)');
  } else {
    score -= 2; // No volume
  }

  const isMomentumWeak = Math.abs(momentum || 0) < 0.5 || obvTrend === 'none' || obvTrend === 'flat';
  if (isMomentumWeak) {
    score -= 2;
    reasons.push('Weak Momentum (-2)');
  } else {
    checklist.momentumFlow = true;
  }

  // STEP 5: Confirmation (Critical)
  const bosConfirmed = structure?.bos || (emaCross !== 'none' && volumeSpike && !isMomentumWeak);
  if (bosConfirmed) {
    score += 2;
    checklist.bosConfirmed = true;
    reasons.push('BOS Confirmation (+2)');
  }

  // STEP 6: Indicator Context (Secondary)
  let indScore = 0;
  if (macdHistogram && Math.abs(macdHistogram) > 0) indScore++;
  if (vwapDiff && Math.abs(vwapDiff) > 0) indScore++;
  if (smartMoneyScore && Math.abs(smartMoneyScore) > 30) indScore++;
  if (indScore >= 2) {
    score += 1;
    reasons.push('Indicator Support (+1)');
  }

  // Strict Institutional Filters
  if (!checklist.liquiditySweep) score -= 10;
  if (isMomentumWeak) score -= 10;
  if (!checklist.volumeExpansion) score -= 10;
  if (state === 'RANGING') score -= 10;

  // STEP 8: Decision Logic
  let decision = 'NO TRADE';
  if (score >= 6 && checklist.liquiditySweep && checklist.volumeExpansion && checklist.momentumFlow) {
    decision = 'VALID TRADE';
  } else if (score >= 3) {
    decision = 'LOW CONFIDENCE SETUP';
    if (!checklist.bosConfirmed) reasons.push('WAIT - No confirmation');
  } else {
    if (!checklist.liquiditySweep) reasons.push('WAIT - Awaiting sweep');
  }

  // Output Mapping
  const signal = decision === 'VALID TRADE' ? (sweep === 'bullish' ? 'buy' : 'sell') : 'neutral';
  const conviction = decision === 'VALID TRADE' ? 'HIGH' : decision === 'LOW CONFIDENCE SETUP' ? 'MEDIUM' : 'NONE';
  
  return {
    score: Math.max(0, score),
    signal,
    conviction,
    reasons,
    institutionalDecision: {
      state,
      decision,
      score: Math.max(0, score),
      message: reasons[0] || 'Awaiting Confluence',
      checklist
    }
  };
}
