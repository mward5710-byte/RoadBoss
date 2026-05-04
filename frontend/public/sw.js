// RoadBoss Service Worker — handles Web Push + basic offline shell.
// This file is served from the web root so that `/sw.js` is its scope.

const SW_VERSION = 'roadboss-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// -----------------------------------------------------------------------------
// Push receive
// -----------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      payload = { title: 'RoadBoss', body: event.data ? event.data.text() : '' };
    } catch (e2) {
      payload = { title: 'RoadBoss', body: '' };
    }
  }

  const title = payload.title || 'RoadBoss';
  const severity = payload.severity || 'info';
  const tag = payload.tag || 'roadboss';
  const url = payload.url || '/';

  // Severity → simple visual treatment via emoji (icons/badges need real PNGs in /public).
  const options = {
    body: payload.body || '',
    tag,
    renotify: true,
    requireInteraction: severity === 'critical',
    data: { url, payload, severity },
    timestamp: payload.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// -----------------------------------------------------------------------------
// Click → focus or open the app
// -----------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const clientUrl = new URL(client.url);
          // If an existing tab is already on the same origin, focus it and route.
          if (clientUrl.origin === self.location.origin) {
            await client.focus();
            try {
              client.postMessage({ type: 'roadboss:notification-click', url: targetUrl });
            } catch (_) {}
            // Navigate if possible.
            if ('navigate' in client) {
              try { await client.navigate(targetUrl); } catch (_) {}
            }
            return;
          }
        } catch (_) {}
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});

// -----------------------------------------------------------------------------
// Subscription change (browser rotates endpoints) — let the app know.
// -----------------------------------------------------------------------------
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        try { c.postMessage({ type: 'roadboss:pushsubscriptionchange' }); } catch (_) {}
      }
    })()
  );
});
