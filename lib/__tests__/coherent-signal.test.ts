import { describe, it, expect } from 'vitest';
import { deriveCoherentSignal } from '@/lib/indicators';

describe('deriveCoherentSignal', () => {
  it('never shows overbought for buy-side strategy', () => {
    expect(deriveCoherentSignal('buy', 80, 70, 30)).toBe('neutral');
    expect(deriveCoherentSignal('strong-buy', 90, 70, 30)).toBe('neutral');
  });

  it('never shows oversold for sell-side strategy', () => {
    expect(deriveCoherentSignal('sell', 20, 70, 30)).toBe('neutral');
    expect(deriveCoherentSignal('strong-sell', 10, 70, 30)).toBe('neutral');
  });

  it('allows directional extremes when aligned', () => {
    expect(deriveCoherentSignal('buy', 20, 70, 30)).toBe('oversold');
    expect(deriveCoherentSignal('sell', 80, 70, 30)).toBe('overbought');
  });

  it('keeps neutral strategy purely RSI-driven', () => {
    expect(deriveCoherentSignal('neutral', 80, 70, 30)).toBe('overbought');
    expect(deriveCoherentSignal('neutral', 20, 70, 30)).toBe('oversold');
    expect(deriveCoherentSignal('neutral', 50, 70, 30)).toBe('neutral');
  });
});
