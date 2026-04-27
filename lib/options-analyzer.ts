/**
 * Options Intelligence Analyzer
 * 
 * Analyzes Put/Call ratios, Implied Volatility (IV), and Max Pain levels
 * to determine institutional sentiment and potential price magnets.
 * 
 * Key Concepts:
 * - Put/Call Ratio (PCR) > 1.0 = Bearish (more puts than calls)
 * - Put/Call Ratio (PCR) < 0.7 = Bullish (more calls than puts)
 * - Max Pain = Price level where most options expire worthless (market magnet)
 * - Rising IV + Rising Price = Strong bullish conviction
 * - Rising IV + Falling Price = Strong bearish conviction
 */

import type { OptionsIntelligence } from './derivatives-types';

/**
 * Analyze Options sentiment for a symbol
 * 
 * @param symbol - Trading pair symbol
 * @param puts - Total put volume/OI
 * @param calls - Total call volume/OI
 * @param iv - Current implied volatility
 * @param maxPain - Current max pain price level
 * @returns OptionsIntelligence object
 */
export function analyzeOptions(
  symbol: string,
  puts: number,
  calls: number,
  iv: number,
  maxPain: number
): OptionsIntelligence {
  const pcr = calls > 0 ? puts / calls : 1.0;
  
  let sentiment: 'bullish' | 'bearish' | 'neutral';
  if (pcr < 0.7) sentiment = 'bullish';
  else if (pcr > 1.2) sentiment = 'bearish';
  else sentiment = 'neutral';

  return {
    symbol,
    putCallRatio: Math.round(pcr * 100) / 100,
    impliedVolatility: Math.round(iv * 100) / 100,
    maxPainPrice: maxPain,
    openInterest: puts + calls,
    sentiment,
    updatedAt: Date.now(),
  };
}

/**
 * Calculate Put/Call Ratio from raw options chain data
 * 
 * @param chain - Array of option contracts
 * @returns PCR value
 */
export function calculatePCR(chain: Array<{ type: 'PUT' | 'CALL'; volume: number }>): number {
  let puts = 0;
  let calls = 0;
  
  for (const contract of chain) {
    if (contract.type === 'PUT') puts += contract.volume;
    else calls += contract.volume;
  }
  
  return calls > 0 ? puts / calls : 1.0;
}
