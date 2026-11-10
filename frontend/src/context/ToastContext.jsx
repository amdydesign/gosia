import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { setToastApi } from '../utils/notify';

const ToastContext = createContext(null);

let counter = 0;

// With an action ("Cofnij") there must be time to notice it and reach it
const DURATION_MS = 3200;
const ACTION_DURATION_MS = 9000;

/**
 * push(type, message, { duration, action: { label, onClick }, key })
 *   duration 0  - stays until closed ("Nowa wersja")
 *   key         - a toast with the same key replaces the earlier one
 * The countdown lives in ToastItem: it pauses while the toast is touched / hovered.
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((type, message, { duration, action, key } = {}) => {
        const id = ++counter;
        // callers' own 5-6 s were too short to reach "Cofnij": an action always gets at least 9 s
        const ms = duration === 0 ? 0 : action ? Math.max(duration || 0, ACTION_DURATION_MS) : duration || DURATION_MS;
        setToasts((prev) => {
            const rest = key ? prev.filter((t) => t.key !== key) : prev;
            const sticky = rest.filter((t) => !t.duration);
            return [...sticky, ...rest.filter((t) => t.duration).slice(-3), { id, type, message, action, key, duration: ms }];
        });
        return id;
    }, []);

    const api = useMemo(
        () => ({
            success: (msg, opts) => push('success', msg, opts),
            error: (msg, opts) => push('error', msg, { duration: 5000, ...opts }),
            info: (msg, opts) => push('info', msg, opts),
            dismiss,
        }),
        [push, dismiss]
    );

    // upload queues and lazy-loaded engines report through utils/notify
    useEffect(() => {
        setToastApi(api);
        return () => setToastApi(null);
    }, [api]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] lg:top-5 lg:right-5 lg:inset-x-auto z-[100] flex flex-col items-center lg:items-end gap-2 px-4">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onClose={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// "Ukryj kwoty" covers toasts too: "Dodano: Zara · 3 000 zł" -> "Dodano: Zara · ••• zł"
const MONEY = /[+−-]?\d[\d\s\u00a0.,]*\s?zł/g;
function maskAmounts(text) {
    if (typeof text !== 'string' || document.documentElement.dataset.hideAmounts !== 'true') return text;
    return text.replace(MONEY, '••• zł');
}

function ToastItem({ toast, onClose }) {
    const styles = {
        success: { icon: CheckCircle2, cls: 'bg-ink text-canvas', iconCls: 'text-emerald-400' },
        error: { icon: AlertTriangle, cls: 'bg-red-600 text-white', iconCls: 'text-white' },
        info: { icon: Info, cls: 'bg-ink text-canvas', iconCls: 'text-sky-300' },
    }[toast.type];
    const Icon = styles.icon;
    const { id, duration } = toast;

    // Countdown that stops while a finger / the pointer is on the toast
    const [paused, setPaused] = useState(false);
    const remaining = useRef(duration);
    useEffect(() => {
        if (!duration || paused) return undefined;
        const started = Date.now();
        const timer = setTimeout(() => onClose(id), Math.max(800, remaining.current));
        return () => {
            clearTimeout(timer);
            remaining.current -= Date.now() - started;
        };
    }, [id, duration, paused, onClose]);

    const hold = () => setPaused(true);
    const release = () => setPaused(false);

    return (
        <div
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl max-w-sm w-full lg:w-auto animate-toast-in ${styles.cls}`}
            role="status"
            onPointerEnter={hold}
            onPointerLeave={release}
            onTouchStart={hold}
            onTouchEnd={release}
            onTouchCancel={release}
        >
            <Icon size={18} className={`shrink-0 ${styles.iconCls}`} />
            <span className="text-sm font-medium flex-1">{maskAmounts(toast.message)}</span>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        toast.action.onClick();
                        onClose(id);
                    }}
                    className="shrink-0 -my-3 min-h-11 min-w-11 px-3 rounded-xl text-xs font-bold uppercase tracking-wide text-primary-300 hover:bg-white/10 active:bg-white/15"
                >
                    {toast.action.label}
                </button>
            )}
            <button
                type="button"
                onClick={() => onClose(id)}
                className="shrink-0 -my-3 -mr-3 w-11 h-11 rounded-full flex items-center justify-center opacity-60 hover:opacity-100"
                aria-label="Zamknij"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}
