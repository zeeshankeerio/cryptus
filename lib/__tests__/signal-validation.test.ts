/**
 * Signal Validation - Unit Tests
 * Copyright © 2024-2026 Mindscape Analytics LLC. All rights reserved.
 *
 * Tests for Super Signal validation logic
 */

import { describe, it, expect } from 'vitest';
import { validateWithSuperSignal } from '../signal-validation';

describe('Signal Validation', () => {
  describe('validateWithSuperSignal', () => {
    it('should return medium confidence when Super Signal is undefined', () => {
      const result = validateWithSuperSignal(50, undefined);

      expect(result.multiplier).toBe(1.0);
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('');
    });

    it('should return medium confidence when strategy is neutral', () => {
      const result = validateWithSuperSignal(0, 50);

      expect(result.multiplier).toBe(1.0);
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('');
    });

    it('should return medium confidence when Super Signal is neutral', () => {
      const result = validateWithSuperSignal(50, 0);

      expect(result.multiplier).toBe(1.0);
      expect(result.confidence).toBe('medium');
      expect(result.reason).toBe('');
    });

    it('should boost when both are bullish', () => {
      const result = validateWithSuperSignal(60, 80);

      expect(result.multiplier).toBeGreaterThan(1.0);
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('Super Signal confirms');
    });

    it('should boost when both are bearish', () => {
      const result = validateWithSuperSignal(-60, -80);

      expect(result.multiplier).toBeGreaterThan(1.0);
      expect(result.confidence).toBe('high');
      expect(result.reason).toContain('Super Signal confirms');
    });

    it('should calculate boost based on minimum score', () => {
      // Strategy: 60, Super: 80 → min = 60 → agreement = 0.60 → boost = 0.09 (9%)
      const result1 = validateWithSuperSignal(60, 80);
      expect(result1.multiplier).toBeCloseTo(1.09, 2);

      // Strategy: 80, Super: 60 → min = 60 → agreement = 0.60 → boost = 0.09 (9%)
      const result2 = validateWithSuperSignal(80, 60);
      expect(result2.multiplier).toBeCloseTo(1.09, 2);

      // Strategy: 100, Super: 100 → min = 100 → agreement = 1.0 → boost = 0.15 (15%)
      const result3 = validateWithSuperSignal(100, 100);
      expect(result3.multiplier).toBeCloseTo(1.15, 2);
    });

    it('should dampen when strategy is bullish but Super Signal is bearish', () => {
      const result = validateWithSuperSignal(60, -60);

      expect(result.multiplier).toBeLessThan(1.0);
      expect(result.confidence).toBe('low');
      expect(result.reason).toContain('Super Signal contradicts');
    });

    it('should dampen when strategy is bearish but Super Signal is bullish', () => {
      const result = validateWithSuperSignal(-60, 60);

      expect(result.multiplier).toBeLessThan(1.0);
      expect(result.confidence).toBe('low');
      expect(result.reason).toContain('Super Signal contradicts');
    });

    it('should calculate penalty based on disagreement magnitude', () => {
      // Strategy: 60, Super: -60 → disagreement = 120/200 = 0.60 → penalty = 0.18 (18%)
      const result1 = validateWithSuperSignal(60, -60);
      expect(result1.multiplier).toBeCloseTo(0.82, 2);

      // Strategy: 100, Super: -100 → disagreement = 200/200 = 1.0 → penalty = 0.30 (30%)
      const result2 = validateWithSuperSignal(100, -100);
      expect(result2.multiplier).toBeCloseTo(0.70, 2);

      // Strategy: 30, Super: -30 → disagreement = 60/200 = 0.30 → penalty = 0.09 (9%)
      const result3 = validateWithSuperSignal(30, -30);
      expect(result3.multiplier).toBeCloseTo(0.91, 2);
    });

    it('should handle edge case: strategy at max, Super Signal at min', () => {
      const result = validateWithSuperSignal(100, -100);

      expect(result.multiplier).toBe(0.70); // Maximum 30% penalty
      expect(result.confidence).toBe('low');
    });

    it('should handle edge case: weak agreement', () => {
      const result = validateWithSuperSignal(10, 10);

      // min = 10 → agreement = 0.10 → boost = 0.015 (1.5%)
      expect(result.multiplier).toBeCloseTo(1.015, 3);
      expect(result.confidence).toBe('high');
    });

    it('should handle edge case: weak disagreement', () => {
      const result = validateWithSuperSignal(10, -10);

      // disagreement = 20/200 = 0.10 → penalty = 0.03 (3%)
      expect(result.multiplier).toBeCloseTo(0.97, 2);
      expect(result.confidence).toBe('low');
    });
  });
});
