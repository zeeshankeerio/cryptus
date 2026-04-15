'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Wifi, Home, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#05080F] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full rounded-3xl border border-white/5 bg-[#0d121f] p-8 text-center shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/[0.02] rounded-full -mr-16 -mt-16 group-hover:bg-[#39FF14]/[0.05] transition-colors duration-1000" />
        
        <Link href="/" className="inline-flex items-center gap-2 group mb-10 transition-transform hover:scale-[1.02]">
           <div className="relative w-40 h-10">
              <Image 
                src="/logo/rsiq-mindscapeanalytics.png" 
                alt="RSIQ Pro" 
                fill
                className="object-contain"
              />
           </div>
        </Link>

        <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">
          {isOnline ? 'Reconnected' : 'Offline'}
        </h1>
        <h2 className="text-xl font-bold text-slate-200 mb-4 uppercase tracking-widest text-[11px]">
          {isOnline ? 'System Restored' : 'Signal Lost'}
        </h2>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          {isOnline
            ? 'Your connection has been restored. You can now access all features.'
            : 'You are currently offline. Some features may be limited. Cached data is available, but real-time updates require a connection.'}
        </p>

        <div className="flex flex-col gap-3">
          {isOnline ? (
            <>
              <Link
                href="/terminal"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#39FF14] text-black font-black text-sm hover:bg-[#32e012] transition-colors active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.1)]"
              >
                <Home size={16} />
                Go to Terminal
              </Link>
              <Link
                href="/"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/5 text-slate-400 font-bold text-sm hover:bg-white/10 border border-white/5 transition-colors active:scale-95"
              >
                Back to Home
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={handleRefresh}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#39FF14] text-black font-black text-sm hover:bg-[#32e012] transition-colors active:scale-95 shadow-[0_0_20px_rgba(57,255,20,0.1)]"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
              <Link
                href="/"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-white/5 text-slate-400 font-bold text-sm hover:bg-white/10 border border-white/5 transition-colors active:scale-95"
              >
                <Home size={16} />
                Check Cached Data
              </Link>
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
