import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../utils/api';

const DashboardContext = createContext(null);
const REFRESH_MS = 5 * 60 * 1000;

/**
 * Single shared source for dashboard stats + nav badges.
 * Pages call `refresh()` after mutations so counters stay in sync.
 */
export function DashboardProvider({ children }) {
    const { token, isAuthenticated } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const inFlight = useRef(null);

    const refresh = useCallback(async ({ silent = true } = {}) => {
        if (!isAuthenticated) return null;
        if (inFlight.current) return inFlight.current;
        if (!silent) setLoading(true);
        inFlight.current = (async () => {
            try {
                const result = await apiRequest('/stats/dashboard.php', 'GET', null, token);
                setData(result);
                setError('');
                return result;
            } catch (err) {
                setError(err.message || 'Błąd ładowania danych');
                return null;
            } finally {
                setLoading(false);
                inFlight.current = null;
            }
        })();
        return inFlight.current;
    }, [isAuthenticated, token]);

    // Background social refresh: once per day per device, only when the server reports stale platforms
    const socialAttempted = useRef(false);
    useEffect(() => {
        if (!data?.social_stale?.length || socialAttempted.current) return;
        const key = 'social.autoRefresh';
        const today = new Date().toISOString().slice(0, 10);
        let last = null;
        try {
            last = localStorage.getItem(key);
        } catch {
            last = null;
        }
        if (last === today) return;
        socialAttempted.current = true;
        try {
            localStorage.setItem(key, today);
        } catch {
            // ignore
        }
        apiRequest('/stats/social/auto_refresh.php', 'POST', {}, token)
            .then((result) => {
                if (result?.updated?.length) refresh();
            })
            .catch(() => {});
    }, [data, token, refresh]);

    useEffect(() => {
        if (!isAuthenticated) {
            setData(null);
            return undefined;
        }
        refresh({ silent: false });
        const interval = setInterval(() => refresh(), REFRESH_MS);
        const onVisible = () => document.visibilityState === 'visible' && refresh();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isAuthenticated, refresh]);

    const value = useMemo(
        () => ({
            data,
            loading,
            error,
            refresh,
            badges: {
                purchases: data?.counts?.urgent_returns_badge || 0,
                collaborations: data?.counts?.overdue_payments || 0,
            },
        }),
        [data, loading, error, refresh]
    );

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
    const ctx = useContext(DashboardContext);
    if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
    return ctx;
}
