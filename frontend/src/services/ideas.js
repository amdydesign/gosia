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
    }
};

export default ideasService;
