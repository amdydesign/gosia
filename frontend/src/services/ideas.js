import { apiRequest } from '../utils/api';

export const ideasService = {
    getAll: async (token, status = 'all') => {
        return apiRequest(`/ideas/index.php?status=${status}`, 'GET', null, token);
    },

    getOne: async (token, id) => {
        return apiRequest(`/ideas/show.php?id=${id}`, 'GET', null, token);
    },

    create: async (token, data) => {
        return apiRequest('/ideas/create.php', 'POST', data, token);
    },

    update: async (token, id, data) => {
        return apiRequest(`/ideas/update.php?id=${id}`, 'PUT', data, token);
    },

    delete: async (token, id) => {
        return apiRequest(`/ideas/delete.php?id=${id}`, 'DELETE', null, token);
    },

    /** "Generator rolek", step 1: 3 new topics in the style of the recorded reels (nothing saved). */
    generateTopics: async (exclude = []) => {
        return apiRequest('/ai/reels.php', 'POST', { step: 'topics', exclude });
    },

    /** "Generator rolek", step 2: script for a picked or own topic (nothing saved); notes keep her direction. */
    writeScript: async (title, pitch = '', notes = []) => {
        return apiRequest('/ai/reels.php', 'POST', { step: 'script', title, pitch, notes });
    },

    /** "Co zmienić?": the script on screen with her notes applied (only that script is sent - cheap). */
    reviseScript: async (title, content, notes) => {
        return apiRequest('/ai/reels.php', 'POST', { step: 'revise', title, content, notes });
    },

    /** Is AI available on the server (same key as screenshot reading)? */
    aiEnabled: async () => {
        const data = await apiRequest('/ai/status.php', 'GET');
        return !!data?.enabled;
    },
};

export default ideasService;
