import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

const TRIGGER = 72; // px of (damped) pull needed to refresh
const MAX = 110;

function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * Pull-to-refresh for the installed app (PWA). iOS / Android browsers have their own,
 * but an app opened from the home screen does not - pulling down at the top of a page
 * reloads it (fresh data and the newest version of the app).
 */
export default function PullToRefresh() {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const start = useRef(null);
    const pullRef = useRef(0);

    useEffect(() => {
        if (!isStandalone()) return undefined;

        const set = (value) => {
            pullRef.current = value;
            setPull(value);
        };

        const onStart = (e) => {
            // only from the very top of the page, one finger, nothing open on top of it
            if (e.touches.length !== 1 || window.scrollY > 0 || document.querySelector('[role="dialog"]')) {
                start.current = null;
                return;
            }
            // a scrolled list / textarea inside the page scrolls first
            for (let el = e.target; el && el !== document.body; el = el.parentElement) {
                if (el.scrollTop > 0) {
                    start.current = null;
                    return;
                }
            }
            start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };

        const onMove = (e) => {
            if (!start.current) return;
            const dy = e.touches[0].clientY - start.current.y;
            const dx = e.touches[0].clientX - start.current.x;
            if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
                if (pullRef.current) set(0);
                if (Math.abs(dx) > Math.abs(dy) || dy < 0) start.current = null;
                return;
            }
            set(Math.min(MAX, dy * 0.5));
        };

        const onEnd = () => {
            if (!start.current) return;
            start.current = null;
            if (pullRef.current >= TRIGGER) {
                setRefreshing(true);
                set(TRIGGER);
                window.location.reload();
            } else {
                set(0);
            }
        };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
        return () => {
            window.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };
    }, []);

    if (!pull && !refreshing) return null;

    const ready = pull >= TRIGGER;
    return (
        <div
            className="fixed left-1/2 z-[60] pointer-events-none"
            style={{ top: 'env(safe-area-inset-top)', transform: `translate(-50%, ${pull - 28}px)`, transition: refreshing ? 'transform 0.2s' : 'none' }}
            aria-hidden="true"
        >
            <div className={`w-10 h-10 rounded-full bg-surface shadow-float border border-line flex items-center justify-center ${ready ? 'text-primary-600' : 'text-ink-muted'}`}>
                <RotateCw
                    size={18}
                    strokeWidth={2.5}
                    className={refreshing ? 'animate-spin' : ''}
                    style={refreshing ? undefined : { transform: `rotate(${(pull / TRIGGER) * 300}deg)`, opacity: Math.min(1, pull / TRIGGER + 0.2) }}
                />
            </div>
        </div>
    );
}
