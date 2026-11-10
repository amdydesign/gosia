import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal that renders as a bottom sheet on mobile and a centered dialog on desktop.
 * closeOnBackdrop={false}: a form with unsaved input does not close on a stray tap
 * outside (X / "Anuluj" / Escape still close).
 * Keyboard: focus moves into the sheet, Tab stays inside, closing returns focus to the opener.
 */
export default function Sheet({ open, onClose, title, description, children, footer, size = 'md', tone = 'default', closeOnBackdrop = true }) {
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const titleId = useId();
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return undefined;
        // only the sheet on top reacts (settings open their own sheets over this one)
        const onTop = () => {
            const all = document.querySelectorAll('[data-sheet]');
            return all[all.length - 1] === rootRef.current;
        };
        const onKey = (e) => {
            if (!onTop()) return;
            if (e.key === 'Escape') {
                closeRef.current?.();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
            if (!items.length) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (!panelRef.current.contains(active) || active === panelRef.current) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
            } else if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Focus: into the sheet (the panel itself, so no keyboard pops up on the phone), back to the opener after
        const opener = document.activeElement;
        if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus({ preventScroll: true });

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
            // (not back into a text field - on a phone that would pop the keyboard up again)
            if (opener instanceof HTMLElement && opener !== document.body && document.contains(opener) && !opener.matches('input, textarea, select, [contenteditable]')) {
                opener.focus({ preventScroll: true });
            }
        };
    }, [open]);

    if (!open) return null;

    const maxW = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' }[size] || 'sm:max-w-md';

    // Rendered into <body> so no page wrapper can trap it under the top bar
    return createPortal(
        <div
            ref={rootRef}
            data-sheet=""
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/60 animate-fade-in"
            onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose?.()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className={`w-full ${maxW} bg-surface border border-line-strong rounded-t-3xl sm:rounded-3xl shadow-sheet flex flex-col max-h-[92dvh] animate-slide-up sm:animate-scale-in outline-none`}
            >
                <div className="sm:hidden flex justify-center pt-2.5">
                    <div className="h-1 w-10 rounded-full bg-slate-300" />
                </div>
                {(title || onClose) && (
                    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
                        <div className="min-w-0">
                            {title && (
                                <h2 id={titleId} className={`text-lg font-bold tracking-tight ${tone === 'danger' ? 'text-red-700' : 'text-ink'}`}>
                                    {title}
                                </h2>
                            )}
                            {description && <p className="text-sm text-ink-soft mt-0.5">{description}</p>}
                        </div>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="shrink-0 -mr-3 -mt-2 w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:bg-ink/5 hover:text-ink transition-colors"
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
        </div>,
        document.body
    );
}
