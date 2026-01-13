/**
 * Returns Service - CRUD operations
 */

import api from './api';

export const returnsService = {
    /**
     * Get all returns
     */
    async getAll(status = null) {
        const params = status ? `?status=${status}` : '';
        return await api.get(`/returns/index.php${params}`);
    },

    /**
     * Create new return
     */
    async create(data) {
        return await api.post('/returns/create.php', data);
    },

    /**
     * Update return
     */
    async update(id, data) {
        return await api.put(`/returns/update.php?id=${id}`, data);
    },

    /**
     * Delete return
     */
    async delete(id) {
        return await api.delete(`/returns/delete.php?id=${id}`);
    },

    /**
     * Mark return as returned
     */
    async markAsReturned(id) {
        return await api.put(`/returns/update.php?id=${id}`, {
            status: 'returned'
        });
    }
};

export default returnsService;
