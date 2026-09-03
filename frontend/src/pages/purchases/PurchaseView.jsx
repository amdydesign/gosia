import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Trash2, ShoppingBag, ExternalLink, RotateCcw, CalendarClock, Undo2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import Attachments from '../../components/common/Attachments';
import ReturnSheet from '../../components/purchases/ReturnSheet';
import { formatCurrency, formatDateLong, getReturnUrgency, getPurchaseStatusInfo } from '../../utils/format';

export default function PurchaseView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const { refresh } = useDashboard();
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [returnOpen, setReturnOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await apiRequest(`/purchases/show.php?id=${id}`);
                if (!cancelled) setPurchase(data);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Błąd ładowania');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) return <PageSkeleton />;
    if (error || !purchase) return <EmptyState icon={ShoppingBag} title="Nie znaleziono zakupu" text={error} action={<Button to="/purchases">Wróć do listy</Button>} />;

    const days = Number(purchase.days_remaining);
    const isActive = purchase.status === 'kept' && days >= 0;
    const isReturned = purchase.status === 'returned' || purchase.status === 'partial';
    const urgency = getReturnUrgency(days);
    const status = getPurchaseStatusInfo(purchase.status, days);
    const total = Number(purchase.return_days) || 14;
    const progress = Math.max(0, Math.min(100, 100 - (days / total) * 100));

    const handleDelete = async () => {
        const ok = await confirm({ title: 'Usunąć zakup?', message: `${purchase.store} · ${purchase.items}`, confirmLabel: 'Usuń', danger: true });
        if (!ok) return;
        try {
            await apiRequest(`/purchases/delete.php?id=${id}`, 'DELETE');
            toast.success('Zakup usunięty');
            refresh();
            navigate('/purchases', { replace: true });
        } catch (err) {
            toast.error(err.message || 'Błąd usuwania');
        }
    };

    const handleUndoReturn = async () => {
        setBusy(true);
        try {
            await apiRequest(`/purchases/update.php?id=${id}`, 'PUT', { status: 'kept', returned_amount: 0 });
            setPurchase((p) => ({ ...p, status: 'kept', returned_amount: 0 }));
            refresh();
            toast.info('Zwrot cofnięty');
        } catch (err) {
            toast.error(err.message || 'Nie udało się cofnąć');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <Card className="relative overflow-hidden !p-6 sm:!p-8">
                <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-amber-100/70 blur-2xl pointer-events-none" />
                <div className="relative">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {isActive && <Badge tone={urgency.tone}>{urgency.message}</Badge>}
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-ink break-words">{purchase.store}</h1>
                    <p className="text-[15px] text-ink-soft mt-1">{purchase.items}</p>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-canvas border border-line p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Koszt</div>
                            <div className="text-2xl font-extrabold text-ink tracking-tight mt-1">{formatCurrency(purchase.amount)}</div>
                        </div>
                        <div className={`rounded-2xl p-4 border ${isReturned ? 'bg-emerald-50 border-emerald-100' : 'bg-canvas border-line'}`}>
                            <div className={`text-[11px] font-bold uppercase tracking-wider ${isReturned ? 'text-emerald-700' : 'text-ink-muted'}`}>
                                {isReturned ? 'Zwrócono' : 'Kupione'}
                            </div>
                            <div className={`font-extrabold tracking-tight mt-1 ${isReturned ? 'text-2xl text-emerald-800' : 'text-lg text-ink'}`}>
                                {isReturned ? formatCurrency(purchase.returned_amount) : formatDateLong(purchase.purchase_date)}
                            </div>
                        </div>
                    </div>

                    {/* Deadline */}
                    {purchase.status === 'kept' && (
                        <div className={`mt-4 rounded-2xl border p-4 ${isActive ? (urgency.tone === 'danger' ? 'bg-red-50 border-red-100' : urgency.tone === 'warning' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50/60 border-emerald-100') : 'bg-slate-50 border-line'}`}>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                                    <CalendarClock size={16} />
                                    {isActive ? 'Termin zwrotu' : 'Termin zwrotu minął'}
                                </div>
                                <div className="text-sm font-semibold text-ink-soft">{formatDateLong(purchase.return_deadline)}</div>
                            </div>
                            {isActive && (
                                <>
                                    <div className="h-1.5 rounded-full bg-white/70 mt-3 overflow-hidden">
                                        <div className={`h-full rounded-full ${urgency.tone === 'danger' ? 'bg-red-500' : urgency.tone === 'warning' ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }} />
                                    </div>
                                    <div className="mt-3">
                                        <Button variant="success" icon={RotateCcw} onClick={() => setReturnOpen(true)} block>
                                            Zrobiłam zwrot
                                        </Button>
                                    </div>
                                </>
                            )}
                            {!isActive && (
                                <p className="text-xs text-ink-muted mt-1">Rzecz została w Twojej garderobie. Możesz to zmienić w edycji.</p>
                            )}
                        </div>
                    )}

                    {isReturned && (
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 p-4">
                            <div className="text-sm text-emerald-900">
                                {purchase.status === 'partial' ? 'Częściowy zwrot' : 'Zwrócone'}
                                {purchase.returned_at && <span className="text-emerald-700"> · {formatDateLong(purchase.returned_at.slice(0, 10))}</span>}
                            </div>
                            <Button size="sm" variant="ghost" icon={Undo2} onClick={handleUndoReturn} loading={busy}>Cofnij</Button>
                        </div>
                    )}
                </div>
            </Card>

            <div className="grid grid-cols-2 gap-2">
                <Button to={`/purchases/${id}/edit`} variant="secondary" icon={Edit2}>Edytuj</Button>
                <Button variant="danger" icon={Trash2} onClick={handleDelete}>Usuń</Button>
            </div>

            {(purchase.purchase_url || purchase.notes) && (
                <Card className="space-y-4">
                    {purchase.purchase_url && (
                        <a href={purchase.purchase_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800 break-all">
                            <ExternalLink size={16} className="shrink-0" />
                            {purchase.purchase_url.replace(/^https?:\/\//, '').slice(0, 60)}
                        </a>
                    )}
                    {purchase.notes && (
                        <div>
                            <h2 className="card-title mb-2">Notatki</h2>
                            <p className="text-[15px] text-ink-soft whitespace-pre-line leading-relaxed">{purchase.notes}</p>
                        </div>
                    )}
                </Card>
            )}

            <Attachments entityType="purchase" entityId={id} />

            <ReturnSheet
                purchase={purchase}
                open={returnOpen}
                onClose={() => setReturnOpen(false)}
                onDone={(updated) => setPurchase((p) => ({ ...p, ...updated, returned_at: new Date().toISOString() }))}
            />
        </div>
    );
}
