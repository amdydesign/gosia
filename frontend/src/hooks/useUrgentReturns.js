import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../utils/api';

export function useUrgentReturns() {
    const { token } = useAuth();
    const [urgentCount, setUrgentCount] = useState(0);

    useEffect(() => {
        if (!token) return;

        const loadCount = async () => {
            try {
                // We're using the dashboard endpoint which now includes this count
                const data = await apiRequest('/stats/dashboard.php', 'GET', null, token);
                if (data && typeof data.urgent_returns_count === 'number') {
                    setUrgentCount(data.urgent_returns_count);
                }
            } catch (err) {
                console.error('Failed to load urgent returns count', err);
            }
        };

        loadCount();

        // Refresh every minute to keep it updated without spamming
        const interval = setInterval(loadCount, 60000);
        return () => clearInterval(interval);
    }, [token]);

    return urgentCount;
}
