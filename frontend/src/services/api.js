/**
 * API Service - axios client for the older services (same cookie login as utils/api.js).
 */

import axios from 'axios';
import { APP_HEADERS, clearSession } from '../utils/api';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
        ...APP_HEADERS,
    },
});

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        if (error.response) {
            // Server responded with error
            const url = error.config?.url || '';
            if (error.response.status === 401 && !url.startsWith('/auth/')) {
                clearSession();
                window.location.href = '/login';
            }
            throw error.response.data;
        } else if (error.request) {
            // No response received
            throw { success: false, message: 'Brak połączenia z serwerem' };
        } else {
            throw { success: false, message: error.message };
        }
    }
);

export default api;
