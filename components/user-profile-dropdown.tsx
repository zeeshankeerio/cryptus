'use client';

import { motion } from 'framer-motion';
import { 
  LayoutGrid, CreditCard, Settings, Shield, Lock, LogOut, ChevronDown 
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface UserProfileDropdownProps {
  session: any;
  isOwner: boolean;
  onLogout: () => void;
  isLoggingOut: boolean;
  onClose: () => void;
  onShowGlobalSettings: () => void;
  isMobile?: boolean;
}

export function UserProfileDropdown({
  session,
  isOwner,
  onLogout,
  isLoggingOut,
  onClose,
  onShowGlobalSettings,
  isMobile = false
}: UserProfileDropdownProps) {
  const router = useRouter();

  const menuItems = [
    { 
      label: 'Market Screener', 
      icon: LayoutGrid, 
      onClick: () => { router.push('/terminal'); onClose(); }, 
      active: true 
    },
    { 
      label: 'Subscription', 
      icon: CreditCard, 
      onClick: () => { router.push('/subscription'); onClose(); } 
    },
    { 
      label: 'Global Settings', 
      icon: Settings, 
      onClick: () => { onShowGlobalSettings(); onClose(); } 
    },
  ];

  if (isOwner) {
    menuItems.push({ 
      label: 'Admin Panel', 
      icon: Shield, 
      onClick: () => { router.push('/admin'); onClose(); } 
    });
    menuItems.push({ 
      label: 'Management', 
      icon: Lock, 
      onClick: () => { router.push('/admin/subscriptions'); onClose(); } 
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: isMobile ? 10 : -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: isMobile ? 10 : -10 }}
      className={cn(
        "absolute z-[500] min-w-[240px] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-2",
        "shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
        isMobile ? "bottom-full mb-3 right-0" : "top-full mt-3 right-0"
      )}
    >
      <div className="px-3 py-2.5 border-b border-white/5 mb-2">
        <p className="text-[10px] font-black text-[#39FF14] uppercase tracking-[0.1em] truncate">
          {session.user.name || 'Trader'}
        </p>
        <p className="text-[8px] font-bold text-slate-500 truncate mt-0.5">{session.user.email}</p>
      </div>
      
      <div className="space-y-1">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={item.onClick}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all group",
                item.active 
                  ? "bg-[#39FF14]/10 text-[#39FF14]" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={14} className={cn(item.active ? "text-[#39FF14]" : "text-slate-600 group-hover:text-slate-400")} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-white/5">
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-[#FF4B5C] hover:bg-[#FF4B5C]/10 transition-all group"
        >
          <LogOut size={14} className={cn("text-[#FF4B5C]", isLoggingOut && "animate-spin")} />
          {isLoggingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </motion.div>
  );
}
