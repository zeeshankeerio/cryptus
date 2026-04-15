// @ts-nocheck
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const LIVE_NOTIFICATION_DEDUPE_MS = 15000;
const notificationDedupe = new Map<string, number>();

// ── SERVICE WORKER LIFECYCLE ──
self.addEventListener('install', () => {
  self.skipWaiting(); // Force activate new worker instantly
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // Take control of all tabs immediately
});

// Force live APIs to always hit network and bypass runtime caches.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/api/')) return;

  event.respondWith(fetch(req, { cache: 'no-store' }));
});

// ── BULLETPROOF GLOBAL POLYFILLS FOR NEXT.JS SWC BUG ──
// SWC emits _async_to_generator and _ts_generator helper calls in the service
// worker bundle but doesn't include their definitions. We polyfill both globally
// so Workbox plugins (cacheWillUpdate etc.) work correctly.
(function(global) {
  // Polyfill: _async_to_generator
  if (typeof global._async_to_generator === 'undefined') {
    global._async_to_generator = function (fn) {
      return function () {
        var gen = fn.apply(this, arguments);
        return new Promise(function (resolve, reject) {
          function step(key, arg) {
            try {
              var info = gen[key](arg);
              var value = info.value;
            } catch (error) {
              reject(error);
              return;
            }
            if (info.done) {
              resolve(value);
            } else {
              return Promise.resolve(value).then(function (value) {
                step("next", value);
              }, function (err) {
                step("throw", err);
              });
            }
          }
          return step("next");
        });
      };
    };
  }

  // Polyfill: _ts_generator (TypeScript generator helper)
  if (typeof global._ts_generator === 'undefined') {
    global._ts_generator = function (thisArg, body) {
      var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
      return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
      function verb(n) { return function (v) { return step([n, v]); }; }
      function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
          if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
          if (y = 0, t) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0: case 1: t = op; break;
            case 4: _.label++; return { value: op[1], done: false };
            case 5: _.label++; y = op[1]; op = [0]; continue;
            case 7: op = _.ops.pop(); _.trys.pop(); continue;
            default:
              if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
              if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
              if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
              if (t[2]) _.ops.pop();
              _.trys.pop(); continue;
          }
          op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
      }
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

// Type helpers for the compiler
declare const _async_to_generator: any;
declare const _ts_generator: any;

// To disable all workbox logging during development
self.__WB_DISABLE_DEV_LOGS = true;

// Helper to show native background notification through Service Worker Registration
// This is explicitly required by Android Chrome for installed PWAs
const showNativeNotification = (payload: any) => {
  const { title, body, icon, exchange } = payload;
  const dedupeKey = `${exchange || 'unknown'}:${title}:${body}`;
  const now = Date.now();
  const lastSeen = notificationDedupe.get(dedupeKey) ?? 0;

  // Prevent duplicate delivery when the same event arrives from push + broadcast + postMessage.
  if (now - lastSeen < LIVE_NOTIFICATION_DEDUPE_MS) {
    return Promise.resolve();
  }
  notificationDedupe.set(dedupeKey, now);

  if (notificationDedupe.size > 500) {
    for (const [key, ts] of notificationDedupe) {
      if (now - ts > LIVE_NOTIFICATION_DEDUPE_MS * 4) {
        notificationDedupe.delete(key);
      }
    }
  }

  // Use exchange-aware tag to prevent notification collision across exchanges
  const tag = `rsiq-${(exchange || 'unknown')}-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return self.registration.showNotification(title, {
    body,
    icon: icon || '/logo/rsiq-pro-icon.png',
    badge: '/logo/rsiq-pro-icon.png',
    silent: false,
    requireInteraction: true, // Keep on screen for trade urgency on mobile
    renotify: true, // Ensure sound/vibration fires for every alert even if one is active
    tag,
    vibrate: [200, 100, 200, 100, 300, 100, 400], // More distinct 2026 urgency pattern
    data: { exchange, url: '/terminal' },
    actions: [
      { action: 'open', title: 'Open Terminal' }
    ]
  });
};

// Listen for messages from the main thread (Foreground/UI fallback)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ALERT_NOTIFICATION') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        const isAppVisible = clients.some((c: any) => c.visibilityState === 'visible');
        if (isAppVisible) return; // Frontend handles local notification when visible
        
        // 2026 Android Chrome Fix: Show notification if requested via postMessage and tab is backgrounded.
        // This serves as a bulletproof fallback for the synthesized AudioContext which
        // frequently suspends on mobile after long periods of inactivity.
        return showNativeNotification(event.data.payload);
      })
    );
  }
});

// Direct Alert Channel handler with visibility check
if (typeof BroadcastChannel !== 'undefined') {
  const alertChannel = new BroadcastChannel('rsiq-alerts');
  alertChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'ALERT_NOTIFICATION') {
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        const isAppVisible = clients.some((c: any) => c.visibilityState === 'visible');
        if (isAppVisible) return;
        showNativeNotification(event.data.payload);
      });
    }
  };
}

// ── Web Push API (24/7 Background Support) ───────────────────────
// Listens for push events from the backend (VAPID).
// This wipes out the "suspended tab" problem as the OS wakes up the SW.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    if (data && data.type === 'ALERT_NOTIFICATION') {
      event.waitUntil(showNativeNotification(data.payload));
    }
  } catch (err) {
    console.error('[sw] Push data error:', err);
  }
});

// ── Periodic Background Sync (2026 Freshness) ───────────────────
// Wakes up the worker to fetch fresh data even if app is closed.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'rsiq-freshness-sync') {
    event.waitUntil(refreshDataInBackground());
  }
});

async function refreshDataInBackground() {
  try {
    // GAP-A5 FIX: Read exchange preference from IndexedDB (matches ticker-worker storage)
    let exchange = 'binance';
    try {
      const DB_NAME = 'rsiq-storage';
      const CONFIG_STORE = 'config';
      const dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 4);
        request.onupgradeneeded = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('prices')) db.createObjectStore('prices');
          if (!db.objectStoreNames.contains(CONFIG_STORE)) db.createObjectStore(CONFIG_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const db: any = await dbPromise;
      const tx = db.transaction(CONFIG_STORE, 'readonly');
      const store = tx.objectStore(CONFIG_STORE);
      const exchangeReq = store.get('exchange');
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => {
          if (exchangeReq.result) exchange = exchangeReq.result;
          resolve();
        };
        tx.onerror = () => resolve();
      });
    } catch (e) {
      // Fall back to binance
    }

    // 1. Fetch top 100 pairs from the API using active exchange
    const freshnessTs = Date.now();
    const res = await fetch(`/api/screener?count=100&exchange=${exchange}&ts=${freshnessTs}`, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache, no-store, max-age=0, must-revalidate',
        pragma: 'no-cache',
      },
    });
    if (!res.ok) return;
    const json = await res.json();
    const data = json.data as any[];

    // 2. Open IndexedDB and update mirrored prices
    const DB_NAME = 'rsiq-storage';
    const STORE_NAME = 'prices';
    
    const dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 4);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const db: any = await dbPromise;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    data.forEach((entry: any) => {
      const tick = {
        price: entry.price,
        change24h: entry.change24h,
        volume24h: entry.volume24h,
        updatedAt: Date.now(),
        rsi1m: entry.rsi1m,
        rsi5m: entry.rsi5m,
        rsi15m: entry.rsi15m,
        rsi1h: entry.rsi1h,
        strategyScore: entry.strategyScore,
        strategySignal: entry.strategySignal
      };
      store.put(tick, entry.symbol);
    });

    console.log(`[sw] Periodic sync updated ${data.length} symbols (exchange: ${exchange})`);
  } catch (err) {
    console.error('[sw] Periodic sync failed:', err);
  }
}

// Handle notification clicks — open /terminal directly for trade decisions
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/terminal';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus existing window first
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Open new window (standard for PWA resumption)
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
