/**
 * Collaborations Service - CRUD operations
 */

import api from './api';

export const collaborationsService = {
    /**
     * Get all collaborations
     */
    async getAll(status = null) {
        const params = status ? `?status=${status}` : '';
        return await api.get(`/collaborations/index.php${params}`);
    },

    /**
     * Create new collaboration
     */
    async create(data) {
        return await api.post('/collaborations/create.php', data);
    },

    /**
     * Update collaboration
     */
    async update(id, data) {
        return await api.put(`/collaborations/update.php?id=${id}`, data);
    },

    /**
     * Delete collaboration
     */
    async delete(id) {
        return await api.delete(`/collaborations/delete.php?id=${id}`);
    },

    /**
     * Mark collaboration as paid
     */
    async markAsPaid(id) {
        return await api.put(`/collaborations/update.php?id=${id}`, {
            payment_status: 'paid'
        });
    }
};

export default collaborationsService;
