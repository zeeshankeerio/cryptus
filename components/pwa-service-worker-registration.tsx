"use client";

import { useEffect } from 'react';
import { toast } from 'sonner';

export function PWAServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker not supported');
      return;
    }

    let updateCheckInterval: ReturnType<typeof setInterval> | null = null;
    let registration: ServiceWorkerRegistration | null = null;

    const registerServiceWorker = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Force fetch of SW on every page load
        });

        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates every 10 minutes
        updateCheckInterval = setInterval(async () => {
          try {
            await registration?.update();
            console.log('[PWA] Checked for SW updates');
          } catch (error) {
            console.error('[PWA] Failed to check for updates:', error);
          }
        }, 10 * 60 * 1000);

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration!.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New service worker is ready but not activated
              console.log('[PWA] New service worker available');
              
              // Notify user of update
              toast.info('App update available. Refresh to apply.', {
                duration: 5000,
                action: {
                  label: 'Refresh',
                  onClick: () => window.location.reload(),
                },
              });

              // Post message to activate worker on next reload
              if (newWorker.state === 'installed') {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            }
          });
        });

        // Handle controller change (new SW activated)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            console.log('[PWA] New service worker activated, reloading page');
            // Force reload to apply the new Service Worker logic immediately
            window.location.reload();
          }
        });
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    };

    // Register on mount
    registerServiceWorker();

    // Clean up interval on unmount
    return () => {
      if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
      }
    };
  }, []);

  return null;
}
