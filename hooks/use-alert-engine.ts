import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { BinanceTicker, ScreenerEntry } from '@/lib/types';
import { approximateRsi, approximateEma } from '@/lib/rsi';
import { computeStrategyScore } from '@/lib/indicators';

// Import the engine singleton to subscribe to ticks
// This allows background processing even if the main dashboard is idle.
let engine: any;
if (typeof window !== 'undefined') {
  // We'll import it dynamically or assume it's available in global scope if we can't easily resolve the circular ref
  // but better to just use the EventTarget instance if we can get it.
}

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export interface Alert {
  id: string;
  symbol: string;
  timeframe: string;
  value: number;
  type: 'OVERSOLD' | 'OVERBOUGHT' | 'STRATEGY_STRONG_BUY' | 'STRATEGY_STRONG_SELL';
  createdAt: number;
}

// ── Cooldown: 3 minutes per symbol-timeframe (NOT per zone) ──
const COOLDOWN_MS = 3 * 60 * 1000;

/**
 * Dynamic hysteresis: prevents rapid zone-flipping when thresholds are close.
 * Returns the number of RSI points to add as a "dead zone" buffer.
 *   - When OB=70, OS=30 → gap=40 → hysteresis = max(2, 40*0.15) = 6
 *   - When OB=40, OS=40 → gap=0  → hysteresis = max(2, 0*0.15) = 2
 *   - When OB=50, OS=45 → gap=5  → hysteresis = max(2, 5*0.15) = 2
 */
function computeHysteresis(overboughtThreshold: number, oversoldThreshold: number): number {
  const gap = Math.max(0, overboughtThreshold - oversoldThreshold);
  return Math.max(2, gap * 0.15);
}

