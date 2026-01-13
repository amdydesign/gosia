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
    },

    /**
     * Get current social stats
     */
    async getSocialCurrent() {
        return await api.get('/stats/social/current.php');
    },

    /**
     * Update social stats
     */
    async updateSocialStats(platform, count) {
        return await api.post('/stats/social/update.php', { platform, count });
    }
};

export default statsService;
