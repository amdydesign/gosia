import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';
import Sheet from '../ui/Sheet';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { discardFromTrash, listTrash, restoreFromTrash } from '../../services/trash';

const TYPE_LABEL = {
    collaboration: 'Współpraca',
    purchase: 'Zakup',
    idea: 'Pomysł',
    document: 'Dokument',
    attachment: 'Załącznik',
    share: 'Udostępniony plik',
};

const BUMP = { collaboration: 'collaborations', purchase: 'purchases', idea: 'ideas', document: 'documents', share: 'shares' };

/**
 * Kosz: what was deleted in the last 30 days - one tap puts it back.
 * Emptying (all or one thing) asks first - that one cannot be undone.
 */
export default function TrashSheet({ open, onClose }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const { bump } = useQuickActions();
    const confirm = useConfirm();
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

    // Gone for good (files too) - only after "Tak, usuń"
    const discard = async (gone) => {
        if (!gone.length) return;
        const one = gone.length === 1;
        const ok = await confirm({
            title: one ? 'Usunąć na zawsze?' : `Opróżnić kosz (${gone.length})?`,
            message: one
                ? `„${gone[0].title || TYPE_LABEL[gone[0].entity_type]}” zniknie razem z plikami. Tego nie da się cofnąć.`
                : 'Wszystko z kosza zniknie razem z plikami. Tego nie da się cofnąć.',
            confirmLabel: one ? 'Tak, usuń' : 'Tak, opróżnij',
            danger: true,
        });
        if (!ok) return;
        const ids = gone.map((i) => i.id);
        setItems((list) => list.filter((i) => !ids.includes(i.id)));
        try {
            await discardFromTrash(ids);
            new Set(gone.map((i) => i.entity_type)).forEach((type) => BUMP[type] && bump(BUMP[type])); // e.g. the space counter in Udostępnij
            toast.success(one ? 'Usunięte na zawsze' : 'Kosz opróżniony');
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć');
            load();
        }
    };

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
        <Sheet open={open} onClose={onClose} title="Kosz" description="Usunięte rzeczy czekają tu 30 dni, potem znikają same. Możesz też opróżnić kosz od razu." size="sm">
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
                            <button
                                type="button"
                                onClick={() => discard([item])}
                                disabled={busyId === item.id}
                                className="-mr-1 w-9 h-9 rounded-full text-ink-muted hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center shrink-0 disabled:opacity-50"
                                aria-label="Usuń na zawsze"
                                title="Usuń na zawsze"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {items?.length > 0 && (
                <button
                    type="button"
                    onClick={() => discard(items)}
                    className="btn btn-ghost w-full mt-3 !text-red-600 hover:!bg-red-50"
                >
                    <Trash2 size={16} /> Opróżnij kosz · {items.length}
                </button>
            )}
        </Sheet>
    );
}
