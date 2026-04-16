"use client";

import { useSubscription } from "@/hooks/use-subscription";
import { Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function TrialIndicator() {
  const { isTrialing, daysLeft, isLoading, subscription } = useSubscription();

  if (isLoading) return null;
  if (!isTrialing) return null;

  const isLowTime = (daysLeft ?? 0) <= 3;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest shadow-lg",
          isLowTime
            ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/10"
            : "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14] shadow-[#39FF14]/10"
        )}
      >
        <div className="relative">
          <Clock className={cn("h-3 w-3", isLowTime && "animate-pulse")} />
          {isLowTime && (
            <Zap className="absolute -top-1 -right-1 h-2 w-2 text-rose-300 animate-bounce" />
          )}
        </div>
        <span>
          Trial: {daysLeft} Day{daysLeft === 1 ? "" : "s"} Left
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
