/**
 * Auth Service - login, logout and the cached user (the session itself is an HttpOnly cookie).
 */

import { apiRequest, clearSession } from '../utils/api';

const USER_KEY = 'user';

export const authService = {
    async login(username, password, rememberMe = true) {
        const data = await apiRequest('/auth/login.php', 'POST', { username, password, remember: rememberMe });
        this.storeUser(data.user);
        return data;
    },

    async logout() {
        try {
            await apiRequest('/auth/logout.php', 'POST', {});
        } catch {
            // offline - the cookie expires on its own
        }
        clearSession();
        window.location.href = '/login';
    },

    /** Last known user - shows the app right away while the cookie is checked in the background. */
    getCurrentUser() {
        try {
            const user = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
            return user ? JSON.parse(user) : null;
        } catch {
            return null;
        }
    },

    storeUser(user) {
        try {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch {
            // storage blocked - the app still works, it just checks the cookie first
        }
    },
};

export default authService;
