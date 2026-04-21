import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { ScreenerEntry } from '@/lib/types';
import { approximateRsi, approximateEma } from '@/lib/rsi';
import { computeStrategyScore } from '@/lib/indicators';
import { getSymbolAlias } from '@/lib/symbol-utils';
import { formatPrice } from '@/lib/utils';
import { alertCoordinator } from '@/lib/alert-coordinator-client';
import { shouldSuppressAlert, getAlertBehavior, type AlertPriority } from '@/lib/alert-priority';
import { recordSignal, evaluateOutcomes, getGlobalWinRate } from '@/lib/signal-tracker';
import { notificationEngine } from '@/lib/notification-engine';

// ── Wake Lock for mobile alert reliability (GAP-E4) ──
let wakeLock: WakeLockSentinel | null = null;
async function requestWakeLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      console.log('[alerts] Wake Lock released');
      wakeLock = null;
    });
    console.log('[alerts] Wake Lock acquired — screen will stay on for alerts');
  } catch (e) {
    console.warn('[alerts] Wake Lock unavailable:', e);
  }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// ── 2026 Resilient Audio Anchor (Media Session) ──
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface Alert {
  id: string;
  symbol: string;
  exchange?: string;
  timeframe: string;
  value: number;
  price?: number;
  type: 'OVERSOLD' | 'OVERBOUGHT' | 'STRATEGY_STRONG_BUY' | 'STRATEGY_STRONG_SELL' | 'LONG_CANDLE' | 'VOLUME_SPIKE';
  createdAt: number;
}

export type AudioState = 'uninitialized' | 'running' | 'suspended' | 'interrupted';

const COOLDOWN_MS = 3 * 60 * 1000;

function computeHysteresis(overboughtThreshold: number, oversoldThreshold: number): number {
  const gap = Math.max(0, overboughtThreshold - oversoldThreshold);
  return Math.max(2, gap * 0.15);
}

