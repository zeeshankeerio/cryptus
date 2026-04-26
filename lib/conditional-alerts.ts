/**
 * Conditional Alert Evaluation Logic - Task 6.5
 * Supports AND/OR logic combining up to 5 conditions.
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionType =
  | 'rsi'
  | 'volume_spike'
  | 'ema_cross'
  | 'macd_signal'
  | 'bb_touch'
  | 'price_change';

export type ConditionOperator = '<' | '>' | '=' | 'cross_above' | 'cross_below';

export interface AlertCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: number;
  timeframe?: string; // e.g. '1m', '5m', '15m', '1h'
}

export interface ConditionalAlertConfig {
  logic: 'AND' | 'OR';
  conditions: AlertCondition[]; // max 5
}

export interface IndicatorSnapshot {
  rsi1m?: number | null;
  rsi5m?: number | null;
  rsi15m?: number | null;
  rsi1h?: number | null;
  rsiCustom?: number | null;
  ema9?: number | null;
  ema21?: number | null;
  emaCross?: 'bullish' | 'bearish' | 'none' | null;
  macdHistogram?: number | null;
  bbPosition?: number | null;
  bbUpper?: number | null;
  bbLower?: number | null;
  price?: number;
  volume24h?: number;
  avgVolume1m?: number | null;
  curCandleVol?: number | null;
  change24h?: number;
}

export interface ConditionResult {
  met: boolean;
  condition: AlertCondition;
  actualValue?: number | string | null;
}

export interface ConditionalEvalResult {
  triggered: boolean;
  metConditions: ConditionResult[];
  allResults: ConditionResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function evaluateOperator(value: number, operator: ConditionOperator, threshold: number): boolean {
  switch (operator) {
    case '<': return value < threshold;
    case '>': return value > threshold;
    case '=': return Math.abs(value - threshold) < 0.0001;
    default: return false;
  }
}

function getRsiForTimeframe(
  indicators: IndicatorSnapshot,
  timeframe?: string,
): number | null | undefined {
  switch (timeframe) {
    case '1m': return indicators.rsi1m;
    case '5m': return indicators.rsi5m;
    case '15m': return indicators.rsi15m;
    case '1h': return indicators.rsi1h;
    case 'custom': return indicators.rsiCustom;
    default: return indicators.rsi15m ?? indicators.rsi1m; // fallback to 15m then 1m
  }
}

// ── Core evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates a single condition against the current indicator snapshot.
 */
export function evaluateCondition(
  condition: AlertCondition,
  indicators: IndicatorSnapshot,
): ConditionResult {
  const base: ConditionResult = { met: false, condition, actualValue: null };

  switch (condition.type) {
    case 'rsi': {
      const rsi = getRsiForTimeframe(indicators, condition.timeframe);
      if (rsi == null) return base;
      return {
        ...base,
        met: evaluateOperator(rsi, condition.operator, condition.value),
        actualValue: rsi,
      };
    }

    case 'volume_spike': {
      // Use curCandleVol / avgVolume1m ratio, or fall back to volume24h
      const curVol = indicators.curCandleVol;
      const avgVol = indicators.avgVolume1m;
      if (curVol != null && avgVol != null && avgVol > 0) {
        const ratio = curVol / avgVol;
        return {
          ...base,
          met: evaluateOperator(ratio, condition.operator, condition.value),
          actualValue: ratio,
        };
      }
      return base;
    }

    case 'ema_cross': {
      const cross = indicators.emaCross;
      if (!cross || cross === 'none') return base;
      const isBullish = cross === 'bullish';
      const met =
        condition.operator === 'cross_above' ? isBullish :
        condition.operator === 'cross_below' ? !isBullish :
        false;
      return { ...base, met, actualValue: cross };
    }

    case 'macd_signal': {
      const hist = indicators.macdHistogram;
      if (hist == null) return base;
      return {
        ...base,
        met: evaluateOperator(hist, condition.operator, condition.value),
        actualValue: hist,
      };
    }

    case 'bb_touch': {
      const pos = indicators.bbPosition;
      if (pos == null) return base;
      // value = 0 means lower band touch, value = 1 means upper band touch
      // operator '<' with value 0.1 = near lower band
      return {
        ...base,
        met: evaluateOperator(pos, condition.operator, condition.value),
        actualValue: pos,
      };
    }

    case 'price_change': {
      const change = indicators.change24h;
      if (change == null) return base;
      return {
        ...base,
        met: evaluateOperator(change, condition.operator, condition.value),
        actualValue: change,
      };
    }

    default:
      return base;
  }
}

/**
 * Evaluates a full conditional alert config (AND/OR) against indicator snapshot.
 * Returns which conditions were met and whether the alert should trigger.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function evaluateConditionalAlert(
  config: ConditionalAlertConfig,
  indicators: IndicatorSnapshot,
): ConditionalEvalResult {
  // Enforce max 5 conditions
  const conditions = config.conditions.slice(0, 5);
  const allResults: ConditionResult[] = conditions.map(c => evaluateCondition(c, indicators));
  const metConditions = allResults.filter(r => r.met);

  const triggered =
    config.logic === 'AND'
      ? allResults.every(r => r.met)
      : allResults.some(r => r.met);

  return { triggered, metConditions, allResults };
}

/**
 * Validates that a conditional alert config is well-formed.
 * Returns an array of validation errors (empty = valid).
 *
 * Requirement: 9.4
 */
export function validateConditionalConfig(config: ConditionalAlertConfig): string[] {
  const errors: string[] = [];

  if (!config.conditions || config.conditions.length === 0) {
    errors.push('At least one condition is required');
  }
  if (config.conditions.length > 5) {
    errors.push('Maximum 5 conditions allowed');
  }
  if (config.logic !== 'AND' && config.logic !== 'OR') {
    errors.push('Logic must be AND or OR');
  }

  const validTypes: ConditionType[] = ['rsi', 'volume_spike', 'ema_cross', 'macd_signal', 'bb_touch', 'price_change'];
  const validOps: ConditionOperator[] = ['<', '>', '=', 'cross_above', 'cross_below'];

  for (const [i, cond] of config.conditions.entries()) {
    if (!validTypes.includes(cond.type)) {
      errors.push(`Condition ${i + 1}: invalid type "${cond.type}"`);
    }
    if (!validOps.includes(cond.operator)) {
      errors.push(`Condition ${i + 1}: invalid operator "${cond.operator}"`);
    }
    if (typeof cond.value !== 'number' || !isFinite(cond.value)) {
      errors.push(`Condition ${i + 1}: value must be a finite number`);
    }
    // cross_above/cross_below only valid for ema_cross
    if ((cond.operator === 'cross_above' || cond.operator === 'cross_below') && cond.type !== 'ema_cross') {
      errors.push(`Condition ${i + 1}: cross_above/cross_below only valid for ema_cross type`);
    }
  }

  return errors;
}
