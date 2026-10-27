/* Service Worker: app-shell cache + Web Push */

const CACHE_NAME = 'gonia-v1';
const SHARE_CACHE = 'gosia-share';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/theme.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Android share sheet -> "Gonia": keep the shared screenshots and open the purchase flow
async function handleShare(request) {
    try {
        const form = await request.formData();
        const files = form.getAll('screens').filter((f) => f && typeof f === 'object' && f.size);
        await caches.delete(SHARE_CACHE);
        const cache = await caches.open(SHARE_CACHE);
        await Promise.all(
            files.slice(0, 8).map((file, i) =>
                cache.put(
                    `/shared-screen/${i}`,
                    new Response(file, {
                        headers: {
                            'Content-Type': file.type || 'image/png',
                            'X-File-Name': encodeURIComponent(file.name || `screen-${i + 1}.png`),
                        },
                    })
                )
            )
        );
    } catch {
        // open the app anyway
    }
    return Response.redirect('/purchases?shared=1', 303);
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share-target') {
        event.respondWith(handleShare(request));
        return;
    }
    if (request.method !== 'GET') return;

    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return; // never cache API responses
    if (url.pathname.startsWith('/share/')) return; // public share pages (PHP) - not the app

    // SPA navigations: network first, offline fallback to cached shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Hashed build assets, icons and the OCR engine (~7 MB, downloaded once): cache first
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/ocr/') || PRECACHE.includes(url.pathname)) {
        event.respondWith(
            caches.match(request).then((cached) =>
                cached ||
                fetch(request).then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
            )
        );
    }
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data ? event.data.text() : '' };
    }

    const jobs = [
        self.registration.showNotification(data.title || 'Gonia', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-96.png',
            // same tag replaces the older message instead of stacking a pile of them
            tag: data.tag || undefined,
            renotify: Boolean(data.tag),
            data: { url: data.url || '/' },
        }),
    ];
    // number on the app icon (iOS 16.4+ home-screen app)
    if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
        jobs.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
    }
    event.waitUntil(Promise.all(jobs).catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
            for (const client of windows) {
                if ('focus' in client) {
                    await client.focus();
                    // iOS cannot navigate() an open app window - let the app route itself
                    client.postMessage({ type: 'open-url', url });
                    return undefined;
                }
            }
            return self.clients.openWindow(url);
        })
    );
});
