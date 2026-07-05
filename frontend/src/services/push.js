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

async function getRegistration() {
    if (!isPushSupported()) return null;
    return (await navigator.serviceWorker.getRegistration()) || null;
}

/**
 * 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'
 */
export async function getPushStatus() {
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
