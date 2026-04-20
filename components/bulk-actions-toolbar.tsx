'use client';

import { memo } from 'react';
import { X, Flame, Volume2, Clock, FileText, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Bulk Actions Toolbar Component
 * Requirements: Requirement 13 (Task 11.1)
 * Design: BulkActionsToolbar, BulkActionButton components
 * 
 * Features:
 * - Floating action bar showing selected symbol count
 * - Action buttons: Set Priority, Set Sound, Enable Quiet Hours, Apply Template
 * - Cancel button to exit bulk mode
 * - Mobile-responsive design
 * - Animated entrance/exit
 */

export interface BulkAction {
  id: 'priority' | 'sound' | 'quietHours' | 'template';
  label: string;
  icon: React.ReactNode;
  description: string;
}

interface BulkActionsToolbarProps {
  selectedCount: number;
  onAction: (actionId: BulkAction['id']) => void;
  onCancel: () => void;
  className?: string;
}

const BULK_ACTIONS: BulkAction[] = [
  {
    id: 'priority',
    label: 'Set Priority',
    icon: <Flame size={14} />,
    description: 'Apply priority level to selected symbols'
  },
  {
    id: 'sound',
    label: 'Set Sound',
    icon: <Volume2 size={14} />,
    description: 'Apply alert sound to selected symbols'
  },
  {
    id: 'quietHours',
    label: 'Quiet Hours',
    icon: <Clock size={14} />,
    description: 'Configure quiet hours for selected symbols'
  },
  {
    id: 'template',
    label: 'Apply Template',
    icon: <FileText size={14} />,
    description: 'Apply alert template to selected symbols'
  }
];

export const BulkActionsToolbar = memo(function BulkActionsToolbar({
  selectedCount,
  onAction,
  onCancel,
  className
}: BulkActionsToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl",
            "px-6 py-4",
            "max-w-4xl w-[calc(100%-2rem)]",
            className
          )}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Selection Count */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30">
                <Check size={18} className="text-[#39FF14]" />
              </div>
              <div>
                <p className="text-sm font-black text-white">
                  {selectedCount} {selectedCount === 1 ? 'Symbol' : 'Symbols'} Selected
                </p>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">
                  Choose an action below
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {BULK_ACTIONS.map((action) => (
                <BulkActionButton
                  key={action.id}
                  action={action}
                  onClick={() => onAction(action.id)}
                />
              ))}
            </div>

            {/* Cancel Button */}
            <button
              onClick={onCancel}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl",
                "bg-white/5 border border-white/10 text-white",
                "text-[10px] font-black uppercase tracking-wider",
                "hover:bg-white/10 transition-all",
                "focus:outline-none focus:ring-2 focus:ring-[#39FF14]/30"
              )}
              title="Cancel bulk mode"
            >
              <X size={14} />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </div>

          {/* Mobile: Stacked Layout */}
          <div className="sm:hidden mt-3 pt-3 border-t border-white/5">
            <div className="grid grid-cols-2 gap-2">
              {BULK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-2 rounded-xl",
                    "bg-white/5 border border-white/10 text-white",
                    "text-[9px] font-black uppercase tracking-wider",
                    "hover:bg-[#39FF14]/10 hover:border-[#39FF14]/30 transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-[#39FF14]/30"
                  )}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

/**
 * Bulk Action Button Component
 * Individual action button with hover tooltip
 */

interface BulkActionButtonProps {
  action: BulkAction;
  onClick: () => void;
  disabled?: boolean;
}

const BulkActionButton = memo(function BulkActionButton({
  action,
  onClick,
  disabled = false
}: BulkActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl",
        "bg-white/5 border border-white/10 text-white",
        "text-[10px] font-black uppercase tracking-wider",
        "hover:bg-[#39FF14]/10 hover:border-[#39FF14]/30 transition-all",
        "focus:outline-none focus:ring-2 focus:ring-[#39FF14]/30",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
      title={action.description}
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
});

/**
 * Export utility for bulk action IDs
 */
export function isBulkActionId(id: string): id is BulkAction['id'] {
  return ['priority', 'sound', 'quietHours', 'template'].includes(id);
}
