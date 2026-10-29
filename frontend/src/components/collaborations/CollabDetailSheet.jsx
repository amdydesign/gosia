import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, ChevronRight, ClipboardList, Copy, FilePlus2, FileText, Lock, MoreHorizontal, Pencil, RotateCcw, Send, Trash2, Loader2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Attachments from '../common/Attachments';
import TaxBreakdown from './TaxBreakdown';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { deletedToast } from '../../services/trash';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { daysFromToday, formatCurrency, formatDateLong, formatDateShort, getBillingLabel, getCollabTypeLabel, getTaxBreakdown, getTodayDate, openPicker } from '../../utils/format';
import { daysWaiting, deliverableProgress, grossOf, hasWorkLeft, isBrief, isLate, isPaid, netOf, paymentDue, toPublish, WAGE_TYPE } from '../../utils/collabs';
import { tickWithUndo } from '../../services/collaborations';
import { readScreens } from '../../services/ai';
import { uploadAttachment } from '../../services/attachments';

const DOC_KINDS = { umowa: 'Umowa', rachunek: 'Rachunek', faktura: 'Faktura', inne: 'Dokument' };

/**
 * Collaboration details with the actions that matter: paid / unpaid, team payouts,
 * edit, repeat, delete, attachments.
 */
export default function CollabDetailSheet({ collabId, onClose, onChanged }) {
    const toast = useToast();
    const { data: dashboard, refresh } = useDashboard();
    const aiEnabled = !!dashboard?.ai?.enabled;
    const briefRef = useRef(null);
    const [readingBrief, setReadingBrief] = useState(false);
    const [attachmentsKey, setAttachmentsKey] = useState(0);
    const { openCollab, versions } = useQuickActions();
    const [collab, setCollab] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [showMath, setShowMath] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        apiRequest(`/collaborations/show.php?id=${collabId}`)
            .then((c) => !cancelled && setCollab(c))
            .catch((err) => !cancelled && setError(err.message || 'Nie znaleziono współpracy'));
        return () => {
            cancelled = true;
        };
    }, [collabId, versions.collaborations]);

    const breakdown = useMemo(() => (collab ? getTaxBreakdown(grossOf(collab), collab.collab_type, collab.date) : null), [collab]);

    const save = async (patch, message) => {
        setBusy(true);
        try {
            await apiRequest(`/collaborations/update.php?id=${collabId}`, 'PUT', patch);
            setCollab((c) => ({ ...c, ...patch }));
            // dates the server works out (payment due, paid on) come back fresh
            apiRequest(`/collaborations/show.php?id=${collabId}`).then(setCollab).catch(() => {});
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

    const tick = async (index) => {
        setBusy(true);
        try {
            await tickWithUndo(toast, collab, index, ({ deliverables, published }) => {
                setCollab((c) => ({ ...c, deliverables, ...(published === true ? { published_at: getTodayDate() } : published === false ? { published_at: null } : {}) }));
                refresh();
                onChanged?.();
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setBusy(false);
        }
    };

    /**
     * A brief for a collaboration that already exists: AI reads the list of things to make
     * (added to what is there, nothing done is lost), fills an empty publish deadline,
     * the file is attached. The stage does not change. "Cofnij" restores the list.
     */
    const addBrief = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        setReadingBrief(true);
        const before = { deliverables: collab.deliverables || [], publish_by: collab.publish_by || null };
        try {
            await Promise.all(files.map((file) => uploadAttachment('collaboration', collab.id, file)));
            setAttachmentsKey((k) => k + 1);
            if (!aiEnabled) {
                toast.success('Brief przypięty — listę dopisz w „Edytuj”');
                return;
            }
            const r = await readScreens('collaboration', files);
            const known = new Set(before.deliverables.map((d) => d.label.trim().toLowerCase()));
            const added = (r.deliverables || [])
                .filter((d) => !known.has(d.label.trim().toLowerCase()))
                .map((d) => ({ label: d.label, count: d.count, done: 0, due: d.due || null }));
            const patch = { deliverables: [...before.deliverables, ...added] };
            if (!before.publish_by && r.publish_by) patch.publish_by = r.publish_by;
            if (!added.length && !patch.publish_by) {
                toast.success('Brief przypięty — nie znalazłam w nim nowych rzeczy do zrobienia');
                return;
            }
            if (await save(patch)) {
                const count = added.reduce((n, d) => n + d.count, 0);
                toast.success(added.length ? `Z briefu: ${count} ${count === 1 ? 'rzecz' : 'rzeczy'} do zrobienia` : 'Z briefu: termin publikacji', {
                    duration: 6000,
                    action: { label: 'Cofnij', onClick: () => save(before) },
                });
            }
        } catch (err) {
            toast.error(err.message || 'Nie udało się odczytać briefu');
        } finally {
            setReadingBrief(false);
        }
    };

    // Date of one thing from the brief (empty = no date) - Start and the calendar follow it
    const setDue = (index, due) => {
        const list = (collab.deliverables || []).map((d, i) => (i === index ? { ...d, due: due || null } : d));
        save({ deliverables: list }, due ? `${list[index].label} — do ${formatDateShort(due)}` : `${list[index].label} — bez terminu`);
    };

    // Published on another day than today: the payment term counts from that day
    const setPublishedOn = (date) => {
        if (!date || date === collab.published_at) return;
        save({ published_at: date }, `Opublikowane ${formatDateShort(date)} — termin płatności liczy się od tego dnia`);
    };

    const toggleTeamPaid = (index) => {
        const team = collab.team.map((m, i) => ({ name: m.name, amount: m.amount, is_paid: i === index ? !isTrue(m.is_paid) : isTrue(m.is_paid) }));
        save({ team });
    };

    const remove = async () => {
        try {
            const res = await apiRequest(`/collaborations/delete.php?id=${collabId}`, 'DELETE');
            deletedToast(toast, `${collab.brand} — usunięta`, res?.trash_id, () => {
                refresh();
                onChanged?.();
            });
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
                deliverables: collab.deliverables || [],
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
    const brief = isBrief(collab);
    const deliverables = collab.deliverables || [];
    const progress = deliverableProgress(collab);
    const late = isLate(collab);
    const waiting = daysWaiting(collab);
    const due = paymentDue(collab);
    const isPrivate = Number(collab.fiscal_tracking) === 0;
    const team = collab.team || [];
    const teamTotal = team.reduce((s, m) => s + (Number(m.amount) || 0), 0);

    return (
        <Sheet
            open
            onClose={onClose}
            size="lg"
            footer={
                <div className="relative flex gap-2 w-full">
                    <Button variant="secondary" icon={Pencil} className="flex-1" onClick={() => openCollab({ id: collab.id })}>Edytuj</Button>
                    <button
                        type="button"
                        onClick={() => setMoreOpen((o) => !o)}
                        aria-expanded={moreOpen}
                        aria-label="Więcej"
                        className="btn btn-secondary !px-0 w-12 shrink-0"
                    >
                        <MoreHorizontal size={20} />
                    </button>
                    {moreOpen && (
                        <div className="absolute right-0 bottom-full mb-2 w-56 rounded-2xl bg-surface border border-line shadow-float overflow-hidden z-10">
                            <button type="button" onClick={() => { setMoreOpen(false); repeat(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-ink hover:bg-canvas text-left">
                                <Copy size={16} /> Powtórz współpracę
                            </button>
                            <button type="button" onClick={() => { setMoreOpen(false); remove(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 text-left border-t border-line">
                                <Trash2 size={16} /> Usuń
                            </button>
                        </div>
                    )}
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

                {brief && (
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-sky-900">
                            <ClipboardList size={17} /> Brief — jeszcze bez umowy
                        </div>
                        <p className="text-xs text-ink-soft mt-1">
                            Gdy wrzucisz umowę do Dokumentów, podepnę ją tutaj i uzupełnię kwotę. Nie liczę tego do pieniędzy, dopóki nie jest ustalone.
                        </p>
                        <Button variant="secondary" size="sm" icon={Check} loading={busy} className="mt-2.5" onClick={() => save({ stage: null }, 'Ustalone — przeniesione do współprac')}>
                            Ustalone
                        </Button>
                    </div>
                )}

                {deliverables.length > 0 && (
                    <div className="rounded-2xl border border-line overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-canvas border-b border-line">
                            <span className="section-label">
                                Do zrobienia{toPublish(collab) && <span className="normal-case tracking-normal font-semibold"> · publikacja do {formatDateShort(collab.publish_by)}</span>}
                            </span>
                            <span className={`text-xs font-bold tabular-nums ${progress.done >= progress.total ? 'text-emerald-700' : 'text-ink'}`}>
                                {progress.done >= progress.total ? 'Wszystko zrobione' : `${progress.done}/${progress.total} zrobione`}
                            </span>
                        </div>
                        <div className="divide-y divide-line">
                            {deliverables.map((d, i) => {
                                const left = Number(d.count) - Number(d.done);
                                const days = d.due && left > 0 ? daysFromToday(d.due) : null;
                                const dueTone = days === null ? 'text-ink-muted' : days < 0 ? 'text-red-700 font-semibold' : days <= 2 ? 'text-amber-700 font-semibold' : 'text-ink-muted';
                                return (
                                    <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${left <= 0 ? 'bg-emerald-50/40' : ''}`}>
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-sm font-semibold truncate ${left <= 0 ? 'text-ink-muted line-through' : 'text-ink'}`}>{d.label}</span>
                                            <span className="flex items-center gap-1 mt-1">
                                                {Array.from({ length: Math.min(Number(d.count), 12) }, (_, n) => (
                                                    <span key={n} className={`w-2 h-2 rounded-full ${n < Number(d.done) ? 'bg-emerald-500' : 'bg-line-strong'}`} />
                                                ))}
                                                <span className="text-xs text-ink-muted tabular-nums ml-1">{d.done}/{d.count}</span>
                                                {left > 0 && (
                                                    // the date sits where it is shown: tap it to change, "+ termin" when there is none
                                                    <DateTap value={d.due} disabled={busy} onPick={(due) => setDue(i, due)} className={`text-xs ml-0.5 ${d.due ? `${dueTone} underline decoration-dotted underline-offset-2` : 'text-ink-muted/70 hover:text-ink'}`}>
                                                        {d.due ? `· do ${formatDateShort(d.due)}` : '· + termin'}
                                                    </DateTap>
                                                )}
                                            </span>
                                        </span>
                                        {left > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => tick(i)}
                                                disabled={busy}
                                                className="shrink-0 h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                                            >
                                                <Check size={15} strokeWidth={2.75} /> Zrobione
                                            </button>
                                        ) : (
                                            <Check size={18} className="shrink-0 text-emerald-600" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {collab.type !== WAGE_TYPE && (
                    <>
                        <input ref={briefRef} type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" onChange={addBrief} />
                        <button
                            type="button"
                            onClick={() => briefRef.current?.click()}
                            disabled={readingBrief}
                            title={aiEnabled ? 'PDF albo screen — wypiszę, co trzeba zrobić, i przypnę plik' : 'PDF albo screen — przypnę go do współpracy'}
                            className={`${deliverables.length ? '-mt-2' : ''} text-xs font-semibold text-sky-700 inline-flex items-center gap-1.5 px-1`}
                        >
                            {readingBrief ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} />}
                            {readingBrief ? 'Czytam brief…' : deliverables.length ? 'Dorzuć z kolejnego briefu' : 'Dodaj brief'}
                        </button>
                    </>
                )}

                {(!brief || grossOf(collab) > 0) && (
                    <div className="rounded-2xl bg-canvas border border-line px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="amount text-xl font-display font-semibold text-ink tabular-nums">{formatCurrency(grossOf(collab))}</span>
                            {!isPrivate && (
                                <span className="text-sm text-ink-muted">
                                    brutto · <b className="amount text-emerald-700">{formatCurrency(netOf(collab))}</b> na rękę
                                </span>
                            )}
                        </div>
                        {!isPrivate && breakdown?.gross > 0 && (
                            <>
                                <button type="button" onClick={() => setShowMath((v) => !v)} className="text-xs font-semibold text-primary-700 mt-1">
                                    {showMath ? 'Ukryj wyliczenie' : 'Jak to policzone?'}
                                </button>
                                {showMath && <div className="mt-2"><TaxBreakdown breakdown={breakdown} collabType={collab.collab_type} date={collab.date} /></div>}
                            </>
                        )}
                    </div>
                )}

                {/* Publish deadline (with a list from the brief the last "Zrobione" marks it published) */}
                {toPublish(collab) && deliverables.length === 0 && (
                    <div className={`rounded-2xl border px-4 py-3 ${(daysFromToday(collab.publish_by) ?? 0) < 0 ? 'bg-red-50 border-red-100' : 'bg-violet-50 border-violet-100'}`}>
                        <div className="flex items-center gap-2 text-sm font-bold text-ink">
                            <CalendarClock size={17} /> Opublikuj do {formatDateLong(collab.publish_by)}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Button
                                variant="secondary"
                                icon={Send}
                                loading={busy}
                                className="flex-1"
                                onClick={() => save({ published_at: getTodayDate() }, 'Opublikowane — termin płatności liczy się od dziś')}
                            >
                                Opublikowane dziś
                            </Button>
                            <PublishedDate disabled={busy} onPick={setPublishedOn} className="btn btn-secondary shrink-0">
                                Inna data
                            </PublishedDate>
                        </div>
                    </div>
                )}
                {collab.published_at && (
                    <div className="flex items-center justify-between gap-3 text-sm text-ink-soft px-1">
                        <span className="inline-flex items-center gap-2">
                            <Send size={15} /> Opublikowane
                            <PublishedDate value={collab.published_at} disabled={busy} onPick={setPublishedOn} className="font-semibold text-ink underline decoration-dotted underline-offset-4">
                                {formatDateShort(collab.published_at)}
                            </PublishedDate>
                        </span>
                        <button type="button" disabled={busy} onClick={() => save({ published_at: null }, 'Cofnięto publikację')} className="text-xs font-semibold text-ink-muted hover:text-ink">
                            Cofnij
                        </button>
                    </div>
                )}

                {/* Payment (a brief is not money yet; with work left nothing to wait for) */}
                {brief ? null : !paid && hasWorkLeft(collab) ? (
                    // progress is in "Do zrobienia" above - here only the payment rule, one quiet line
                    <p className="text-xs text-ink-muted px-1 -mt-1">
                        Przelew: {Number(collab.payment_days) || 30} dni od publikacji (ostatnie „Zrobione” ją oznaczy) ·{' '}
                        <button type="button" disabled={busy} onClick={() => save({ payment_status: 'paid' }, `${collab.brand} — opłacone`)} className="font-semibold text-ink-soft hover:text-ink underline underline-offset-2">
                            pieniądze już przyszły?
                        </button>
                    </p>
                ) : paid ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 px-4 py-3">
                        <span className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                            <Check size={18} /> Opłacone{collab.paid_at ? ` ${formatDateShort(collab.paid_at)}` : ''}
                        </span>
                        <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy} onClick={() => save({ payment_status: 'pending' }, 'Cofnięto — czeka na przelew')}>
                            Cofnij
                        </Button>
                    </div>
                ) : (
                    <div className={`rounded-2xl border px-4 py-3 ${late ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                        <div className={`text-sm font-bold ${late ? 'text-red-700' : 'text-amber-800'}`}>
                            {late
                                ? `Termin płatności minął ${formatDateShort(due)}`
                                : due
                                    ? `Przelew do ${formatDateShort(due)}${waiting > 0 ? ` · czeka ${waiting} dni` : ''}`
                                    : 'Czeka na przelew'}
                        </div>
                        <div className="text-xs text-ink-muted mt-0.5">
                            Płatność w {Number(collab.payment_days) || 30} dni od {collab.published_at ? 'publikacji' : collab.publish_by ? 'terminu publikacji' : 'daty współpracy'}
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
                                <span className="amount">{formatCurrency(teamTotal)}</span> · zostaje Ci <span className="amount">{formatCurrency(netOf(collab) - teamTotal)}</span>
                            </span>
                        </div>
                        <div className="divide-y divide-line">
                            {team.map((m, i) => {
                                const memberPaid = isTrue(m.is_paid);
                                return (
                                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                        <span className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">{m.name}</span>
                                        <span className="amount text-sm font-bold tabular-nums">{formatCurrency(m.amount)}</span>
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

                {/* contracts / bills and attached files: one row, the list on tap */}
                <Attachments
                    key={attachmentsKey}
                    entityType="collaboration"
                    entityId={collab.id}
                    extraCount={collab.documents?.length || 0}
                    extra={
                        collab.documents?.length > 0 && (
                            <div className="divide-y divide-line">
                                {collab.documents.map((d) => (
                                    <Link key={d.id} to={`/documents?doc=${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas transition-colors">
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
                        )
                    }
                />
            </div>
        </Sheet>
    );
}

/** A label that opens the date picker (the text stays as it is - no extra field on the card). */
function DateTap({ value, onPick, disabled, className, children, max, label = 'Termin' }) {
    return (
        <label className={`relative cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}>
            {children}
            <input
                type="date"
                onClick={openPicker}
                value={value || ''}
                max={max}
                onChange={(e) => onPick(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label={label}
            />
        </label>
    );
}

/** Published on (no later than today). */
function PublishedDate(props) {
    return <DateTap {...props} max={getTodayDate()} label="Data publikacji" />;
}

function isTrue(v) {
    return v === true || v === 'true' || Number(v) === 1;
}
