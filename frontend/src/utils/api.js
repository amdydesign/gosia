/**
 * API Utility for direct fetch requests
 */

const API_BASE_URL = '/api';

export const apiRequest = async (endpoint, method = 'GET', body = null, token = null) => {
    const headers = {
        'Content-Type': 'application/json',
    };

    if (!token) {
        token = localStorage.getItem('token');
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // Handle 401 Unauthorized globally
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            throw new Error('Sesja wygasła. Zaloguj się ponownie.');
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Wystąpił błąd serwera');
        }

        // Return the payload data if it exists, otherwise the full response
        return data.data !== undefined ? data.data : data;
    } catch (error) {
        throw error;
    }
};
