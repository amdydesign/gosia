/**
 * Auth Service - Login, logout, token management
 */

import api from './api';

export const authService = {
    /**
     * Login with username and password
     */
    async login(username, password) {
        const response = await api.post('/auth/login.php', { username, password });

        if (response.success && response.data) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
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
        window.location.href = '/login';
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!localStorage.getItem('token');
    },

    /**
     * Get current user from localStorage
     */
    getCurrentUser() {
        const user = localStorage.getItem('user');
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
    getToken() {
        return localStorage.getItem('token');
    }
};

export default authService;
