/**
 * API Service - Base configuration and request handling
 */

import axios from 'axios';

// Base URL - empty for same-origin (will use proxy in dev, same domain in prod)
const API_BASE_URL = '/api';

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor - handle errors
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        if (error.response) {
            // Server responded with error
            if (error.response.status === 401) {
                // Unauthorized - clear token and redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('user');
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
