/**
 * Auth Context - Global authentication state
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/auth';
import { fetchMe } from '../services/users';
import { detachPushFromAccount } from '../services/push';

/** Keep the stored copy of the user in the same storage the token lives in. */
function storeUser(user) {
    const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
    storage.setItem('user', JSON.stringify(user));
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const storedUser = authService.getCurrentUser();
            const storedToken = authService.getToken();

            if (storedToken && storedUser) {
                setUser(storedUser);
                setToken(storedToken);
                setIsAuthenticated(true);
                // refresh name and role (sessions from before accounts lack them)
                fetchMe()
                    .then((data) => {
                        if (data?.user) {
                            setUser(data.user);
                            storeUser(data.user);
                        }
                    })
                    .catch(() => {});
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    // Login
    const login = async (username, password, rememberMe = false) => {
        const data = await authService.login(username, password, rememberMe);
        setUser(data.user);
        setToken(data.token);
        setIsAuthenticated(true);
        return data;
    };

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
        authService.logout();
        setUser(null);
        setToken(null);
        setIsAuthenticated(false);
    };

    const updateUser = useCallback((next) => {
        setUser(next);
        storeUser(next);
    }, []);

    const value = {
        user,
        token,
        loading,
        isAuthenticated,
        login,
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
