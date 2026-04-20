'use client';

import { memo } from 'react';
import { X, AlertTriangle, Check, Flame, Volume2, Clock, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { AlertPriority } from './priority-selector';
import type { AlertSound } from './sound-selector';

/**
 * Bulk Confirmation Dialog Component
 * Requirements: Requirement 13 (Task 11.4)
 * Design: BulkConfirmationDialog component
 * 
 * Features:
 * - Display affected symbols
 * - Show preview of changes
 * - Add confirm/cancel buttons
 * - Mobile-responsive design
 * - Clear visual hierarchy
 */

export type BulkActionType = 'priority' | 'sound' | 'quietHours' | 'template';

export interface BulkActionConfig {
  type: BulkActionType;
  priority?: AlertPriority;
  sound?: AlertSound;
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  templateName?: string;
  templateConfig?: Record<string, any>;
}

interface BulkConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  symbols: string[];
  action: BulkActionConfig;
  isProcessing?: boolean;
}

export const BulkConfirmationDialog = memo(function BulkConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  symbols,
  action,
  isProcessing = false
}: BulkConfirmationDialogProps) {
  if (!isOpen) return null;

  const actionInfo = getActionInfo(action);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                "bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl",
                "w-full max-w-2xl max-h-[80vh] overflow-hidden",
                "flex flex-col"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl border",
                    actionInfo.bgClass,
                    actionInfo.borderClass
                  )}>
                    {actionInfo.icon}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">
                      Confirm Bulk Action
                    </h2>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      {actionInfo.title}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className="p-2 rounded-xl hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Warning Banner */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30">
                  <AlertTriangle size={18} className="text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-orange-400">
                      This will affect {symbols.length} {symbols.length === 1 ? 'symbol' : 'symbols'}
                    </p>
                    <p className="text-[10px] text-orange-400/70 mt-1">
                      This action cannot be undone. Review the changes below before confirming.
                    </p>
                  </div>
                </div>

                {/* Changes Preview */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Changes to Apply
                  </h3>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                    {renderActionPreview(action)}
                  </div>
                </div>

                {/* Affected Symbols */}
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Affected Symbols ({symbols.length})
                  </h3>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 max-h-48 overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {symbols.map((symbol) => (
                        <span
                          key={symbol}
                          className="px-2 py-1 rounded-lg bg-slate-800/50 border border-white/5 text-[10px] font-bold text-white"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5">
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className={cn(
                    "px-4 py-2 rounded-xl",
                    "bg-white/5 border border-white/10 text-white",
                    "text-[10px] font-black uppercase tracking-wider",
                    "hover:bg-white/10 transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isProcessing}
                  className={cn(
                    "px-4 py-2 rounded-xl flex items-center gap-2",
                    "bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14]",
                    "text-[10px] font-black uppercase tracking-wider",
                    "hover:bg-[#39FF14]/20 transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-[#39FF14]/30 border-t-[#39FF14] rounded-full animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirm & Apply</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
});

/**
 * Utility Functions
 */

function getActionInfo(action: BulkActionConfig) {
  switch (action.type) {
    case 'priority':
      return {
        title: 'Set Alert Priority',
        icon: <Flame size={18} className="text-orange-400" />,
        bgClass: 'bg-orange-500/10',
        borderClass: 'border-orange-500/30'
      };
    case 'sound':
      return {
        title: 'Set Alert Sound',
        icon: <Volume2 size={18} className="text-blue-400" />,
        bgClass: 'bg-blue-500/10',
        borderClass: 'border-blue-500/30'
      };
    case 'quietHours':
      return {
        title: 'Configure Quiet Hours',
        icon: <Clock size={18} className="text-purple-400" />,
        bgClass: 'bg-purple-500/10',
        borderClass: 'border-purple-500/30'
      };
    case 'template':
      return {
        title: 'Apply Alert Template',
        icon: <FileText size={18} className="text-[#39FF14]" />,
        bgClass: 'bg-[#39FF14]/10',
        borderClass: 'border-[#39FF14]/30'
      };
  }
}

function renderActionPreview(action: BulkActionConfig) {
  switch (action.type) {
    case 'priority':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Priority Level
            </span>
            <span className="text-sm font-black text-white">
              {getPriorityLabel(action.priority || 'medium')}
            </span>
          </div>
          <p className="text-[9px] text-slate-500">
            {getPriorityDescription(action.priority || 'medium')}
          </p>
        </div>
      );

    case 'sound':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Alert Sound
            </span>
            <span className="text-sm font-black text-white">
              {getSoundLabel(action.sound || 'default')}
            </span>
          </div>
          <p className="text-[9px] text-slate-500">
            {getSoundDescription(action.sound || 'default')}
          </p>
        </div>
      );

    case 'quietHours':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Quiet Hours
            </span>
            <span className="text-sm font-black text-white">
              {action.quietHoursEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {action.quietHoursEnabled && (
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>From {formatHour(action.quietHoursStart || 22)}</span>
              <span>→</span>
              <span>To {formatHour(action.quietHoursEnd || 8)}</span>
            </div>
          )}
          <p className="text-[9px] text-slate-500">
            {action.quietHoursEnabled
              ? 'Low/medium priority alerts will be suppressed during these hours'
              : 'Alerts will fire at all times'}
          </p>
        </div>
      );

    case 'template':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Template
            </span>
            <span className="text-sm font-black text-white">
              {action.templateName || 'Custom Template'}
            </span>
          </div>
          <p className="text-[9px] text-slate-500">
            All alert settings from this template will be applied to selected symbols
          </p>
        </div>
      );
  }
}

function getPriorityLabel(priority: AlertPriority): string {
  const labels = {
    low: '🔵 Low',
    medium: '🟢 Medium',
    high: '🟠 High',
    critical: '🔴 Critical'
  };
  return labels[priority];
}

function getPriorityDescription(priority: AlertPriority): string {
  const descriptions = {
    low: 'Soft sound, 5s toast notification',
    medium: 'Default sound, 8s toast notification',
    high: 'Bell sound, 12s persistent notification',
    critical: 'Urgent sound, requires user interaction'
  };
  return descriptions[priority];
}

function getSoundLabel(sound: AlertSound): string {
  const labels = {
    default: '🔔 Default',
    soft: '🔕 Soft',
    urgent: '⚠️ Urgent',
    bell: '🛎️ Bell',
    ping: '📍 Ping'
  };
  return labels[sound];
}

function getSoundDescription(sound: AlertSound): string {
  const descriptions = {
    default: 'Standard notification sound, balanced volume',
    soft: 'Gentle chime, ideal for quiet environments',
    urgent: 'Loud alert tone, demands immediate attention',
    bell: 'Classic bell sound, clear and distinct',
    ping: 'Short ping sound, subtle and quick'
  };
  return descriptions[sound];
}

function formatHour(hour: number): string {
  const h = hour % 24;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:00 ${period}`;
}
