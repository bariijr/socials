const CACHE = 'parokia-v1';
const PRECACHE = [
    '/',
    '/dashboard',
    '/login',
    '/manifest.json',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', e => {
    const data    = e.data ? e.data.json() : {};
    const title   = data.title || 'Parokia';
    const options = {
        body:  data.body || '',
        icon:  '/img/icon-192.png',
        badge: '/img/icon-192.png',
        data:  { url: data.url || '/dashboard' },
        vibrate: [200, 100, 200],
    };
    e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const url = e.notification.data?.url || '/dashboard';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const client of list) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            return clients.openWindow(url);
        })
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Skip non-GET, cross-origin, admin POST requests, API calls
    if (e.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/storage/')) return;

    e.respondWith(
        caches.match(e.request).then(cached => {
            const network = fetch(e.request).then(res => {
                // Cache successful HTML/CSS/JS responses
                if (res.ok && ['text/html', 'text/css', 'application/javascript', 'image/'].some(t => (res.headers.get('content-type') || '').includes(t))) {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => cached);

            return cached || network;
        })
    );
});
