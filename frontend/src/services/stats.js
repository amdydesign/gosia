/**
 * Stats Service - Dashboard and statistics data
 */

import api from './api';

export const statsService = {
    async getDashboard() {
        return await api.get('/stats/dashboard.php');
    },

    async getMonthly(months = 6) {
        return await api.get(`/stats/monthly.php?months=${months}`);
    },

    async getSocialCurrent() {
        return await api.get('/stats/social/current.php');
    },

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

    /** Background refresh of platforms without today's numbers. */
    async autoRefreshSocial({ force = false, platforms = null } = {}) {
        return await api.post('/stats/social/auto_refresh.php', platforms ? { force, platforms } : { force });
    },

    async getSocialProfiles() {
        return await api.get('/stats/social/profiles.php');
    },

    async saveSocialProfiles(profiles) {
        return await api.post('/stats/social/profiles.php', profiles);
    },

    async getSocialHistory() {
        return await api.get('/stats/social/history.php');
    },

    async scrapeInstagram() {
        return await api.post('/social/scrape_instagram.php');
    },

    async scrapeFacebook() {
        return await api.post('/social/scrape_facebook.php');
    }
};

export default statsService;
