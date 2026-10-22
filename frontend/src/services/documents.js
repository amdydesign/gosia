import { apiRequest, getStoredToken } from '../utils/api';

async function fetchFile(id, inline = false) {
    const response = await fetch(`/api/documents/download.php?id=${id}${inline ? '&inline=1' : ''}`, {
        headers: { Authorization: `Bearer ${getStoredToken()}` },
        cache: 'no-store',
    });
    if (!response.ok) throw new Error('Nie udało się pobrać pliku');
    return response.blob();
}

export const documentsService = {
    search: (query = '') => apiRequest(`/documents/index.php${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`),

    upload: async ({ file, title, notes, status, contentText }) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('notes', notes || '');
        formData.append('status', status || 'signed');
        if (contentText) formData.append('content_text', contentText);

        let response;
        try {
            response = await fetch('/api/documents/upload.php', {
                method: 'POST',
                headers: { Authorization: `Bearer ${getStoredToken()}` },
                body: formData,
            });
        } catch {
            throw new Error('Brak połączenia z serwerem');
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
            const firstError = data.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
            throw new Error(firstError || data.message || 'Błąd przesyłania pliku');
        }
        return data.data;
    },

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
