import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { listTrash, restoreFromTrash } from '../../services/trash';

const TYPE_LABEL = {
    collaboration: 'Współpraca',
    purchase: 'Zakup',
    idea: 'Pomysł',
    document: 'Dokument',
    attachment: 'Załącznik',
};

const BUMP = { collaboration: 'collaborations', purchase: 'purchases', idea: 'ideas', document: 'documents' };

/**
 * Kosz: what was deleted in the last 30 days - one tap puts it back.
 */
export default function TrashSheet({ open, onClose }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const { bump } = useQuickActions();
    const [items, setItems] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(() => {
        listTrash()
            .then((list) => setItems(Array.isArray(list) ? list : []))
            .catch(() => setItems([]));
    }, []);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const restore = async (item) => {
        setBusyId(item.id);
        try {
            await restoreFromTrash(item.id);
            setItems((list) => list.filter((i) => i.id !== item.id));
            toast.success(`Przywrócone: ${item.title}`);
            if (BUMP[item.entity_type]) bump(BUMP[item.entity_type]);
            refresh();
        } catch (err) {
            toast.error(err.message || 'Nie udało się przywrócić');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Kosz" description="Usunięte rzeczy czekają tu 30 dni, potem znikają na dobre." size="sm">
            {items === null ? (
                <p className="text-sm text-ink-muted py-6 text-center">Ładowanie…</p>
            ) : items.length === 0 ? (
                <EmptyState icon={Trash2} title="Kosz jest pusty" text="Nic nie usunęłaś w ostatnich 30 dniach." />
            ) : (
                <div className="card divide-y divide-line overflow-hidden">
                    {items.map((item) => (
                        <div key={item.id} className="row">
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-ink truncate">{item.title || TYPE_LABEL[item.entity_type]}</span>
                                <span className={`block text-xs ${Number(item.days_left) <= 3 ? 'text-secondary font-medium' : 'text-ink-muted'}`}>
                                    {TYPE_LABEL[item.entity_type]} · zniknie za {item.days_left} {Number(item.days_left) === 1 ? 'dzień' : 'dni'}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={() => restore(item)}
                                disabled={busyId === item.id}
                                className="h-10 px-3 rounded-full border border-line-strong text-xs font-semibold text-ink inline-flex items-center gap-1.5 hover:bg-surface-2 shrink-0 disabled:opacity-50"
                            >
                                <RotateCcw size={14} /> Przywróć
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </Sheet>
    );
}
