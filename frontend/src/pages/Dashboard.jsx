import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowRight,
    Briefcase,
    CalendarCheck,
    CalendarDays,
    CalendarX,
    Camera,
    Check,
    ChevronDown,
    Clock,
    History,
    Crosshair,
    FileText,
    ImagePlus,
    Lightbulb,
    Loader2,
    Play,
    ShoppingBag,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { useQuickActions } from '../context/QuickActionsContext';
import { useToast } from '../context/ToastContext';
import { useMarkPaid } from '../hooks/useMarkPaid';
import Button from '../components/ui/Button';
import Sheet from '../components/ui/Sheet';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { addDays, formatCurrency, formatDateShort, formatWeekdayDate, getTodayDate, greetingForHour, openPicker, toDateInput, userName } from '../utils/format';
import { imagesFromDataTransfer } from '../utils/images';
import {
    SNOOZE_PRESETS,
    cancelSnooze,
    classifyNote,
    createIdea,
    createTask,
    deadlineLabel,
    deleteIdea,
    deleteTask,
    dismissAgenda,
    doneHistory,
    hoursLeft,
    planIdea,
    setPublished,
    setPurchaseStatus,
    setSigned,
    setTaskDone,
    snooze,
    undismissAgenda,
} from '../services/agenda';
import { inboxFile, markInboxDone, reopenInbox, uploadToInbox } from '../services/inbox';
import { tickWithUndo } from '../services/collaborations';
import { setAppBadge } from '../services/push';

const FOCUS_KEY = 'gonia.focus';
const WEEK_OPEN_KEY = 'gonia.weekOpen';
const SNOOZED_OPEN_KEY = 'gonia.snoozedOpen';
const LATE_OPEN_KEY = 'gonia.lateOpen';
const REVIEW_OPEN_KEY = 'gonia.reviewOpen';

/** "przypomnę o 19:00" today, "jutro o 9:00" / "pt o 9:00" later. */
function snoozeLabel(until) {
    const [date, time] = until.split(' ');
    const hhmm = (time || '').slice(0, 5).replace(/^0/, '');
    const [y, m, d] = date.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    if (diff <= 0) return `przypomnę o ${hhmm}`;
    if (diff === 1) return `jutro o ${hhmm}`;
    if (diff > 6) return `${formatDateShort(date)} o ${hhmm}`;
    return `${new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(day).replace('.', '')} o ${hhmm}`;
}

function readFlag(key) {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function writeFlag(key, on) {
    try {
        localStorage.setItem(key, on ? '1' : '0');
    } catch {
        // ignore
    }
}

/** Remembered open / closed state (ADHD: back to the screen exactly as it was left). */
function useFlag(key) {
    const [on, setOn] = useState(() => readFlag(key));
    const toggle = useCallback(() => {
        setOn((o) => {
            writeFlag(key, !o);
            return !o;
        });
    }, [key]);
    return [on, toggle];
}

/**
 * Start for an ADHD brain: one thing now ("Teraz"), a short list after it,
 * visible progress for the day, money at a glance and one field to dump thoughts into.
 */
export default function Dashboard() {
    const { data, loading, error, refresh } = useDashboard();
    const { user } = useAuth();
    const [focus, setFocus] = useState(() => readFlag(FOCUS_KEY));
    const [skip, setSkip] = useState(0);
    const actions = useAgendaActions();

    useEffect(() => {
        refresh();
    }, [refresh]);

    const agenda = useMemo(() => data?.agenda || [], [data]);
    // Today's list in time order: things with an hour today first (the next one is "Teraz"),
    // then the rest by urgency. Snoozed to another day goes to "Odłożone".
    const todayItems = useMemo(() => {
        const list = agenda.filter((i) => i.bucket === 'today' || i.bucket === 'later');
        const timed = list.filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time));
        return [...timed, ...list.filter((i) => !i.time)];
    }, [agenda]);
    const weekItems = useMemo(() => agenda.filter((i) => i.bucket === 'week'), [agenda]);
    const snoozed = useMemo(() => agenda.filter((i) => i.bucket === 'snoozed'), [agenda]);
    const done = useMemo(() => data?.done_today || [], [data]);

    useEffect(() => {
        if (data) setAppBadge(todayItems.length);
    }, [data, todayItems.length]);

    const toggleFocus = () => {
        setFocus((f) => {
            writeFlag(FOCUS_KEY, !f);
            return !f;
        });
    };

    if (loading && !data) return <PageSkeleton />;
    if (error && !data) {
        return (
            <EmptyState
                icon={AlertCircle}
                title="Nie udało się pobrać danych"
                text={error}
                action={<Button variant="primary" onClick={() => refresh({ silent: false })}>Spróbuj ponownie</Button>}
            />
        );
    }

    const index = todayItems.length ? skip % todayItems.length : 0;
    const current = todayItems[index] || null;
    const later = todayItems.filter((i) => i !== current);
    const total = done.length + todayItems.length;
    const todayCount = todayItems.length;

    return (
        <div className="space-y-4 lg:space-y-5 animate-fade-in">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div className="flex-1 min-w-[220px]">
                    <h2 className="font-display text-2xl lg:text-[28px] font-semibold tracking-tight text-ink">
                        {greetingForHour()}{userName(user) ? `, ${userName(user)}` : ''}
                    </h2>
                    <p className="text-sm text-ink-muted mt-0.5">
                        {formatWeekdayDate()}
                        {todayCount > 0 && ` · na dziś ${todayCount}, reszta może poczekać`}
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <Progress done={done.length} total={total} />
                    <button
                        type="button"
                        onClick={toggleFocus}
                        aria-pressed={focus}
                        className={`h-11 px-4 rounded-full border text-sm font-medium inline-flex items-center gap-2 shrink-0 transition-colors ${
                            focus ? 'bg-ink text-canvas border-ink' : 'bg-surface text-ink border-line-strong hover:bg-surface-2'
                        }`}
                    >
                        <Crosshair size={16} />
                        <span className="hidden sm:inline">Tryb skupienia</span>
                        <span className="sm:hidden">Skupienie</span>
                    </button>
                </div>
            </div>

            {!focus && data?.week_review && <WeekReview review={data.week_review} />}

            <div className={`grid grid-cols-1 gap-4 ${focus ? '' : 'lg:grid-cols-[1.6fr_1fr]'}`}>
                <FocusCard
                    item={current}
                    canSkip={todayItems.length > 1}
                    onSkip={() => setSkip((s) => s + 1)}
                    actions={actions}
                    doneCount={done.length}
                />
                {!focus && <EarningsCard data={data} display="hidden lg:flex" />}
            </div>

            {focus ? (
                <p className="text-center text-sm text-ink-muted py-6">
                    Tylko ta jedna rzecz. Reszta jest schowana i poczeka — wyłącz tryb skupienia, gdy skończysz.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_1fr_1fr]">
                    <LaterList items={later} snoozed={snoozed} done={done} weekItems={weekItems} actions={actions} />
                    <CaptureCard ai={data?.ai} ideas={data?.draft_ideas || []} onPlan={actions.planIdeaToday} onInbox={actions.handleInboxResult} />
                    <MoneyCard data={data} />
                    {/* phone: earnings at the end, after what needs doing */}
                    <EarningsCard data={data} display="flex lg:hidden" />
                </div>
            )}

            <SnoozeSheet
                target={actions.snoozeTarget}
                onPick={actions.snoozeWith}
                onRemove={actions.removeTask}
                onUnplan={actions.unplanIdea}
                onDropInbox={actions.dropInbox}
                onClose={() => actions.setSnoozeTarget(null)}
            />
            <InboxChoiceSheet item={actions.inboxChoice} onPick={actions.openInboxAs} onDrop={actions.dropInbox} onClose={() => actions.setInboxChoice(null)} />
        </div>
    );
}