export function useAlertEngine(
  data: any[],
  coinConfigs: Record<string, any>,
  enabled: boolean,
  soundEnabled: boolean
) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
// Store the last known zone: 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT' | string (for strategy)
  const zoneState = useRef<Map<string, string>>(new Map());
  // Anti-dancing cooldown — keyed by symbol-timeframe (not zone)
  const lastTriggered = useRef<Map<string, number>>(new Map());

  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Audio: resume context (called on user gesture from dashboard) ──
  const resumeAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      console.log("[alerts] AudioContext active:", audioCtxRef.current.state);
    } catch (e) {
      console.error("[alerts] Failed to resume audio:", e);
    }
  }, []);

  // ── Audio: Play enterprise chime (with background fallback) ──
  const playAlertSound = useCallback(async () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;

      // Always try to resume — critical for background tabs
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      if (ctx.state !== 'running') {
        // AudioContext is blocked (e.g., mobile background) — 
        // rely on native Notification sound (silent: false) as fallback
        console.warn('[alerts] AudioContext not running, relying on notification sound');
        return;
      }

      const playTone = (freq: number, startTime: number, duration: number, vol: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

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
        }, (duration + 0.5) * 1000);
      };

      const now = ctx.currentTime;

      // Enterprise "Harmonic Bloom" Chime
      playTone(1046.50, now, 0.6, 0.12, 'sine');       // C6
      playTone(1318.51, now + 0.05, 0.5, 0.08, 'sine'); // E6
      playTone(1567.98, now + 0.1, 0.4, 0.06, 'sine');  // G6
      playTone(523.25, now, 0.8, 0.05, 'sine');          // C5 soft bed

    } catch (e) {
      console.warn('[alerts] Audio generation failed:', e);
    }
  }, [soundEnabled]);

  // ── Native notification (with sound for background mobile) ──
  const triggerNativeNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      // Use silent: false so mobile plays system notification sound
      // even when AudioContext is suspended in background
      const notification = new Notification(title, {
        body,
        icon: '/logo/mindscape-analytics.png',
        badge: '/logo/rsiq-pro-icon.png',
        silent: false, // CRITICAL: allow system sound for background mobile
        requireInteraction: false,
        tag: `rsiq-${title.replace(/\s+/g, '-').toLowerCase()}`,
      });

      // Auto-close after 8s
      setTimeout(() => notification.close(), 8000);
    } catch {
      // Notification constructor can fail in some environments
    }

    // Also try Service Worker notification for true background delivery
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'ALERT_NOTIFICATION',
          payload: { title, body, icon: '/logo/mindscape-analytics.png' },
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

  // ── Core alert evaluation loop (Refactored to Event-Driven) ──
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Use the engine instance (we'll need to export it properly or import it here)
    // For now, we'll listen on the global 'engine' if it's available or use the CustomEvent pattern
    const handleBatchTicks = (e: Event) => {
      if (!enabled) return;
      const batch = (e as CustomEvent).detail as Map<string, any>;
      if (!batch || batch.size === 0) return;

      // Process entire data set (even non-visible ones) against the batch
      data.forEach(entry => {
        const live = batch.get(entry.symbol);
        if (!live) return;

        const config = coinConfigs[entry.symbol];
        if (!config) return;

        const r1mP = config?.rsi1mPeriod ?? 14;
        const r5mP = config?.rsi5mPeriod ?? 14;
        const r15mP = config?.rsi15mPeriod ?? 14;
        const r1hP = config?.rsi1hPeriod ?? 14;
        const obT = config?.overboughtThreshold ?? 70;
        const osT = config?.oversoldThreshold ?? 30;
        const confluenceMode = config?.alertConfluence ?? false;

        // Dynamic RSI and indicator approximations for alert detection
        let rsi1m = entry.rsi1m;
        let rsi5m = entry.rsi5m;
        let rsi15m = entry.rsi15m;
        let rsi1h = entry.rsi1h;
        let rsiCustom = entry.rsiCustom;
        
        let ema9 = entry.ema9;
        let ema21 = entry.ema21;
        let emaCross = entry.emaCross;
        let bbPosition = entry.bbPosition;

        if (entry.rsiState1m) rsi1m = approximateRsi(entry.rsiState1m, live.price, r1mP);
        if (entry.rsiState5m) rsi5m = approximateRsi(entry.rsiState5m, live.price, r5mP);
        if (entry.rsiState15m) rsi15m = approximateRsi(entry.rsiState15m, live.price, r15mP);
        if (entry.rsiState1h) rsi1h = approximateRsi(entry.rsiState1h, live.price, r1hP);
        if (entry.rsiStateCustom) rsiCustom = approximateRsi(entry.rsiStateCustom, live.price, entry.rsiPeriodAtCreation);

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

        // ── Phase 1: Determine zones ──
        const currentZones = new Map<string, 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT'>();
        timeframes.forEach(({ label, val }) => {
          if (val === null || val === undefined) return;
          const stateKey = `${entry.symbol}-${label}`;
          const previousZone = zoneState.current.get(stateKey);
          let zone: 'NEUTRAL' | 'OVERSOLD' | 'OVERBOUGHT' = 'NEUTRAL';

          if (val <= osT) zone = 'OVERSOLD';
          else if (val >= obT) zone = 'OVERBOUGHT';
          else if (previousZone === 'OVERSOLD' && val < osT + hysteresis) zone = 'OVERSOLD';
          else if (previousZone === 'OVERBOUGHT' && val > obT - hysteresis) zone = 'OVERBOUGHT';

          currentZones.set(label, zone);
        });

        // ── Phase 2: Fire RSI alerts ──
        timeframes.forEach(({ label, configKey }) => {
          if (config[configKey as keyof typeof config] !== true) return;

          const currentZone = currentZones.get(label);
          if (!currentZone || currentZone === 'NEUTRAL') {
            zoneState.current.set(`${entry.symbol}-${label}`, 'NEUTRAL');
            return;
          }

          const stateKey = `${entry.symbol}-${label}`;
          const previousZone = zoneState.current.get(stateKey);

          let hasConfluence = true;
          if (confluenceMode) {
            hasConfluence = timeframes
              .filter(tf => tf.label !== label && config[tf.configKey as keyof typeof config])
              .some(tf => currentZones.get(tf.label) === currentZone);
          }

          if (previousZone !== undefined && previousZone !== currentZone && hasConfluence) {
            const alertKey = `${entry.symbol}-${label}`;
            const now = Date.now();
            if (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS) {
              lastTriggered.current.set(alertKey, now);
              const val = timeframes.find(t => t.label === label)?.val || 0;
              
              toast[currentZone === 'OVERSOLD' ? 'success' : 'error'](
                `${entry.symbol} ${label} RSI is ${currentZone} [${val.toFixed(1)}]`,
                { duration: 6000 }
              );
              playAlertSound();
              logAlert({ symbol: entry.symbol, timeframe: label, value: val, type: currentZone as Alert['type'] });
              triggerNativeNotification(`${entry.symbol} ${currentZone}`, `${label} RSI reached ${val.toFixed(1)}`);
            }
          }
          zoneState.current.set(stateKey, currentZone);
        });

        // ── Phase 3: Strategy Shift Alerts ──
        if (config.alertOnStrategyShift) {
          const stratKey = `${entry.symbol}-STRATEGY`;
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
          const prevStrat = zoneState.current.get(stratKey);

          if (prevStrat !== undefined && prevStrat !== currentStrat) {
            if (currentStrat === 'strong-buy' || currentStrat === 'strong-sell') {
              const alertKey = `${entry.symbol}-STRAT`;
              const now = Date.now();
              if (now - (lastTriggered.current.get(alertKey) || 0) > COOLDOWN_MS) {
                lastTriggered.current.set(alertKey, now);
                const isBuy = currentStrat === 'strong-buy';
                toast[isBuy ? 'success' : 'error'](`${entry.symbol} shifted to ${isBuy ? 'STRONG BUY' : 'STRONG SELL'}`, {
                    duration: 6000,
                    description: `Score: ${liveStrategy.score.toFixed(0)}`
                });
                playAlertSound();
                logAlert({ symbol: entry.symbol, timeframe: 'STRAT', value: liveStrategy.score, type: isBuy ? 'STRATEGY_STRONG_BUY' : 'STRATEGY_STRONG_SELL' });
                triggerNativeNotification(`${entry.symbol} ${isBuy ? 'Strong Buy' : 'Strong Sell'}`, `Strategy shift detected.`);
              }
            }
          }
          zoneState.current.set(stratKey, currentStrat);
        }
      });
    };

    // Use a global listener or find the engine from window
    // @ts-ignore
    const engineInstance = window.__priceEngine;
    if (engineInstance) {
      engineInstance.addEventListener('ticks', handleBatchTicks);
      return () => engineInstance.removeEventListener('ticks', handleBatchTicks);
    }
  }, [data, coinConfigs, enabled, logAlert, playAlertSound, triggerNativeNotification]);

  // ── Fetch alert history on mount ──
  useEffect(() => {
    fetch('/api/alerts')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAlerts(data);
      })
      .catch(e => console.error('[alerts] History fetch failed:', e));
  }, []);

  // ── Test alert ──
  const triggerTestAlert = useCallback(() => {
    toast.success("RSIQ Enterprise: Flow Test", {
      description: "Verifying your personalized high-fidelity alert pipeline."
    });
    playAlertSound();
    triggerNativeNotification("RSIQ PRO Test", "Enterprise alert delivery is active!");
  }, [playAlertSound, triggerNativeNotification]);

  // ── Clear history ──
  const clearAlertHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts', { method: 'DELETE' });
      if (res.ok) {
        setAlerts([]);
        toast.success("Alert history purged.");
      }
    } catch (e) {
      console.error('[alerts] Clear history failed:', e);
    }
  }, []);

  return { alerts, setAlerts, triggerTestAlert, clearAlertHistory, resumeAudioContext };
}
