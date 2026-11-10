import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A half-filled form survives closing the sheet, a lost session or a killed app.
 *   const draft = useDraft('collab.new');      // falsy name = no draft
 *   draft.initial   - what was saved last time (null when nothing)
 *   draft.restored  - true while the form shows a restored draft ("Przywrócono szkic")
 *   draft.save(v)   - remember (debounced); only plain JSON - never File / Blob
 *   draft.clear()   - after a successful save or "Wyczyść"
 */
const PREFIX = 'gonia.draft.';
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const DELAY_MS = 400;

function readDraft(name) {
    try {
        const saved = JSON.parse(localStorage.getItem(PREFIX + name) || 'null');
        if (!saved || typeof saved.t !== 'number' || Date.now() - saved.t > MAX_AGE_MS) return null;
        return saved.v ?? null;
    } catch {
        return null;
    }
}

function writeDraft(name, value) {
    try {
        localStorage.setItem(PREFIX + name, JSON.stringify({ t: Date.now(), v: value }));
    } catch {
        // storage blocked / full - the draft lives only while the form is open
    }
}

function removeDraft(name) {
    try {
        localStorage.removeItem(PREFIX + name);
    } catch {
        // nothing to remove
    }
}

/** Logging out: the next person must not get someone else's half-written form. */
export function clearAllDrafts() {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(PREFIX))
            .forEach((k) => localStorage.removeItem(k));
    } catch {
        // storage blocked
    }
}

export function useDraft(name) {
    const [initial] = useState(() => (name ? readDraft(name) : null));
    const [restored, setRestored] = useState(initial !== null);
    const pending = useRef(null); // { value } waiting to be written
    const timer = useRef(null);
    const nameRef = useRef(name);
    useEffect(() => {
        nameRef.current = name;
    }, [name]);

    const flush = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = null;
        if (pending.current && nameRef.current) writeDraft(nameRef.current, pending.current.value);
        pending.current = null;
    }, []);

    const save = useCallback(
        (value) => {
            if (!nameRef.current) return;
            pending.current = { value };
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, DELAY_MS);
        },
        [flush]
    );

    const clear = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = null;
        pending.current = null;
        if (nameRef.current) removeDraft(nameRef.current);
        setRestored(false);
    }, []);

    // Nothing typed in the last moment is lost: write on leaving the form, hiding the app, reload (lost session)
    useEffect(() => {
        const onHide = () => document.visibilityState === 'hidden' && flush();
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onHide);
        return () => {
            window.removeEventListener('pagehide', flush);
            document.removeEventListener('visibilitychange', onHide);
            flush();
        };
    }, [flush]);

    return { initial, restored, save, clear };
}