/* ------------------------------------------------------------------ actions */

function useAgendaActions() {
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();
    const { markPaid } = useMarkPaid();
    const { openCollab, openPurchase } = useQuickActions();
    const [busy, setBusy] = useState(null);
    const [snoozeTarget, setSnoozeTarget] = useState(null);
    const [inboxChoice, setInboxChoice] = useState(null);

    const run = useCallback(
        async (item, fn) => {
            setBusy(item.ref_key);
            try {
                await fn();
                await refresh();
            } catch (err) {
                toast.error(err.message || 'Nie udało się zapisać');
            } finally {
                setBusy(null);
            }
        },
        [refresh, toast]
    );

    const undoToast = useCallback(
        (text, undo) =>
            toast.success(text, {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => Promise.resolve(undo()).then(() => refresh()) },
            }),
        [refresh, toast]
    );

    /** Open a screen from the inbox in the right form ("Ze screena: ..."); done when it is saved. */
    const openInboxAs = useCallback(
        async (inbox, kind = inbox.kind, file) => {
            setInboxChoice(null);
            const done = () => markInboxDone(inbox.id).then(() => refresh());
            try {
                const screen = file || (await inboxFile(inbox));
                const data = inbox.data || {};
                if (kind === 'purchase') {
                    openPurchase(screen ? { files: [screen], onSaved: done } : { manual: true, prefill: data, onSaved: done });
                } else if (kind === 'collaboration') {
                    openCollab({ prefill: { brand: data.brand, amount_gross: data.amount_gross, notes: data.notes }, files: screen ? [screen] : undefined, onSaved: done });
                } else if (kind === 'document') {
                    navigate(`/documents?inbox=${inbox.id}`);
                } else {
                    setInboxChoice(inbox);
                }
            } catch (err) {
                toast.error(err.message || 'Nie udało się otworzyć screena');
            }
        },
        [navigate, openCollab, openPurchase, refresh, toast]
    );

    const dropInbox = useCallback(
        (item) => {
            setSnoozeTarget(null);
            setInboxChoice(null);
            const inbox = item.inbox || item;
            markInboxDone(inbox.id)
                .then(() => refresh())
                .then(() => undoToast('Screen usunięty z listy', () => reopenInbox(inbox.id)))
                .catch((err) => toast.error(err.message || 'Nie udało się'));
        },
        [refresh, toast, undoToast]
    );

    /** A screen dropped into "Zrzuć tutaj": saved (task / idea) or straight into its form. */
    const handleInboxResult = useCallback(
        (res, file) => {
            if (res.done && res.created?.task_id) {
                const when = res.data?.remind_at ? ` — ${snoozeLabel(res.data.remind_at)}` : '';
                undoToast(`Zapisane jako zadanie: ${res.data?.title || res.title}${when}`, () => deleteTask(res.created.task_id));
            } else if (res.done && res.created?.idea_id) {
                undoToast('Zapisane jako pomysł na rolkę', () => deleteIdea(res.created.idea_id));
            } else {
                openInboxAs({ ...res, has_file: true }, res.kind, file);
            }
            refresh();
        },
        [openInboxAs, refresh, undoToast]
    );

    const complete = useCallback(
        (item) => {
            switch (item.kind) {
                case 'idea':
                    navigate(item.url);
                    return;
                case 'inbox':
                    openInboxAs(item.inbox);
                    return;
                case 'payment':
                    run(item, () => markPaid(item.collab));
                    return;
                case 'task':
                    run(item, async () => {
                        await setTaskDone(item.task_id, true);
                        undoToast('Ogarnięte!', () => setTaskDone(item.task_id, false));
                    });
                    return;
                case 'return': {
                    const purchases = item.purchases || [];
                    run(item, async () => {
                        for (const [i, p] of purchases.entries()) {
                            // the parcel's postage "jak ostatnio" with this shop goes on the first item
                            const cost = i === 0 && item.return_cost != null ? { return_cost: item.return_cost } : {};
                            await setPurchaseStatus(p.id, { status: 'returned', returned_amount: p.amount, kept_confirmed: 0, ...cost });
                        }
                        undoToast(`Zwrot ${item.store} odhaczony — przypomnę, gdy pieniądze powinny wrócić`, async () => {
                            for (const p of purchases) await setPurchaseStatus(p.id, { status: 'kept', returned_amount: 0, return_cost: null });
                        });
                    });
                    return;
                }
                case 'refund':
                    run(item, async () => {
                        for (const id of item.purchase_ids || []) await setPurchaseStatus(id, { refunded_at: 'today' });
                        undoToast(`+${formatCurrency(item.amount)} wróciło z ${item.store}`, async () => {
                            for (const id of item.purchase_ids || []) await setPurchaseStatus(id, { refunded_at: null });
                        });
                    });
                    return;
                case 'publish':
                    if (item.deliverable_index !== null && item.deliverable_index !== undefined) {
                        // one thing from the brief made (the last one marks the job published)
                        run(item, () => tickWithUndo(toast, { id: item.collab_id, brand: item.brand }, item.deliverable_index, () => refresh()));
                        return;
                    }
                    run(item, async () => {
                        await setPublished(item.collab_id, true);
                        undoToast('Opublikowane — termin płatności liczy się od dziś', () => setPublished(item.collab_id, false));
                    });
                    return;
                case 'sign':
                    run(item, async () => {
                        await setSigned(item.document_id, true);
                        undoToast('Podpisane', () => setSigned(item.document_id, false));
                    });
                    return;
                case 'term':
                    run(item, async () => {
                        await dismissAgenda(item.ref_key, item.title);
                        undoToast('OK — zniknie z listy', () => undismissAgenda(item.ref_key));
                    });
                    return;
                default:
                    navigate(item.url);
            }
        },
        [markPaid, navigate, openInboxAs, refresh, run, toast, undoToast]
    );

    const snoozeWith = useCallback(
        (preset, remindAt) => {
            const item = snoozeTarget;
            setSnoozeTarget(null);
            if (!item) return;
            run(item, async () => {
                const res = await snooze(item, preset, remindAt);
                const when = res?.remind_at ? snoozeLabel(res.remind_at).replace(/^przypomnę /, '') : SNOOZE_PRESETS.find((p) => p.value === preset)?.label.toLowerCase() || '';
                toast.success(`Odłożone — przypomnę ${when}`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => cancelSnooze(item.ref_key).then(() => refresh()) },
                });
            });
        },
        [refresh, run, snoozeTarget, toast]
    );

    /** "Wszystko na jutro": the late pile goes away in one tap, no shame. */
    const snoozeAll = useCallback(
        async (list) => {
            setBusy('late');
            try {
                for (const item of list) await snooze(item, 'tomorrow');
                await refresh();
                undoToast(`Przeniesione na jutro: ${list.length}`, async () => {
                    for (const item of list) await cancelSnooze(item.ref_key);
                });
            } catch (err) {
                toast.error(err.message || 'Nie udało się przenieść');
            } finally {
                setBusy(null);
            }
        },
        [refresh, toast, undoToast]
    );

    // Tasks typed into "Zrzuć tutaj" can be removed (a joke, a typo); "Cofnij" brings them back
    const removeTask = useCallback(
        (item) => {
            setSnoozeTarget(null);
            const id = item.task_id ?? Number(String(item.ref_key).split(':')[1]);
            const wasDone = !!item.done_at;
            run(item, async () => {
                await deleteTask(id);
                toast.success('Usunięte', {
                    duration: 5000,
                    action: {
                        label: 'Cofnij',
                        onClick: async () => {
                            const res = await createTask(item.title, item.deadline || undefined, item.snoozed_until?.slice(0, 16));
                            if (wasDone && res?.id) await setTaskDone(res.id, true);
                            refresh();
                        },
                    },
                });
            });
        },
        [refresh, run, toast]
    );

    // "Nie dziś": a planned reel goes back to the ideas list without a date
    const unplanIdea = useCallback(
        (item) => {
            setSnoozeTarget(null);
            run(item, async () => {
                await planIdea(item.idea_id, false);
                toast.success('Zdjęte z dzisiejszej listy', {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => planIdea(item.idea_id, true).then(() => refresh()) },
                });
            });
        },
        [refresh, run, toast]
    );

    const planIdeaToday = useCallback(
        async (idea) => {
            try {
                await planIdea(idea.id, true);
                await refresh();
                toast.success('Na dziś — jest na liście');
            } catch (err) {
                toast.error(err.message || 'Nie udało się zapisać');
            }
        },
        [refresh, toast]
    );

    const unsnooze = useCallback(
        (item) => {
            run(item, async () => {
                await cancelSnooze(item.ref_key);
                toast.success('Przywrócone na listę');
            });
        },
        [run, toast]
    );

    return {
        busy,
        complete,
        snoozeTarget,
        setSnoozeTarget,
        snoozeWith,
        snoozeAll,
        unsnooze,
        removeTask,
        unplanIdea,
        planIdeaToday,
        inboxChoice,
        setInboxChoice,
        openInboxAs,
        dropInbox,
        handleInboxResult,
    };
}

