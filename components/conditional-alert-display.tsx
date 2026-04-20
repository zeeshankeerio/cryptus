'use client';

import { memo } from 'react';
import { Edit2, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ConditionalAlertConfig, AlertCondition, ConditionResult } from '@/lib/conditional-alerts';
import { getConditionTypeLabel, getOperatorLabel } from './conditional-alert-builder';

/**
 * Conditional Alert Display Component
 * Requirements: Requirement 2 (Task 9.4)
 * Design: Display active conditional alerts with edit/delete actions
 * 
 * Features:
 * - List all conditions for a symbol
 * - Show which conditions are currently met
 * - Edit and delete actions
 * - Visual indicators for condition status
 * - Memoized for performance
 */

interface ConditionalAlertDisplayProps {
  config: ConditionalAlertConfig;
  conditionResults?: ConditionResult[];
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  className?: string;
}

export const ConditionalAlertDisplay = memo(function ConditionalAlertDisplay({
  config,
  conditionResults,
  onEdit,
  onDelete,
  disabled = false,
  className
}: ConditionalAlertDisplayProps) {
  const hasResults = conditionResults && conditionResults.length > 0;
  const metCount = hasResults ? conditionResults.filter(r => r.met).length : 0;
  const totalCount = config.conditions.length;
  
  const isTriggered = config.logic === 'AND'
    ? metCount === totalCount
    : metCount > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider",
            config.logic === 'AND'
              ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
              : "bg-blue-500/10 border-blue-500/30 text-blue-400"
          )}>
            {config.logic}
          </div>
          
          {hasResults && (
            <div className={cn(
              "px-2 py-1 rounded-md border text-[9px] font-black uppercase tracking-wider",
              isTriggered
                ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14]"
                : "bg-slate-800/30 border-slate-700/30 text-slate-500"
            )}>
              {metCount}/{totalCount} Met
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              disabled={disabled}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-[#39FF14] hover:border-[#39FF14]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Edit alert"
            >
              <Edit2 size={12} />
            </button>
          )}
          
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={disabled}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-[#FF4B5C] hover:border-[#FF4B5C]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete alert"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Conditions List */}
      <div className="space-y-2">
        {config.conditions.map((condition, index) => {
          const result = hasResults ? conditionResults[index] : undefined;
          const isMet = result?.met || false;
          
          return (
            <ConditionDisplayRow
              key={index}
              condition={condition}
              index={index}
              isMet={isMet}
              actualValue={result?.actualValue}
              showLogicLabel={index > 0}
              logic={config.logic}
            />
          );
        })}
      </div>

      {/* Status Message */}
      {hasResults && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-2 rounded-lg border text-[9px] font-bold",
            isTriggered
              ? "bg-[#39FF14]/10 border-[#39FF14]/20 text-[#39FF14]"
              : "bg-slate-800/30 border-slate-700/30 text-slate-500"
          )}
        >
          {isTriggered ? (
            <div className="flex items-center gap-1.5">
              <CheckCircle size={12} />
              <span>Alert conditions met - notification will be sent</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <AlertCircle size={12} />
              <span>
                {config.logic === 'AND'
                  ? `Waiting for all ${totalCount} conditions to be met`
                  : `Waiting for any of ${totalCount} conditions to be met`}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
});

/**
 * Condition Display Row
 * Shows individual condition with status
 */

interface ConditionDisplayRowProps {
  condition: AlertCondition;
  index: number;
  isMet: boolean;
  actualValue?: number | string | null;
  showLogicLabel?: boolean;
  logic?: 'AND' | 'OR';
}

const ConditionDisplayRow = memo(function ConditionDisplayRow({
  condition,
  index,
  isMet,
  actualValue,
  showLogicLabel = false,
  logic = 'AND'
}: ConditionDisplayRowProps) {
  const typeLabel = getConditionTypeLabel(condition.type);
  const operatorLabel = getOperatorLabel(condition.operator);
  
  // Format value display
  const valueDisplay = condition.type === 'price_change'
    ? `${condition.value > 0 ? '+' : ''}${condition.value}%`
    : condition.value.toString();

  const actualValueDisplay = actualValue !== undefined && actualValue !== null
    ? typeof actualValue === 'number'
      ? condition.type === 'price_change'
        ? `${actualValue > 0 ? '+' : ''}${actualValue.toFixed(2)}%`
        : actualValue.toFixed(2)
      : actualValue.toString()
    : null;

  return (
    <div className="relative p-3 rounded-lg bg-white/[0.02] border border-white/5">
      {/* Logic Label */}
      {showLogicLabel && (
        <div className="absolute -top-2 left-3 px-1.5 py-0.5 rounded-sm bg-slate-900 border border-white/10">
          <span className={cn(
            "text-[7px] font-black uppercase tracking-wider",
            logic === 'AND' ? "text-[#39FF14]" : "text-blue-400"
          )}>
            {logic}
          </span>
        </div>
      )}

      {/* Status Indicator */}
      <div className="absolute -top-2 right-3 w-5 h-5 rounded-full bg-slate-900 border flex items-center justify-center">
        {isMet ? (
          <CheckCircle size={10} className="text-[#39FF14]" />
        ) : (
          <XCircle size={10} className="text-slate-600" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        {/* Condition Description */}
        <div className="flex-1">
          <div className="text-[10px] font-bold text-white leading-tight">
            <span className="text-slate-400">{typeLabel}</span>
            {' '}
            <span className="text-slate-500">{operatorLabel}</span>
            {' '}
            <span className="text-[#39FF14]">{valueDisplay}</span>
            {condition.timeframe && (
              <>
                {' '}
                <span className="text-slate-600">({condition.timeframe.toUpperCase()})</span>
              </>
            )}
          </div>
          
          {/* Actual Value */}
          {actualValueDisplay && (
            <div className="text-[8px] font-bold text-slate-600 mt-0.5">
              Current: {actualValueDisplay}
            </div>
          )}
        </div>

        {/* Condition Number */}
        <div className="w-5 h-5 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center shrink-0">
          <span className="text-[8px] font-black text-slate-500">
            {index + 1}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * Empty State Component
 * Shown when no conditional alerts are configured
 */

interface ConditionalAlertEmptyStateProps {
  onCreateNew?: () => void;
  className?: string;
}

export const ConditionalAlertEmptyState = memo(function ConditionalAlertEmptyState({
  onCreateNew,
  className
}: ConditionalAlertEmptyStateProps) {
  return (
    <div className={cn("p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center", className)}>
      <div className="w-12 h-12 rounded-xl bg-slate-800/50 border border-white/5 flex items-center justify-center mx-auto mb-3">
        <AlertCircle size={20} className="text-slate-600" />
      </div>
      
      <h4 className="text-sm font-black text-white mb-1">
        No Conditional Alerts
      </h4>
      
      <p className="text-[10px] text-slate-500 font-bold leading-tight mb-4">
        Create complex alerts by combining multiple conditions with AND/OR logic
      </p>
      
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="px-4 py-2 rounded-lg bg-[#39FF14] text-slate-950 text-[10px] font-black uppercase tracking-wider hover:bg-[#39FF14]/90 transition-all"
        >
          Create Conditional Alert
        </button>
      )}
    </div>
  );
});
