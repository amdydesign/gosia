import { useEffect, useState } from 'react';
import { Check, ExternalLink, Heart, Loader2, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Attachments from '../common/Attachments';
import { apiRequest } from '../../utils/api';
import { usePurchaseActions } from '../../hooks/usePurchaseActions';
import { useToast } from '../../context/ToastContext';
import { deletedToast } from '../../services/trash';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { bucket, deadlineText, deadlineTone, recoveredOf, refundPending, RETURN_DAY_PRESETS, withPatch } from '../../utils/purchases';
import { formatCurrency, formatDateLong, openPicker, parseAmount } from '../../utils/format';

/**
 * One purchased item: decide (returned / keep / partial), edit, delete, attachments.
 */
export default function PurchaseDetailSheet({ purchaseId, initial, onClose, onChanged }) {
    const toast = useToast();
    const { bump } = useQuickActions();
    const { refresh } = useDashboard();
    const [purchase, setPurchase] = useState(initial || null);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('view'); // view | partial | edit
    const [partial, setPartial] = useState('');
    const [edit, setEdit] = useState(null);
    const [saving, setSaving] = useState(false);

    const { update, returned, keep, delivered, refunded, busyId } = usePurchaseActions({
        onChange: (id, patch) => {
            setPurchase((p) => withPatch(p, patch));
            onChanged?.(id, patch);
        },
    });

    useEffect(() => {
        if (initial) return undefined;
        let cancelled = false;
        apiRequest(`/purchases/show.php?id=${purchaseId}`)
            .then((p) => !cancelled && setPurchase(p))
            .catch((err) => !cancelled && setError(err.message || 'Nie znaleziono zakupu'));
        return () => {
            cancelled = true;
        };
    }, [purchaseId, initial]);

    if (error || !purchase) {
        return (
            <Sheet open onClose={onClose} size="lg">
                {error ? <p className="py-8 text-center text-sm text-ink-muted">{error}</p> : <div className="py-16 flex justify-center text-ink-muted"><Loader2 className="animate-spin" /></div>}
            </Sheet>
        );
    }

    const state = bucket(purchase);
    const days = Number(purchase.days_remaining);
    const tone = deadlineTone(days);
    const busy = busyId === purchase.id;

    const startEdit = () => {
        setEdit({
            items: purchase.items || '',
            amount: String(Number(purchase.amount) || ''),
            store: purchase.store || '',
            purchase_date: purchase.purchase_date,
            return_days: String(purchase.return_days || 14),
            purchase_url: purchase.purchase_url || '',
            notes: purchase.notes || '',
        });
        setMode('edit');
    };

    const saveEdit = async () => {
        if (!edit.items.trim() || !edit.store.trim()) {
            toast.error('Uzupełnij nazwę i sklep');
            return;
        }
        setSaving(true);
        const patch = {
            items: edit.items.trim(),
            amount: parseAmount(edit.amount),
            store: edit.store.trim(),
            purchase_date: edit.purchase_date,
            return_days: parseInt(edit.return_days, 10) || 0,
            purchase_url: edit.purchase_url.trim(),
            notes: edit.notes.trim(),
        };
        const ok = await update(purchase, patch);
        setSaving(false);
        if (ok) {
            // deadline depends on date + days - reload the computed fields
            try {
                setPurchase(await apiRequest(`/purchases/show.php?id=${purchase.id}`));
            } catch {
                // keep the optimistic copy
            }
            toast.success('Zapisano zmiany');
            setMode('view');
        }
    };

    const savePartial = async () => {
        const amount = parseAmount(partial);
        if (await returned(purchase, amount)) setMode('view');
    };

    const remove = async () => {
        try {
            const res = await apiRequest(`/purchases/delete.php?id=${purchase.id}`, 'DELETE');
            deletedToast(toast, `${purchase.store} — usunięte`, res?.trash_id, () => {
                refresh();
                bump('purchases');
            });
            refresh();
            onChanged?.(purchase.id, null);
            onClose();
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć');
        }
    };

    return (
        <Sheet
            open
            onClose={onClose}
            size="lg"
            footer={
                mode === 'edit' ? (
                    <>
                        <Button variant="secondary" className="flex-1" onClick={() => setMode('view')}>Anuluj</Button>
                        <Button variant="primary" className="flex-[2]" icon={Check} loading={saving} onClick={saveEdit}>Zapisz</Button>
                    </>
                ) : (
                    <div className="grid grid-cols-2 gap-2 w-full">
                        <Button variant="secondary" icon={Pencil} onClick={startEdit}>Edytuj</Button>
                        <Button variant="danger" icon={Trash2} onClick={remove}>Usuń</Button>
                    </div>
                )
            }
        >
            {mode === 'edit' ? (
                <div className="space-y-4 pt-1">
                    <EditField label="Co" value={edit.items} onChange={(v) => setEdit({ ...edit, items: v })} />
                    <div className="grid grid-cols-2 gap-3">
                        <EditField label="Kwota (zł)" value={edit.amount} onChange={(v) => setEdit({ ...edit, amount: v })} inputMode="decimal" />
                        <EditField label="Sklep" value={edit.store} onChange={(v) => setEdit({ ...edit, store: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <EditField label="Data zakupu" type="date" value={edit.purchase_date} onChange={(v) => setEdit({ ...edit, purchase_date: v })} />
                        <EditField label="Dni na zwrot" value={edit.return_days} onChange={(v) => setEdit({ ...edit, return_days: v })} inputMode="numeric" list="detail-return-days" />
                        <datalist id="detail-return-days">{RETURN_DAY_PRESETS.map((d) => <option key={d} value={d} />)}</datalist>
                    </div>
                    <EditField label="Link do produktu" value={edit.purchase_url} onChange={(v) => setEdit({ ...edit, purchase_url: v })} placeholder="https://…" />
                    <EditField label="Notatka" value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} />
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <div className="text-xs font-semibold text-ink-muted">{purchase.store} · {formatDateLong(purchase.purchase_date)}</div>
                        <h2 className="text-2xl font-display font-semibold tracking-tight text-ink mt-1 break-words">{purchase.items}</h2>
                        <div className="text-xl font-display font-semibold text-ink mt-1 tabular-nums">{formatCurrency(purchase.amount)}</div>
                    </div>

                    {state === 'active' && (
                        <div className={`rounded-2xl border p-4 ${tone === 'danger' ? 'bg-red-50 border-red-100' : tone === 'warning' ? 'bg-amber-50 border-amber-100' : 'bg-canvas border-line'}`}>
                            <div className={`text-sm font-bold ${tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-800' : 'text-ink'}`}>
                                Zwrot: {deadlineText(days, purchase.return_deadline)}
                            </div>
                            {purchase.delivered_at ? (
                                <div className="text-xs text-ink-muted mt-0.5">liczone od dostawy {formatDateLong(purchase.delivered_at)}</div>
                            ) : (
                                <button type="button" disabled={busy} onClick={() => delivered([purchase])} className="mt-1 text-xs font-semibold text-ink-muted hover:text-ink">
                                    Paczka przyszła dziś? Termin liczy się od dostawy
                                </button>
                            )}
                            {mode === 'partial' ? (
                                <div className="mt-3 flex gap-2">
                                    <div className="relative flex-1">
                                        <input autoFocus className="input !pr-9" inputMode="decimal" placeholder="Ile wróciło" value={partial} onChange={(e) => setPartial(e.target.value)} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">zł</span>
                                    </div>
                                    <Button variant="success" icon={Check} loading={busy} onClick={savePartial}>Zapisz</Button>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <Button variant="success" icon={RotateCcw} loading={busy} onClick={() => returned(purchase)}>Zwrócone</Button>
                                        <Button variant="secondary" icon={Heart} disabled={busy} onClick={() => keep(purchase)}>Zostawiam</Button>
                                    </div>
                                    <button type="button" onClick={() => setMode('partial')} className="mt-2 text-xs font-semibold text-ink-muted hover:text-ink">
                                        Zwróciłam tylko część kwoty
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {state === 'kept' && (
                        <div className="rounded-2xl border border-line bg-canvas p-4 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-bold text-ink flex items-center gap-1.5"><Heart size={15} className="text-primary-600" /> Zostaje u Ciebie</div>
                                <div className="text-xs text-ink-muted mt-0.5">
                                    {days >= 0 ? `Zwrot możliwy jeszcze do ${formatDateLong(purchase.return_deadline)}` : `Termin zwrotu minął ${formatDateLong(purchase.return_deadline)}`}
                                </div>
                            </div>
                            {days >= 0 && Number(purchase.kept_confirmed) === 1 ? (
                                <Button size="sm" variant="ghost" icon={Undo2} loading={busy} onClick={() => update(purchase, { kept_confirmed: 0 })}>Cofnij</Button>
                            ) : (
                                <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy} onClick={() => returned(purchase)}>Jednak zwrócone</Button>
                            )}
                        </div>
                    )}

                    {state === 'returned' && (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                                        <Check size={16} /> {purchase.status === 'partial' ? 'Częściowo zwrócone' : 'Zwrócone'} · {formatCurrency(recoveredOf(purchase))}
                                    </div>
                                    <div className="text-xs text-emerald-700/80 mt-0.5">
                                        {purchase.returned_at ? `odesłane ${formatDateLong(purchase.returned_at.slice(0, 10))}` : ''}
                                        {Number(purchase.return_cost) > 0 ? ` · odesłanie ${formatCurrency(purchase.return_cost)}` : ''}
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" icon={Undo2} loading={busy} onClick={() => update(purchase, { status: 'kept', returned_amount: 0, return_cost: null })}>Cofnij</Button>
                            </div>
                            {refundPending(purchase) ? (
                                <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                                    <span className="flex-1 text-xs text-amber-900">Czekam na pieniądze — sklep ma 14 dni.</span>
                                    <Button size="sm" variant="success" icon={Check} loading={busy} onClick={() => refunded([purchase])}>Pieniądze są</Button>
                                </div>
                            ) : (
                                purchase.refunded_at && <div className="mt-2 text-xs text-emerald-700">Pieniądze wróciły {formatDateLong(purchase.refunded_at)}</div>
                            )}
                        </div>
                    )}

                    {(purchase.purchase_url || purchase.notes) && (
                        <div className="rounded-2xl bg-canvas border border-line px-4 py-3 space-y-2">
                            {purchase.notes && <p className="text-sm text-ink-soft whitespace-pre-line">{purchase.notes}</p>}
                            {purchase.purchase_url && (
                                <a href={purchase.purchase_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-primary-700 break-all">
                                    <ExternalLink size={14} className="shrink-0" /> {purchase.purchase_url.replace(/^https?:\/\//, '').slice(0, 50)}
                                </a>
                            )}
                        </div>
                    )}

                    <Attachments entityType="purchase" entityId={purchase.id} />
                </div>
            )}
        </Sheet>
    );
}

function EditField({ label, value, onChange, type = 'text', ...rest }) {
    return (
        <label className="block">
            <span className="label">{label}</span>
            <input type={type} className="input" value={value} onClick={type === 'date' || type === 'time' ? openPicker : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
        </label>
    );
}
