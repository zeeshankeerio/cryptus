"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Smartphone, 
  MonitorSmartphone,
  Share,
  PlusSquare,
  ArrowUpCircle,
  MoreVertical,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [browser, setBrowser] = useState({ isIOS: false, isSafari: false, isFirefox: false });

  useEffect(() => {
    // 1. Precise Standalone Detection
    const checkStandalone = () => {
      if (typeof window === 'undefined') return false;
      return (
        window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      );
    };

    // 2. Browser Detection for tailored steps
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isFirefox = ua.toLowerCase().indexOf('firefox') > -1;
    setBrowser({ isIOS, isSafari, isFirefox });

    // DEBUG: Force show if needed for testing
    const isDebug = typeof window !== 'undefined' && sessionStorage.getItem('pwa-debug') === 'true';

    if (checkStandalone() && !isDebug) {
      setIsInstalled(true);
      return;
    }

    // Check if permanently dismissed
    const isPermanentlyDismissed = localStorage.getItem('pwa-never-show') === 'true';
    if (isPermanentlyDismissed && !isDebug) return;

    // Check if dismissed in this session
    if (sessionStorage.getItem('pwa-prompt-dismissed') && !isDebug) return;

    // 2. Automated Event Listener (Chrome/Android/Edge)
    const handler = (e: any) => {
      console.log("[PWA] beforeinstallprompt event fired");
      e.preventDefault();
      setDeferredPrompt(e);
      if (!sessionStorage.getItem('pwa-snoozed') || isDebug) {
        setTimeout(() => setIsVisible(true), isDebug ? 500 : 2000);
      }
    };
    const onAppInstalled = () => {
      console.log("[PWA] App installed successfully");
      setIsInstalled(true);
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onAppInstalled);

    // 3. Fallback Logic for iOS/Firefox/Desktop without prompt
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!checkStandalone() && (!sessionStorage.getItem('pwa-snoozed') || isDebug)) {
      const delay = isIOS ? 4000 : 10000;
      timer = setTimeout(() => {
        if (!isInstalled) setIsVisible(true);
      }, delay);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [isInstalled]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Show custom manual instruction modal instead of alert
      setShowManual(true);
      return;
    }
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const closePrompt = (permanent = false) => {
    setIsVisible(false);
    if (permanent) {
      localStorage.setItem('pwa-never-show', 'true');
    } else {
      sessionStorage.setItem('pwa-prompt-dismissed', 'true');
      sessionStorage.setItem('pwa-snoozed', 'true');
    }
  };

  if (isInstalled || !isVisible) return null;

  return (
    <>
      <AnimatePresence>
        {isVisible && !showManual && (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 w-[calc(100%-2rem)] md:w-[380px] z-[999]"
          >
            <div className="bg-[#080F1B]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] flex items-center gap-4 relative group overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#39FF14]/5 to-transparent opacity-50" />
              
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#39FF14]/20 to-emerald-900/40 border border-[#39FF14]/30 flex items-center justify-center shrink-0 shadow-lg ring-1 ring-[#39FF14]/10 relative z-10">
                <MonitorSmartphone size={24} className="text-[#39FF14]" />
              </div>

              <div className="flex-1 min-w-0 relative z-10">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5 leading-none">
                    Install <span className="text-[#39FF14]">RSIQ Pro</span>
                  </h4>
                   <button 
                    onClick={() => closePrompt(false)}
                    className="p-1 rounded-full hover:bg-white/5 text-slate-600 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-2 leading-tight">
                  Install the terminal for a full-screen, native experience.
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <button 
                    onClick={handleInstall}
                    className="px-5 py-2 rounded-xl bg-[#39FF14] text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#39FF14]/20"
                  >
                    Install Now
                  </button>
                  <button 
                    onClick={() => closePrompt(true)}
                    className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all underline decoration-white/10 underline-offset-4"
                  >
                    Never show
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setShowManual(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[#0A0E17] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h2 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-widest">
                  <Download size={18} className="text-[#39FF14]" />
                  Installation <span className="text-[#39FF14]">Guide</span>
                </h2>
                <button onClick={() => setShowManual(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {browser.isIOS ? (
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0 border border-blue-500/30">
                        <Share size={16} className="text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Step 01</p>
                        <p className="text-xs font-bold text-white">Tap the <span className="text-blue-400">Share</span> icon in your Safari toolbar below.</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-[#39FF14]/20 flex items-center justify-center shrink-0 border border-[#39FF14]/30">
                        <PlusSquare size={16} className="text-[#39FF14]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Step 02</p>
                        <p className="text-xs font-bold text-white">Scroll down and select <span className="text-[#39FF14]">"Add to Home Screen"</span>.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0 border border-orange-500/30">
                        <MoreVertical size={16} className="text-orange-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Step 01</p>
                        <p className="text-xs font-bold text-white">Open your browser menu (usually three dots or bars).</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-[#39FF14]/20 flex items-center justify-center shrink-0 border border-[#39FF14]/30">
                        <Download size={16} className="text-[#39FF14]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Step 02</p>
                        <p className="text-xs font-bold text-white">Click <span className="text-[#39FF14]">"Install App"</span> or <span className="text-[#39FF14]">"Add to Home Screen"</span>.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-white/5 text-center">
                  <button 
                    onClick={() => setShowManual(false)}
                    className="w-full bg-white/5 text-slate-400 font-black uppercase tracking-[0.2em] py-4 rounded-2xl hover:bg-white/10 hover:text-white transition-all text-[10px]"
                  >
                    Got it, thanks
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
