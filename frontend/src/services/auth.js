/**
 * Auth Service - Login, logout, token management
 */

import api from './api';

export const authService = {
    /**
     * Login with username and password
     */
    async login(username, password, rememberMe = false) {
        const response = await api.post('/auth/login.php', { username, password });

        if (response.success && response.data) {
            const storage = rememberMe ? localStorage : sessionStorage;
            storage.setItem('token', response.data.token);
            storage.setItem('user', JSON.stringify(response.data.user));
            // Store preference so we know where to look
            localStorage.setItem('rememberMe', rememberMe ? 'true' : 'false');
            return response.data;
        }

        throw response;
    },

    /**
     * Logout - remove token
     */
    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('rememberMe');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login';
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!(localStorage.getItem('token') || sessionStorage.getItem('token'));
    },

    /**
     * Get current user from localStorage or sessionStorage
     */
    getCurrentUser() {
        const user = localStorage.getItem('user') || sessionStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },

    /**
     * Verify token is still valid
     */
    async verifyToken() {
        try {
            const response = await api.get('/auth/verify.php');
            return response.success;
        } catch {
            return false;
        }
    },

    /**
     * Get auth token
     */
    /**
     * Get auth token - checks both storages
     */
    getToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    }
};

export default authService;
