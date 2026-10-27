/**
 * "Udostępnij": files with a public link (api/share, public page in /share).
 *
 * Uploads go in pieces (a few MB each), so the size is not limited by the hosting.
 * The queue lives here, outside the page: going to another tab does not stop it,
 * and coming back shows the progress where it was.
 */
import { useSyncExternalStore } from 'react';
import { apiFetch, apiRequest } from '../utils/api';
import { makePoster } from '../utils/poster';

export const listShares = () => apiRequest('/share/index.php');
export const updateShare = (id, data) => apiRequest(`/share/update.php?id=${id}`, 'PUT', data);
export const deleteShare = (id) => apiRequest(`/share/delete.php?id=${id}`, 'DELETE');
export const posterUrl = (share) => (share.has_poster ? `/api/share/poster.php?id=${share.id}` : null);

/** Send the link: share sheet on the phone, clipboard elsewhere. @return 'shared' | 'copied' | null */
export async function sendLink(share) {
    if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        try {
            await navigator.share({ title: share.title, url: share.url });
            return 'shared';
        } catch (err) {
            if (err?.name === 'AbortError') return null;
        }
    }
    return (await copyLink(share)) ? 'copied' : null;
}

export async function copyLink(share) {
    try {
        await navigator.clipboard.writeText(share.url);
        return true;
    } catch {
        return false;
    }
}

// ---- upload queue -------------------------------------------------------

let uploads = []; // { key, name, size, sent, status: 'waiting'|'uploading'|'saving'|'error', error }
const listeners = new Set();
const controllers = new Map(); // key -> AbortController
const finishedListeners = new Set();
let running = false;
let wakeLock = null;

function emit() {
    uploads = [...uploads];
    listeners.forEach((l) => l());
}

function patch(key, data) {
    uploads = uploads.map((u) => (u.key === key ? { ...u, ...data } : u));
    emit();
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useShareUploads() {
    return useSyncExternalStore(subscribe, () => uploads);
}

/** Called with the new share each time a file is ready. */
export function onShareUploaded(listener) {
    finishedListeners.add(listener);
    return () => finishedListeners.delete(listener);
}

export function queueShareUploads(files) {
    const added = files.map((file, i) => ({
        key: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        sent: 0,
        status: 'waiting',
        error: '',
    }));
    uploads = [...added, ...uploads];
    emit();
    run();
}

export function cancelShareUpload(key) {
    controllers.get(key)?.abort();
    uploads = uploads.filter((u) => u.key !== key);
    emit();
}

export function retryShareUpload(key) {
    patch(key, { status: 'waiting', error: '' });
    run();
}

async function post(endpoint, body, signal, headers = {}) {
    const response = await apiFetch(endpoint, { method: 'POST', body, signal, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
        const error = new Error(Object.values(data.errors || {}).find((v) => typeof v === 'string') || data.message || 'Błąd wysyłania');
        error.status = response.status;
        error.offset = data.errors?.offset;
        throw error;
    }
    return data.data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadOne(item) {
    const controller = new AbortController();
    controllers.set(item.key, controller);
    const { signal } = controller;
    const { file } = item;

    const posterJob = makePoster(file).catch(() => null);
    const start = await post('/share/start.php', JSON.stringify({ name: file.name, size: file.size }), signal, { 'Content-Type': 'application/json' });
    let offset = start.offset || 0;
    let failures = 0;

    while (offset < file.size) {
        const end = Math.min(offset + start.chunk_size, file.size);
        try {
            const res = await post(
                `/share/chunk.php?upload_id=${start.upload_id}&offset=${offset}`,
                file.slice(offset, end),
                signal,
                { 'Content-Type': 'application/octet-stream' }
            );
            offset = res.offset;
            failures = 0;
            patch(item.key, { sent: offset });
        } catch (err) {
            if (signal.aborted) throw err;
            // network hiccup (phone switching Wi-Fi / LTE): a few more tries, then give up
            failures += 1;
            if (err.status === 409 && typeof err.offset === 'number' && failures <= 6) {
                offset = err.offset; // the server knows where we are - continue from there
                continue;
            }
            if (failures > 6 || err.status === 404 || err.status === 422) throw err;
            patch(item.key, { error: 'Słaby internet — próbuję dalej…' });
            await wait(Math.min(30000, 1500 * 2 ** failures));
            patch(item.key, { error: '' });
        }
    }

    patch(item.key, { status: 'saving' });
    const form = new FormData();
    form.append('upload_id', start.upload_id);
    const poster = await posterJob;
    if (poster) form.append('poster', poster, 'poster.jpg');
    return post('/share/finish.php', form, signal);
}

async function keepAwake(on) {
    try {
        if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
        if (!on && wakeLock) {
            await wakeLock.release();
            wakeLock = null;
        }
    } catch {
        wakeLock = null;
    }
}

const warnLeaving = (e) => {
    e.preventDefault();
    e.returnValue = '';
};

async function run() {
    if (running) return;
    running = true;
    window.addEventListener('beforeunload', warnLeaving);
    try {
        for (;;) {
            const next = [...uploads].reverse().find((u) => u.status === 'waiting'); // oldest first
            if (!next) break;
            await keepAwake(true); // the phone screen going dark would cut the upload
            patch(next.key, { status: 'uploading', error: '' });
            try {
                const share = await uploadOne(next);
                uploads = uploads.filter((u) => u.key !== next.key);
                emit();
                finishedListeners.forEach((l) => l(share));
            } catch (err) {
                if (uploads.some((u) => u.key === next.key)) {
                    patch(next.key, { status: 'error', error: err.message || 'Nie udało się wysłać' });
                }
            } finally {
                controllers.delete(next.key);
            }
        }
    } finally {
        running = false;
        window.removeEventListener('beforeunload', warnLeaving);
        keepAwake(false);
    }
}
