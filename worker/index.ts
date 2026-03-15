// @ts-nocheck
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// ── BULLETPROOF GLOBAL POLYFILL FOR NEXT.JS SWC BUG ──
// This fixes "ReferenceError: _async_to_generator is not defined" in sw.js
// It ensures the helper is available to Workbox internal plugins.
(function(global) {
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
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);

// Type helper for the compiler
declare const _async_to_generator: any;

// To disable all workbox logging during development
self.__WB_DISABLE_DEV_LOGS = true;

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'ALERT_NOTIFICATION') {
    const { title, body, icon } = event.data.payload;

    // Show native background notification through Service Worker Registration
    // This is explicitly required by Android Chrome for installed PWAs
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/logo/rsiq-pro-icon.png',
        badge: '/logo/rsiq-pro-icon.png',
        silent: false,
        requireInteraction: false,
        tag: `rsiq-${title.replace(/\s+/g, '-').toLowerCase()}`,
        vibrate: [200, 100, 200]
      })
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Focus the window if it's open, else open a new window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === self.registration.scope && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
