/**
 * Inbox: screens shared from the iPhone (Skróty) or dropped into "Zrzuć tutaj" (api/inbox/).
 */
import { apiFetch, apiRequest } from '../utils/api';

/** Send a screen (and/or text) - AI says what it is; a task or an idea is saved right away. */
export async function uploadToInbox(file, text = '') {
    const form = new FormData();
    if (file) form.append('file', file, file.name || 'screen.png');
    if (text) form.append('text', text);
    const res = await apiFetch('/inbox/upload.php', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'Nie udało się wysłać screena');
    return data.data;
}

/** The screen of an item as a File (to hand to the purchase / collaboration / document flow). */
export async function inboxFile(item) {
    if (!item?.has_file) return null;
    const res = await apiFetch(`/inbox/file.php?id=${item.id}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return new File([blob], item.original_name || `screen-${item.id}.${ext}`, { type: blob.type });
}

export function markInboxDone(id) {
    return apiRequest(`/inbox/index.php?done=${id}`, 'POST', {});
}

export function reopenInbox(id) {
    return apiRequest(`/inbox/index.php?undo=${id}`, 'POST', {});
}

export function getShareToken(renew = false) {
    return apiRequest('/inbox/token.php', renew ? 'POST' : 'GET', renew ? {} : null);
}
