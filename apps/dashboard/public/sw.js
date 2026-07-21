// WABOS service worker: offline app-shell + web-push handling.
const CACHE = 'wabos-shell-v2';
const SHELL = ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Network-first for navigations (always show fresh app when online, cached shell
// when offline). Other requests pass through to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/offline'))),
    );
  }
});

// Incoming push → show a notification.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'WABOS';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
    icon: '/icons/192.png',
    badge: '/icons/96.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses an existing tab or opens the target URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.navigate(url).catch(() => {}); return client.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
