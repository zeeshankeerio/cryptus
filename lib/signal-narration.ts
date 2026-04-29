/**
 * Mindscape Analytics - Signal Narration Engine™
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
 * market narrative - similar to what a senior analyst would write in a morning brief.
 */

import type { ScreenerEntry, TradingStyle } from './types';
import { RSI_ZONES, TF_WEIGHTS } from './defaults';

// ── Output Types ─────────────────────────────────────────────────

export interface SignalNarration {
  /** One-line headline, e.g. "High-Conviction Bullish Setup" */
  headline: string;
  /** Ordered list of supporting reasons with emoji bullets */
  reasons: string[];
  /** 0-100 conviction score (higher = more indicators agree) */
  conviction: number;
  /** Visual conviction label */
  convictionLabel: 'Weak' | 'Moderate' | 'Strong' | 'Very Strong' | 'Maximum';
  /** Summary emoji for quick scanning */
  emoji: string;
  /** Compact one-liner for sharing */
  shareLine: string;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Get a human-readable zone description for an RSI value,
 * calibrated to the asset class's volatility profile.
 *
 * Crypto: wide zones (20/30/70/80) - extreme oscillations are normal
 * Metals/Forex: tighter zones (22-25/32-35/65-68/75-78) - commodity mean-reversion
 * 
 * 2026 FIX: Use proportional offsets for "approaching" thresholds
 */
function rsiZone(rsi: number | null, market: ScreenerEntry['market'] = 'Crypto'): string | null {
  if (rsi === null) return null;
  const zones = RSI_ZONES[market] ?? RSI_ZONES.Crypto;
  
  // Calculate proportional offset (15% of zone width)
  const zoneWidth = zones.ob - zones.os;
  const approachingOffset = Math.round(zoneWidth * 0.15);
  
  if (rsi <= zones.deepOS) return 'deeply oversold';
  if (rsi <= zones.os)     return 'oversold';
  if (rsi <= zones.os + approachingOffset) return 'approaching oversold';
  if (rsi >= zones.deepOB) return 'deeply overbought';
  if (rsi >= zones.ob)     return 'overbought';
  if (rsi >= zones.ob - approachingOffset) return 'approaching overbought';
  return null; // Neutral - not interesting enough to narrate
}

function formatNum(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return '-';
  return n.toFixed(decimals);
}

// ── Core Narration Engine ────────────────────────────────────────

export function generateSignalNarration(entry: ScreenerEntry, tradingStyle: TradingStyle = 'intraday'): SignalNarration {
  const reasons: string[] = [];
  let bullishPoints = 0;
  let bearishPoints = 0;
  let totalPoints = 0;

  // Analytical Pillars (Categories) for Institutional Confluence
  const pillars = {
    momentum: false,
    trend: false,
    structure: false,
    liquidity: false,
    volatility: false
  };

  const market = entry.market ?? 'Crypto';
  const zones = RSI_ZONES[market] ?? RSI_ZONES.Crypto;

  const rsiValues = [
    { label: '1m',  val: entry.rsi1m },
    { label: '5m',  val: entry.rsi5m },
    { label: '15m', val: entry.rsi15m },
    { label: '1h',  val: entry.rsi1h },
    { label: '4h',  val: entry.rsi4h },
    { label: '1d',  val: entry.rsi1d },
  ].filter(r => r.val !== null);

  const tw = TF_WEIGHTS[tradingStyle] || TF_WEIGHTS.intraday;

  // ── 2026 FIX: 24H Price Action Context (HIGHEST PRIORITY) ──
  // This should be analyzed FIRST before other indicators
  // A +42% move is MORE IMPORTANT than any RSI reading
  if (entry.change24h !== null && entry.change24h !== undefined) {
    const priceChange = entry.change24h;
    const absPriceChange = Math.abs(priceChange);
    
    if (absPriceChange > 50) {
      // EXTREME move (>50%)
      const emoji = priceChange > 0 ? '🚀' : '💥';
      const direction = priceChange > 0 ? 'rallied' : 'crashed';
      reasons.push(`${emoji} PARABOLIC MOVE: Price ${direction} ${absPriceChange.toFixed(1)}% in 24h. Extreme exhaustion risk, high reversal probability`);
      totalPoints += 25;
      // Extreme rally = bearish reversal signal (overbought exhaustion)
      // Extreme crash = bullish reversal signal (oversold bounce)
      if (priceChange > 0) bearishPoints += 25;
      else bullishPoints += 25;
      pillars.momentum = true;
    } else if (absPriceChange > 30) {
      // VERY STRONG move (30-50%)
      const emoji = priceChange > 0 ? '🚀' : '📉';
      const direction = priceChange > 0 ? 'surged' : 'plunged';
      reasons.push(`${emoji} EXTREME MOMENTUM: Price ${direction} ${absPriceChange.toFixed(1)}% in 24h. Monitor for exhaustion signals`);
      totalPoints += 20;
      if (priceChange > 0) bearishPoints += 20;
      else bullishPoints += 20;
      pillars.momentum = true;
    } else if (absPriceChange > 15) {
      // STRONG move (15-30%)
      const emoji = priceChange > 0 ? '📈' : '📉';
      const direction = priceChange > 0 ? 'rallied' : 'declined';
      reasons.push(`${emoji} Strong 24h momentum: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%. ${priceChange > 0 ? 'Overbought' : 'Oversold'} risk building`);
      totalPoints += 12;
      if (priceChange > 0) bearishPoints += 12;
      else bullishPoints += 12;
      pillars.momentum = true;
    } else if (absPriceChange > 5) {
      // MODERATE move (5-15%)
      reasons.push(`📊 24h change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%. Moderate momentum`);
      totalPoints += 5;
      if (priceChange > 0) bearishPoints += 5;
      else bullishPoints += 5;
    }
  }

  // Use style-based weighting for all timeframes
  rsiValues.forEach(r => {
    const v = r.val;
    if (v === null || v === undefined) return;

    const weight = (tw as any)[`rsi${r.label}`] || 0;
    if (weight === 0) return;

    const zone = rsiZone(v, market);
    if (zone) {
      const isDeep = v <= zones.deepOS || v >= zones.deepOB;
      const isBullish = v <= zones.os + 10;
      const pts = (isDeep ? 15 : 10) * weight;
      
      if (isBullish) bullishPoints += pts; else bearishPoints += pts;
      totalPoints += pts;
      pillars.momentum = true;
      
      // Always narrate non-neutral RSI zones (including "approaching" zones).
      // The narration is a diagnostics surface as much as an explanation layer.
      reasons.push(`${isBullish ? '📉' : '📈'} RSI(${r.label}) is ${zone} at ${formatNum(v)}`);
    }
  });


  // ── 2. EMA Cross ──
  if (entry.emaCross === 'bullish') {
    reasons.push('🔀 EMA 9/21 bullish crossover - short-term momentum shifting up');
    bullishPoints += 15;
    totalPoints += 15;
    pillars.trend = true;
  } else if (entry.emaCross === 'bearish') {
    reasons.push('🔀 EMA 9/21 bearish crossover - short-term momentum fading');
    bearishPoints += 15;
    totalPoints += 15;
    pillars.trend = true;
  }

  // ── 3. MACD ──
  if (entry.macdHistogram !== null && entry.macdHistogram !== 0) {
    const macdStrength = Math.abs(entry.macdHistogram);
    if (entry.macdHistogram > 0) {
      reasons.push(`📊 MACD histogram positive (${formatNum(entry.macdHistogram, 4)}) - bullish momentum${macdStrength > 0.1 ? ' accelerating' : ''}`);
      bullishPoints += 10;
    } else {
      reasons.push(`📊 MACD histogram negative (${formatNum(entry.macdHistogram, 4)}) - bearish momentum${macdStrength > 0.1 ? ' accelerating' : ''}`);
      bearishPoints += 10;
    }
    totalPoints += 10;
    pillars.trend = true;
  }

  // ── 4. Bollinger Bands Position ──
  if (entry.bbPosition !== null) {
    if (entry.bbPosition <= 0.1) {
      reasons.push('📏 Price at lower Bollinger Band - potential bounce zone');
      bullishPoints += 8;
      totalPoints += 8;
    } else if (entry.bbPosition >= 0.9) {
      reasons.push('📏 Price at upper Bollinger Band - potential resistance');
      bearishPoints += 8;
      totalPoints += 8;
    }
    pillars.structure = true;
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
    pillars.momentum = true;
  }

  // ── 6. RSI Divergence (Relevance-Gated) ──
  // We use the live RSI (15m or 1m fallback) to check if the divergence is still relevant.
  // 2026 FIX: Remove fallback to 50 - require actual RSI data for validation
  // Use rsiDivergenceCustom if available (matches the user's custom RSI period)
  const activeDivergence = entry.rsiDivergenceCustom && entry.rsiDivergenceCustom !== 'none'
    ? entry.rsiDivergenceCustom
    : entry.rsiDivergence;
  const currentRsi = entry.rsi15m ?? entry.rsi1m;
  if (activeDivergence === 'bullish') {
    if (currentRsi !== null && currentRsi !== undefined) {
      if (currentRsi < 65) {
        reasons.push('🔄 Bullish RSI divergence detected - price making lower lows but RSI making higher lows');
        bullishPoints += 18;
        totalPoints += 18;
        pillars.momentum = true;
      } else {
        reasons.push('⌛ Bullish divergence detected but likely played out (RSI already overextended)');
      }
    } else {
      reasons.push('⚠️ Bullish divergence detected but RSI data unavailable for validation');
    }
  } else if (activeDivergence === 'bearish') {
    if (currentRsi !== null && currentRsi !== undefined) {
      if (currentRsi > 35) {
        reasons.push('🔄 Bearish RSI divergence detected - price making higher highs but RSI making lower highs');
        bearishPoints += 18;
        totalPoints += 18;
        pillars.momentum = true;
      } else {
        reasons.push('⌛ Bearish divergence detected but likely played out (RSI already oversold)');
      }
    } else {
      reasons.push('⚠️ Bearish divergence detected but RSI data unavailable for validation');
    }
  }

  // ── 7. Volume Spike ──
  if (entry.volumeSpike) {
    reasons.push('🔊 Abnormal volume spike detected - institutional activity likely');
    totalPoints += 12;
    // Volume spike direction depends on price action
    if (entry.candleDirection === 'bullish') bullishPoints += 12;
    else if (entry.candleDirection === 'bearish') bearishPoints += 12;
    pillars.liquidity = true;
  }

  // ── 8. VWAP Deviation ──
  if (entry.vwapDiff !== null && Math.abs(entry.vwapDiff) > 1) {
    if (entry.vwapDiff < -1) {
      reasons.push(`💰 Trading ${formatNum(Math.abs(entry.vwapDiff))}% below VWAP - potential value zone`);
      bullishPoints += 6;
    } else {
      reasons.push(`💰 Trading ${formatNum(entry.vwapDiff)}% above VWAP - extended from fair value`);
      bearishPoints += 5;
    }
    totalPoints += 5;
    pillars.structure = true;
  }

  // ── 9. ADX Trend Strength ──
  // 2026 FIX: Correct double-counting bug - only add points once, to the appropriate direction
  if (entry.adx !== null && entry.adx > 0) {
    if (entry.adx > 30) {
      reasons.push(`📐 ADX at ${formatNum(entry.adx)}. Strong trend confirmed, trend-following signals amplified`);
      // ADX confirms direction of the dominant bias - amplifies, doesn't create
      if (bullishPoints > bearishPoints) {
        bullishPoints += 5;
        totalPoints += 5;
      } else if (bearishPoints > bullishPoints) {
        bearishPoints += 5;
        totalPoints += 5;
      }
      // If neutral (bullishPoints === bearishPoints), ADX doesn't add points
      pillars.trend = true;
    } else if (entry.adx < 18) {
      reasons.push(`📐 ADX at ${formatNum(entry.adx)}. Choppy/ranging market, oscillator signals more reliable`);
      totalPoints += 3;
      pillars.trend = true;
    }
  }

  // ── 10. Confluence Score ──
  if (entry.confluence !== undefined && Math.abs(entry.confluence) >= 30) {
    if (entry.confluence >= 50) {
      reasons.push(`🎯 Strong multi-indicator confluence (${entry.confluence}) - high conviction`);
      bullishPoints += 12;
    } else if (entry.confluence >= 30) {
      reasons.push(`🎯 Moderate bullish confluence (${entry.confluence})`);
      bullishPoints += 6;
    } else if (entry.confluence <= -50) {
      reasons.push(`🎯 Strong bearish confluence (${entry.confluence}) - high conviction`);
      bearishPoints += 12;
    } else if (entry.confluence <= -30) {
      reasons.push(`🎯 Moderate bearish confluence (${entry.confluence})`);
      bearishPoints += 6;
    }
    totalPoints += 12;
    pillars.trend = true; // Confluence maps well to trend/momentum mix
  }

  // ── 10.5 RSI Crossover (Reversal Events) ──
  // Captures the precise moment price crosses back above oversold or below overbought.
  // This is a high-conviction event that the scoring engine weights at 1.5.
  if (entry.rsiCrossover && entry.rsiCrossover !== 'none') {
    if (entry.rsiCrossover === 'bullish_reversal') {
      reasons.push('↥ RSI Bullish Reversal: RSI crossed back above oversold zone, confirming momentum shift to upside');
      bullishPoints += 14;
      totalPoints += 14;
      pillars.momentum = true;
    } else if (entry.rsiCrossover === 'bearish_reversal') {
      reasons.push('↧ RSI Bearish Reversal: RSI crossed back below overbought zone, confirming momentum shift to downside');
      bearishPoints += 14;
      totalPoints += 14;
      pillars.momentum = true;
    }
  }

  // ── 11. OBV Volume Trend ──
  if (entry.obvTrend && entry.obvTrend !== 'none') {
    if (entry.obvTrend === 'bullish') {
      reasons.push('📈 OBV volume trend bullish - smart money accumulation detected');
      bullishPoints += 8;
    } else {
      reasons.push('📉 OBV volume trend bearish - institutional distribution in progress');
      bearishPoints += 8;
    }
    totalPoints += 8;
    pillars.liquidity = true;
  }

  // ── 11.5 Smart Money Score (Institutional Flow) ──
  // Derivatives data: funding rate, liquidations, whale trades, order flow.
  // Only narrated when signal is strong enough to be actionable (|score| >= 30).
  const sms = entry.smartMoneyScore ?? null;
  if (sms != null && Math.abs(sms) >= 30) {
    const smsBullish = sms > 0;
    if (smsBullish) {
      reasons.push(`🐳 Smart Money Flow: +${sms}. Derivatives data (funding, order flow, whale activity) confirms bullish institutional positioning`);
      bullishPoints += 8;
    } else {
      reasons.push(`🐳 Smart Money Flow: ${sms}. Derivatives data signals net institutional selling pressure (negative funding / liquidation clusters)`);
      bearishPoints += 8;
    }
    totalPoints += 8;
    pillars.liquidity = true;
  }

  // ── 12. Williams %R ──
  if (entry.williamsR !== null && entry.williamsR !== undefined) {
    const wr = entry.williamsR;
    if (wr <= -85) {
      reasons.push(`📊 Williams %R at ${formatNum(wr)} - deeply oversold, reversal probability elevated`);
      bullishPoints += 7;
      totalPoints += 7;
    } else if (wr >= -15) {
      reasons.push(`📊 Williams %R at ${formatNum(wr)} - deeply overbought, pullback risk elevated`);
      bearishPoints += 7;
      totalPoints += 7;
    } else if (wr <= -70) {
      reasons.push(`📊 Williams %R at ${formatNum(wr)} - approaching oversold territory`);
      bullishPoints += 3;
      totalPoints += 3;
    } else if (wr >= -30) {
      reasons.push(`📊 Williams %R at ${formatNum(wr)} - approaching overbought territory`);
      bearishPoints += 3;
      totalPoints += 3;
    }
    pillars.momentum = true;
  }

  // ── 12b. CCI (Commodity Channel Index) ──
  if (entry.cci !== null && entry.cci !== undefined) {
    const cci = entry.cci;
    const isCommodity = market === 'Metal' || market === 'Forex';
    const ptsExtreme = isCommodity ? 14 : 8;
    const ptsNormal = isCommodity ? 7 : 4;

    if (cci >= 200) {
      if (isCommodity) {
        reasons.push(`📡 CCI at ${formatNum(cci)}. Extreme overbought (commodity momentum peak). High reversal probability.`);
      } else {
        reasons.push(`📉 CCI at ${formatNum(cci)} - extreme overbought condition (Trend Exhaustion)`);
      }
      bearishPoints += ptsExtreme;
      totalPoints += ptsExtreme;
    } else if (cci >= 100) {
      if (isCommodity) {
        reasons.push(`📡 CCI at ${formatNum(cci)}. Overbought zone. Trend likely intact but momentum may plateau.`);
      } else {
        reasons.push(`📉 CCI at ${formatNum(cci)} - entering overbought zone`);
      }
      bearishPoints += ptsNormal;
      totalPoints += ptsNormal;
    } else if (cci <= -200) {
      if (isCommodity) {
        reasons.push(`📡 CCI at ${formatNum(cci)}. Extreme oversold (commodity demand spike zone). High mean-reversion probability.`);
      } else {
        reasons.push(`📈 CCI at ${formatNum(cci)} - extreme oversold condition (Trend Bottoming)`);
      }
      bullishPoints += ptsExtreme;
      totalPoints += ptsExtreme;
    } else if (cci <= -100) {
      if (isCommodity) {
        reasons.push(`📡 CCI at ${formatNum(cci)}. Oversold territory. Bullish entry zone.`);
      } else {
        reasons.push(`📈 CCI at ${formatNum(cci)} - entering oversold zone`);
      }
      bullishPoints += ptsNormal;
      totalPoints += ptsNormal;
    } else if (isCommodity && Math.abs(cci) > 80) {
      const dir = cci > 0 ? 'approaching overbought' : 'approaching oversold';
      reasons.push(`📡 CCI at ${formatNum(cci)}. ${dir} boundary.`);
    }
    pillars.momentum = true;
  }

  // ── 13. Hidden Divergence (Continuation Patterns) ──
  if (entry.hiddenDivergence && entry.hiddenDivergence !== 'none') {
    if (entry.hiddenDivergence === 'hidden-bullish') {
      reasons.push('🔄 Hidden bullish divergence - price higher low + RSI lower low = hidden trend strength');
      bullishPoints += 14;
    } else {
      reasons.push('🔄 Hidden bearish divergence - price lower high + RSI higher high = hidden trend weakness');
      bearishPoints += 14;
    }
    totalPoints += 14;
    pillars.momentum = true;
  }

  // ── 14. Market Regime Context ──
  if (entry.regime && entry.regime.confidence >= 40) {
    const r = entry.regime;
    switch (r.regime) {
      case 'trending':
        reasons.push(`🌊 Market Regime: Trending (${r.confidence}% confidence) - trend-following indicators favored`);
        totalPoints += 5;
        if (bullishPoints > bearishPoints) bullishPoints += 5;
        else if (bearishPoints > bullishPoints) bearishPoints += 5;
        break;
      case 'ranging':
        reasons.push(`📦 Market Regime: Ranging (${r.confidence}% confidence) - oscillator signals more reliable`);
        totalPoints += 3;
        break;
      case 'volatile':
        reasons.push(`⚡ Market Regime: Volatile (${r.confidence}% confidence) - exercise caution, widen stops`);
        totalPoints += 3;
        break;
      case 'breakout':
        reasons.push(`🚀 Market Regime: Breakout detected (${r.confidence}% confidence) - momentum signals amplified`);
        totalPoints += 8;
        if (bullishPoints > bearishPoints) bullishPoints += 8;
        else if (bearishPoints > bullishPoints) bearishPoints += 8;
        break;
    }
  }

  // ── 15. ATR-Based Risk Parameters ──
  if (entry.riskParams) {
    const rp = entry.riskParams;
    const direction = entry.strategySignal?.includes('buy') ? 'Buy' : 'Sell';
    reasons.push(
      `🎯 Risk Parameters (${direction}): SL $${formatPrice(rp.stopLoss)} | TP1 $${formatPrice(rp.takeProfit1)} (${rp.riskRewardRatio}:1) | TP2 $${formatPrice(rp.takeProfit2)} (2:1) | ATR: ${formatNum(rp.atrUsed, 4)}`
    );
    // Risk params don't add directional points - they're informational
  }

  // ── 16. Fibonacci Proximity (Institutional Demand/Supply) ──
  if (entry.fibLevels && entry.price) {
    const fib = entry.fibLevels;
    const price = entry.price;
    const range = fib.swingHigh - fib.swingLow;
    if (range > 0) {
      const tolerance = range * 0.005;
      const near618 = Math.abs(price - fib.level618) < tolerance;
      const near500 = Math.abs(price - fib.level500) < tolerance;

      if (near618 || near500) {
        const isBullishTrend = entry.strategySignal?.includes('buy');
        const level = near618 ? fib.level618 : fib.level500;
        const price = entry.price;
        
        // Institutional Directional Accuracy: A level is only "Demand" if price is ABOVE it.
        // If price is below, it acts as resistance (Supply/Target).
        const zoneType = price >= level ? 'Demand Zone' : 'Supply Zone';
        
        reasons.push(`🏛️ Price testing Institutional ${zoneType} (${near618 ? '61.8% Golden Ratio' : '50% Level'}) - strong reversal potential`);
        totalPoints += 15;
        if (zoneType === 'Demand Zone') bullishPoints += 15; else bearishPoints += 15;
      } else {
        // Standard fib proximity check
        const nearLevels: string[] = [];
        if (Math.abs(price - fib.level382) < tolerance) nearLevels.push('38.2%');
        if (Math.abs(price - fib.level786) < tolerance) nearLevels.push('78.6%');
        if (nearLevels.length > 0) {
          const isBelowMid = price < (fib.swingHigh + fib.swingLow) / 2;
          reasons.push(`📐 Price near Fibonacci ${nearLevels.join(', ')} ${isBelowMid ? 'support' : 'resistance'} level(s)`);
          totalPoints += 8;
          if (isBelowMid) bullishPoints += 8; else bearishPoints += 8;
        }
      }
      pillars.structure = true;
    }
  }

  // ── 17. Fair Value Gap (FVG) & Order Blocks (SMC) ──
  if (entry.smc) {
    if (entry.smc.fvg) {
      const isBullishFvg = entry.smc.fvg.type === 'bullish';
      const isBullishSignal = entry.strategySignal?.includes('buy');
      
      // Clarify FVG role: If a bearish FVG exists in a bullish signal, it's a target/resistance.
      const fvgRole = (isBullishFvg && isBullishSignal) ? 'Support' 
                    : (!isBullishFvg && !isBullishSignal) ? 'Resistance'
                    : (!isBullishFvg && isBullishSignal) ? 'Target Resistance'
                    : 'Target Support';

      reasons.push(`⚡ ${isBullishFvg ? 'Bullish' : 'Bearish'} Fair Value Gap (FVG) detected ($${formatPrice(entry.smc.fvg.bottom)} - $${formatPrice(entry.smc.fvg.top)}). ${fvgRole} - rapid institutional execution in progress`);
      totalPoints += 15;
      if (isBullishFvg) bullishPoints += 15; else bearishPoints += 15;
      pillars.liquidity = true;
    }

    if (entry.smc.orderBlock) {
      const isBullishOb = entry.smc.orderBlock.type === 'bullish';
      reasons.push(`🧱 Institutional ${isBullishOb ? 'Demand Order Block' : 'Supply Order Block'} detected at $${formatPrice(entry.smc.orderBlock.bottom)} - $${formatPrice(entry.smc.orderBlock.top)}.`);
      totalPoints += 18;
      if (isBullishOb) bullishPoints += 18; else bearishPoints += 18;
      pillars.structure = true;
    }
  } else if (entry.regime?.regime === 'breakout' && entry.longCandle && entry.volumeSpike) {
    // Fallback gap detection for when precise SMC geometry isn't present
    const direction = entry.candleDirection === 'bullish' ? 'Bullish' : 'Bearish';
    reasons.push(`⚡ ${direction} Momentum Gap detected. Rapid institutional execution in progress`);
    totalPoints += 12;
    if (entry.candleDirection === 'bullish') bullishPoints += 12;
    else if (entry.candleDirection === 'bearish') bearishPoints += 12;
    pillars.liquidity = true;
  }

  // ── 18. Metals / Energy Institutional Context ──────────────────────
  // Asset-specific macroeconomic and commodity context. This section only
  // activates for Metal-classified assets (Gold, Silver, Oil, Copper, etc.).
  // Provides the 'why' behind the technical signal using commodity market economics.
  if (market === 'Metal') {
    const sym = entry.symbol?.toUpperCase() || '';
    const isGold   = ['GC=F', 'XAUTUSDT', 'PAXGUSDT', 'XAUUSD', 'GOLD'].includes(sym);
    const isSilver  = ['SI=F', 'XAGUSD', 'SILVER'].includes(sym);
    const isOil     = ['CL=F', 'BZ=F'].includes(sym);
    const isGas     = ['NG=F'].includes(sym);
    const isCopper  = ['HG=F'].includes(sym);
    const isBullish = bullishPoints > bearishPoints;
    const isBearish = bearishPoints > bullishPoints;

    // ── Gold: Safe-Haven / USD Inverse / Central Bank Demand ──
    if (isGold) {
      if (isBullish) {
        reasons.push('🏅 Gold Macro Context: Bullish setups often coincide with USD weakness, elevated geopolitical risk, or inflation hedging demand. Monitor DXY for inverse confirmation.');
      } else if (isBearish) {
        reasons.push('🏅 Gold Macro Context: Bearish pressure may reflect USD strengthening or risk-on rotation. Central bank buying provides structural support; consider scaling entries.');
      } else {
        reasons.push('🏅 Gold Macro Context: Neutral consolidation. Awaiting a catalyst (CPI, Fed policy, geopolitical event). Gold typically leads risk-off moves by 1-3 sessions.');
      }
      pillars.structure = true;
    }

    // ── Silver: Industrial Demand + Safe-Haven Hybrid ──
    if (isSilver) {
      if (isBullish) {
        reasons.push('🥈 Silver Macro Context: Dual driver (safe-haven buying AND industrial demand from solar panels, electronics). Silver typically lags Gold then outperforms (higher beta).');
      } else if (isBearish) {
        reasons.push('🥈 Silver Macro Context: Industrial slowdown fears + USD strength can pressure Silver harder than Gold. Gold/Silver ratio expansion = bearish for Silver.');
      }
      pillars.structure = true;
    }

    // ── WTI / Brent Crude Oil: Supply-Demand Cycle ──
    if (isOil) {
      if (isBullish) {
        reasons.push('🛢️ Oil Macro Context: Bullish oil signals driven by supply constraints (OPEC+ cuts), geopolitical risk premium, or demand recovery. Watch EIA inventory reports.');
      } else if (isBearish) {
        reasons.push('🛢️ Oil Macro Context: Bearish pressure from demand destruction fears, supply glut, or OPEC compliance concerns. Recession signals amplify oil drawdowns.');
      } else {
        reasons.push('🛢️ Oil Macro Context: Consolidation - oil markets balancing supply/demand. Breakout direction typically dictated by next OPEC+ meeting or US inventory data.');
      }
      pillars.structure = true;
    }

    // ── Natural Gas: Seasonal / Storage Cycle ──
    if (isGas) {
      reasons.push('⛽ Natural Gas Context: Highly seasonal - summer/winter storage cycles drive extreme moves. Check EIA storage reports for directional confirmation.');
    }

    // ── Copper: Economic Bellwether / "Dr. Copper" ──
    if (isCopper) {
      if (isBullish) {
        reasons.push('🟤 Copper Macro: "Dr. Copper" bullish - industrial expansion signal. China PMI and construction data are primary catalysts for copper demand.');
      } else if (isBearish) {
        reasons.push('🟤 Copper Macro: Copper weakness signals industrial slowdown. Often a leading indicator of broader economic contraction 2-3 months ahead.');
      }
    }


  }

  // ── Compose Headline & Conviction ──
  const pillarCount = Object.values(pillars).filter(Boolean).length;
  const netBias = bullishPoints - bearishPoints;
  const maxPossible = Math.max(totalPoints, 1);

  // Institutional Conviction Algorithm:
  // Base score + Pillar Confluence Bonus (12pts per pillar after the first) + Absolute Strength factor
  // 2026 FIX: Only calculate conviction if there are actual points
  let conviction: number;
  let convictionLabel: SignalNarration['convictionLabel'];
  
  if (totalPoints === 0) {
    // No indicators contributed - zero conviction
    conviction = 0;
    convictionLabel = 'Weak';
  } else {
    const baseConviction = (Math.abs(netBias) / maxPossible) * 100;
    const confluenceBonus = Math.max(0, (pillarCount - 1) * 12);
    const scaleFactor = totalPoints > 50 ? 1.2 : 1.0;
    conviction = Math.min(100, Math.round(baseConviction * scaleFactor + confluenceBonus));
    
    if (conviction >= 88) convictionLabel = 'Maximum';
    else if (conviction >= 72) convictionLabel = 'Very Strong';
    else if (conviction >= 52) convictionLabel = 'Strong';
    else if (conviction >= 32) convictionLabel = 'Moderate';
    else convictionLabel = 'Weak';
  }

  let headline: string;
  let emoji: string;

  // ── 2026 FIX: Context-Aware Headlines ──
  // Add price action context to headlines for clarity
  const priceChange24h = entry.change24h ?? 0;
  const isExtremeMove = Math.abs(priceChange24h) > 20;
  const isParabolicMove = Math.abs(priceChange24h) > 40;

  // ── 20. Institutional Headline Pivot (Hard Accuracy Guard) ──
  // If RSI is at extreme levels, we override the netBias-based headline to prevent "False Bullish" signals.
  const rsiHigh = (entry.rsi1m ?? 0) > 75 && (entry.rsi5m ?? 0) > 70 && (entry.rsi15m ?? 0) > 65;
  const rsiLow = (entry.rsi1m ?? 100) < 25 && (entry.rsi5m ?? 100) < 30 && (entry.rsi15m ?? 100) < 35;

  if (netBias > 25) {
    if (rsiHigh && conviction < 90) {
      headline = 'Extended Market Condition | Pullback Risk Elevated';
      emoji = '🟡⚠️';
    } else if (conviction >= 80 && pillarCount >= 3) {
      // 2026 FIX: Verify price is actually ABOVE demand before confirming it in headline
      const hasDemandAbovePrice = entry.smc?.orderBlock?.type === 'bullish' && entry.price < entry.smc.orderBlock.bottom;
      const isMetals = market === 'Metal';
      
      if (hasDemandAbovePrice) {
        headline = isMetals 
          ? 'Bullish Commodity Setup | Testing Broken Demand'
          : 'Bullish Reversal Setup | Level Testing';
      } else {
        headline = isMetals
          ? 'Institutional Commodity Buy | Demand Zone Confirmed'
          : 'Institutional Buy Setup | High Confluence';
      }
      emoji = conviction >= 70 ? '🟢🔥' : '🟢';
    } else if (conviction >= 60) {
      headline = market === 'Metal'
        ? 'Bullish Commodity Setup Forming | Awaiting Confirmation'
        : 'Bullish Expansion | Strategy Confirmed';
      emoji = '🟢';
    } else {
      headline = 'Bullish Setup Forming | Awaiting Confirmation';
      emoji = '🟢';
    }
  } else if (netBias < -25) {
    // 2026 FIX: Add context for bearish signals after extreme bullish moves
    if (isParabolicMove && priceChange24h > 40 && rsiHigh) {
      headline = `Overbought Exhaustion After +${priceChange24h.toFixed(1)}% Rally | Pullback Risk Extreme`;
      emoji = '🟡⚠️';
      // Add clarification to reasons
      reasons.unshift(`⚠️ CONTEXT: This is an EXHAUSTION warning, not institutional distribution. Price rallied ${priceChange24h.toFixed(1)}% in 24h and is deeply overbought.`);
    } else if (isExtremeMove && priceChange24h > 20 && rsiHigh) {
      headline = `Overextended Rally | Correction Signals Building After +${priceChange24h.toFixed(1)}% Move`;
      emoji = '🟡⚠️';
    } else if (rsiLow && conviction < 90) {
      headline = 'Deeply Oversold Condition | Reversal Potential Building';
      emoji = '🟡⚠️';
    } else if (conviction >= 80 && pillarCount >= 3) {
      headline = market === 'Metal'
        ? 'Institutional Commodity Sell | Supply Zone Active'
        : 'Institutional Sell Setup | High Confluence';
      emoji = conviction >= 70 ? '🔴🔥' : '🔴';
    } else if (conviction >= 60) {
      headline = market === 'Metal'
        ? 'Bearish Commodity Distribution | Exit Longs'
        : 'Bearish Distribution | Exit Longs, Monitor Shorts';
      emoji = '🔴';
    } else {
      headline = 'Bearish Pressure Building | Confirm Before Entry';
      emoji = '🔴';
    }
  } else if (totalPoints > 40 || (pillarCount >= 2 && Math.abs(netBias) < 15)) {
    headline = 'Indecision Zone | Conflicting Signals, Risk Off';
    emoji = '🟡';
    if (reasons.length > 0 && !reasons.some(r => r.includes('HOLD'))) {
      reasons.push('⚖️ Conflicting signals detected - neutral stance recommended until price confirms direction');
    }
  } else {
    headline = 'Market Equilibrium | No Edge, Stand Aside';
    emoji = '⚪';
  }

  // If no reasons were generated, provide a neutral baseline
  if (reasons.length === 0) {
    reasons.push('📊 All indicators within normal ranges - no actionable signals');
  }

  // ── Compose Share Line ──
  const assetPrefix = market === 'Metal' ? '🏅' : market === 'Forex' ? '💱' : '';
  const topReason = reasons[0]?.replace(/^[^\s]+\s/, '') || 'Neutral';
  const institutionalTag = conviction >= 80 && pillarCount >= 4 ? ' | ✅ Institutional Alignment Confirmed' : '';
  const shareLine = `${assetPrefix}${emoji} ${headline} | ${topReason} | Conviction: ${conviction}% (${convictionLabel})${institutionalTag}`;

  // ── 19. Strategy Style Context (Institutional Transparency) ──
  const styleLabel = tradingStyle.charAt(0).toUpperCase() + tradingStyle.slice(1);
  const styleExplanation =
    tradingStyle === 'scalping' ? 'weighted for ultra-fast 1m/5m momentum & volatility' :
    tradingStyle === 'swing' ? 'weighted for 4h/1d macro trend stability' :
    tradingStyle === 'position' ? 'weighted for maximum 1d/Weekly macro cycle preservation' :
    'balanced for 15m/1h intraday market structure';

  reasons.unshift(`🛡️ Strategy Mode: ${styleLabel} - Indicators are ${styleExplanation}`);

  return {
    headline,
    reasons,
    conviction,
    convictionLabel,
    emoji,
    shareLine,
  };
}

// ── Price Formatting Helper ──────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}
