/**
 * Współdzielony licznik pilnych zwrotów.
 *
 * Wcześniej hook useUrgentReturns był wywoływany osobno w Sidebar i
 * MobileBottomNav — dwa niezależne interwały odpytywały /stats/dashboard.php.
 * Provider trzyma jeden interwał i jedno zapytanie, współdzielone przez oba.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../utils/api';

const UrgentReturnsContext = createContext(0);

export function UrgentReturnsProvider({ children }) {
    const { token } = useAuth();
    const [urgentCount, setUrgentCount] = useState(0);

    useEffect(() => {
        // Provider montowany jest w AppLayout (tylko dla zalogowanych), więc po
        // wylogowaniu odmontowuje się razem z layoutem — nie trzeba resetować licznika.
        if (!token) return;

        let active = true;

        const loadCount = async () => {
            try {
                const data = await apiRequest('/stats/dashboard.php');
                if (active && data && typeof data.urgent_returns_count === 'number') {
                    setUrgentCount(data.urgent_returns_count);
                }
            } catch {
                /* licznik pomocniczy — błąd pomijamy cicho */
            }
        };

        loadCount();
        const interval = setInterval(loadCount, 60000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [token]);

    return (
        <UrgentReturnsContext.Provider value={urgentCount}>
            {children}
        </UrgentReturnsContext.Provider>
    );
}

export function useUrgentReturns() {
    return useContext(UrgentReturnsContext);
}