/* ------------------------------------------------------------------ pieces */

function Progress({ done, total }) {
    const segments = Math.min(Math.max(total, 1), 8);
    const filled = total > 8 ? Math.round((done / total) * 8) : done;
    return (
        <div className="flex-1 sm:w-64 sm:flex-none" aria-label={`Dziś ogarnięte ${done} z ${total}`}>
            <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold text-ink">Dziś ogarnięte</span>
                <span className="text-ink-muted">
                    {done} z {total}
                </span>
            </div>
            <div className="flex gap-1.5">
                {Array.from({ length: segments }).map((_, i) => (
                    <span key={i} className={`h-2 flex-1 rounded-full ${i < filled ? 'bg-chart' : 'bg-line'}`} />
                ))}
            </div>
        </div>
    );
}

const PRIMARY_LABEL = {
    return: 'Zrobione, odesłane',
    refund: 'Pieniądze są',
    payment: 'Opłacone',
    publish: 'Opublikowane',
    sign: 'Podpisane',
    term: 'OK, wiem',
    inbox: 'Otwórz',
    task: 'Zrobione',
    idea: 'Nagraj teraz',
};

function primaryLabel(item) {
    if (item.kind === 'term' && item.term_type === 'publish') return 'Zrobione';
    if (item.kind === 'publish' && item.deliverable_index !== null && item.deliverable_index !== undefined) return 'Zrobione';
    return PRIMARY_LABEL[item.kind] || 'Zrobione';
}

function PrimaryIcon({ kind, size }) {
    if (kind === 'idea') return <Play size={size} strokeWidth={2.4} />;
    if (kind === 'inbox') return <ArrowRight size={size} strokeWidth={2.4} />;
    return <Check size={size} strokeWidth={2.4} />;
}

