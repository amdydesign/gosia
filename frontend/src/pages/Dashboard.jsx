import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Briefcase, CalendarCheck, CalendarX, Camera, Check, Clock, Crosshair, FileText, Lightbulb, Loader2, Play, Sparkles, Trash2, X } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { useQuickActions } from '../context/QuickActionsContext';
import { useToast } from '../context/ToastContext';
import { useMarkPaid } from '../hooks/useMarkPaid';
import Button from '../components/ui/Button';
import Sheet from '../components/ui/Sheet';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatWeekdayDate, greetingForHour, userName } from '../utils/format';
import {
    SNOOZE_PRESETS,
    cancelSnooze,
    classifyNote,
    createIdea,
    createTask,
    deadlineLabel,
    deleteIdea,
    deleteTask,
    hoursLeft,
    planIdea,
    setPurchaseStatus,
    setTaskDone,
    snooze,
} from '../services/agenda';
import { setAppBadge } from '../services/push';

const FOCUS_KEY = 'gonia.focus';
const WEEK_OPEN_KEY = 'gonia.weekOpen';
const SNOOZED_OPEN_KEY = 'gonia.snoozedOpen';

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
    const todayItems = useMemo(() => agenda.filter((i) => i.bucket === 'today'), [agenda]);
    const weekItems = useMemo(() => agenda.filter((i) => i.bucket === 'week'), [agenda]);
    // "Później" today stays on today's list (not in Teraz); snoozed to another day goes to "Odłożone"
    const laterToday = useMemo(() => agenda.filter((i) => i.bucket === 'later'), [agenda]);
    const snoozed = useMemo(() => agenda.filter((i) => i.bucket === 'snoozed'), [agenda]);
    const done = useMemo(() => data?.done_today || [], [data]);

    useEffect(() => {
        if (data) setAppBadge(todayItems.length + laterToday.length);
    }, [data, todayItems.length, laterToday.length]);

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
    const total = done.length + todayItems.length + laterToday.length;
    const todayCount = todayItems.length + laterToday.length;

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
                    <LaterList items={later} laterToday={laterToday} snoozed={snoozed} done={done} weekItems={weekItems} actions={actions} />
                    <CaptureCard ai={data?.ai} ideas={data?.draft_ideas || []} onPlan={actions.planIdeaToday} />
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
                onClose={() => actions.setSnoozeTarget(null)}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ actions */

function useAgendaActions() {
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();
    const { markPaid } = useMarkPaid();
    const [busy, setBusy] = useState(null);
    const [snoozeTarget, setSnoozeTarget] = useState(null);

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

    const complete = useCallback(
        (item) => {
            if (item.kind === 'idea') {
                navigate(item.url);
                return;
            }
            if (item.kind === 'payment') {
                run(item, () => markPaid(item.collab));
                return;
            }
            if (item.kind === 'task') {
                run(item, async () => {
                    await setTaskDone(item.task_id, true);
                    toast.success('Ogarnięte!', {
                        duration: 5000,
                        action: { label: 'Cofnij', onClick: () => setTaskDone(item.task_id, false).then(() => refresh()) },
                    });
                });
                return;
            }
            if (item.kind === 'return') {
                const purchases = item.purchases || [];
                run(item, async () => {
                    for (const p of purchases) {
                        await setPurchaseStatus(p.id, { status: 'returned', returned_amount: p.amount, kept_confirmed: 0 });
                    }
                    toast.success(`Zwrot ${item.store} odhaczony`, {
                        duration: 5000,
                        action: {
                            label: 'Cofnij',
                            onClick: async () => {
                                for (const p of purchases) await setPurchaseStatus(p.id, { status: 'kept', returned_amount: 0 });
                                refresh();
                            },
                        },
                    });
                });
            }
        },
        [markPaid, navigate, refresh, run, toast]
    );

    const snoozeWith = useCallback(
        (preset) => {
            const item = snoozeTarget;
            setSnoozeTarget(null);
            if (!item) return;
            run(item, async () => {
                const res = await snooze(item, preset);
                const at = res?.remind_at ? res.remind_at.slice(11, 16) : '';
                const label = SNOOZE_PRESETS.find((p) => p.value === preset)?.label || '';
                toast.success(`Odłożone — przypomnę ${preset === 'tomorrow' ? 'jutro o 9:00' : at ? `o ${at}` : label.toLowerCase()}`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => cancelSnooze(item.ref_key).then(() => refresh()) },
                });
            });
        },
        [refresh, run, snoozeTarget, toast]
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
                            const res = await createTask(item.title, item.deadline || undefined);
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

    return { busy, complete, snoozeTarget, setSnoozeTarget, snoozeWith, unsnooze, removeTask, unplanIdea, planIdeaToday };
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
    payment: 'Opłacone',
    task: 'Zrobione',
    idea: 'Nagraj teraz',
};

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
    const PrimaryIcon = item.kind === 'idea' ? Play : Check;

    return (
        <section aria-labelledby="teraz-title" className="rounded-[28px] bg-accent text-on-accent p-5 lg:p-7 flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-2">
                <Crosshair size={15} /> Teraz · jedna rzecz
            </span>
            <h2 id="teraz-title" className="font-display text-[24px] lg:text-[30px] font-semibold tracking-tight leading-[1.1]">
                {item.title}
            </h2>
            <p className="text-[15px]">
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
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <PrimaryIcon size={18} strokeWidth={2.4} />}
                    {PRIMARY_LABEL[item.kind]}
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
                {canSkip && (
                    <button type="button" onClick={onSkip} className="text-sm font-medium underline underline-offset-2 px-2 ml-auto">
                        Pokaż następną
                    </button>
                )}
            </div>
        </section>
    );
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