export function useAlertEngine(
  data: ScreenerEntry[],
  coinConfigs: Record<string, any>,
  enabled: boolean,
  soundEnabled: boolean,
  globalThresholdsEnabled: boolean = false,
  globalOverbought: number = 90,
  globalOversold: number = 15,
  globalThresholdTimeframes: string[] = ['1m', '5m', '15m', '1h'],
  globalLongCandleThreshold: number = 3.0,
  globalVolumeSpikeThreshold: number = 5.0,
  globalVolatilityEnabled: boolean = false,
  enabledIndicators?: {
    rsi?: boolean;
    macd?: boolean;
    bb?: boolean;
    stoch?: boolean;
    ema?: boolean;
    vwap?: boolean;
    confluence?: boolean;
    divergence?: boolean;
    momentum?: boolean;
  },
  globalSignalThresholdMode: 'default' | 'custom' = 'default'
) {
  // ── HOISTED REFS (GAP FIX) ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioAnchorRef = useRef<HTMLAudioElement | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [audioState, setAudioState] = useState<AudioState>('uninitialized');

  // Track AudioContext state changes (Ref Safe)
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const handler = () => setAudioState(ctx.state as AudioState);
    ctx.addEventListener('statechange', handler);
    setAudioState(ctx.state as AudioState); // Immediate sync
    
    return () => ctx.removeEventListener('statechange', handler);
  }, [audioCtxRef.current]);

  // Main Refs
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const coinConfigsRef = useRef(coinConfigs);
  const configLastUpdated = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const now = Date.now();
    Object.keys(coinConfigs).forEach(s => {
      if (coinConfigs[s] !== coinConfigsRef.current[s]) {
        configLastUpdated.current.set(s, now);
        // Clear BOTH zone states AND lastTriggered when config changes.
        // Without clearing lastTriggered, the cooldown from the old config
        // prevents the new config's alert from firing immediately.
        for (const [key] of zoneState.current) if (key.startsWith(`${s}-`)) zoneState.current.delete(key);
        for (const [key] of lastTriggered.current) if (key.startsWith(`${s}-`)) lastTriggered.current.delete(key);
      }
    });
    coinConfigsRef.current = coinConfigs;
  }, [coinConfigs]);

  const zoneState = useRef<Map<string, string | undefined>>(new Map());
  const lastTriggered = useRef<Map<string, number>>(new Map());
  const dataMapRef = useRef<Map<string, ScreenerEntry>>(new Map());
  const lastWinRateEvalRef = useRef<number | null>(null);

  // Sync data index and prune stale states
  useEffect(() => {
    const m = new Map<string, ScreenerEntry>();
    for (const entry of data) m.set(entry.symbol, entry);
    dataMapRef.current = m;

    const currentSymbols = new Set(data.map(e => e.symbol));
    for (const key of zoneState.current.keys()) {
      const sym = key.split('-')[0];
      if (!currentSymbols.has(sym)) zoneState.current.delete(key);
    }
  }, [data]);

  const globalThresholdsEnabledRef = useRef(globalThresholdsEnabled);
  useEffect(() => { globalThresholdsEnabledRef.current = globalThresholdsEnabled; }, [globalThresholdsEnabled]);
  const globalOverboughtRef = useRef(globalOverbought);
  useEffect(() => { globalOverboughtRef.current = globalOverbought; }, [globalOverbought]);
  const globalOversoldRef = useRef(globalOversold);
  useEffect(() => { globalOversoldRef.current = globalOversold; }, [globalOversold]);
  const globalThresholdTimeframesRef = useRef(globalThresholdTimeframes);
  useEffect(() => { globalThresholdTimeframesRef.current = globalThresholdTimeframes; }, [globalThresholdTimeframes]);
  const globalVolatilityEnabledRef = useRef(globalVolatilityEnabled);
  useEffect(() => { globalVolatilityEnabledRef.current = globalVolatilityEnabled; }, [globalVolatilityEnabled]);
  const enabledIndicatorsRef = useRef(enabledIndicators);
  useEffect(() => { enabledIndicatorsRef.current = enabledIndicators; }, [enabledIndicators]);

  // ── Callbacks ──
  const getExchange = useCallback(() => {
    if (typeof window === 'undefined') return 'binance';
    return (window as any).__priceEngine?.getExchange?.() ?? 'binance';
  }, []);

  const setupMediaSession = useCallback(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'RSIQ Pro Monitor',
      artist: 'Mindscape Analytics',
      album: 'Real-time Alert Engine',
      artwork: [{ src: '/logo/rsiq-pro-icon.png', sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.playbackState = 'playing';
    const noop = () => {};
    navigator.mediaSession.setActionHandler('play', noop);
    navigator.mediaSession.setActionHandler('pause', noop);
  }, []);

  const resumeAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      if (!audioAnchorRef.current) {
        const audio = new Audio(SILENT_WAV_BASE64);
        audio.loop = true;
        audio.muted = true;
        audioAnchorRef.current = audio;
      }
      if (audioAnchorRef.current.paused) {
        await audioAnchorRef.current.play().catch(() => {});
        setupMediaSession();
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state === 'running') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0005, ctx.currentTime);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(0); osc.stop(0.1);
      }
      console.log("[alerts] Resilient Audio Engine active");
    } catch (e) {
      console.error("[alerts] Audio resume failed:", e);
    }
  }, [setupMediaSession]);

  const playAlertSound = useCallback(async (isVolatility = false, priority: AlertPriority = 'medium') => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      if ((ctx.state as any) !== 'running') return;

      const playTone = (freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + dur);
        // Clean up nodes immediately after they finish to prevent memory accumulation
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      };

      const now = ctx.currentTime;
      if (isVolatility || priority === 'critical') {
        const base = priority === 'critical' ? 2637.02 : 2093.00;
        playTone(base, now, 0.1, 0.1, 'square');
        playTone(base, now + 0.12, 0.1, 0.1, 'square');
        playTone(base, now + 0.24, 0.4, 0.12, 'square');
      } else {
        const mult = priority === 'high' ? 1.5 : (priority === 'low' ? 0.6 : 1.0);
        playTone(1046.50, now, 0.7, 0.1 * mult, 'sine');
        playTone(1318.51, now + 0.08, 0.6, 0.07 * mult, 'sine');
        playTone(1567.98, now + 0.16, 0.5, 0.05 * mult, 'sine');
      }
    } catch (e) { console.warn('[alerts] Sound failed:', e); }
  }, [soundEnabled]);

  const logAlert = useCallback(async (alert: Omit<Alert, 'id' | 'createdAt'>) => {
    // Optimistic UI update: add to local state immediately so the user sees it
    // even if the API call fails. The server will deduplicate via cooldown.
    const optimisticAlert: Alert = {
      ...alert,
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    setAlerts(prev => [optimisticAlert, ...prev].slice(0, 50));

    // Attempt to persist to server with one retry on network failure
    const attempt = async (retryCount = 0): Promise<void> => {
      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(alert),
        });
        if (res.ok) {
          const saved = await res.json();
          if (saved.skipped) return; // Server-side cooldown dedup — keep optimistic entry
          const normalized: Alert = {
            ...saved,
            createdAt: typeof saved.createdAt === 'string' ? new Date(saved.createdAt).getTime() : saved.createdAt,
          };
          // Replace the optimistic entry with the server-confirmed one
          setAlerts(prev => prev.map(a => a.id === optimisticAlert.id ? normalized : a));
        } else if (res.status >= 500 && retryCount === 0) {
          // Server error — retry once after 2s
          await new Promise(r => setTimeout(r, 2000));
          return attempt(1);
        }
        // 4xx errors (auth, entitlement) — don't retry, keep optimistic entry
      } catch (e) {
        if (retryCount === 0) {
          // Network error — retry once after 3s
          await new Promise(r => setTimeout(r, 3000));
          return attempt(1);
        }
        // Second failure — keep optimistic entry, log silently
        console.warn('[alerts] Failed to persist alert after retry:', e);
      }
    };

    attempt();
  }, []);

  const triggerNativeNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const currentExchange = (window as any).__priceEngine?.getExchange?.() ?? 'unknown';
    const tag = `rsiq-${currentExchange}-${title.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.visibilityState === 'visible') {
      try {
        const n = new Notification(title, { body, icon: '/logo/rsiq-pro-icon.png', badge: '/logo/rsiq-pro-icon.png', silent: false, renotify: true, tag } as any);
        setTimeout(() => n.close(), 8000);
      } catch {}
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'ALERT_NOTIFICATION', payload: { title, body, icon: '/logo/rsiq-pro-icon.png', exchange: currentExchange } });
    }
  }, []);

  const playAlertSoundRef = useRef(playAlertSound);
  useEffect(() => { playAlertSoundRef.current = playAlertSound; }, [playAlertSound]);
  const logAlertRef = useRef(logAlert);
  useEffect(() => { logAlertRef.current = logAlert; }, [logAlert]);
  const triggerNativeRef = useRef(triggerNativeNotification);
  useEffect(() => { triggerNativeRef.current = triggerNativeNotification; }, [triggerNativeNotification]);

  // ── Life Cycle: Wake Lock & Audio Watchdog ──
  useEffect(() => {
    if (enabled) {
      requestWakeLock();
      const watchdog = setInterval(() => {
        if (enabled && document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
      }, 30000);
      const handleVisibility = () => {
        if (document.visibilityState === 'visible' && enabled) { requestWakeLock(); resumeAudioContext(); }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', resumeAudioContext);
      return () => {
        clearInterval(watchdog);
        releaseWakeLock();
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', resumeAudioContext);
      };
    } else releaseWakeLock();
  }, [enabled, resumeAudioContext]);

  // Interaction Catch
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = () => resumeAudioContext();
    window.addEventListener('click', h);
    window.addEventListener('touchstart', h);
    window.addEventListener('mousedown', h);
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('click', h);
      window.removeEventListener('touchstart', h);
      window.removeEventListener('mousedown', h);
      window.removeEventListener('keydown', h);
    };
  }, [resumeAudioContext]);

  // History Hydration
  useEffect(() => {
    fetch('/api/alerts', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlerts(data.map(v => ({...v, createdAt: typeof v.createdAt === 'string' ? new Date(v.createdAt).getTime() : v.createdAt})).slice(0, 50));
        }
      }).catch(e => console.error('[alerts] Hydrate failed:', e));
  }, []);

  // ── THE ENGINE: Tick Evaluation ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const eng = (window as any).__priceEngine;
    if (!eng) return;

    const handleBatchTicks = (e: Event) => {
      if (!enabledRef.current) return;
      const batch = (e as CustomEvent).detail as Map<string, any>;
      if (!batch || batch.size === 0) return;

      try {
        batch.forEach((live, symbol) => {
          const entry = dataMapRef.current.get(symbol);
          const config = coinConfigsRef.current[symbol];
          if (!entry || (!config && !globalThresholdsEnabledRef.current)) return;

          const obT = config?.overboughtThreshold ?? globalOverboughtRef.current;
          const osT = config?.oversoldThreshold ?? globalOversoldRef.current;
          const hyst = computeHysteresis(obT, osT);

          // RSI Approx
          const tfKeys = ['1m', '5m', '15m', '1h'];
          tfKeys.forEach(tf => {
            const rsi = entry[`rsi${tf}` as keyof ScreenerEntry] as number;
            const stateKey = `${symbol}-${tf}`;
            const previousZone = (zoneState.current.get(stateKey) ?? 'NEUTRAL') as any;
            let currentZone: any = 'NEUTRAL';
            
            if (previousZone === 'OVERSOLD') currentZone = rsi > osT + hyst ? 'NEUTRAL' : 'OVERSOLD';
            else if (previousZone === 'OVERBOUGHT') currentZone = rsi < obT - hyst ? 'NEUTRAL' : 'OVERBOUGHT';
            else {
              if (rsi <= osT) currentZone = 'OVERSOLD';
              else if (rsi >= obT) currentZone = 'OVERBOUGHT';
            }

            if (currentZone !== 'NEUTRAL' && currentZone !== previousZone) {
               const now = Date.now();
               const alertKey = `${stateKey}-${currentZone}`;
               const coordKey = alertCoordinator.getCooldownKey(symbol, getExchange(), tf, currentZone);
               const recentlyUpdated = (configLastUpdated.current.get(symbol) || 0) > now - 15000;
               
               if (recentlyUpdated || (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS && !alertCoordinator.isInCooldown(coordKey, COOLDOWN_MS))) {
                 lastTriggered.current.set(alertKey, now);
                 alertCoordinator.setCooldown(coordKey);
                 const priority: AlertPriority = (config?.priority as AlertPriority) ?? 'medium';
                 
                 toast[currentZone === 'OVERSOLD' ? 'success' : 'error'](`${getSymbolAlias(symbol)} ${tf} RSI ${currentZone}`, {
                   description: `RSI: ${rsi.toFixed(1)} @ $${formatPrice(live.price)} [${getExchange().toUpperCase()}]`
                 });
                 
                 playAlertSoundRef.current(false, priority);
                 logAlertRef.current({ symbol, exchange: getExchange(), timeframe: tf, value: rsi, price: live.price, type: currentZone });
                 triggerNativeRef.current(`${getSymbolAlias(symbol)} ${tf} RSI ${currentZone}`, `RSI: ${rsi.toFixed(1)} @ $${formatPrice(live.price)}`);
               }
            }
            zoneState.current.set(stateKey, currentZone);
          });

          // Strategy Shift — only compute if explicitly enabled for this symbol
          if (config?.alertOnStrategyShift) {
            // Debounce: only evaluate strategy once per 500ms per symbol to avoid CPU spikes
            const stratKey = `${symbol}-STRAT-EVAL`;
            const lastEval = lastTriggered.current.get(stratKey) || 0;
            const now2 = Date.now();
            if (now2 - lastEval < 500) return; // Skip if evaluated recently
            lastTriggered.current.set(stratKey, now2);

            const liveStrategy = computeStrategyScore({ ...entry, price: live.price, enabledIndicators: enabledIndicatorsRef.current });
            const sKey = `${symbol}-STRAT`;
            const prevS = zoneState.current.get(sKey);
            if (prevS !== undefined && prevS !== liveStrategy.signal && (liveStrategy.signal === 'strong-buy' || liveStrategy.signal === 'strong-sell')) {
              const now = Date.now();
              if (now - (lastTriggered.current.get(sKey) || 0) > COOLDOWN_MS) {
                lastTriggered.current.set(sKey, now);
                const isBuy = liveStrategy.signal === 'strong-buy';
                recordSignal(symbol, isBuy ? 'strong-buy' : 'strong-sell', live.price);
                toast[isBuy ? 'success' : 'error'](`${getSymbolAlias(symbol)} → ${isBuy?'🟢 BUY':'🔴 SELL'}`, { description: `Score: ${liveStrategy.score.toFixed(0)} @ $${formatPrice(live.price)}` });
                playAlertSoundRef.current(false, (config.priority as any) ?? 'medium');
                logAlertRef.current({ symbol, exchange: getExchange(), timeframe: 'STRATEGY', value: liveStrategy.score, price: live.price, type: isBuy ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL' });
                triggerNativeRef.current(`${getSymbolAlias(symbol)} Strategy Shift`, `${isBuy?'Bullish':'Bearish'} signal @ $${formatPrice(live.price)}`);
              }
            }
            zoneState.current.set(sKey, liveStrategy.signal);
          }
        });

        // Evaluation
        const now = Date.now();
        if (!lastWinRateEvalRef.current || now - lastWinRateEvalRef.current > 30000) {
          lastWinRateEvalRef.current = now;
          const pm = new Map<string, number>();
          batch.forEach((l, s) => { if (l.price > 0) pm.set(s, l.price); });
          if (pm.size > 0) evaluateOutcomes(pm);
        }
      } catch (err) { console.warn('[alerts] Tick fail:', err); }
    };

    const handleWorkerAlert = (e: Event) => {
      if (!enabledRef.current) return;
      const payload = (e as CustomEvent).detail;
      const { symbol, exchange, timeframe, value, type } = payload;
      const config = coinConfigsRef.current[symbol];
      const isVol = type === 'LONG_CANDLE' || type === 'VOLUME_SPIKE';
      if (!config && ((isVol && !globalVolatilityEnabledRef.current) || (!isVol && !globalThresholdsEnabledRef.current))) return;

      const aKey = isVol ? `${symbol}-${type}` : `${symbol}-${timeframe}`;
      const now = Date.now();
      const cKey = alertCoordinator.getCooldownKey(symbol, exchange ?? getExchange(), isVol ? type : timeframe, type);
      
      if (now - (lastTriggered.current.get(aKey) || 0) > COOLDOWN_MS && !alertCoordinator.isInCooldown(cKey, COOLDOWN_MS)) {
        lastTriggered.current.set(aKey, now);
        alertCoordinator.setCooldown(cKey);
        const priority: AlertPriority = (config?.priority as AlertPriority) ?? 'medium';
        const isPos = type === 'OVERSOLD' || type === 'STRATEGY_STRONG_BUY' || type === 'LONG_CANDLE';
        toast[isPos ? 'success' : 'error'](`${getSymbolAlias(symbol)} ${timeframe} ${type}`, { description: `Value: ${value.toFixed(1)}` });
        playAlertSoundRef.current(isVol, priority);
        logAlertRef.current({ symbol, exchange: exchange ?? getExchange(), timeframe, value, price: payload.price, type });
        triggerNativeRef.current(`${getSymbolAlias(symbol)} Alert`, `${type} detected on ${timeframe}`);
      }
    };

    eng.addEventListener('ticks', handleBatchTicks);
    eng.addEventListener('alert', handleWorkerAlert);
    return () => {
      eng.removeEventListener('ticks', handleBatchTicks);
      eng.removeEventListener('alert', handleWorkerAlert);
    };
  }, [getExchange]);

  return {
    alerts,
    clearAlertHistory: async () => { setAlerts([]); await fetch('/api/alerts', { method: 'DELETE' }); },
    resumeAudioContext,
    getGlobalWinRate,
    audioState,
    isAudioSuspended: audioState === 'suspended' || audioState === 'uninitialized'
  };
}
