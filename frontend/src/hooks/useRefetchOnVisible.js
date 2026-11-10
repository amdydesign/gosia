import { useEffect, useRef } from 'react';

/**
 * Lists must not show yesterday's data when the app comes back from the background:
 * calls `refetch` when the page is visible again after being hidden for a while.
 */
export function useRefetchOnVisible(refetch, minHiddenMs = 60 * 1000) {
    const fn = useRef(refetch);
    useEffect(() => {
        fn.current = refetch;
    }, [refetch]);

    useEffect(() => {
        let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
        const onChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
            } else if (hiddenAt !== null) {
                const away = Date.now() - hiddenAt;
                hiddenAt = null;
                if (away >= minHiddenMs) fn.current?.();
            }
        };
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
    }, [minHiddenMs]);
}
