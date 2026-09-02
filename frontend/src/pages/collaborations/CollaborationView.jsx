import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Trash2, Copy, Check, Users, Lock, Building2, CalendarDays, RotateCcw, Briefcase } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import { useMarkPaid } from '../../hooks/useMarkPaid';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import Attachments from '../../components/common/Attachments';
import TaxBreakdown from '../../components/collaborations/TaxBreakdown';
import { formatCurrency, formatDateLong, getCollabTypeLabel, getBillingLabel, getPaymentStatusInfo, getTaxBreakdown, daysFromToday } from '../../utils/format';

export default function CollaborationView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const { refresh } = useDashboard();
    const { markPaid, setStatus, busyId } = useMarkPaid();
    const [collab, setCollab] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showBreakdown, setShowBreakdown] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await apiRequest(`/collaborations/show.php?id=${id}`);
                if (!cancelled) setCollab(data);
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

    const breakdown = useMemo(() => {
        if (!collab) return null;
        const gross = Number(collab.amount_gross) > 0 ? collab.amount_gross : collab.amount_net;
        return getTaxBreakdown(gross, collab.collab_type);
    }, [collab]);

    if (loading) return <PageSkeleton />;
    if (error || !collab) return <EmptyState icon={Briefcase} title="Nie znaleziono współpracy" text={error} action={<Button to="/collaborations">Wróć do listy</Button>} />;

    const status = getPaymentStatusInfo(collab.payment_status);
    const isPaid = collab.payment_status === 'paid';
    const isPrivate = Number(collab.fiscal_tracking) === 0;
    const billingLabel = getBillingLabel(collab.collab_type);
    const waiting = !isPaid ? -(daysFromToday(collab.date) ?? 0) : 0;
    const teamTotal = (collab.team || []).reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const netToHand = Number(collab.amount_net) > 0 ? Number(collab.amount_net) : breakdown?.net || 0;

    const handleDelete = async () => {
        const ok = await confirm({
            title: 'Usunąć współpracę?',
            message: `${collab.brand} zostanie trwale usunięta razem z załącznikami.`,
            confirmLabel: 'Usuń',
            danger: true,
        });
        if (!ok) return;
        try {
            await apiRequest(`/collaborations/delete.php?id=${id}`, 'DELETE');
            toast.success('Współpraca usunięta');
            refresh();
            navigate('/collaborations', { replace: true });
        } catch (err) {
            toast.error(err.message || 'Błąd usuwania');
        }
    };

    const handleDuplicate = () => {
        navigate('/collaborations/new', {
            state: {
                prefill: {
                    brand: collab.brand,
                    type: collab.type,
                    collab_type: collab.collab_type || 'umowa_50',
                    amount_gross: collab.amount_gross,
                    notes: collab.notes || '',
                    team: (collab.team || []).map((m) => ({ name: m.name, amount: m.amount, is_paid: false })),
                },
            },
        });
    };

    const handlePaid = () => markPaid(collab, { onChange: (_, s) => setCollab((c) => ({ ...c, payment_status: s })) });
    const handleUnpay = async () => {
        if (await setStatus(collab.id, 'pending')) {
            setCollab((c) => ({ ...c, payment_status: 'pending' }));
            toast.info('Status zmieniony na „oczekuje”');
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            {/* Hero */}
            <Card className="relative overflow-hidden !p-6 sm:!p-8">
                <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary-100/70 blur-2xl pointer-events-none" />
                <div className="relative">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <Badge tone="brand">{getCollabTypeLabel(collab.type)}</Badge>
                        {billingLabel && <Badge tone="plum">{billingLabel}</Badge>}
                        {isPrivate ? (
                            <Badge tone="neutral" icon={Lock}>Poza PIT</Badge>
                        ) : (
                            <Badge tone="info" icon={Building2}>Wliczane do PIT</Badge>
                        )}
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-ink break-words">{collab.brand}</h1>
                    <p className="text-sm text-ink-muted mt-1 flex items-center gap-1.5">
                        <CalendarDays size={14} /> {formatDateLong(collab.date)}
                    </p>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Na rękę</div>
                            <div className="text-2xl font-extrabold text-emerald-800 tracking-tight mt-1">{formatCurrency(netToHand)}</div>
                        </div>
                        <div className="rounded-2xl bg-canvas border border-line p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{isPrivate ? 'Kwota' : 'Brutto'}</div>
                            <div className="text-2xl font-extrabold text-ink tracking-tight mt-1">{formatCurrency(collab.amount_gross || collab.amount_net)}</div>
                        </div>
                    </div>

                    {!isPrivate && breakdown?.gross > 0 && (
                        <button type="button" onClick={() => setShowBreakdown((v) => !v)} className="mt-3 text-xs font-semibold text-primary-700 hover:text-primary-800">
                            {showBreakdown ? 'Ukryj wyliczenie' : 'Pokaż jak to policzyliśmy'}
                        </button>
                    )}
                    {showBreakdown && breakdown && <div className="mt-3"><TaxBreakdown breakdown={breakdown} collabType={collab.collab_type} /></div>}

                    {/* Payment status */}
                    <div className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 border ${
                        isPaid ? 'bg-emerald-50/60 border-emerald-100' : collab.payment_status === 'overdue' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
                    }`}>
                        <div>
                            <div className="text-sm font-bold text-ink">{status.label}</div>
                            {!isPaid && waiting > 0 && (
                                <div className="text-xs text-ink-muted mt-0.5">Od wystawienia minęło {waiting} dni</div>
                            )}
                        </div>
                        {isPaid ? (
                            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={handleUnpay} loading={busyId === collab.id}>
                                Cofnij opłacenie
                            </Button>
                        ) : (
                            <Button size="sm" variant="success" icon={Check} onClick={handlePaid} loading={busyId === collab.id}>
                                Oznacz jako opłacone
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2">
                <Button to={`/collaborations/${id}/edit`} variant="secondary" icon={Edit2}>Edytuj</Button>
                <Button variant="secondary" icon={Copy} onClick={handleDuplicate}>Duplikuj</Button>
                <Button variant="danger" icon={Trash2} onClick={handleDelete}>Usuń</Button>
            </div>

            {/* Team */}
            {collab.team && collab.team.length > 0 && (
                <Card padded={false}>
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
                        <h2 className="card-title flex items-center gap-2"><Users size={16} className="text-primary-500" /> Zespół</h2>
                        <span className="text-xs font-semibold text-ink-muted">Razem {formatCurrency(teamTotal)}</span>
                    </div>
                    <div className="divide-y divide-line">
                        {collab.team.map((member, i) => {
                            const paid = member.is_paid === true || member.is_paid === 'true' || Number(member.is_paid) === 1;
                            return (
                                <div key={i} className="row">
                                    <div className="row-avatar bg-stone-100 text-ink-soft !w-9 !h-9 !text-sm">{(member.name || '?').charAt(0)}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-ink truncate">{member.name}</div>
                                        <Badge tone={paid ? 'success' : 'warning'} className="mt-0.5">{paid ? 'Opłacono' : 'Do zapłaty'}</Badge>
                                    </div>
                                    <div className="font-bold text-ink tabular-nums">{formatCurrency(member.amount)}</div>
                                </div>
                            );
                        })}
                    </div>
                    {teamTotal > 0 && netToHand > 0 && (
                        <div className="px-5 py-3 bg-canvas text-xs text-ink-muted border-t border-line">
                            Po opłaceniu zespołu zostaje Ci ok. <strong className="text-ink">{formatCurrency(netToHand - teamTotal)}</strong>
                        </div>
                    )}
                </Card>
            )}

            {collab.notes && (
                <Card>
                    <h2 className="card-title mb-2">Notatki</h2>
                    <p className="text-[15px] text-ink-soft whitespace-pre-line leading-relaxed">{collab.notes}</p>
                </Card>
            )}

            <Attachments entityType="collaboration" entityId={id} />
        </div>
    );
}
