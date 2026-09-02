import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Sheet from '../components/ui/Sheet';
import Button from '../components/ui/Button';

const ConfirmContext = createContext(null);

/**
 * Promise-based confirm dialog replacing window.confirm().
 * const confirm = useConfirm();
 * if (await confirm({ title: 'Usunąć?', danger: true })) { ... }
 */
export function ConfirmProvider({ children }) {
    const [state, setState] = useState(null);
    const resolver = useRef(null);

    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            resolver.current = resolve;
            setState({
                title: 'Jesteś pewna?',
                message: '',
                confirmLabel: 'Tak, potwierdzam',
                cancelLabel: 'Anuluj',
                danger: false,
                ...options,
            });
        });
    }, []);

    const close = (result) => {
        resolver.current?.(result);
        resolver.current = null;
        setState(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Sheet
                open={!!state}
                onClose={() => close(false)}
                size="sm"
                footer={
                    state && (
                        <>
                            <Button variant="secondary" className="flex-1" onClick={() => close(false)}>
                                {state.cancelLabel}
                            </Button>
                            <Button variant={state.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)} autoFocus>
                                {state.confirmLabel}
                            </Button>
                        </>
                    )
                }
            >
                {state && (
                    <div className="flex gap-4 pt-2">
                        <div
                            className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center ${state.danger ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}
                        >
                            <AlertTriangle size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-ink tracking-tight">{state.title}</h2>
                            {state.message && <p className="text-sm text-ink-soft mt-1 leading-relaxed">{state.message}</p>}
                        </div>
                    </div>
                )}
            </Sheet>
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx;
}
