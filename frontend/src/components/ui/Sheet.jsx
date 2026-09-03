import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Modal that renders as a bottom sheet on mobile and a centered dialog on desktop.
 */
export default function Sheet({ open, onClose, title, description, children, footer, size = 'md', tone = 'default' }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => e.key === 'Escape' && onClose?.();
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    const maxW = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' }[size] || 'sm:max-w-md';

    return (
        <div
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] animate-fade-in"
            onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
            role="dialog"
            aria-modal="true"
        >
            <div
                className={`w-full ${maxW} bg-surface rounded-t-3xl sm:rounded-3xl shadow-sheet flex flex-col max-h-[92dvh] animate-slide-up sm:animate-scale-in`}
            >
                <div className="sm:hidden flex justify-center pt-2.5">
                    <div className="h-1 w-10 rounded-full bg-slate-300" />
                </div>
                {(title || onClose) && (
                    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
                        <div className="min-w-0">
                            {title && (
                                <h2 className={`text-lg font-bold tracking-tight ${tone === 'danger' ? 'text-red-700' : 'text-ink'}`}>
                                    {title}
                                </h2>
                            )}
                            {description && <p className="text-sm text-ink-soft mt-0.5">{description}</p>}
                        </div>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="shrink-0 -mr-2 -mt-1 p-2 rounded-full text-ink-muted hover:bg-black/5 hover:text-ink transition-colors"
                                aria-label="Zamknij"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                )}
                <div className="px-5 pb-5 overflow-y-auto flex-1 min-h-0">{children}</div>
                {footer && <div className="px-5 py-4 border-t border-line bg-canvas/60 rounded-b-3xl safe-bottom flex gap-3">{footer}</div>}
                {!footer && <div className="safe-bottom" />}
            </div>
        </div>
    );
}
