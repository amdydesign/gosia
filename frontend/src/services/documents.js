import { apiFetch, apiRequest } from '../utils/api';

async function fetchFile(id, inline = false) {
    const response = await apiFetch(`/documents/download.php?id=${id}${inline ? '&inline=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Nie udało się pobrać pliku');
    return response.blob();
}

export const documentsService = {
    search: (query = '') => apiRequest(`/documents/index.php${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`),

    upload: async ({ file, title, notes, status, docDate, contentText }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('notes', notes || '');
        formData.append('status', status || 'signed');
        formData.append('doc_date', docDate || '');
        if (contentText) formData.append('content_text', contentText);

        const response = await apiFetch('/documents/upload.php', { method: 'POST', body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            const firstError = data.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
            const error = new Error(firstError || data.message || 'Błąd przesyłania pliku');
            error.duplicateId = data.errors?.duplicate_id || null; // the same document is already in the archive
            throw error;
        }
        return data.data;
    },

    // OPTIONAL AI (Claude Sonnet): fills name, counterparty, date, status, summary
    analyze: (id) => apiRequest(`/documents/analyze.php?id=${id}`, 'POST'),

    // Collaboration suggestions from contracts / bills (contract + its bill = one suggestion)
    collabSuggestions: () => apiRequest('/documents/suggestions.php'),
    linkCollab: (documentIds, collaborationId) =>
        apiRequest('/documents/link.php', 'POST', { document_ids: documentIds, collaboration_id: collaborationId }),
    dismissCollab: (documentIds) => apiRequest('/documents/link.php', 'POST', { document_ids: documentIds, dismiss: true }),
    unlinkCollab: (documentIds) => apiRequest('/documents/link.php', 'POST', { document_ids: documentIds, unlink: true }),

    getText: (id) => apiRequest(`/documents/text.php?id=${id}`),

    // Text read again in the browser (OCR); the server re-guesses date and counterparty
    saveText: (id, contentText) => apiRequest(`/documents/text.php?id=${id}`, 'POST', { content_text: contentText }),

    /** The stored file as a File object (for reading it again on the device). */
    file: async (doc) => new File([await fetchFile(doc.id)], doc.original_name, { type: doc.mime_type }),

    update: (id, data) => apiRequest(`/documents/update.php?id=${id}`, 'PUT', data),

    delete: (id) => apiRequest(`/documents/delete.php?id=${id}`, 'DELETE'),

    download: async (doc) => {
        const url = URL.createObjectURL(await fetchFile(doc.id));
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.original_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    // The tab is opened synchronously (popup blockers), the file is loaded into it afterwards
    preview: async (doc) => {
        const win = window.open('', '_blank');
        try {
            const url = URL.createObjectURL(await fetchFile(doc.id, true));
            if (win) win.location.href = url;
            else window.location.href = url;
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            win?.close();
            throw err;
        }
    },
};

export default documentsService;
