/**
 * Jedyny klient API aplikacji (fetch).
 *
 * Kontrakt:
 *  - metody get/post/put/del/delete zwracają PEŁNĄ kopertę { success, message, data }
 *  - token pobierany z jednego miejsca (local/session storage)
 *  - 401 czyści oba magazyny i przekierowuje na /login (jeden punkt obsługi)
 *  - błąd sieci/serwera rzuca obiekt { success:false, message, errors } — spójny kształt
 */

const API_BASE_URL = '/api';

function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
}

async function request(endpoint, { method = 'GET', body = null } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method,
            headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        throw { success: false, message: 'Brak połączenia z serwerem' };
    }

    if (response.status === 401) {
        clearSession();
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
        throw { success: false, message: 'Sesja wygasła. Zaloguj się ponownie.' };
    }

    let data = {};
    try {
        data = await response.json();
    } catch {
        // odpowiedzi bez ciała zostawiamy jako pustą kopertę
    }

    if (!response.ok || data.success === false) {
        throw {
            success: false,
            message: data.message || 'Wystąpił błąd serwera',
            errors: data.errors,
        };
    }

    return data;
}

const api = {
    get: (endpoint) => request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
    put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
    del: (endpoint) => request(endpoint, { method: 'DELETE' }),
    delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
    getToken,
    clearSession,
};

export default api;
