/**
 * Stats Service - Dashboard and statistics data
 */

import api from './api';

export const statsService = {
    /**
     * Get dashboard stats
     */
    async getDashboard() {
        return await api.get('/stats/dashboard.php');
    },

    /**
     * Get monthly chart data
     */
    async getMonthly() {
        return await api.get('/stats/monthly.php');
    }
};

export default statsService;
