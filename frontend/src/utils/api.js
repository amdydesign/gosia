/**
 * API utility - thin fetch wrapper used across the app.
 * Returns `data.data` when present, otherwise the full JSON payload.
 */

const API_BASE_URL = '/api';

export function getStoredToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
}

export const apiRequest = async (endpoint, method = 'GET', body = null, token = null) => {
    const headers = { 'Content-Type': 'application/json' };
    const authToken = token || getStoredToken();
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    } catch {
        throw new Error('Brak połączenia z serwerem');
    }

    if (response.status === 401) {
        clearSession();
        if (!window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
        }
        throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const firstFieldError = data?.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
        throw new Error(firstFieldError || data?.message || 'Wystąpił błąd serwera');
    }

    return data && data.data !== undefined ? data.data : data;
};
