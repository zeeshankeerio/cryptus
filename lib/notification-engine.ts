import { toast } from 'sonner';
import { getAlertBehavior, type AlertPriority } from './alert-priority';

// Deduplication map: symbol-type -> timestamp
const dedupeMap = new Map<string, number>();
const DEDUPE_MS = 15000;

export interface NotificationOptions {
  title: string;
  body: string;
  symbol: string;
  exchange?: string;
  priority: AlertPriority;
  type: string; // 'rsi' | 'whale' | 'liquidation'
  icon?: string;
  value?: number;
  price?: number;
}

/**
 * Institutional Notification Engine
 * Unifies UI Toasts, Audio Alerts, Vibrations, and Native Background Push.
 */
class NotificationEngine {
  private audioCtx: AudioContext | null = null;
  private syncChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.syncChannel = new BroadcastChannel('rsiq-alerts');
    }
  }

  private async triggerNative(title: string, body: string, priority: string) {
    if (typeof window === 'undefined') return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
      // Institutional approach: Use Service Worker for reliability if possible
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          registration.showNotification(title, {
            body,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            tag: 'rsiq-alert',
            renotify: true,
            vibrate: priority === 'critical' ? [200, 100, 200, 100, 400] : [100, 50, 100],
            data: { url: window.location.href }
          } as any);
          return;
        }
      } catch (e) {
        console.warn('[notification-engine] SW Notification failed, falling back to legacy:', e);
      }

      // Legacy fallback (standard browser)
      new Notification(title, { 
        body,
        icon: '/favicon.ico',
        tag: 'rsiq-alert',
        renotify: true
      } as any);
    }
  }

  setAudioContext(ctx: AudioContext) {
    this.audioCtx = ctx;
  }

  /**
   * Dispatches a multi-channel notification (Toast + Sound + Native)
   */
  async notify(options: NotificationOptions) {
    const { title, body, symbol, priority, type, exchange } = options;
    const now = Date.now();
    const dedupeKey = `${symbol}:${type}`;

    // 1. Deduplication
    const lastSeen = dedupeMap.get(dedupeKey) || 0;
    if (now - lastSeen < DEDUPE_MS) return;
    dedupeMap.set(dedupeKey, now);

    // 2. Behavior Resolution
    const behavior = getAlertBehavior(priority);

    // 3. UI Toast (Only if foregrounded)
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const toastType = this.getToastType(options.type, options.body);
      toast[toastType](title, {
        description: body,
        duration: behavior.toastDuration,
      });
    }

    // 4. Alert Sound (Foreground Logic)
    // AudioContext usually resumes on interaction, but we try anyway.
    if (this.audioCtx) {
       this.playAlertSound(priority);
    }

    // 5. Native / Service Worker Bridge
    // This is the critical piece for mobile "Gaps."
    // We send to SW even if visible, because user might not be looking.
    if (this.syncChannel) {
      this.syncChannel.postMessage({
        type: 'ALERT_NOTIFICATION',
        payload: {
          title,
          body,
          priority,
          exchange,
          type: options.type,
          timestamp: now
        }
      });
    }

    // 6. Server-Side Logging (Asynchronous)
    this.logToServer(options);
  }

  private getToastType(type: string, body: string): 'success' | 'error' | 'info' {
    if (type === 'whale' && body.toLowerCase().includes('buy')) return 'success';
    if (type === 'whale' && body.toLowerCase().includes('sell')) return 'error';
    if (type === 'liquidation' && body.toLowerCase().includes('long')) return 'error';
    if (type === 'liquidation' && body.toLowerCase().includes('short')) return 'success';
    if (type === 'rsi' && body.toLowerCase().includes('oversold')) return 'success';
    if (type === 'rsi' && body.toLowerCase().includes('overbought')) return 'error';
    return 'info';
  }

  private async playAlertSound(priority: AlertPriority) {
    if (!this.audioCtx || this.audioCtx.state === 'suspended') return;

    try {
      const behavior = getAlertBehavior(priority);
      const frequency = this.getFrequencyForSound(behavior.sound);
      
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = priority === 'critical' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
      
      gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, this.audioCtx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.6);

      // Critical alerts get a double beep
      if (priority === 'critical' || priority === 'high') {
         setTimeout(() => this.playAlertSound('medium'), 200);
      }
    } catch (e) {
      console.warn('[NotificationEngine] Audio playback failed', e);
    }
  }

  private getFrequencyForSound(sound: string): number {
    switch (sound) {
      case 'soft': return 440; // A4
      case 'urgent': return 880; // A5
      case 'bell': return 660; // E5
      case 'ping': return 1000;
      default: return 550;
    }
  }

  private async logToServer(options: NotificationOptions) {
    try {
      // Background logging for institutional auditing
      fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: options.symbol,
          exchange: options.exchange || 'binance',
          timeframe: options.type === 'rsi' ? '15m' : 'event',
          value: options.value || 0,
          price: options.price || 0,
          type: options.type.toUpperCase(),
          priority: options.priority
        })
      });
    } catch (e) {
      // Silent fail for logging
    }
  }
}

export const notificationEngine = new NotificationEngine();
