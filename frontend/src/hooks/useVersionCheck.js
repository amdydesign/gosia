import { useEffect } from 'react';
import { announceNewVersion } from '../utils/chunks';

const EVERY_MS = 10 * 60 * 1000;

function runningScript() {
    const el = document.querySelector('script[type=module][src]');
    try {
        return el ? new URL(el.src, window.location.href).pathname : null;
    } catch {
        return null;
    }
}

/**
 * A home-screen app can stay open for days. When it comes back to the front (at most
 * every 10 minutes) compare the build on the server with the one running and offer
 * "Nowa wersja · Odśwież". Never reloads by itself.
 */
export function useVersionCheck() {
    useEffect(() => {
        if (!import.meta.env.PROD) return undefined;
        const current = runningScript();
        if (!current) return undefined;
        let lastCheck = Date.now();
        let announced = false;

        const check = async () => {
            if (announced || document.visibilityState !== 'visible' || Date.now() - lastCheck < EVERY_MS) return;
            lastCheck = Date.now();
            try {
                // the query string keeps an older service worker from answering out of its cache
                const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return;
                const html = await res.text();
                const tag = html.match(/<script\b[^>]*\btype=["']module["'][^>]*>/i)?.[0] || '';
                const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
                if (!src) return;
                if (new URL(src, window.location.href).pathname !== current) {
                    announced = true;
                    announceNewVersion();
                }
                navigator.serviceWorker?.getRegistration?.().then((reg) => reg?.update()).catch(() => {});
            } catch {
                // offline - try next time
            }
        };

        document.addEventListener('visibilitychange', check);
        return () => document.removeEventListener('visibilitychange', check);
    }, []);
}
