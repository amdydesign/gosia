import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Per-device look & privacy: theme (dark / light / auto) and "Ukryj kwoty".
 * Applied as data attributes on <html> so CSS tokens and `.amount` follow.
 * index.html sets data-theme before React loads, so there is no flash.
 */
const PreferencesContext = createContext(null);

const THEME_KEY = 'gonia.theme';
const HIDE_DEFAULT_KEY = 'gonia.hideAmountsDefault';
const THEME_COLORS = { dark: '#0b0b0d', light: '#f3f3ef' };

function read(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // private mode - preference lasts for this visit only
    }
}

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function PreferencesProvider({ children }) {
    const [theme, setThemeState] = useState(() => read(THEME_KEY, 'auto'));
    const [systemDark, setSystemDark] = useState(() => !!darkQuery()?.matches);
    const [hideByDefault, setHideByDefaultState] = useState(() => read(HIDE_DEFAULT_KEY, '0') === '1');
    const [amountsHidden, setAmountsHidden] = useState(() => read(HIDE_DEFAULT_KEY, '0') === '1');

    useEffect(() => {
        const mq = darkQuery();
        if (!mq) return undefined;
        const onChange = (e) => setSystemDark(e.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);

    const resolvedTheme = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolvedTheme;
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', THEME_COLORS[resolvedTheme]));
    }, [resolvedTheme]);

    useEffect(() => {
        document.documentElement.dataset.hideAmounts = amountsHidden ? 'true' : 'false';
    }, [amountsHidden]);

    const setTheme = useCallback((value) => {
        setThemeState(value);
        write(THEME_KEY, value);
    }, []);

    const setHideByDefault = useCallback((value) => {
        setHideByDefaultState(value);
        setAmountsHidden(value);
        write(HIDE_DEFAULT_KEY, value ? '1' : '0');
    }, []);

    const toggleAmounts = useCallback(() => setAmountsHidden((v) => !v), []);

    const value = useMemo(
        () => ({ theme, setTheme, resolvedTheme, amountsHidden, toggleAmounts, hideByDefault, setHideByDefault }),
        [theme, setTheme, resolvedTheme, amountsHidden, toggleAmounts, hideByDefault, setHideByDefault]
    );

    return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
    return ctx;
}
