/**
 * API utility - thin fetch wrapper used across the app.
 * Returns `data.data` when present, otherwise the full JSON payload.
 *
 * The login lives in an HttpOnly cookie the browser sends by itself (api/config/Session.php);
 * every call carries X-Requested-With, which the server requires for writes (CSRF).
 */

const API_BASE_URL = '/api';

export const APP_HEADERS = { 'X-Requested-With': 'gonia' };

// Tokens older app versions kept in the browser - moved to the cookie once, then deleted
export function getLegacyToken() {
    try {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    } catch {
        return null;
    }
}

export function clearLegacyToken() {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('rememberMe');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
    } catch {
        // storage blocked
    }
}

export function clearSession() {
    clearLegacyToken();
    try {
        localStorage.removeItem('user');
    } catch {
        // storage blocked
    }
}

// Wrong password / expired link answer 401 too - that is not "logged out"
const LOGIN_CALLS = ['/auth/login.php', '/auth/passkey/', '/auth/reset_password'];

function handleUnauthorized(endpoint) {
    if (LOGIN_CALLS.some((p) => endpoint.startsWith(p))) return false;
    clearSession();
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/reset-password')) {
        window.location.href = '/login';
    }
    return true;
}

/** fetch() to the API with the app header (uploads, downloads); handles a lost session. */
export async function apiFetch(endpoint, options = {}) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            credentials: 'same-origin',
            ...options,
            headers: { ...APP_HEADERS, ...(options.headers || {}) },
        });
    } catch {
        throw new Error('Brak połączenia z serwerem');
    }
    if (response.status === 401 && handleUnauthorized(endpoint)) {
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }
    return response;
}

/** `token` only for moving an older app's stored token to the cookie. */
export const apiRequest = async (endpoint, method = 'GET', body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const response = await apiFetch(endpoint, config);

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const firstFieldError = data?.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
        const error = new Error(firstFieldError || data?.message || 'Wystąpił błąd serwera');
        error.status = response.status;
        throw error;
    }

    return data && data.data !== undefined ? data.data : data;
};
