import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { ScreenerEntry } from '@/lib/types';
import { approximateRsi, approximateEma } from '@/lib/rsi';
import { computeStrategyScore } from '@/lib/indicators';
import { getSymbolAlias } from '@/lib/symbol-utils';
import { formatPrice } from '@/lib/utils';

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
    // Wake Lock can fail if page is not visible
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
// A 1-second silent WAV to anchor the Media Session and prevent background throttling
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export interface Alert {
  id: string;
  symbol: string;
  exchange?: string;
  timeframe: string;
  value: number;
  type: 'OVERSOLD' | 'OVERBOUGHT' | 'STRATEGY_STRONG_BUY' | 'STRATEGY_STRONG_SELL';
  createdAt: number;
}

// ── Cooldown: 3 minutes per symbol-timeframe ──
const COOLDOWN_MS = 3 * 60 * 1000;

/**
 * Dynamic hysteresis: prevents rapid zone-flipping when thresholds are close.
 *   - When OB=70, OS=30 → gap=40 → hysteresis = max(2, 40*0.15) = 6
 *   - When OB=50, OS=45 → gap=5  → hysteresis = max(2, 5*0.15) = 2
 */
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
  globalThresholdTimeframes: string[] = ['1m', '5m', '15m', '1h']
) {
  // ── GAP-E4: Wake Lock lifecycle tied to alert enabled state ──
  useEffect(() => {
    if (enabled) {
      requestWakeLock();
      // Re-acquire wake lock on visibility change (mobile browsers release it)
      const handleVisibility = () => {
        if (document.visibilityState === 'visible' && enabled) requestWakeLock();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        releaseWakeLock();
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    } else {
      releaseWakeLock();
    }
  }, [enabled]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Hydrate alert history from API on mount
  useEffect(() => {
    fetch('/api/alerts')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const normalized = data.map(val => ({
            ...val,
            createdAt: typeof val.createdAt === 'string' ? new Date(val.createdAt).getTime() : val.createdAt
          })).slice(0, 50);
          setAlerts(normalized);
        }
      })
      .catch(e => console.error('[alerts] Error fetching history:', e));
  }, []);

  // Store the last known zone: undefined = uninitialized, 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT' once seen
  const zoneState = useRef<Map<string, string | undefined>>(new Map());
  // Anti-dancing cooldown — keyed by symbol-timeframe
  const lastTriggered = useRef<Map<string, number>>(new Map());
  // Track when a config was last updated to allow "cold-start" alerts for manual changes
  const configLastUpdated = useRef<Map<string, number>>(new Map());

  // Gap 7: O(1) data index — rebuilt only when `data` changes, not on every tick
  const dataMapRef = useRef<Map<string, ScreenerEntry>>(new Map());
  useEffect(() => {
    const m = new Map<string, ScreenerEntry>();
    for (const entry of data) m.set(entry.symbol, entry);
    dataMapRef.current = m;

    // ── GAP-D2 FIX: Prune zone/cooldown state for symbols no longer in dataset ──
    const currentSymbols = new Set(data.map(e => e.symbol));
    for (const key of zoneState.current.keys()) {
      const sym = key.split('-')[0];
      if (!currentSymbols.has(sym)) zoneState.current.delete(key);
    }
    for (const key of lastTriggered.current.keys()) {
      const sym = key.split('-')[0];
      if (!currentSymbols.has(sym)) lastTriggered.current.delete(key);
    }
  }, [data]);

  // Gap 7: O(1) coinConfigs index — stable ref updated when coinConfigs changes
  const coinConfigsRef = useRef<Record<string, any>>(coinConfigs);
  useEffect(() => {
    // Mark which configs were updated to allow immediate evaluation
    const now = Date.now();
    Object.keys(coinConfigs).forEach(s => {
      if (coinConfigs[s] !== coinConfigsRef.current[s]) {
        configLastUpdated.current.set(s, now);
      }
    });
    coinConfigsRef.current = coinConfigs;
  }, [coinConfigs]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioAnchorRef = useRef<HTMLAudioElement | null>(null);

  // ── Audio: setup media session and anchor ──
  const setupMediaSession = useCallback(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'RSIQ Pro Monitor',
      artist: 'Mindscape Analytics',
      album: 'Real-time Alert Engine',
      artwork: [
        { src: '/logo/rsiq-pro-icon.png', sizes: '512x512', type: 'image/png' }
      ]
    });

    // Set playback state to playing to signal "Active Engine" to the OS
    navigator.mediaSession.playbackState = 'playing';

    // Dummy handlers to keep the session alive
    const noop = () => {};
    navigator.mediaSession.setActionHandler('play', noop);
    navigator.mediaSession.setActionHandler('pause', noop);
  }, []);

  // ── Audio: resume context (called on user gesture from dashboard) ──
  const resumeAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      // Initialize Audio Anchor if not existing
      if (!audioAnchorRef.current) {
        const audio = new Audio(SILENT_WAV_BASE64);
        audio.loop = true;
        audio.muted = true; // Still counts as "Media Session" for most 2026 browsers
        audioAnchorRef.current = audio;
      }

      // Try to play the anchor (must be triggered by user gesture)
      if (audioAnchorRef.current.paused) {
        await audioAnchorRef.current.play().catch(() => {});
        setupMediaSession();
      }

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // iOS/Mobile Magic: Play a silent buffer to "unlock" audio output
      if (ctx.state === 'running') {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0005, ctx.currentTime); 
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(0);
        oscillator.stop(0.1);
        setTimeout(() => {
          oscillator.disconnect();
          gain.disconnect();
        }, 200);
      }

      console.log("[alerts] Resilient Audio Engine active (MediaSession anchored)");
    } catch (e) {
      console.error("[alerts] Failed to resume resilient audio:", e);
    }
  }, [setupMediaSession]);

  // Use level interactions and focus gain to ensure context is always resumed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleGesture = () => {
      resumeAudioContext();
    };

    window.addEventListener('click', handleGesture);
    window.addEventListener('touchstart', handleGesture);
    window.addEventListener('mousedown', handleGesture);
    window.addEventListener('keydown', handleGesture);
    window.addEventListener('focus', handleGesture);

    // Audio Keep-Alive: OS/Mobile browsers often suspend AudioContext after a few minutes of silence.
    // We play a near-silent pulse every 4 minutes to keep the context "warm".
    const keepAliveInterval = setInterval(() => {
      // 2026 Android Optimization: Shorter pulse interval (2.5 min) to prevent CPU sleep
      resumeAudioContext();
    }, 2.5 * 60 * 1000);

    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
      window.removeEventListener('mousedown', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      window.removeEventListener('focus', handleGesture);
      clearInterval(keepAliveInterval);
    };
  }, [resumeAudioContext]);

  // ── Audio: Play enterprise chime (with background fallback) ──
  const playAlertSound = useCallback(async () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        await ctx.resume().catch(() => { });
      }

      if (ctx.state !== 'running') {
        // One final attempt for Android Chrome stability
        await ctx.resume().catch(() => {});
        console.warn('[alerts] AudioContext not running, relying on notification sound fallback');
        // Type assertion to 'any' to bypass TS narrowing which doesn't account for state change after await
        if ((ctx.state as any) !== 'running') return;
      }

      const playTone = (freq: number, startTime: number, duration: number, vol: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const osc2 = type === 'sine' ? ctx.createOscillator() : null;
        const gain2 = osc2 ? ctx.createGain() : null;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        if (osc2 && gain2) {
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(freq * 2, startTime);
          gain2.gain.setValueAtTime(0, startTime);
          gain2.gain.linearRampToValueAtTime(vol * 0.3, startTime + 0.05);
          gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(startTime);
          osc2.stop(startTime + duration);
        }

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);

        setTimeout(() => {
          osc.disconnect();
          gain.disconnect();
          if (osc2) osc2.disconnect();
          if (gain2) gain2.disconnect();
        }, (duration + 0.5) * 1000);
      };

      const now = ctx.currentTime;

      // Elite Enterprise "Harmonic Bloom"
      playTone(1046.50, now, 0.7, 0.1, 'sine');        // C6 (Primary)
      playTone(1318.51, now + 0.08, 0.6, 0.07, 'sine'); // E6 (Bright)
      playTone(1567.98, now + 0.16, 0.5, 0.05, 'sine'); // G6 (High)
      playTone(523.25, now, 1.0, 0.04, 'sine');         // C5 (Warm Bed)
      playTone(2093.00, now + 0.24, 0.4, 0.03, 'sine');  // C7 (Airy finish)

    } catch (e) {
      console.warn('[alerts] Audio generation failed:', e);
    }
  }, [soundEnabled]);

  // Stable ref so callbacks don't recreate when soundEnabled changes
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const globalThresholdsEnabledRef = useRef(globalThresholdsEnabled);
  useEffect(() => { globalThresholdsEnabledRef.current = globalThresholdsEnabled; }, [globalThresholdsEnabled]);

  const globalOverboughtRef = useRef(globalOverbought);
  useEffect(() => { globalOverboughtRef.current = globalOverbought; }, [globalOverbought]);

  const globalOversoldRef = useRef(globalOversold);
  useEffect(() => { globalOversoldRef.current = globalOversold; }, [globalOversold]);

  const globalThresholdTimeframesRef = useRef(globalThresholdTimeframes);
  useEffect(() => { globalThresholdTimeframesRef.current = globalThresholdTimeframes; }, [globalThresholdTimeframes]);

  // ── Native notification ──
  const triggerNativeNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const currentExchange = (window as any).__priceEngine?.getExchange?.() ?? 'unknown';
    // Use exchange-aware tag to match Service Worker logic and prevent duplicates
    const tag = `rsiq-${currentExchange}-${title.replace(/\s+/g, '-').toLowerCase()}`;

    try {
      // Local notification (Foreground optimization)
      const notification = new Notification(title, {
        body,
        icon: '/logo/rsiq-pro-icon.png',
        badge: '/logo/rsiq-pro-icon.png',
        silent: false,
        renotify: true,
        tag,
        vibrate: [200, 100, 200, 100, 200], // Strong 5-pulse for trade urgency
        requireInteraction: false,
      } as any);
      setTimeout(() => notification.close(), 8000);
    } catch {
      // Notification constructor can fail on some mobile platforms (rely on SW)
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'ALERT_NOTIFICATION',
          payload: { title, body, icon: '/logo/rsiq-pro-icon.png', exchange: currentExchange },
        });
      } catch {
        // SW communication not available
      }
    }
  }, []);

  // ── Log alert to API ──
  const logAlert = useCallback(async (alert: Omit<Alert, 'id' | 'createdAt'>) => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });
      if (res.ok) {
        const saved = await res.json();
        const normalized = {
          ...saved,
          createdAt: typeof saved.createdAt === 'string' ? new Date(saved.createdAt).getTime() : saved.createdAt
        };
        setAlerts(prev => [normalized, ...prev].slice(0, 50));
      }
    } catch (e) {
      console.error('[alerts] Failed to log alert:', e);
    }
  }, []);

  // Stable refs for callbacks used inside the engine listener
  const logAlertRef = useRef(logAlert);
  useEffect(() => { logAlertRef.current = logAlert; }, [logAlert]);
  const playAlertSoundRef = useRef(playAlertSound);
  useEffect(() => { playAlertSoundRef.current = playAlertSound; }, [playAlertSound]);
  const triggerNativeRef = useRef(triggerNativeNotification);
  useEffect(() => { triggerNativeRef.current = triggerNativeNotification; }, [triggerNativeNotification]);

  // ── Gap 1: STABLE engine listener — mounts once, reads live data via refs ──
  // We attach the engine listener exactly ONCE (empty deps). All live values
  // are accessed via refs to avoid stale closures without ever re-attaching.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const engineInstance = (window as any).__priceEngine;
    if (!engineInstance) {
      // Engine not mounted yet (rare race) — retry after a short delay
      const retryTimer = setTimeout(() => {
        const eng = (window as any).__priceEngine;
        if (eng) attachListeners(eng);
      }, 500);
      return () => clearTimeout(retryTimer);
    }

    const cleanup = attachListeners(engineInstance);
    return cleanup;

    function attachListeners(eng: EventTarget) {
      // Get current exchange for alert context
      const getExchange = () => (window as any).__priceEngine?.getExchange?.() ?? 'binance';
      const handleBatchTicks = (e: Event) => {
        if (!enabledRef.current) return;
        const batch = (e as CustomEvent).detail as Map<string, any>;
        if (!batch || batch.size === 0) return;

        // Gap 7: O(1) lookup via ref-indexed map — no O(n) iteration
        batch.forEach((live, symbol) => {
          const entry = dataMapRef.current.get(symbol);
          if (!entry) return;

          const config = coinConfigsRef.current[symbol];
          const hasConfig = !!config;
          const globalEnabled = globalThresholdsEnabledRef.current;

          // Process if it has a manual alert config OR global mode is active
          if (!hasConfig && !globalEnabled) return;

          const r1mP = config?.rsi1mPeriod ?? 14;
          const r5mP = config?.rsi5mPeriod ?? 14;
          const r15mP = config?.rsi15mPeriod ?? 14;
          const r1hP = config?.rsi1hPeriod ?? 14;
          const obT = config?.overboughtThreshold ?? 70;
          const osT = config?.oversoldThreshold ?? 30;
          const globalObT = globalOverboughtRef.current;
          const globalOsT = globalOversoldRef.current;
          const confluenceMode = config?.alertConfluence ?? false;

          // Live RSI approximations
          let rsi1m = entry.rsi1m;
          let rsi5m = entry.rsi5m;
          let rsi15m = entry.rsi15m;
          let rsi1h = entry.rsi1h;
          let rsiCustom = entry.rsiCustom;

          if (entry.rsiState1m) rsi1m = approximateRsi(entry.rsiState1m, live.price, r1mP);
          if (entry.rsiState5m) rsi5m = approximateRsi(entry.rsiState5m, live.price, r5mP);
          if (entry.rsiState15m) rsi15m = approximateRsi(entry.rsiState15m, live.price, r15mP);
          if (entry.rsiState1h) rsi1h = approximateRsi(entry.rsiState1h, live.price, r1hP);
          if (entry.rsiStateCustom) rsiCustom = approximateRsi(entry.rsiStateCustom, live.price, entry.rsiPeriodAtCreation);

          let ema9 = entry.ema9;
          let ema21 = entry.ema21;
          let emaCross = entry.emaCross;
          let bbPosition = entry.bbPosition;

          if (ema9 !== null) ema9 = approximateEma(ema9, live.price, 9);
          if (ema21 !== null) ema21 = approximateEma(ema21, live.price, 21);
          if (ema9 !== null && ema21 !== null) emaCross = ema9 > ema21 ? 'bullish' : 'bearish';

          if (entry.bbUpper !== null && entry.bbLower !== null) {
            const range = entry.bbUpper - entry.bbLower;
            if (range > 0) bbPosition = (live.price - entry.bbLower) / range;
          }

          const hysteresis = computeHysteresis(obT, osT);
          const timeframes = [
            { key: 'rsi1m', label: '1m', val: rsi1m, configKey: 'alertOn1m' },
            { key: 'rsi5m', label: '5m', val: rsi5m, configKey: 'alertOn5m' },
            { key: 'rsi15m', label: '15m', val: rsi15m, configKey: 'alertOn15m' },
            { key: 'rsi1h', label: '1h', val: rsi1h, configKey: 'alertOn1h' },
            { key: 'rsiCustom', label: 'Custom', val: rsiCustom, configKey: 'alertOnCustom' }
          ];

          // ── Phase 1: Determine zones (State-First Hysteresis) ──
          const currentZones = new Map<string, 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT'>();
          timeframes.forEach(({ label, val }) => {
            if (val === null || val === undefined) return;
            const stateKey = `${symbol}-${label}`;
            // Gap 8: undefined = uninitialized, treat same as NEUTRAL for zone calc
            const previousZone = (zoneState.current.get(stateKey) ?? 'NEUTRAL') as 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT';
            const isInverted = obT < osT;
            let zone: 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT' = 'NEUTRAL';

            const NEAR_BUFFER = 0.3; // Allow "near" reach alerts

            if (previousZone === 'OVERSOLD') {
              zone = isInverted
                ? (val < osT - hysteresis ? 'NEUTRAL' : 'OVERSOLD')
                : (val > osT + hysteresis ? 'NEUTRAL' : 'OVERSOLD');
            } else if (previousZone === 'OVERBOUGHT') {
              zone = isInverted
                ? (val > obT + hysteresis ? 'NEUTRAL' : 'OVERBOUGHT')
                : (val < obT - hysteresis ? 'NEUTRAL' : 'OVERBOUGHT');
            } else {
              if (isInverted) {
                // Inverted reach: "Very near or reach"
                if (val >= osT - NEAR_BUFFER) zone = 'OVERSOLD';
                else if (val <= obT + NEAR_BUFFER) zone = 'OVERBOUGHT';
              } else {
                // Normal reach: "Very near or reach"
                if (val <= osT + NEAR_BUFFER) zone = 'OVERSOLD';
                else if (val >= obT - NEAR_BUFFER) zone = 'OVERBOUGHT';
              }
            }

            // ── Phase 1.5: Global Extreme Threshold Override ──
            if (globalEnabled) {
              const globalHysteresis = computeHysteresis(globalObT, globalOsT);
              const isGlobalInverted = globalObT < globalOsT;
              
              if (previousZone === 'OVERSOLD' && zone === 'NEUTRAL') {
                 const stillExtreme = isGlobalInverted ? val >= globalOsT - globalHysteresis : val <= globalOsT + globalHysteresis;
                 if (stillExtreme) zone = 'OVERSOLD';
              } else if (previousZone === 'OVERBOUGHT' && zone === 'NEUTRAL') {
                 const stillExtreme = isGlobalInverted ? val <= globalObT + globalHysteresis : val >= globalObT - globalHysteresis;
                 if (stillExtreme) zone = 'OVERBOUGHT';
              } else if (zone === 'NEUTRAL') {
                 if (isGlobalInverted ? val >= globalOsT : val <= globalOsT) zone = 'OVERSOLD';
                 else if (isGlobalInverted ? val <= globalObT : val >= globalObT) zone = 'OVERBOUGHT';
              }
            }

            currentZones.set(label, zone);
          });

          // ── Phase 2: Fire RSI alerts ──
          timeframes.forEach(({ label, val, configKey }) => {
            const hasManualAlert = config?.[configKey as keyof typeof config] === true;
            const globalEnabled = globalThresholdsEnabledRef.current;
            
            // Allow alert if manually enabled OR if global extreme mode is on
            if (!hasManualAlert && !globalEnabled) return;

            const currentZone = currentZones.get(label);
            if (!currentZone || currentZone === 'NEUTRAL') {
              zoneState.current.set(`${symbol}-${label}`, 'NEUTRAL');
              return;
            }

            const stateKey = `${symbol}-${label}`;
            const previousZone = zoneState.current.get(stateKey);

            let hasConfluence = true;
            if (confluenceMode) {
              hasConfluence = timeframes
                .filter(tf => tf.label !== label && config[tf.configKey as keyof typeof config])
                .some(tf => currentZones.get(tf.label) === currentZone);
            }

            // Allow "cold-start" alerts if the config was updated in the last 15 seconds
            const recentlyUpdated = (configLastUpdated.current.get(symbol) || 0) > Date.now() - 15000;
            const isFirstSeen = previousZone === undefined || previousZone === 'NEUTRAL';
            const justEntered = isFirstSeen; // currentZone is guaranteed to be OVERSOLD or OVERBOUGHT here

            // Determine if this specific TF-Symbol hit a global threshold
            let isGlobalHit = false;
            if (globalEnabled && globalThresholdTimeframesRef.current.includes(label)) {
              if (currentZone === 'OVERSOLD') {
                isGlobalHit = (globalOverboughtRef.current < globalOversoldRef.current) ? (val as number) >= globalOsT : (val as number) <= globalOsT;
              } else {
                isGlobalHit = (globalOverboughtRef.current < globalOversoldRef.current) ? (val as number) <= globalObT : (val as number) >= globalObT;
              }
            }

            const shouldNotify = hasManualAlert || isGlobalHit;

            if (justEntered && (previousZone !== undefined || recentlyUpdated) && hasConfluence && shouldNotify) {
              const alertKey = `${symbol}-${label}`;
              const now = Date.now();
              if (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS) {
                lastTriggered.current.set(alertKey, now);
                const val = timeframes.find(t => t.label === label)?.val ?? 0;
                const formattedExchange = getExchange().charAt(0).toUpperCase() + getExchange().slice(1);
                const zoneLabel = currentZone === 'OVERSOLD' ? 'BUY' : 'SELL';
                const isGlobalAlert = isGlobalHit && !hasManualAlert;
                const priceStr = formatPrice(live.price);

                if (document.visibilityState === 'visible') {
                  toast[currentZone === 'OVERSOLD' ? 'success' : 'error'](
                    `${getSymbolAlias(symbol)} ${label} RSI ${currentZone}${isGlobalAlert ? ' [Global]' : ''}`,
                    { duration: 8000, description: `RSI: ${(val as number).toFixed(1)} @ $${priceStr} [${formattedExchange}]` }
                  );
                }
                playAlertSoundRef.current();
                logAlertRef.current({ symbol, exchange: getExchange(), timeframe: label, value: val as number, type: currentZone as Alert['type'] });
                
                triggerNativeRef.current(
                  `${getSymbolAlias(symbol)} ${zoneLabel}${isGlobalAlert ? ' (Global)' : ''}`,
                  `[${formattedExchange}] ${label} RSI reached ${(val as number).toFixed(1)} @ $${priceStr}`
                );
              }
            }
            zoneState.current.set(stateKey, currentZone);
          });

          // ── Phase 3: Strategy Shift Alerts ──
          if (config.alertOnStrategyShift) {
            const stratKey = `${symbol}-STRAT`;
            const prevStrat = zoneState.current.get(stratKey); // undefined on first tick

            const liveStrategy = computeStrategyScore({
              rsi1m, rsi5m, rsi15m, rsi1h,
              macdHistogram: entry.macdHistogram,
              bbPosition,
              stochK: entry.stochK,
              stochD: entry.stochD,
              emaCross,
              vwapDiff: entry.vwapDiff,
              volumeSpike: entry.volumeSpike,
              price: live.price,
              confluence: entry.confluence,
              rsiDivergence: entry.rsiDivergence,
              momentum: entry.momentum,
            });

            const currentStrat = liveStrategy.signal;

            // Gap 8: skip on uninitialized state
            if (prevStrat !== undefined && prevStrat !== currentStrat &&
              (currentStrat === 'strong-buy' || currentStrat === 'strong-sell')) {
              // Gap 2: unified key `${symbol}-STRAT`  
              const alertKey = `${symbol}-STRAT`;
              const now = Date.now();
              if (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS) {
                lastTriggered.current.set(alertKey, now);
                const isBuy = currentStrat === 'strong-buy';
                const priceStr = formatPrice(live.price);
                if (document.visibilityState === 'visible') {
                  toast[isBuy ? 'success' : 'error'](
                    `${getSymbolAlias(symbol)} → ${isBuy ? '🟢 STRONG BUY' : '🔴 STRONG SELL'}`,
                    { duration: 8000, description: `Strategy Score: ${liveStrategy.score.toFixed(0)} @ $${priceStr}` }
                  );
                }
                playAlertSoundRef.current();
                logAlertRef.current({
                  symbol,
                  exchange: getExchange(),
                  timeframe: 'STRATEGY',
                  value: liveStrategy.score,
                  type: liveStrategy.signal === 'strong-buy' ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL',
                });

                const formattedExchange = getExchange().charAt(0).toUpperCase() + getExchange().slice(1);
                // isBuy and priceStr are already defined above
                
                triggerNativeRef.current(
                  `${getSymbolAlias(symbol)} ${isBuy ? 'Strong Buy' : 'Strong Sell'}`,
                  `[${formattedExchange}] Strategy shift detected. Score: ${liveStrategy.score.toFixed(0)} @ $${priceStr}`
                );
              }
            }
            zoneState.current.set(stratKey, currentStrat);
          }
        });
      };

      // ── Phase 4: Worker-triggered alerts (Instant Response) ──
      // The worker already evaluated zones and sent ALERT_TRIGGERED. We just need to
      // present the alert and log it. Cooldown key uses bare symbol-timeframe to match
      // the worker's key format and prevent the batch evaluator from re-firing.
      const handleWorkerAlert = (e: Event) => {
        if (!enabledRef.current) return;
        const payload = (e as CustomEvent).detail;
        const { symbol, exchange, timeframe, value, type } = payload;

        const config = coinConfigsRef.current[symbol];
        if (!config) return;

        // Unified cooldown key: bare symbol-timeframe (matches worker + batch evaluator)
        const alertKey = `${symbol}-${timeframe === 'STRATEGY' ? 'STRAT' : timeframe}`;
        const now = Date.now();
        if (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS) {
          // Set cooldown for BOTH this handler AND the batch evaluator
          lastTriggered.current.set(alertKey, now);

          const isStrat = timeframe === 'STRATEGY';
          const alias = getSymbolAlias(symbol);
          const exchangeLabel = exchange ? ` [${exchange.charAt(0).toUpperCase() + exchange.slice(1)}]` : '';
          const priceStr = payload.price ? formatPrice(payload.price) : '';
          const title = isStrat
            ? `${alias}${exchangeLabel} → ${type === 'STRATEGY_STRONG_BUY' ? '🟢 STRONG BUY' : '🔴 STRONG SELL'}`
            : `${alias}${exchangeLabel} ${timeframe} RSI ${type}`;
          const desc = isStrat
            ? `Strategy Score: ${value.toFixed(0)} ${priceStr ? `@ $${priceStr}` : ''}`
            : `RSI: ${value.toFixed(1)} ${priceStr ? `@ $${priceStr}` : ''}`;

          if (document.visibilityState === 'visible') {
            toast[type === 'OVERSOLD' || type === 'STRATEGY_STRONG_BUY' ? 'success' : 'error'](
              title,
              { duration: 8000, description: desc }
            );
          }

          playAlertSoundRef.current();
          logAlertRef.current({ symbol, exchange, timeframe, value, type: type as Alert['type'] });
          triggerNativeRef.current(title, desc);
        }
      };

      eng.addEventListener('ticks', handleBatchTicks);
      eng.addEventListener('alert', handleWorkerAlert);
      return () => {
        eng.removeEventListener('ticks', handleBatchTicks);
        eng.removeEventListener('alert', handleWorkerAlert);
      };
    }
  }, []); // Gap 1: empty deps — attaches once, uses refs for live values

  // ── Reset alert zone states when exchange changes ──
  // Prevents cross-exchange false alerts (e.g., Binance RSI zone bleeding into Bybit)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const engineInstance = (window as any).__priceEngine;
    if (!engineInstance) return;

    const handleExchangeChange = () => {
      zoneState.current.clear();
      lastTriggered.current.clear();
    };

    engineInstance.addEventListener('exchange-changed', handleExchangeChange);
    return () => {
      engineInstance.removeEventListener('exchange-changed', handleExchangeChange);
    };
  }, []);

  // (Removed: duplicate fetch('/api/alerts') — already handled at lines 46-59)

  // ── Test alert ──
  const triggerTestAlert = useCallback(async () => {
    await resumeAudioContext();
    toast.success("RSIQ Enterprise: Flow Test", {
      description: "Verifying your personalized high-fidelity alert pipeline."
    });
    playAlertSound();
    triggerNativeNotification("RSIQ PRO Test", "Enterprise alert delivery is active!");
  }, [resumeAudioContext, playAlertSound, triggerNativeNotification]);

  // ── Clear history ──
  const clearAlertHistory = useCallback(async () => {
    await resumeAudioContext();
    try {
      const res = await fetch('/api/alerts', { method: 'DELETE' });
      if (res.ok) {
        setAlerts([]);
        toast.success("Alert history purged.");
      }
    } catch (e) {
      console.error('[alerts] Clear history failed:', e);
    }
  }, [resumeAudioContext]);

  return { alerts, setAlerts, triggerTestAlert, clearAlertHistory, resumeAudioContext };
}
