/* Service Worker: app-shell cache + Web Push */

// v2: v1 could hold index.html saved under a missing /assets/ file - dropped on activate
const CACHE_NAME = 'gonia-v2';
const SHARE_CACHE = 'gosia-share';
// The OCR engine (~7 MB) never changes with a deploy - its own cache survives app updates
const OCR_CACHE = 'gonia-ocr';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/theme.js'];
// Which build the cached /assets/ belong to (the entry script named in index.html)
const BUILD_MARK = '/__build';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // 'reload': straight from the server, not from the browser's HTTP cache
            .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    const keep = [CACHE_NAME, SHARE_CACHE, OCR_CACHE];
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

const isHtml = (response) => (response.headers.get('content-type') || '').includes('text/html');

/**
 * Keep a fresh index.html as the offline shell. When it names a different entry script
 * than last time, a new build is out: every cached /assets/ file of the old build is
 * deleted (file names carry a content hash, so old ones are never asked for again).
 */
async function rememberShell(response) {
    const cache = await caches.open(CACHE_NAME);
    const html = await response.clone().text();
    await cache.put('/index.html', response);
    const tag = (html.match(/<script\b[^>]*\btype=["']module["'][^>]*>/i) || [''])[0];
    const entry = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
    if (!entry) return;
    const marked = await cache.match(BUILD_MARK);
    if (marked && (await marked.text()) === entry) return;
    const requests = await cache.keys();
    await Promise.all(
        requests
            .filter((r) => {
                const path = new URL(r.url).pathname;
                return path.startsWith('/assets/') && !html.includes(path);
            })
            .map((r) => cache.delete(r))
    );
    await cache.put(BUILD_MARK, new Response(entry));
}

/** Cache first; only a real file is kept - never an error page or index.html served in place of a missing file. */
function cacheFirst(request, cacheName) {
    return caches.match(request).then(
        (cached) =>
            cached ||
            fetch(request).then((response) => {
                if (response.ok && !isHtml(response)) {
                    const copy = response.clone();
                    caches.open(cacheName).then((cache) => cache.put(request, copy));
                }
                return response;
            })
    );
}

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

    // The app checking for a new version must reach the server
    if (request.cache === 'no-store') return;

    // SPA navigations: network first, offline fallback to cached shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // an error page (500, maintenance) must not become the offline shell
                    if (response.ok && isHtml(response)) event.waitUntil(rememberShell(response.clone()).catch(() => {}));
                    return response;
                })
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // Hashed build assets and icons: cache first
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }
    // OCR engine (~7 MB, downloaded once)
    if (url.pathname.startsWith('/ocr/')) {
        event.respondWith(cacheFirst(request, OCR_CACHE));
        return;
    }

    // manifest / theme.js: the cached copy right away, refreshed in the background for next time
    if (PRECACHE.includes(url.pathname) && !url.search) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const fresh = fetch(request).then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
                    }
                    return response;
                });
                if (!cached) return fresh;
                event.waitUntil(fresh.catch(() => {}));
                return cached;
            })
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
