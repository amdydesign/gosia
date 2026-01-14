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
    },

    async getSocialStatus() {
        return await api.get('/stats/social/status.php');
    },

    async getSocialAuthUrl(platform) {
        return await api.get(`/auth/${platform}/get_auth_url.php`);
    },

    async exchangeSocialCode(platform, code) {
        return await api.post(`/auth/${platform}/exchange.php`, { code });
    },

    async connectYouTubePublic(channelId) {
        return await api.post('/stats/social/fetch_youtube_public.php', { channel_id: channelId });
    },

    async refreshSocialStats() {
        return await api.post('/stats/social/refresh.php');
    },

    async scrapeInstagram() {
        return await api.post('/social/scrape_instagram.php');
    }
};

export default statsService;
