// @ts-nocheck
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

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

  // Use exchange-aware tag to prevent notification collision across exchanges
  const tag = `rsiq-${(exchange || 'unknown')}-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return self.registration.showNotification(title, {
    body,
    icon: icon || '/logo/rsiq-pro-icon.png',
    badge: '/logo/rsiq-pro-icon.png',
    silent: false,
    requireInteraction: false,
    renotify: true,
    tag,
    vibrate: [200, 100, 200, 100, 200], // Strong 3-pulse for trade urgency
    data: { exchange, url: '/terminal' }
  });
};

// ── Direct Alert Channel (Worker -> Service Worker) ─────────────
// Listens for alerts broadcasted directly from the Ticker Worker.
// This ensures reliability even if the main thread is throttled.
if (typeof BroadcastChannel !== 'undefined') {
  const alertChannel = new BroadcastChannel('rsiq-alerts');
  alertChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'ALERT_NOTIFICATION') {
      showNativeNotification(event.data.payload);
    }
  };
}

// Listen for messages from the main thread (Foreground/UI fallback)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ALERT_NOTIFICATION') {
    event.waitUntil(showNativeNotification(event.data.payload));
  }
});

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
      // Open new window to terminal
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
