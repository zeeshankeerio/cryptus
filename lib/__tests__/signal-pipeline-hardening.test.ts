import { describe, it, expect } from 'vitest';
import { computeRiskParameters } from '../indicators';
import { generateSignalNarration } from '../signal-narration';

describe('Signal Pipeline Hardening 2026', () => {
  
  describe('Risk Parameter Confluence (OB Hardening)', () => {
    it('places stop-loss below the Order Block for bullish trades', () => {
      const price = 4519.15;
      const atr = 9.5;
      const direction = 'buy';
      const market = 'Metal';
      const smc = {
        orderBlock: { type: 'bullish', top: 4515, bottom: 4511.44 }
      };

      const params = computeRiskParameters(price, atr, direction, market, smc);
      
      // Standard ATR stop: 4519.15 - (9.5 * 1.2) = 4507.75
      // OB Bottom: 4511.44
      // Hardened stop should be 4507.75
      expect(params.stopLoss).toBe(4507.75);

      // Scenario where OB is even lower, protecting the stop
      const smc2 = {
        orderBlock: { type: 'bullish', top: 4510, bottom: 4505 }
      };
      const params2 = computeRiskParameters(price, atr, direction, market, smc2);
      // Math.min(4507.75, 4505) = 4505
      expect(params2.stopLoss).toBe(4505);
    });
  });

  describe('Directional Narration Logic', () => {
    it('labels level as Demand Zone when price is above', () => {
      const entry = {
        price: 4511.5,
        fibLevels: { level618: 4511, swingHigh: 4600, swingLow: 4400 },
        strategySignal: 'buy',
        market: 'Metal'
      };
      const narration = generateSignalNarration(entry as any);
      const fibReason = narration.reasons.find(r => r.includes('Institutional Demand Zone'));
      expect(fibReason).toBeDefined();
    });

    it('labels level as Supply Zone when price is below', () => {
      const entry = {
        price: 4510.5,
        fibLevels: { level618: 4511, swingHigh: 4600, swingLow: 4400 },
        strategySignal: 'buy',
        market: 'Metal'
      };
      const narration = generateSignalNarration(entry as any);
      const fibReason = narration.reasons.find(r => r.includes('Institutional Supply Zone'));
      expect(fibReason).toBeDefined();
    });

    it('downgrades headline when price is below demand structure', () => {
      // Setup a strong bullish signal but with price below the demand level
      const entry = {
        price: 4505,
        fibLevels: { level618: 4511, swingHigh: 4600, swingLow: 4400 },
        rsi15m: 20, // oversold
        rsi1h: 22,  // oversold
        strategySignal: 'buy',
        strategyScore: 85,
        market: 'Metal',
        change24h: -2.5
      };
      const narration = generateSignalNarration(entry as any);
      // It should NOT say "Demand Zone Confirmed" because price is 4505 and level is 4511
      expect(narration.headline).toContain('Potential Reversal');
      expect(narration.headline).not.toContain('Demand Zone Confirmed');
    });
  });
});
