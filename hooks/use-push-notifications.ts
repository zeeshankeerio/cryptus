import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export type PushStatus = 'idle' | 'loading' | 'active' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('idle');

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const checkSubscription = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (Notification.permission === 'denied') {
        setStatus('denied');
      } else if (subscription) {
        setStatus('active');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.error('[usePush] Check failed:', err);
      setStatus('idle');
    }
  };

  useEffect(() => {
    checkSubscription();
    
    // ── Periodic Background Sync Registration (2026) ──
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (registration: any) => {
        if ('periodicSync' in registration) {
          try {
            await registration.periodicSync.register('rsiq-freshness-sync', {
              minInterval: 60 * 60 * 1000, // 1 hour
            });
            console.log('[usePush] Periodic Sync registered: rsiq-freshness-sync');
          } catch (e) {
            console.warn('[usePush] Periodic Sync regi failed:', e);
          }
        }
      });
    }
  }, []);

  const subscribe = async () => {
    setStatus('loading');
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      
      if (permission !== 'granted') {
        setStatus('denied');
        toast.error("Notification permission denied.", {
          description: "Please enable notifications in your browser settings to use 24/7 alerts."
        });
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("VAPID Public Key missing in environment.");
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      const res = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription }),
      });

      if (res.ok) {
        setStatus('active');
        toast.success("24/7 Background Alerts activated!", {
          description: "RSIQ Pro will now wake your device even if the app is closed."
        });
      } else {
        throw new Error("Failed to save subscription on server.");
      }
    } catch (err) {
      console.error('[usePush] Subscribe error:', err);
      setStatus('idle');
      toast.error("Cloud Sync Failed", {
        description: "Could not activate persistent alerts. Please try again."
      });
    }
  };

  const unsubscribe = async () => {
    setStatus('loading');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await fetch('/api/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      
      setStatus('idle');
      toast.info("24/7 Background Alerts disabled.");
    } catch (err) {
      console.error('[usePush] Unsubscribe error:', err);
      setStatus('active'); // Revert to active if it failed
      toast.error("Failed to disable alerts cleanly.");
    }
  };

  const toggle = async () => {
    if (status === 'active') {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return {
    status,
    toggle,
    checkSubscription,
    isSupported: status !== 'unsupported',
    isActive: status === 'active',
    isLoading: status === 'loading'
  };
}
