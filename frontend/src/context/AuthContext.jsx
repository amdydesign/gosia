/**
 * Auth Context - Global authentication state
 */

import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const storedUser = authService.getCurrentUser();
            const token = authService.getToken();

            if (token && storedUser) {
                setUser(storedUser);
                setIsAuthenticated(true);
            }
            setLoading(false);
        };

        checkAuth();
    }, []);

    // Login
    const login = async (username, password, rememberMe = false) => {
        const data = await authService.login(username, password, rememberMe);
        setUser(data.user);
        setIsAuthenticated(true);
        return data;
    };

    // Logout
    const logout = () => {
        authService.logout();
        setUser(null);
        setIsAuthenticated(false);
    };

    const value = {
        user,
        loading,
        isAuthenticated,
        login,
        logout
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