function FocusCard({ item, canSkip, onSkip, actions, doneCount }) {
    if (!item) {
        return (
            <section className="rounded-[28px] bg-accent text-on-accent p-6 lg:p-7 flex flex-col justify-center gap-2 min-h-[220px]">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2">
                    <Sparkles size={15} /> Teraz
                </span>
                <h2 className="font-display text-[26px] lg:text-3xl font-semibold tracking-tight leading-tight">
                    {doneCount > 0 ? 'Wszystko na dziś ogarnięte.' : 'Nic pilnego na dziś.'}
                </h2>
                <p className="text-[15px] opacity-80">Wpadnie coś do głowy? Zapisz to w polu „Zrzuć tutaj”.</p>
            </section>
        );
    }

    const busy = actions.busy === item.ref_key;
    const hours = item.kind === 'return' ? hoursLeft(item.deadline) : null;

    return (
        <section aria-labelledby="teraz-title" className="rounded-[28px] bg-accent text-on-accent p-5 lg:p-7 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2">
                <Crosshair size={15} /> Teraz · jedna rzecz
            </span>
            <h2 id="teraz-title" className="font-display text-[24px] lg:text-[30px] font-semibold tracking-tight leading-[1.1]">
                {item.title}
            </h2>
            <p className="text-[15px]">
                {item.time && <span className="font-semibold">o {item.time.replace(/^0/, '')} · </span>}
                {item.meta}
                {item.amount > 0 && (
                    <>
                        {' · '}
                        {item.kind === 'return' ? 'odzyskasz ' : ''}
                        <span className="amount font-semibold">{formatCurrency(item.amount)}</span>
                    </>
                )}
            </p>

            {item.kind === 'return' && (
                <div className="mt-1">
                    <div className="flex flex-wrap justify-between gap-x-3 text-sm font-semibold mb-1.5">
                        <span>Termin: {deadlineLabel(item.days, item.deadline)}</span>
                        {hours !== null && <span>zostało ok. {hours} godz.</span>}
                    </div>
                    <div className="h-2.5 rounded-full bg-black/15 overflow-hidden">
                        <div className="h-full rounded-full bg-on-accent" style={{ width: `${Math.min(100, Math.max(8, 100 - (hours / 168) * 100))}%` }} />
                    </div>
                </div>
            )}

            <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => actions.complete(item)}
                    disabled={busy}
                    className="h-12 px-5 rounded-full bg-on-accent text-accent font-semibold inline-flex items-center gap-2 active:scale-[0.98] disabled:opacity-60"
                >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <PrimaryIcon kind={item.kind} size={18} />}
                    {primaryLabel(item)}
                </button>
                <button
                    type="button"
                    onClick={() => actions.setSnoozeTarget(item)}
                    disabled={busy}
                    className="h-12 px-4 rounded-full border-[1.5px] border-black/35 font-semibold inline-flex items-center gap-2 active:scale-[0.98]"
                >
                    <Clock size={18} /> Później
                </button>
                {item.kind === 'return' && (
                    <Link to="/purchases" className="text-sm font-medium underline underline-offset-2 px-2">
                        Część zostawiam
                    </Link>
                )}
                {item.kind === 'task' && (
                    <button type="button" onClick={() => actions.removeTask(item)} disabled={busy} className="text-sm font-medium underline underline-offset-2 px-2">
                        Usuń
                    </button>
                )}
                {item.kind === 'idea' && (
                    <button type="button" onClick={() => actions.unplanIdea(item)} disabled={busy} className="text-sm font-medium underline underline-offset-2 px-2">
                        Nie dziś
                    </button>
                )}
                {['publish', 'sign', 'payment', 'refund', 'term'].includes(item.kind) && (
                    <Link to={item.url} className="text-sm font-medium underline underline-offset-2 px-2">
                        Szczegóły
                    </Link>
                )}
                {canSkip && (
                    <button type="button" onClick={onSkip} className="text-sm font-medium underline underline-offset-2 px-2 ml-auto">
                        Pokaż następną
                    </button>
                )}
            </div>
        </section>
    );
}

/**
 * "Przegląd tygodnia" (Monday-Tuesday until done): money last week, what is due this week.
 * 5 minutes, then "Gotowe" - it does not nag the rest of the week.
 */
