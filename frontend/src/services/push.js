/**
 * Push Notifications Service
 * Handles the browser subscription lifecycle + backend sync.
 */

import api from './api';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** iPhone gets push only in the app added to the home screen (Safari tabs have no PushManager). */
export function needsHomeScreenInstall() {
    return isIOS() && !isStandalone();
}

async function getRegistration() {
    if (!isPushSupported()) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
}

/**
 * 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'
 */
export async function getPushStatus() {
    if (needsHomeScreenInstall()) return 'install';
    if (!isPushSupported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';

    const registration = await getRegistration();
    if (!registration) return 'unsupported'; // SW not registered (e.g. dev mode)

    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'subscribed' : 'unsubscribed';
}

export async function subscribeToPush() {
    const registration = await getRegistration();
    if (!registration) throw new Error('Service Worker nie jest zarejestrowany');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Nie wyrażono zgody na powiadomienia');

    const keyResponse = await api.get('/push/public_key.php');
    const publicKey = keyResponse?.data?.publicKey;
    if (!publicKey) throw new Error('Serwer nie ma skonfigurowanych powiadomień push');

    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await api.post('/push/subscribe.php', subscription.toJSON());
    return subscription;
}

export async function unsubscribeFromPush() {
    const registration = await getRegistration();
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    try {
        await api.post('/push/unsubscribe.php', { endpoint });
    } catch {
        // backend cleanup is best-effort; dead subs are purged on send anyway
    }
}

/**
 * Called on every app start: keeps the server's copy of this device's subscription
 * fresh (iOS may rotate it) without the welcome notification.
 */
export async function resyncPush() {
    try {
        if (!isPushSupported() || Notification.permission !== 'granted') return;
        const registration = await getRegistration();
        if (!registration) return;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const keyResponse = await api.get('/push/public_key.php');
            const publicKey = keyResponse?.data?.publicKey;
            if (!publicKey) return;
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }
        await api.post('/push/subscribe.php', { ...subscription.toJSON(), silent: true });
    } catch {
        // best effort - the settings screen shows the real state
    }
}

export async function getPushPrefs() {
    const res = await api.get('/push/prefs.php');
    return res?.data;
}

export async function savePushPrefs(patch) {
    const res = await api.post('/push/prefs.php', patch);
    return res?.data;
}

export async function sendTestPush() {
    const res = await api.post('/push/test.php', {});
    return res?.data;
}

/** Number on the app icon (iOS 16.4+ home-screen app, Chrome desktop). */
export function setAppBadge(count) {
    try {
        if (count > 0) navigator.setAppBadge?.(count);
        else navigator.clearAppBadge?.();
    } catch {
        // unsupported
    }
}
