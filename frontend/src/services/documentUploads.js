/**
 * Documents on their way to the archive (OCR -> upload -> optional AI analysis).
 * The queue lives here, outside the page (like services/shares.js): going to another
 * screen does not lose the progress rows or the errors, and the result is announced
 * with a toast wherever she is by then.
 *
 * Each job: { key, name, error?, prepare(onStatus) -> { file, text } }. Jobs run one by one (OCR is heavy).
 */
import { useSyncExternalStore } from 'react';
import documentsService from './documents';
import { notify } from '../utils/notify';

let uploads = []; // { key, name, stage, error, duplicateId }
const listeners = new Set();
const changeListeners = new Set();
let chain = Promise.resolve();

function setRows(update) {
    uploads = update(uploads);
    listeners.forEach((l) => l());
}

const patch = (key, data) => setRows((prev) => prev.map((u) => (u.key === key ? { ...u, ...data } : u)));

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function useDocumentUploads() {
    return useSyncExternalStore(subscribe, () => uploads);
}

/** Hide a row (an error that was read, a duplicate that was opened). */
export function dismissDocumentUpload(key) {
    setRows((prev) => prev.filter((u) => u.key !== key));
}

/** Called when the archive changed: 'list' = a document was added / analysed, 'done' = a batch finished. */
export function onDocumentsChanged(listener) {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
}

const changed = (what) => changeListeners.forEach((l) => l(what));

async function runBatch(jobs, status, ai) {
    let done = 0;
    for (const job of jobs.filter((j) => !j.error)) {
        try {
            const { file, text } = await job.prepare((stage) => patch(job.key, { stage }));
            patch(job.key, { stage: 'Wysyłanie…' });
            const uploaded = await documentsService.upload({ file, title: '', status, contentText: text });
            if (ai) {
                patch(job.key, { stage: 'AI analizuje dokument…' });
                changed('list');
                try {
                    await documentsService.analyze(uploaded.id);
                } catch (err) {
                    patch(job.key, { error: `Dodano, ale analiza AI się nie udała: ${err.message}` });
                    notify.error(`${job.name}: dodano, ale analiza AI się nie udała`);
                    changed('list');
                    continue;
                }
            }
            dismissDocumentUpload(job.key);
            done += 1;
            changed('list');
        } catch (err) {
            patch(job.key, { error: err.message || 'Nie udało się dodać pliku', duplicateId: err.duplicateId || null });
            // also when she is on another screen by now - a lost contract must not go unnoticed
            notify.error(`Nie dodano: ${job.name} — ${err.message || 'spróbuj jeszcze raz'}`);
        }
    }
    if (done) {
        notify.success(done === 1 ? 'Dokument dodany' : `Dodano dokumenty: ${done}`);
        changed('done');
    }
    return done;
}

/** @return Promise<number> - how many documents were really added */
export function queueDocumentUploads(jobs, status, ai = false) {
    setRows((prev) => [...jobs.map(({ key, name, error }) => ({ key, name, error: error || '', stage: 'Czekam…' })), ...prev]);
    const result = chain.then(() => runBatch(jobs, status, ai));
    chain = result.catch(() => {});
    return result;
}
