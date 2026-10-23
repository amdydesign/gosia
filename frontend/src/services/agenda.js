/**
 * Start screen actions: snooze ("Przypomnij później"), tasks and the quick capture.
 */
import { apiRequest } from '../utils/api';

export const SNOOZE_PRESETS = [
    { value: 'hour', label: 'Za godzinę' },
    { value: 'evening', label: 'Wieczorem (19:00)' },
    { value: 'tomorrow', label: 'Jutro 9:00' },
];

export function snooze(item, preset = 'tomorrow') {
    return apiRequest('/reminders/create.php', 'POST', { ref_key: item.ref_key, title: item.title, url: item.url, preset });
}

export function cancelSnooze(refKey) {
    return apiRequest(`/reminders/delete.php?ref_key=${encodeURIComponent(refKey)}`, 'DELETE');
}

export function createTask(title, dueDate) {
    return apiRequest('/tasks/create.php', 'POST', { title, ...(dueDate ? { due_date: dueDate } : {}) });
}

export function setTaskDone(id, done) {
    return apiRequest(`/tasks/update.php?id=${id}`, 'PUT', { done });
}

export function deleteTask(id) {
    return apiRequest(`/tasks/delete.php?id=${id}`, 'DELETE');
}

/** AI sorts a quick note into idea / task / purchase / collaboration (Claude Haiku). */
export function classifyNote(text) {
    return apiRequest('/ai/capture.php', 'POST', { text });
}

export function createIdea(title, content = '') {
    return apiRequest('/ideas/create.php', 'POST', { title, content });
}

export function deleteIdea(id) {
    return apiRequest(`/ideas/delete.php?id=${id}`, 'DELETE');
}

export function setPurchaseStatus(id, patch) {
    return apiRequest(`/purchases/update.php?id=${id}`, 'PUT', patch);
}

/** "jutro, pt 24.10" style label for a YYYY-MM-DD deadline. */
export function deadlineLabel(days, deadline) {
    if (days === 0) return 'dziś, ostatni dzień';
    if (days === 1) return `jutro, ${shortDay(deadline)}`;
    return `${shortDay(deadline)} (za ${days} dni)`;
}

function shortDay(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const wd = new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(date).replace('.', '');
    return `${wd} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

/** Hours left until the end of the deadline day (returns are accepted all day). */
export function hoursLeft(deadline) {
    if (!deadline) return null;
    const [y, m, d] = deadline.split('-').map(Number);
    const end = new Date(y, m - 1, d, 23, 59, 59);
    return Math.max(0, Math.round((end - Date.now()) / 3600000));
}
