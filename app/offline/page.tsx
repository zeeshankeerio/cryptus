'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Wifi, Home, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = async () => {
      setIsVerifying(true);
      // Real-world check: Small fetch to confirm we aren't in "Lie-Fi"
      try {
        await fetch('/favicon.ico', { mode: 'no-cors', cache: 'no-store' });
        setIsOnline(true);
      } catch (e) {
        setIsOnline(false);
      } finally {
        setIsVerifying(false);
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial verify
    if (navigator.onLine) handleOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleForceClear = async () => {
    if (confirm('This will wipe your local cache and system worker to resolve the stuck state. Proceed?')) {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) await reg.unregister();
      }
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#05080F] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full rounded-3xl border border-white/5 bg-[#0d121f] p-8 text-center shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/[0.02] rounded-full -mr-16 -mt-16 group-hover:bg-[#39FF14]/[0.05] transition-colors duration-1000" />
        
        <div className="flex justify-center mb-10">
           <div className="relative w-40 h-10">
              <Image 
                src="/logo/rsiq-mindscapeanalytics.png" 
                alt="RSIQ Pro" 
                fill
                className="object-contain"
              />
           </div>
        </div>

        <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">
          {isOnline ? 'Reconnected' : 'Offline'}
        </h1>
        <h2 className={cn(
          "text-xl font-bold mb-4 uppercase tracking-widest text-[11px]",
          isOnline ? "text-[#39FF14]" : "text-amber-500"
        )}>
          {isVerifying ? 'Verifying Signal...' : (isOnline ? 'SYSTEM RESTORED' : 'SIGNAL LOST')}
        </h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          {isOnline
            ? 'Your connection has been restored. We recommend a fresh sync to ensure all data feeds are live.'
            : 'You are currently offline. Real-time scanning and intelligence updates are paused until connection is restored.'}
        </p>

        <div className="flex flex-col gap-3">
          {isOnline ? (
            <>
              {/* Force HARD navigation to break out of SW cache trap */}
              <a
                href="/terminal"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#39FF14] text-black font-black text-sm hover:bg-[#32e012] transition-colors active:scale-95 shadow-[0_20px_40px_rgba(57,255,20,0.1)]"
              >
                <Home size={16} />
                Enter Terminal
              </a>
              <a
                href="/"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/5 text-slate-400 font-bold text-sm hover:bg-white/10 border border-white/5 transition-colors active:scale-95"
              >
                Return Home
              </a>
              
              <button
                onClick={handleForceClear}
                className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-rose-400 transition-colors"
              >
                Stuck? Reset System Cache
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleRefresh}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white text-black font-black text-sm hover:bg-slate-200 transition-colors active:scale-95"
              >
                <RefreshCw size={16} className={cn(isVerifying && "animate-spin")} />
                {isVerifying ? 'Checking...' : 'Check Connection'}
              </button>
              <a
                href="/"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/5 text-slate-400 font-bold text-sm hover:bg-white/10 border border-white/5 transition-colors active:scale-95"
              >
                <Home size={16} />
                View Cached State
              </a>
            </>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 mb-2">
            Connection Status: <span className={isOnline ? 'text-green-400' : 'text-amber-500'}>{isOnline ? 'Online' : 'Offline'}</span>
          </p>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">Mindscape Analytics LLC</span>
        </div>
      </div>
    </div>
  );
}
