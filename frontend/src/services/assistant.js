import { apiFetch, apiRequest } from '../utils/api';

/** Chats, models and whether the assistant is on (a Claude key is set). */
export const listChats = () => apiRequest('/assistant/chats.php');

export const getChat = (id) => apiRequest(`/assistant/chats.php?id=${id}`);

export const deleteChat = (id) => apiRequest(`/assistant/chats.php?id=${id}`, 'DELETE');

export const restoreChat = (id) => apiRequest('/assistant/chats.php', 'POST', { restore: id });

/**
 * Send a message and read the reply as it is written.
 * onEvent(name, data): chat | status | tool | text | source | task | done | error | dropped
 * "dropped": the connection ended before the reply did - the server keeps writing it.
 * Resolves when the stream ends; throws only when the request itself fails.
 */
export async function sendMessage({ chatId, model, message, images = [], onEvent, signal }) {
    const response = await apiFetch('/assistant/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ chat_id: chatId || undefined, model, message, images }),
        signal,
    });

    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/event-stream')) {
        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }
        const fieldError = data?.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
        throw new Error(fieldError || data?.message || 'Asystent nie odpowiedział. Spróbuj jeszcze raz.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let ended = false;

    const handle = (raw) => {
        let name = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) name = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) return;
        try {
            const parsed = JSON.parse(data);
            if (name === 'done' || name === 'error') ended = true;
            onEvent(name, parsed);
        } catch {
            // broken line - skip
        }
    };

    for (;;) {
        let chunk;
        try {
            chunk = await reader.read();
        } catch {
            // the phone went to sleep or lost the network mid-answer
            break;
        }
        const { value, done } = chunk;
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let pos;
        while ((pos = buffer.indexOf('\n\n')) !== -1) {
            handle(buffer.slice(0, pos));
            buffer = buffer.slice(pos + 2);
        }
    }
    if (buffer.trim()) handle(buffer);
    if (!ended) onEvent('dropped', {});
}
