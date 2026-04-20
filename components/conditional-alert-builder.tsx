'use client';

import { memo, useState, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, Info, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type {
  ConditionalAlertConfig,
  AlertCondition,
  ConditionType,
  ConditionOperator
} from '@/lib/conditional-alerts';
import { validateConditionalConfig } from '@/lib/conditional-alerts';

/**
 * Conditional Alert Builder Component
 * Requirements: Requirement 2 (Task 9)
 * Design: ConditionalAlertBuilder, ConditionRow, LogicToggle components
 * 
 * Features:
 * - Add up to 5 conditions with type, operator, value, and timeframe
 * - AND/OR logic toggle
 * - Real-time validation with specific error messages
 * - Add/remove conditions dynamically
 * - Robust error handling and user feedback
 * - Memoized for performance
 */

interface ConditionalAlertBuilderProps {
  initialConfig?: ConditionalAlertConfig;
  onSave: (config: ConditionalAlertConfig) => Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

export const ConditionalAlertBuilder = memo(function ConditionalAlertBuilder({
  initialConfig,
  onSave,
  onCancel,
  disabled = false,
  className
}: ConditionalAlertBuilderProps) {
  const [config, setConfig] = useState<ConditionalAlertConfig>(
    initialConfig || {
      logic: 'AND',
      conditions: []
    }
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Validate on config change
  const validateConfig = useCallback((cfg: ConditionalAlertConfig) => {
    const validationErrors = validateConditionalConfig(cfg);
    setErrors(validationErrors);
    return validationErrors.length === 0;
  }, []);

  // Add new condition
  const handleAddCondition = useCallback(() => {
    if (config.conditions.length >= 5) {
      setErrors(['Maximum 5 conditions allowed']);
      return;
    }

    const newCondition: AlertCondition = {
      type: 'rsi',
      operator: '<',
      value: 30,
      timeframe: '15m'
    };

    const newConfig = {
      ...config,
      conditions: [...config.conditions, newCondition]
    };
    setConfig(newConfig);
    validateConfig(newConfig);
  }, [config, validateConfig]);

  // Remove condition
  const handleRemoveCondition = useCallback((index: number) => {
    const newConfig = {
      ...config,
      conditions: config.conditions.filter((_, i) => i !== index)
    };
    setConfig(newConfig);
    validateConfig(newConfig);
  }, [config, validateConfig]);

  // Update condition
  const handleUpdateCondition = useCallback((index: number, updates: Partial<AlertCondition>) => {
    const newConditions = [...config.conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    
    const newConfig = {
      ...config,
      conditions: newConditions
    };
    setConfig(newConfig);
    validateConfig(newConfig);
  }, [config, validateConfig]);

  // Toggle logic
  const handleToggleLogic = useCallback(() => {
    const newConfig = {
      ...config,
      logic: config.logic === 'AND' ? 'OR' as const : 'AND' as const
    };
    setConfig(newConfig);
    validateConfig(newConfig);
  }, [config, validateConfig]);

  // Save configuration
  const handleSave = useCallback(async () => {
    if (!validateConfig(config)) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(config);
      setErrors([]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to save configuration']);
    } finally {
      setIsSaving(false);
    }
  }, [config, onSave, validateConfig]);

  const canAddMore = config.conditions.length < 5;
  const hasConditions = config.conditions.length > 0;
  const isValid = errors.length === 0 && hasConditions;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Conditional Alerts
          </h3>
          <p className="text-[10px] text-slate-500 font-bold mt-0.5">
            Trigger alerts when multiple conditions are met
          </p>
        </div>
        
        {hasConditions && (
          <LogicToggle
            logic={config.logic}
            onToggle={handleToggleLogic}
            disabled={disabled || config.conditions.length < 2}
          />
        )}
      </div>

      {/* Conditions List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {config.conditions.map((condition, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <ConditionRow
                condition={condition}
                index={index}
                onUpdate={(updates) => handleUpdateCondition(index, updates)}
                onRemove={() => handleRemoveCondition(index)}
                disabled={disabled}
                showLogicLabel={index > 0}
                logic={config.logic}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add Condition Button */}
        {canAddMore && (
          <button
            onClick={handleAddCondition}
            disabled={disabled}
            className={cn(
              "w-full px-4 py-3 rounded-xl border-2 border-dashed transition-all flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider",
              disabled
                ? "border-slate-800 text-slate-700 cursor-not-allowed"
                : "border-white/10 text-slate-400 hover:border-[#39FF14]/30 hover:text-[#39FF14] hover:bg-[#39FF14]/5"
            )}
          >
            <Plus size={16} />
            <span>Add Condition ({config.conditions.length}/5)</span>
          </button>
        )}

        {!canAddMore && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-400 font-bold leading-tight">
                Maximum 5 conditions reached. Remove a condition to add more.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-[#FF4B5C]/10 border border-[#FF4B5C]/20"
        >
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-[#FF4B5C] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-black text-[#FF4B5C] uppercase tracking-wider mb-1">
                Validation Errors
              </p>
              <ul className="space-y-0.5">
                {errors.map((error, idx) => (
                  <li key={idx} className="text-[9px] text-[#FF4B5C]/80 font-bold leading-tight">
                    • {error}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* Help Text */}
      {!hasConditions && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="flex items-start gap-2">
            <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
            <div className="text-[10px] text-slate-500 font-bold leading-tight">
              <p className="mb-2">Create complex alerts by combining multiple conditions:</p>
              <ul className="space-y-1 ml-3">
                <li>• <strong>RSI</strong>: Trigger when RSI crosses thresholds</li>
                <li>• <strong>Volume Spike</strong>: Alert on unusual volume</li>
                <li>• <strong>EMA Cross</strong>: Detect trend changes</li>
                <li>• <strong>MACD Signal</strong>: Momentum shifts</li>
                <li>• <strong>BB Touch</strong>: Bollinger Band extremes</li>
                <li>• <strong>Price Change</strong>: Percentage moves</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={disabled || !isValid || isSaving}
          className={cn(
            "flex-1 px-4 py-3 rounded-xl font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 text-sm",
            isValid && !disabled && !isSaving
              ? "bg-[#39FF14] text-slate-950 hover:bg-[#39FF14]/90"
              : "bg-slate-800 text-slate-600 cursor-not-allowed"
          )}
        >
          {isSaving ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Check size={16} />
              </motion.div>
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check size={16} />
              <span>Save Alert</span>
            </>
          )}
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            disabled={disabled || isSaving}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * Logic Toggle Component
 * Switches between AND/OR logic
 */

interface LogicToggleProps {
  logic: 'AND' | 'OR';
  onToggle: () => void;
  disabled?: boolean;
}

const LogicToggle = memo(function LogicToggle({
  logic,
  onToggle,
  disabled = false
}: LogicToggleProps) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 rounded-lg border-2 font-black text-[10px] uppercase tracking-wider transition-all",
        logic === 'AND'
          ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
          : "bg-blue-500/10 border-blue-500/30 text-blue-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={logic === 'AND' ? 'All conditions must be met' : 'Any condition can trigger'}
    >
      {logic}
    </button>
  );
});

/**
 * Condition Row Component
 * Individual condition editor with type, operator, value, and timeframe
 */

interface ConditionRowProps {
  condition: AlertCondition;
  index: number;
  onUpdate: (updates: Partial<AlertCondition>) => void;
  onRemove: () => void;
  disabled?: boolean;
  showLogicLabel?: boolean;
  logic?: 'AND' | 'OR';
}

const ConditionRow = memo(function ConditionRow({
  condition,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  showLogicLabel = false,
  logic = 'AND'
}: ConditionRowProps) {
  const conditionTypes: { value: ConditionType; label: string }[] = [
    { value: 'rsi', label: 'RSI' },
    { value: 'volume_spike', label: 'Volume Spike' },
    { value: 'ema_cross', label: 'EMA Cross' },
    { value: 'macd_signal', label: 'MACD Signal' },
    { value: 'bb_touch', label: 'BB Touch' },
    { value: 'price_change', label: 'Price Change' }
  ];

  const operators: { value: ConditionOperator; label: string }[] = [
    { value: '<', label: 'Less Than (<)' },
    { value: '>', label: 'Greater Than (>)' },
    { value: '=', label: 'Equals (=)' },
    { value: 'cross_above', label: 'Cross Above' },
    { value: 'cross_below', label: 'Cross Below' }
  ];

  const timeframes = ['1m', '5m', '15m', '1h', 'custom'];

  // Filter operators based on condition type
  const availableOperators = condition.type === 'ema_cross'
    ? operators.filter(op => op.value === 'cross_above' || op.value === 'cross_below')
    : operators.filter(op => op.value !== 'cross_above' && op.value !== 'cross_below');

  const showTimeframe = condition.type === 'rsi';

  return (
    <div className="relative p-4 rounded-xl bg-white/[0.02] border border-white/5">
      {/* Logic Label */}
      {showLogicLabel && (
        <div className="absolute -top-3 left-4 px-2 py-0.5 rounded-md bg-slate-900 border border-white/10">
          <span className={cn(
            "text-[8px] font-black uppercase tracking-wider",
            logic === 'AND' ? "text-[#39FF14]" : "text-blue-400"
          )}>
            {logic}
          </span>
        </div>
      )}

      {/* Condition Number */}
      <div className="absolute -top-3 right-4 w-6 h-6 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center">
        <span className="text-[10px] font-black text-slate-400">
          {index + 1}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Condition Type */}
        <div className="space-y-1.5">
          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">
            Condition Type
          </label>
          <select
            value={condition.type}
            onChange={(e) => onUpdate({ type: e.target.value as ConditionType })}
            disabled={disabled}
            className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
          >
            {conditionTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Operator */}
        <div className="space-y-1.5">
          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">
            Operator
          </label>
          <select
            value={condition.operator}
            onChange={(e) => onUpdate({ operator: e.target.value as ConditionOperator })}
            disabled={disabled}
            className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
          >
            {availableOperators.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {/* Value */}
        <div className="space-y-1.5">
          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">
            Value
          </label>
          <input
            type="number"
            value={condition.value}
            onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
            disabled={disabled}
            step="0.01"
            className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
            placeholder="Enter value"
          />
        </div>

        {/* Timeframe (RSI only) */}
        {showTimeframe && (
          <div className="space-y-1.5">
            <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider ml-0.5">
              Timeframe
            </label>
            <select
              value={condition.timeframe || '15m'}
              onChange={(e) => onUpdate({ timeframe: e.target.value })}
              disabled={disabled}
              className="w-full bg-slate-950/50 border border-white/5 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#39FF14]/30 transition-all disabled:opacity-50"
            >
              {timeframes.map(tf => (
                <option key={tf} value={tf}>
                  {tf.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute -bottom-3 right-4 w-6 h-6 rounded-full bg-[#FF4B5C]/10 border border-[#FF4B5C]/30 flex items-center justify-center text-[#FF4B5C] hover:bg-[#FF4B5C]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="Remove condition"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
});

/**
 * Export utility for getting condition type label
 */
export function getConditionTypeLabel(type: ConditionType): string {
  const labels: Record<ConditionType, string> = {
    rsi: 'RSI',
    volume_spike: 'Volume Spike',
    ema_cross: 'EMA Cross',
    macd_signal: 'MACD Signal',
    bb_touch: 'Bollinger Band Touch',
    price_change: 'Price Change'
  };
  return labels[type];
}

/**
 * Export utility for getting operator label
 */
export function getOperatorLabel(operator: ConditionOperator): string {
  const labels: Record<ConditionOperator, string> = {
    '<': 'Less Than',
    '>': 'Greater Than',
    '=': 'Equals',
    cross_above: 'Cross Above',
    cross_below: 'Cross Below'
  };
  return labels[operator];
}
