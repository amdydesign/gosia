import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Copy, FileText, Lock, Pencil, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Attachments from '../common/Attachments';
import TaxBreakdown from './TaxBreakdown';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { formatCurrency, formatDateLong, getBillingLabel, getCollabTypeLabel, getTaxBreakdown } from '../../utils/format';
import { daysWaiting, grossOf, isLate, isPaid, netOf, WAGE_TYPE } from '../../utils/collabs';

const DOC_KINDS = { umowa: 'Umowa', rachunek: 'Rachunek', faktura: 'Faktura', inne: 'Dokument' };

/**
 * Collaboration details with the actions that matter: paid / unpaid, team payouts,
 * edit, repeat, delete, attachments.
 */
export default function CollabDetailSheet({ collabId, onClose, onChanged }) {
    const toast = useToast();
    const confirm = useConfirm();
    const { refresh } = useDashboard();
    const { openCollab, versions } = useQuickActions();
    const [collab, setCollab] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [showMath, setShowMath] = useState(false);

    useEffect(() => {
        let cancelled = false;
        apiRequest(`/collaborations/show.php?id=${collabId}`)
            .then((c) => !cancelled && setCollab(c))
            .catch((err) => !cancelled && setError(err.message || 'Nie znaleziono współpracy'));
        return () => {
            cancelled = true;
        };
    }, [collabId, versions.collaborations]);

    const breakdown = useMemo(() => (collab ? getTaxBreakdown(grossOf(collab), collab.collab_type) : null), [collab]);

    const save = async (patch, message) => {
        setBusy(true);
        try {
            await apiRequest(`/collaborations/update.php?id=${collabId}`, 'PUT', patch);
            setCollab((c) => ({ ...c, ...patch }));
            refresh();
            onChanged?.();
            if (message) toast.success(message);
            return true;
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
            return false;
        } finally {
            setBusy(false);
        }
    };

    const toggleTeamPaid = (index) => {
        const team = collab.team.map((m, i) => ({ name: m.name, amount: m.amount, is_paid: i === index ? !isTrue(m.is_paid) : isTrue(m.is_paid) }));
        save({ team });
    };

    const remove = async () => {
        if (!(await confirm({ title: 'Usunąć współpracę?', message: `${collab.brand} zostanie usunięta razem z załącznikami.`, confirmLabel: 'Usuń', danger: true }))) return;
        try {
            await apiRequest(`/collaborations/delete.php?id=${collabId}`, 'DELETE');
            toast.success('Usunięto');
            refresh();
            onChanged?.();
            onClose();
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć');
        }
    };

    const repeat = () => {
        openCollab({
            prefill: {
                brand: collab.brand,
                type: collab.type,
                collab_type: collab.collab_type,
                amount_gross: grossOf(collab),
                team: collab.team || [],
            },
        });
    };

    if (error) {
        return (
            <Sheet open onClose={onClose} title="Współpraca" size="lg">
                <p className="py-8 text-center text-sm text-ink-muted">{error}</p>
            </Sheet>
        );
    }

    if (!collab) {
        return (
            <Sheet open onClose={onClose} size="lg">
                <div className="py-16 flex justify-center text-ink-muted"><Loader2 className="animate-spin" /></div>
            </Sheet>
        );
    }

    const paid = isPaid(collab);
    const late = isLate(collab);
    const waiting = daysWaiting(collab);
    const isPrivate = Number(collab.fiscal_tracking) === 0;
    const team = collab.team || [];
    const teamTotal = team.reduce((s, m) => s + (Number(m.amount) || 0), 0);

    return (
        <Sheet
            open
            onClose={onClose}
            size="lg"
            footer={
                <div className="grid grid-cols-3 gap-2 w-full">
                    <Button variant="secondary" icon={Pencil} onClick={() => openCollab({ id: collab.id })}>Edytuj</Button>
                    <Button variant="secondary" icon={Copy} onClick={repeat}>Powtórz</Button>
                    <Button variant="danger" icon={Trash2} onClick={remove}>Usuń</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <div className="text-xs font-semibold text-ink-muted flex flex-wrap items-center gap-x-2">
                        <span>{formatDateLong(collab.date)}</span>
                        <span>·</span>
                        <span>{collab.type === WAGE_TYPE ? 'Etat' : getCollabTypeLabel(collab.type)}</span>
                        {getBillingLabel(collab.collab_type, { short: true }) && collab.type !== WAGE_TYPE && (
                            <>
                                <span>·</span>
                                <span>{getBillingLabel(collab.collab_type, { short: true })}</span>
                            </>
                        )}
                        {isPrivate && <Lock size={12} className="text-ink-muted" aria-label="Poza PIT" />}
                    </div>
                    <h2 className="text-2xl font-display font-semibold tracking-tight text-ink mt-1 break-words">{collab.brand}</h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-canvas border border-line p-3.5">
                        <div className="section-label">{isPrivate ? 'Kwota' : 'Brutto'}</div>
                        <div className="text-xl font-display font-semibold text-ink mt-1 tabular-nums">{formatCurrency(grossOf(collab))}</div>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3.5">
                        <div className="section-label !text-emerald-700">Na rękę</div>
                        <div className="text-xl font-display font-semibold text-emerald-800 mt-1 tabular-nums">{formatCurrency(netOf(collab))}</div>
                    </div>
                </div>
                {!isPrivate && breakdown?.gross > 0 && (
                    <div>
                        <button type="button" onClick={() => setShowMath((v) => !v)} className="text-xs font-semibold text-primary-700">
                            {showMath ? 'Ukryj wyliczenie' : 'Jak to policzone?'}
                        </button>
                        {showMath && <div className="mt-2"><TaxBreakdown breakdown={breakdown} collabType={collab.collab_type} /></div>}
                    </div>
                )}

                {/* Payment */}
                {paid ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-bold text-emerald-800"><Check size={18} /> Opłacone</span>
                        <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy} onClick={() => save({ payment_status: 'pending' }, 'Cofnięto — czeka na przelew')}>
                            Cofnij
                        </Button>
                    </div>
                ) : (
                    <div className={`rounded-2xl border px-4 py-3 ${late ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                        <div className={`text-sm font-bold ${late ? 'text-red-700' : 'text-amber-800'}`}>
                            {waiting > 0 ? `Czeka na przelew od ${waiting} dni` : 'Czeka na przelew'}
                        </div>
                        <Button variant="success" size="lg" block icon={Check} loading={busy} className="mt-3" onClick={() => save({ payment_status: 'paid' }, `${collab.brand} — opłacone`)}>
                            Przelew doszedł
                        </Button>
                    </div>
                )}

                {team.length > 0 && (
                    <div className="rounded-2xl border border-line overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-canvas border-b border-line">
                            <span className="section-label">Zespół</span>
                            <span className="text-xs text-ink-muted">
                                {formatCurrency(teamTotal)} · zostaje Ci {formatCurrency(netOf(collab) - teamTotal)}
                            </span>
                        </div>
                        <div className="divide-y divide-line">
                            {team.map((m, i) => {
                                const memberPaid = isTrue(m.is_paid);
                                return (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{m.name}</span>
                                        <span className="text-sm font-bold tabular-nums">{formatCurrency(m.amount)}</span>
                                        <button
                                            type="button"
                                            onClick={() => toggleTeamPaid(i)}
                                            disabled={busy}
                                            className={`text-xs font-bold rounded-lg px-2.5 py-1.5 ${memberPaid ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-800'}`}
                                        >
                                            {memberPaid ? 'Zapłacone' : 'Do zapłaty'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {collab.notes && (
                    <div className="rounded-2xl bg-canvas border border-line px-4 py-3">
                        <div className="section-label mb-1">Notatka</div>
                        <p className="text-sm text-ink-soft whitespace-pre-line leading-relaxed">{collab.notes}</p>
                    </div>
                )}

                {collab.documents?.length > 0 && (
                    <div className="rounded-2xl border border-line overflow-hidden">
                        <div className="px-4 py-2.5 bg-canvas border-b border-line">
                            <span className="section-label">Umowy i rachunki</span>
                        </div>
                        <div className="divide-y divide-line">
                            {collab.documents.map((d) => (
                                <Link
                                    key={d.id}
                                    to={`/documents?doc=${d.id}`}
                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas transition-colors"
                                >
                                    <FileText size={16} className="text-primary-500 shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-ink truncate">{d.title}</span>
                                        <span className="block text-xs text-ink-muted">
                                            {[DOC_KINDS[d.doc_kind], d.doc_date && formatDateLong(d.doc_date), d.status === 'to_sign' && 'do podpisu'].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <ChevronRight size={16} className="text-ink-muted shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <Attachments entityType="collaboration" entityId={collab.id} />
            </div>
        </Sheet>
    );
}

function isTrue(v) {
    return v === true || v === 'true' || Number(v) === 1;
}
