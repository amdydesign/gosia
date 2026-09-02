import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const push = useCallback(
        (type, message, { duration = 3200, action } = {}) => {
            const id = ++counter;
            setToasts((prev) => [...prev.slice(-3), { id, type, message, action }]);
            timers.current.set(id, setTimeout(() => dismiss(id), duration));
            return id;
        },
        [dismiss]
    );

    const api = useMemo(
        () => ({
            success: (msg, opts) => push('success', msg, opts),
            error: (msg, opts) => push('error', msg, { duration: 5000, ...opts }),
            info: (msg, opts) => push('info', msg, opts),
            dismiss,
        }),
        [push, dismiss]
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-24 lg:bottom-auto lg:top-5 lg:right-5 lg:inset-x-auto z-[100] flex flex-col items-center lg:items-end gap-2 px-4">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onClose }) {
    const styles = {
        success: { icon: CheckCircle2, cls: 'bg-ink text-white', iconCls: 'text-emerald-400' },
        error: { icon: AlertTriangle, cls: 'bg-red-600 text-white', iconCls: 'text-white' },
        info: { icon: Info, cls: 'bg-ink text-white', iconCls: 'text-sky-300' },
    }[toast.type];
    const Icon = styles.icon;

    return (
        <div
            className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl max-w-sm w-full lg:w-auto animate-toast-in ${styles.cls}`}
            role="status"
        >
            <Icon size={18} className={`shrink-0 ${styles.iconCls}`} />
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            {toast.action && (
                <button
                    type="button"
                    onClick={() => {
                        toast.action.onClick();
                        onClose();
                    }}
                    className="text-xs font-bold uppercase tracking-wide text-primary-300 hover:text-white"
                >
                    {toast.action.label}
                </button>
            )}
            <button type="button" onClick={onClose} className="shrink-0 -mr-1 p-1 rounded-full opacity-60 hover:opacity-100" aria-label="Zamknij">
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
