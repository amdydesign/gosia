import { useEffect, useState } from 'react';

/**
 * useState that survives leaving the screen and closing the app (localStorage, JSON).
 * For things the screen should "remember": filters, search, folds, tabs.
 * `valid(value)` may reject a stored value that no longer makes sense.
 */
export function readStored(key, fallback, valid) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const value = JSON.parse(raw);
        return valid && !valid(value) ? fallback : value;
    } catch {
        return fallback;
    }
}

export function writeStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // private mode / full storage - remembered for this visit only
    }
}

export function usePersistentState(key, initial, valid) {
    const [value, setValue] = useState(() => readStored(key, typeof initial === 'function' ? initial() : initial, valid));
    useEffect(() => {
        writeStored(key, value);
    }, [key, value]);
    return [value, setValue];
}
