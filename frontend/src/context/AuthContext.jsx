/**
 * Auth Context - Global authentication state.
 * The session is an HttpOnly cookie; here we only keep who is logged in.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/auth';
import { fetchMe } from '../services/users';
import { detachPushFromAccount } from '../services/push';
import { APP_HEADERS, apiRequest, clearLegacyToken, clearSession, getLegacyToken } from '../utils/api';

/** Is there a working session cookie? (no redirect - used before we know) */
async function probeSession() {
    try {
        const res = await fetch('/api/auth/verify.php', { credentials: 'same-origin', headers: APP_HEADERS });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data?.user || null;
    } catch {
        return null;
    }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const accept = useCallback((next) => {
        setUser(next);
        setIsAuthenticated(true);
        authService.storeUser(next);
    }, []);

    // Check auth on mount
    useEffect(() => {
        let cancelled = false;
        const checkAuth = async () => {
            // An older app version kept a token in the browser: one call moves it to the cookie
            const legacy = getLegacyToken();
            if (legacy) {
                try {
                    const data = await apiRequest('/auth/verify.php', 'GET', null, legacy);
                    clearLegacyToken();
                    if (!cancelled && data?.user) accept(data.user);
                } catch {
                    clearSession();
                }
                if (!cancelled) setLoading(false);
                return;
            }

            const cached = authService.getCurrentUser();
            if (cached) {
                // show the app right away; a dead cookie sends us to /login on the first call
                setUser(cached);
                setIsAuthenticated(true);
                setLoading(false);
                fetchMe()
                    .then((data) => !cancelled && data?.user && accept(data.user))
                    .catch(() => {});
                return;
            }

            const fresh = await probeSession();
            if (!cancelled) {
                if (fresh) accept(fresh);
                setLoading(false);
            }
        };

        checkAuth();
        return () => {
            cancelled = true;
        };
    }, [accept]);

    // Login
    const login = async (username, password, rememberMe = true) => {
        const data = await authService.login(username, password, rememberMe);
        accept(data.user);
        return data;
    };

    // Reset link: the server already set the cookie
    const loginWithUser = useCallback((next) => accept(next), [accept]);

    // Logout - this device stops getting this account's reminders; account-specific
    // leftovers in the browser go too, so the next person starts clean
    const logout = async () => {
        await detachPushFromAccount();
        try {
            sessionStorage.removeItem('gonia.reelGenerator');
            localStorage.removeItem('gosia-return-keep');
            localStorage.removeItem('gosia-return-open');
        } catch {
            // storage blocked - nothing to clean
        }
        setUser(null);
        setIsAuthenticated(false);
        await authService.logout();
    };

    const updateUser = useCallback((next) => {
        setUser(next);
        authService.storeUser(next);
    }, []);

    const value = {
        user,
        loading,
        isAuthenticated,
        login,
        loginWithUser,
        logout,
        updateUser
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export default AuthContext;
