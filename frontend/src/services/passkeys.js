/**
 * Face ID / Touch ID login (WebAuthn passkeys) - server side in api/config/Passkeys.php.
 */
import { apiRequest } from '../utils/api';

const ENABLED_KEY = 'gonia.passkey'; // this device has a passkey -> Login shows the Face ID button
const OFFER_KEY = 'gonia.passkeyOffer'; // "Nie teraz" - ask again in 30 days

function toBytes(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function toB64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readFlag(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeFlag(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        // storage blocked
    }
}

/** Face ID / fingerprint available on this device (and the browser can hand over the key). */
export async function passkeysSupported() {
    try {
        if (!window.PublicKeyCredential || !navigator.credentials) return false;
        if (typeof window.AuthenticatorAttestationResponse?.prototype?.getPublicKey !== 'function') return false;
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

export function passkeyOnThisDevice() {
    return readFlag(ENABLED_KEY) === '1';
}

/** Offer "Logowanie Face ID" after a password login? (not when declined in the last 30 days) */
export function shouldOfferPasskey() {
    if (passkeyOnThisDevice()) return false;
    const declined = Number(readFlag(OFFER_KEY) || 0);
    return !declined || Date.now() - declined > 30 * 86400000;
}

export function declinePasskeyOffer() {
    writeFlag(OFFER_KEY, String(Date.now()));
}

export function deviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    return 'To urządzenie';
}

/** Create a passkey on this device for the logged-in account. */
export async function registerPasskey() {
    const o = await apiRequest('/auth/passkey/options.php', 'POST', { purpose: 'register' });
    const credential = await navigator.credentials.create({
        publicKey: {
            challenge: toBytes(o.challenge),
            rp: { id: o.rp_id, name: o.rp_name },
            user: { id: toBytes(o.user.id), name: o.user.name, displayName: o.user.display_name },
            pubKeyCredParams: o.algorithms.map((alg) => ({ type: 'public-key', alg })),
            authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required', authenticatorAttachment: 'platform' },
            excludeCredentials: (o.exclude || []).map((id) => ({ type: 'public-key', id: toBytes(id) })),
            attestation: 'none',
            timeout: 120000,
        },
    });
    const r = credential.response;
    await apiRequest('/auth/passkey/register.php', 'POST', {
        state: o.state,
        id: toB64url(credential.rawId),
        client_data: toB64url(r.clientDataJSON),
        authenticator_data: toB64url(r.getAuthenticatorData()),
        public_key: toB64url(r.getPublicKey()),
        algorithm: r.getPublicKeyAlgorithm(),
        name: deviceName(),
    });
    writeFlag(ENABLED_KEY, '1');
}

/** Log in with Face ID - returns the user (the server sets the session cookie). */
export async function loginWithPasskey() {
    const o = await apiRequest('/auth/passkey/options.php', 'POST', { purpose: 'login' });
    const credential = await navigator.credentials.get({
        publicKey: { challenge: toBytes(o.challenge), rpId: o.rp_id, userVerification: 'required', allowCredentials: [], timeout: 120000 },
    });
    const r = credential.response;
    const data = await apiRequest('/auth/passkey/login.php', 'POST', {
        state: o.state,
        id: toB64url(credential.rawId),
        client_data: toB64url(r.clientDataJSON),
        authenticator_data: toB64url(r.authenticatorData),
        signature: toB64url(r.signature),
        user_handle: r.userHandle ? toB64url(r.userHandle) : '',
    });
    writeFlag(ENABLED_KEY, '1');
    return data.user;
}

export function listPasskeys() {
    return apiRequest('/auth/passkey/index.php');
}

export async function removePasskey(id) {
    await apiRequest(`/auth/passkey/index.php?id=${id}`, 'DELETE');
    writeFlag(ENABLED_KEY, null);
}

/** "NotAllowedError" = she closed the Face ID sheet - not worth an error message. */
export function isCancelled(err) {
    return err?.name === 'NotAllowedError' || err?.name === 'AbortError';
}