function LaterList({ items, laterToday, snoozed, done, weekItems, actions }) {
    const [weekOpen, setWeekOpen] = useState(() => readFlag(WEEK_OPEN_KEY));
    const [snoozedOpen, setSnoozedOpen] = useState(() => readFlag(SNOOZED_OPEN_KEY));
    const shown = items.slice(0, 3);
    const hidden = items.length - shown.length;

    const toggleWeek = () => {
        setWeekOpen((o) => {
            writeFlag(WEEK_OPEN_KEY, !o);
            return !o;
        });
    };

    return (
        <section className="card p-2 pt-4 flex flex-col">
            <h3 className="px-3 mb-1 text-base font-semibold text-ink">Potem dziś</h3>
            {shown.length === 0 && laterToday.length === 0 && done.length === 0 && <p className="px-3 py-2 text-sm text-ink-muted">Nic więcej na dziś.</p>}
            {shown.map((item) => (
                <AgendaRow key={item.ref_key} item={item} actions={actions} />
            ))}
            {hidden > 0 && <p className="px-3 py-1 text-xs text-ink-muted">+ {hidden} kolejne, pokażą się po kolei w „Teraz”</p>}
            {laterToday.map((item) => (
                <AgendaRow key={item.ref_key} item={item} actions={actions} />
            ))}
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
                    <button
                        type="button"
                        onClick={() =>
                            setSnoozedOpen((o) => {
                                writeFlag(SNOOZED_OPEN_KEY, !o);
                                return !o;
                            })
                        }
                        aria-expanded={snoozedOpen}
                        className="w-full flex justify-between items-center py-2.5 text-sm text-ink-muted"
                    >
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

            {weekItems.length > 0 && (
                <div className="mt-auto pt-2 mx-3 border-t border-line">
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
        </section>
    );
}

function AgendaRow({ item, actions }) {
    const busy = actions.busy === item.ref_key;
    const metaTone = item.late ? 'text-secondary font-medium' : 'text-ink-muted';
    return (
        <div className="flex items-center gap-3 px-3 py-1.5">
            <button
                type="button"
                onClick={() => actions.complete(item)}
                disabled={busy}
                aria-label={PRIMARY_LABEL[item.kind]}
                title={PRIMARY_LABEL[item.kind]}
                className="w-11 h-11 -ml-1.5 rounded-full flex items-center justify-center shrink-0 group"
            >
                <span className="w-7 h-7 rounded-full border-2 border-line-strong flex items-center justify-center group-hover:border-chart">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : item.kind === 'idea' ? <Play size={11} className="text-ink-muted" /> : null}
                </span>
            </button>
            <Link to={item.url} className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-ink truncate">{item.title}</span>
                <span className={`block text-xs ${item.snoozed_until ? 'text-ink-muted' : metaTone}`}>
                    {item.snoozed_until ? (
                        <>
                            <span className="inline-flex items-center gap-1 font-medium text-ink-soft">
                                <Clock size={11} /> {snoozeLabel(item.snoozed_until)}
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
            </Link>
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

function CaptureCard({ ai, ideas, onPlan }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const navigate = useNavigate();
    const { openCollab, openPurchase } = useQuickActions();
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    // A suggestion only - reels count as "na dziś" after "Nagram dziś"
    const nextIdea = ideas.find((i) => Number(i.words) > 0 && !i.planned_for);

    const saveAsTask = async (title, due) => {
        const res = await createTask(title, due);
        toast.success('Zapisane jako zadanie', {
            duration: 5000,
            action: { label: 'Cofnij', onClick: () => deleteTask(res.id).then(() => refresh()) },
        });
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
                    await saveAsTask(result.title || note, result.due_date);
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
                    {ai?.enabled ? 'AI rozpozna: zadanie, pomysł, zakup albo płatną współpracę' : 'Zapiszę jako zadanie na dziś'}
                </label>
                <div className="flex gap-2">
                    <input
                        id="capture"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="np. rolka o płaszczach, Vichy chce 2 stories…"
                        className="input !rounded-2xl !h-12 flex-1 min-w-0"
                        enterKeyHint="done"
                    />
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

function SnoozeSheet({ target, onPick, onRemove, onUnplan, onClose }) {
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
            </div>
        </Sheet>
    );
}
