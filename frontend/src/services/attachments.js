import { apiFetch } from '../utils/api';

/** One file attached to a collaboration / purchase (e.g. the brief it was created from). */
export async function uploadAttachment(entityType, entityId, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);
    const response = await apiFetch('/attachments/upload.php', { method: 'POST', body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        const firstError = data.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
        throw new Error(firstError || data.message || 'Błąd przesyłania pliku');
    }
    return data.data;
}
