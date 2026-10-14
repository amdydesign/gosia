/**
 * Screenshots shared to the app from the phone's gallery (Android "Udostępnij").
 * The service worker stores them in this cache and redirects to /purchases?shared=1.
 */
export const SHARE_CACHE = 'gosia-share';

export async function takeSharedFiles() {
    if (!('caches' in window)) return [];
    try {
        const cache = await caches.open(SHARE_CACHE);
        const requests = await cache.keys();
        const files = [];
        for (const request of requests) {
            const response = await cache.match(request);
            if (!response) continue;
            const blob = await response.blob();
            const name = decodeURIComponent(response.headers.get('X-File-Name') || 'screen.png');
            files.push(new File([blob], name, { type: blob.type || 'image/png' }));
        }
        await caches.delete(SHARE_CACHE);
        return files;
    } catch {
        return [];
    }
}