function WeekReview({ review }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [open, toggleOpen] = useFlag(REVIEW_OPEN_KEY);
    const [saving, setSaving] = useState(false);

    const finish = async () => {
        setSaving(true);
        try {
            await dismissAgenda(review.key, 'Przegląd tygodnia');
            await refresh();
            toast.success('Przegląd zrobiony — dobry start tygodnia', {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => undismissAgenda(review.key).then(() => refresh()) },
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
            setSaving(false);
        }
    };

    return (
        <section className="card p-4 lg:p-5">
            <div className="flex items-center gap-3">
                <CalendarDays size={18} className="text-primary-600 shrink-0" />
                <h3 className="flex-1 text-base font-semibold text-ink">
                    Przegląd tygodnia <span className="font-normal text-ink-muted">· 5 minut</span>
                </h3>
                <button
                    type="button"
                    onClick={finish}
                    disabled={saving}
                    className="h-10 px-4 rounded-full bg-ink text-canvas text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Gotowe
                </button>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
                <ReviewStat label="Wpłynęło w zeszłym tyg." value={formatCurrency(review.paid_last_week.net)} sub={review.paid_last_week.count ? `${review.paid_last_week.count} wpłat` : 'nic'} tone="text-emerald-700" />
                <ReviewStat label="Czeka na przelew" value={formatCurrency(review.waiting.gross)} sub={`${review.waiting.count} współprac`} tone="text-ink" />
                <ReviewStat label="Terminy w tym tyg." value={String(review.this_week.length)} sub={review.late ? `zaległe: ${review.late}` : 'bez zaległości'} tone={review.late ? 'text-secondary' : 'text-ink'} />
            </div>
            {review.this_week.length > 0 && (
                <>
                    <button type="button" onClick={toggleOpen} aria-expanded={open} className="mt-3 w-full flex items-center justify-between text-sm text-ink-muted">
                        <span>{open ? 'Zwiń terminy' : 'Pokaż terminy tego tygodnia'}</span>
                        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                        <ul className="mt-2 divide-y divide-line">
                            {review.this_week.map((d, i) => (
                                <li key={i}>
                                    <Link to={d.url} className="flex items-center gap-3 py-2 text-sm">
                                        <span className="w-16 shrink-0 text-xs font-semibold text-ink-muted">{weekdayShort(d.date)}</span>
                                        <span className="flex-1 min-w-0 truncate text-ink">{d.title}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
}

function ReviewStat({ label, value, sub, tone }) {
    return (
        <div className="rounded-2xl bg-canvas border border-line p-3 min-w-0">
            <div className="text-[11px] leading-tight text-ink-muted">{label}</div>
            <div className={`amount font-display text-lg font-semibold tracking-tight mt-1 truncate ${tone}`}>{value}</div>
            <div className="text-[11px] text-ink-muted truncate">{sub}</div>
        </div>
    );
}

function weekdayShort(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(date).replace('.', '')} ${formatDateShort(ymd)}`;
}

function EarningsCard({ data, display }) {
    const months = data?.months || [];
    const net = data?.financials?.month?.net || 0;
    const count = data?.financials?.month?.count || 0;
    const max = Math.max(...months.map((m) => m.net), 1);
    const best = net > 0 && net >= max;

    return (
        <Link to="/statistics?tab=finanse" className={`card p-5 lg:p-6 ${display} flex-col gap-1 hover:border-line-strong transition-colors`}>
            <span className="text-sm text-ink-muted">Na rękę · {new Intl.DateTimeFormat('pl-PL', { month: 'long' }).format(new Date())}</span>
            <span className="amount font-display text-[32px] lg:text-[38px] font-semibold tracking-tight leading-none self-start">{formatCurrency(net)}</span>
            <span className="text-xs text-ink-muted mt-1">
                {count ? `${count} opłacone współprace` : 'jeszcze nic nie wpłynęło'}
                {best && <span className="ml-2 inline-block rounded-full bg-accent text-on-accent font-semibold px-2 py-0.5">najlepszy miesiąc</span>}
            </span>
            <div className="amount flex-1 min-h-[72px] flex items-end gap-1.5 mt-3" aria-hidden="true">
                {months.map((m, i) => (
                    <span
                        key={m.month}
                        className={`flex-1 rounded-md ${i === months.length - 1 ? 'bg-chart' : 'bg-line'}`}
                        style={{ height: `${Math.max(4, (m.net / max) * 100)}%` }}
                    />
                ))}
            </div>
            <span className="flex justify-between text-[11px] text-ink-muted mt-1">
                <span>12 miesięcy temu</span>
                <span>teraz</span>
            </span>
        </Link>
    );
}

function LaterList({ items, snoozed, done, weekItems, actions }) {
    const [weekOpen, toggleWeek] = useFlag(WEEK_OPEN_KEY);
    const [snoozedOpen, toggleSnoozed] = useFlag(SNOOZED_OPEN_KEY);
    const [lateOpen, toggleLate] = useFlag(LATE_OPEN_KEY);
    const [historyOpen, setHistoryOpen] = useState(false);
    // Several late things: one calm row instead of a wall of red
    const late = items.filter((i) => i.late);
    const groupLate = late.length >= 2;
    const rest = groupLate ? items.filter((i) => !i.late) : items;
    const shown = rest.slice(0, 3);
    const hidden = rest.length - shown.length;

    return (
        <section className="card p-2 pt-4 flex flex-col">
            <h3 className="px-3 mb-1 text-base font-semibold text-ink">Potem dziś</h3>
            {shown.length === 0 && !groupLate && done.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">Nic więcej na dziś.</p>}

            {groupLate && (
                <div className="mx-1 mb-1 rounded-2xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                        <button type="button" onClick={toggleLate} aria-expanded={lateOpen} className="flex-1 min-w-0 text-left text-sm">
                            <span className="font-semibold text-ink">Zaległe: {late.length}</span>
                            <span className="text-ink-muted"> · {lateOpen ? 'zwiń' : 'pokaż'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => actions.snoozeAll(late)}
                            disabled={actions.busy === 'late'}
                            className="h-9 px-3 rounded-full border border-amber-300 bg-surface text-xs font-semibold text-ink shrink-0 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {actions.busy === 'late' ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />} Wszystko na jutro
                        </button>
                    </div>
                    {lateOpen && (
                        <div className="pb-1">
                            {late.map((item) => (
                                <AgendaRow key={item.ref_key} item={item} actions={actions} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {shown.map((item) => (
                <AgendaRow key={item.ref_key} item={item} actions={actions} />
            ))}
            {hidden > 0 && <p className="px-3 py-1 text-xs text-ink-muted">+ {hidden} kolejne, pokażą się po kolei w „Teraz”</p>}
            {done.slice(0, 3).map((d) => (
                <div key={d.ref_key + d.done_at} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-7 h-7 rounded-full bg-chart text-on-accent flex items-center justify-center shrink-0">
                        <Check size={14} strokeWidth={3} />
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-ink-muted line-through truncate">{d.title}</span>
                    <span className="text-xs text-ink-muted">{d.done_at.slice(11, 16)}</span>
                    {d.ref_key.startsWith('task:') && (
                        <button
                            type="button"
                            onClick={() => actions.removeTask(d)}
                            aria-label={`Usuń: ${d.title}`}
                            title="Usuń"
                            className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-ink-muted hover:bg-ink/5 hover:text-ink shrink-0"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            ))}

            {snoozed.length > 0 && (
                <div className="mt-2 pt-2 mx-3 border-t border-line">
                    <button type="button" onClick={toggleSnoozed} aria-expanded={snoozedOpen} className="w-full flex justify-between items-center py-2.5 text-sm text-ink-muted">
                        <span className="inline-flex items-center gap-1.5">
                            <Clock size={14} /> Odłożone na później: {snoozed.length}
                        </span>
                        <span className="font-medium text-ink">{snoozedOpen ? 'Zwiń' : 'Pokaż'}</span>
                    </button>
                    {snoozedOpen && (
                        <div className="-mx-3 pb-1">
                            {snoozed.map((item) => (
                                <AgendaRow key={item.ref_key} item={item} actions={actions} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-auto">
            {weekItems.length > 0 && (
                <div className="pt-2 mx-3 border-t border-line">
                    <button type="button" onClick={toggleWeek} aria-expanded={weekOpen} className="w-full flex justify-between items-center py-2.5 text-sm text-ink-muted">
                        <span>W tym tygodniu jeszcze {weekItems.length}</span>
                        <span className="font-medium text-ink">{weekOpen ? 'Zwiń' : 'Pokaż'}</span>
                    </button>
                    {weekOpen && (
                        <div className="-mx-3 pb-1">
                            {weekItems.map((item) => (
                                <AgendaRow key={item.ref_key} item={item} actions={actions} />
                            ))}
                        </div>
                    )}
                </div>
            )}
                <div className="flex justify-between px-3 pt-1">
                    <Link to="/calendar" className="h-9 -ml-2 px-2 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                        <CalendarDays size={13} /> Kalendarz
                    </Link>
                    <button
                        type="button"
                        onClick={() => setHistoryOpen(true)}
                        className="h-9 -mr-2 px-2 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                    >
                        <History size={13} /> Historia
                    </button>
                </div>
            </div>
            {historyOpen && <HistorySheet onClose={() => setHistoryOpen(false)} />}
        </section>
    );
}

/** "Dziś" / "Wczoraj" / "pon 26 paź" for a YYYY-MM-DD day. */
function historyDayLabel(ymd) {
    const today = new Date();
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (ymd === key(today)) return 'Dziś';
    today.setDate(today.getDate() - 1);
    if (ymd === key(today)) return 'Wczoraj';
    return weekdayShort(ymd);
}

/** What got done, day by day - fetched each time it opens, 30 days at a time. */
function HistorySheet({ onClose }) {
    const [days, setDays] = useState(30);
    const [state, setState] = useState({ loading: true, error: null, items: [], hasOlder: false });

    useEffect(() => {
        let alive = true;
        doneHistory(days)
            .then((res) => alive && setState({ loading: false, error: null, items: res?.items || [], hasOlder: !!res?.has_older }))
            .catch((err) => alive && setState((s) => ({ ...s, loading: false, error: err.message || 'Nie udało się pobrać historii' })));
        return () => {
            alive = false;
        };
    }, [days]);

    const showOlder = () => {
        setState((s) => ({ ...s, loading: true, error: null }));
        setDays((n) => n + 30);
    };

    const groups = useMemo(() => {
        const out = [];
        for (const item of state.items) {
            const day = item.done_at.slice(0, 10);
            const last = out[out.length - 1];
            if (last && last.day === day) last.items.push(item);
            else out.push({ day, items: [item] });
        }
        return out;
    }, [state.items]);

    return (
        <Sheet open onClose={onClose} title="Historia" description="Co już ogarnięte, dzień po dniu" size="md">
            {state.loading && !state.items.length ? (
                <div className="flex justify-center py-8 text-ink-muted">
                    <Loader2 size={20} className="animate-spin" />
                </div>
            ) : state.error && !state.items.length ? (
                <p className="py-4 text-sm text-secondary">{state.error}</p>
            ) : groups.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">Jeszcze nic tu nie ma — pierwsze odhaczone zadanie pojawi się w historii.</p>
            ) : (
                <div className="space-y-4">
                    {groups.map((g) => (
                        <div key={g.day}>
                            <div className="flex items-baseline justify-between pb-1 border-b border-line">
                                <span className="text-sm font-semibold text-ink">{historyDayLabel(g.day)}</span>
                                <span className="text-xs text-ink-muted">
                                    ogarnięte: <span className="font-semibold text-ink">{g.items.length}</span>
                                </span>
                            </div>
                            <ul>
                                {g.items.map((d) => (
                                    <li key={d.ref_key + d.done_at} className="flex items-center gap-3 py-1.5">
                                        <span className="w-6 h-6 rounded-full bg-chart text-on-accent flex items-center justify-center shrink-0">
                                            <Check size={12} strokeWidth={3} />
                                        </span>
                                        <span className="flex-1 min-w-0 text-sm text-ink truncate">{d.title}</span>
                                        <span className="text-xs text-ink-muted">{d.done_at.slice(11, 16)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {state.hasOlder && (
                        <button
                            type="button"
                            onClick={showOlder}
                            disabled={state.loading}
                            className="w-full h-11 rounded-full border border-line-strong text-sm font-medium text-ink inline-flex items-center justify-center gap-2 hover:bg-surface-2 disabled:opacity-50"
                        >
                            {state.loading && <Loader2 size={15} className="animate-spin" />} Pokaż starsze
                        </button>
                    )}
                </div>
            )}
        </Sheet>
    );
}

function AgendaRow({ item, actions }) {
    const busy = actions.busy === item.ref_key;
    const metaTone = item.late ? 'text-secondary font-medium' : 'text-ink-muted';
    const isLink = !['inbox'].includes(item.kind);
    const Body = isLink ? Link : 'button';
    const bodyProps = isLink ? { to: item.url } : { type: 'button', onClick: () => actions.complete(item) };
    return (
        <div className="flex items-center gap-3 px-3 py-1.5">
            <button
                type="button"
                onClick={() => actions.complete(item)}
                disabled={busy}
                aria-label={primaryLabel(item)}
                title={primaryLabel(item)}
                className="w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center shrink-0 group"
            >
                <span className="w-7 h-7 rounded-full border-2 border-line-strong flex items-center justify-center group-hover:border-chart">
                    {busy ? (
                        <Loader2 size={13} className="animate-spin" />
                    ) : item.kind === 'idea' ? (
                        <Play size={11} className="text-ink-muted" />
                    ) : item.kind === 'inbox' ? (
                        <ArrowRight size={12} className="text-ink-muted" />
                    ) : null}
                </span>
            </button>
            <Body {...bodyProps} className="flex-1 min-w-0 text-left">
                <span className="block text-[15px] font-medium text-ink truncate">{item.title}</span>
                <span className={`block text-xs ${item.snoozed_until ? 'text-ink-muted' : metaTone}`}>
                    {item.snoozed_until ? (
                        <>
                            <span className="inline-flex items-center gap-1 font-medium text-ink-soft">
                                <Clock size={11} /> {snoozeLabel(item.snoozed_until)}
                            </span>
                            {' · '}
                        </>
                    ) : item.time ? (
                        <>
                            <span className="inline-flex items-center gap-1 font-semibold text-ink-soft">
                                <Clock size={11} /> {item.time.replace(/^0/, '')}
                            </span>
                            {' · '}
                        </>
                    ) : null}
                    {item.kind === 'return' ? deadlineLabel(item.days, item.deadline) : item.meta}
                    {item.amount > 0 && (
                        <>
                            {' · '}
                            <span className="amount">{formatCurrency(item.amount)}</span>
                        </>
                    )}
                </span>
            </Body>
            <button
                type="button"
                onClick={() => (item.snoozed_until ? actions.unsnooze(item) : actions.setSnoozeTarget(item))}
                className="h-10 px-3 rounded-full border border-line-strong text-xs font-medium text-ink hover:bg-surface-2 shrink-0"
            >
                {item.snoozed_until ? 'Przywróć' : 'Później'}
            </button>
        </div>
    );
}

function MoneyCard({ data }) {
    const fin = data?.financials || {};
    const counts = data?.counts || {};
    const official = fin.official || {};
    const progress = Math.min(100, official.tax_threshold_progress || 0);
    const left = Math.max(0, (official.tax_threshold || 0) - (official.income || 0));

    return (
        <section className="card p-5 flex flex-col gap-1">
            <h3 className="text-base font-semibold text-ink mb-1">Pieniądze</h3>
            <Link to="/collaborations" className="flex items-center gap-3 py-2.5 border-b border-line">
                <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-muted">Czeka na płatność</span>
                    <span className={`block text-xs ${fin.pending?.overdue_count ? 'text-secondary font-medium' : 'text-ink-muted'}`}>
                        {fin.pending?.count ? `${fin.pending.count} współprace${fin.pending.overdue_count ? ` · ${fin.pending.overdue_count} po terminie` : ''}` : 'wszystko opłacone'}
                    </span>
                </span>
                <span className="amount font-display text-xl font-semibold tracking-tight">{formatCurrency(fin.pending?.gross || 0)}</span>
            </Link>
            <Link to="/purchases" className="flex items-center gap-3 py-2.5 border-b border-line">
                <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-muted">Do odzyskania ze zwrotów</span>
                    <span className="block text-xs text-ink-muted">
                        {counts.active_returns ? `${counts.active_returns} ${counts.active_returns === 1 ? 'rzecz' : 'rzeczy'}` : 'nic nie czeka'}
                    </span>
                </span>
                <span className="amount font-display text-xl font-semibold tracking-tight">{formatCurrency(counts.active_returns_value || 0)}</span>
            </Link>
            <Link to="/statistics?tab=finanse" className="pt-3 block">
                <span className="flex justify-between text-sm">
                    <span className="text-ink-muted">Próg podatkowy</span>
                    <span className="font-semibold text-ink">{Math.round(progress)}%</span>
                </span>
                <span className="block h-2 rounded-full bg-line overflow-hidden mt-2">
                    <span className={`block h-full rounded-full ${progress >= 90 ? 'bg-secondary' : 'bg-chart'}`} style={{ width: `${progress}%` }} />
                </span>
                <span className="block text-xs text-ink-muted mt-1.5">
                    zostało <span className="amount">{formatCurrency(left)}</span> do II progu
                </span>
            </Link>
        </section>
    );
}

function CaptureCard({ ai, ideas, onPlan, onInbox }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const navigate = useNavigate();
    const { openCollab, openPurchase } = useQuickActions();
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const imageRef = useRef(null);
    // A suggestion only - reels count as "na dziś" after "Nagram dziś"
    const nextIdea = ideas.find((i) => Number(i.words) > 0 && !i.planned_for);

    const saveAsTask = async (title, due, remindAt) => {
        const res = await createTask(title, due, remindAt);
        toast.success(res?.remind_at ? `${title} — ${snoozeLabel(res.remind_at)}` : 'Zapisane jako zadanie', {
            duration: 5000,
            action: { label: 'Cofnij', onClick: () => deleteTask(res.id).then(() => refresh()) },
        });
    };

    // A screen (paste, pick, camera): AI says what it is and opens the right form
    const sendImage = async (file) => {
        if (!file || saving) return;
        setSaving(true);
        try {
            const res = await uploadToInbox(file, text.trim());
            setText('');
            onInbox(res, file);
        } catch (err) {
            toast.error(err.message || 'Nie udało się odczytać screena');
        } finally {
            setSaving(false);
        }
    };

    const onPaste = (e) => {
        const images = imagesFromDataTransfer(e.clipboardData);
        if (images.length) {
            e.preventDefault();
            sendImage(images[0]);
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        const note = text.trim();
        if (!note || saving) return;
        setSaving(true);
        try {
            if (!ai?.enabled) {
                await saveAsTask(note);
            } else {
                let result;
                try {
                    result = await classifyNote(note);
                } catch {
                    result = { kind: 'task', title: note };
                }
                if (result.kind === 'idea') {
                    const res = await createIdea(result.title, result.idea?.content || note);
                    toast.success('Zapisane jako pomysł na rolkę', {
                        duration: 5000,
                        action: { label: 'Cofnij', onClick: () => deleteIdea(res.id).then(() => refresh()) },
                    });
                } else if (result.kind === 'collaboration') {
                    openCollab({ prefill: { brand: result.collaboration?.brand, amount_gross: result.collaboration?.amount_gross, notes: result.collaboration?.notes || note } });
                } else if (result.kind === 'purchase') {
                    openPurchase({ manual: true, prefill: result.purchase });
                } else {
                    await saveAsTask(result.title || note, result.due_date, result.remind_at);
                }
            }
            setText('');
            refresh();
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="card p-5 flex flex-col gap-3">
            <h3 className="text-base font-semibold text-ink">Głowa pełna? Zrzuć tutaj</h3>
            <form onSubmit={submit} className="flex flex-col gap-1.5">
                <label htmlFor="capture" className="text-xs text-ink-muted">
                    {ai?.enabled ? 'Wpisz albo wklej screena — AI rozpozna: zadanie, pomysł, zakup, współpracę' : 'Zapiszę jako zadanie na dziś'}
                </label>
                <div className="flex gap-2">
                    <input
                        id="capture"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onPaste={ai?.enabled ? onPaste : undefined}
                        placeholder="np. rolka o płaszczach, Vichy chce 2 stories…"
                        className="input !rounded-2xl !h-12 flex-1 min-w-0"
                        enterKeyHint="done"
                    />
                    {ai?.enabled && (
                        <>
                            <button
                                type="button"
                                onClick={() => imageRef.current?.click()}
                                disabled={saving}
                                aria-label="Dodaj screena"
                                title="Dodaj screena"
                                className="w-12 h-12 rounded-2xl border border-line-strong text-ink flex items-center justify-center shrink-0 hover:bg-surface-2 disabled:opacity-40"
                            >
                                <ImagePlus size={19} />
                            </button>
                            <input
                                ref={imageRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    sendImage(file);
                                }}
                            />
                        </>
                    )}
                    <button
                        type="submit"
                        disabled={saving || !text.trim()}
                        aria-label="Zapisz"
                        className="w-12 h-12 rounded-2xl bg-ink text-canvas flex items-center justify-center shrink-0 disabled:opacity-40"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={19} />}
                    </button>
                </div>
            </form>
            <div>
                <div className="text-xs text-ink-muted mb-2">Albo dodaj od razu:</div>
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: 'Umowa', icon: FileText, run: () => navigate('/documents?add=1') },
                        { label: 'Współpraca', icon: Briefcase, run: () => openCollab() },
                        { label: 'Zakup', icon: Camera, run: () => openPurchase() },
                        { label: 'Pomysł', icon: Lightbulb, run: () => navigate('/ideas/new') },
                    ].map((a) => (
                        <button
                            key={a.label}
                            type="button"
                            onClick={a.run}
                            className="h-12 px-3 rounded-2xl border border-line-strong bg-surface text-sm font-semibold text-ink inline-flex items-center gap-2 hover:bg-surface-2 active:scale-[0.98]"
                        >
                            <a.icon size={18} className="text-primary-600 shrink-0" /> {a.label}
                        </button>
                    ))}
                </div>
            </div>
            {nextIdea && (
                <div className="mt-auto flex items-center gap-3 p-3 rounded-2xl bg-canvas">
                    <Link to={`/ideas/${nextIdea.id}?prompter=1`} aria-label="Otwórz prompter" className="w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center shrink-0">
                        <Play size={15} fill="currentColor" />
                    </Link>
                    <Link to={`/ideas/${nextIdea.id}`} className="min-w-0 flex-1">
                        <span className="block text-xs text-ink-muted">Pomysł do nagrania</span>
                        <span className="block text-sm font-medium text-ink truncate">{nextIdea.title}</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => onPlan(nextIdea)}
                        className="h-10 px-3 rounded-full border border-line-strong text-xs font-semibold text-ink inline-flex items-center gap-1.5 shrink-0 hover:bg-surface-2"
                    >
                        <CalendarCheck size={14} /> Na dziś
                    </button>
                </div>
            )}
        </section>
    );
}

function SnoozeSheet({ target, onPick, onRemove, onUnplan, onDropInbox, onClose }) {
    return (
        <Sheet open={!!target} onClose={onClose} title="Przypomnij później" description={target?.title} size="sm">
            <div className="grid gap-2 pb-1">
                {SNOOZE_PRESETS.map((p) => (
                    <button
                        key={p.value}
                        type="button"
                        onClick={() => onPick(p.value)}
                        className="h-14 px-4 rounded-2xl border border-line-strong text-left font-semibold text-ink hover:bg-surface-2 inline-flex items-center gap-3"
                    >
                        <Clock size={18} className="text-ink-muted" /> {p.label}
                    </button>
                ))}
                {target && <CustomSnooze key={target.ref_key} onPick={onPick} />}
                <p className="hint">Do tego czasu zniknie z listy, a potem przyjdzie powiadomienie.</p>
                {target?.kind === 'idea' && (
                    <button
                        type="button"
                        onClick={() => onUnplan(target)}
                        className="mt-2 h-12 px-4 rounded-2xl text-left font-semibold text-ink hover:bg-surface-2 inline-flex items-center gap-3"
                    >
                        <CalendarX size={18} className="text-ink-muted" /> Nie dziś — wróci do listy pomysłów
                    </button>
                )}
                {target?.kind === 'task' && (
                    <button
                        type="button"
                        onClick={() => onRemove(target)}
                        className="mt-2 h-12 px-4 rounded-2xl text-left font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-3"
                    >
                        <Trash2 size={18} /> Usuń zadanie
                    </button>
                )}
                {target?.kind === 'inbox' && (
                    <button
                        type="button"
                        onClick={() => onDropInbox(target)}
                        className="mt-2 h-12 px-4 rounded-2xl text-left font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-3"
                    >
                        <Trash2 size={18} /> Usuń screena z listy
                    </button>
                )}
            </div>
        </Sheet>
    );
}

/** "Inny dzień i godzina": own date + time (tomorrow 9:00 to start with). */
function CustomSnooze({ onPick }) {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState(() => toDateInput(addDays(getTodayDate(), 1)));
    const [time, setTime] = useState('09:00');
    const valid = !!date && /^\d{2}:\d{2}$/.test(time) && new Date(`${date}T${time}`) > new Date();

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="h-14 px-4 rounded-2xl border border-line-strong text-left font-semibold text-ink hover:bg-surface-2 inline-flex items-center gap-3"
            >
                <CalendarDays size={18} className="text-ink-muted" /> Inny dzień i godzina
            </button>
        );
    }
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (valid) onPick('custom', `${date} ${time}`);
            }}
            className="rounded-2xl border border-line-strong p-3 grid gap-2"
        >
            <div className="flex gap-2">
                <input type="date" value={date} min={getTodayDate()} onClick={openPicker} onChange={(e) => setDate(e.target.value)} aria-label="Dzień" className="input !h-12 flex-1 min-w-0" />
                <input type="time" value={time} onClick={openPicker} onChange={(e) => setTime(e.target.value)} aria-label="Godzina" className="input !h-12 w-32 shrink-0" />
            </div>
            <button type="submit" disabled={!valid} className="h-12 rounded-full bg-ink text-canvas font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
                <Check size={16} /> Przypomnij {date ? weekdayShort(date) : ''} o {time}
            </button>
        </form>
    );
}

/** A screen AI could not sort (or no AI): one tap says what it is. */
function InboxChoiceSheet({ item, onPick, onDrop, onClose }) {
    const options = [
        { kind: 'purchase', label: 'Zakup do zwrotu', icon: ShoppingBag },
        { kind: 'collaboration', label: 'Płatna współpraca', icon: Briefcase },
        { kind: 'document', label: 'Umowa / dokument', icon: FileText },
    ];
    return (
        <Sheet open={!!item} onClose={onClose} title="Co jest na screenie?" size="sm">
            <div className="grid gap-2 pb-1">
                {options.map((o) => (
                    <button
                        key={o.kind}
                        type="button"
                        onClick={() => onPick(item, o.kind)}
                        className="h-14 px-4 rounded-2xl border border-line-strong text-left font-semibold text-ink hover:bg-surface-2 inline-flex items-center gap-3"
                    >
                        <o.icon size={18} className="text-primary-600" /> {o.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => onDrop(item)}
                    className="mt-2 h-12 px-4 rounded-2xl text-left font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-3"
                >
                    <Trash2 size={18} /> Nic ważnego — usuń
                </button>
            </div>
        </Sheet>
    );
}
