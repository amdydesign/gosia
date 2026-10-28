import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Briefcase, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, FileText, Loader2, Package, Play, Send, SquareCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useDashboard } from '../context/DashboardContext';
import { calendarEvents, createTask, deleteTask } from '../services/agenda';
import { formatCurrency, getTodayDate, toDateInput } from '../utils/format';

const MONTH_KEY = 'gonia.calendarMonth';
const DAY_KEY = 'gonia.calendarDay';
const WEEKDAYS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];

// Dot / accent per tone - deadlines and money at a glance, no counting days
const TONE = {
    late: { dot: 'bg-red-500', text: 'text-red-700' },
    money: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    deadline: { dot: 'bg-amber-400', text: 'text-amber-700' },
    plan: { dot: 'bg-chart', text: 'text-ink' },
    info: { dot: 'bg-line-strong', text: 'text-ink-muted' },
};

const ICON = {
    task: SquareCheck,
    reminder: Bell,
    payment: CircleDollarSign,
    publish: Send,
    collab: Briefcase,
    return: Package,
    idea: Play,
    term: FileText,
};

function readSession(key, fallback) {
    try {
        return sessionStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function writeSession(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function ymdToDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Monday-first weeks covering the whole month. */
function monthGrid(month) {
    const first = ymdToDate(`${month}-01`);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    const days = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(toDateInput(d));
    return days;
}

function shiftMonth(month, by) {
    const d = ymdToDate(`${month}-01`);
    d.setMonth(d.getMonth() + by);
    return toDateInput(d).slice(0, 7);
}

function dayTitle(ymd, today) {
    const date = ymdToDate(ymd);
    const label = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    const diff = Math.round((date - ymdToDate(today)) / 86400000);
    if (diff === 0) return `Dziś, ${label}`;
    if (diff === 1) return `Jutro, ${label}`;
    if (diff > 1) return `${label} · za ${diff} dni`;
    return label;
}

/**
 * "Kalendarz": what is coming, also weeks ahead - tasks, reminders, payments,
 * publish and return deadlines, contract dates. Tap a day, see its list, add to it.
 */
export default function Calendar() {
    const toast = useToast();
    const { refresh: refreshDashboard } = useDashboard();
    const today = getTodayDate();
    const [month, setMonth] = useState(() => readSession(MONTH_KEY, today.slice(0, 7)));
    const [day, setDay] = useState(() => readSession(DAY_KEY, today));
    const [state, setState] = useState({ loading: true, error: null, events: [] });
    const [reload, setReload] = useState(0);

    const grid = useMemo(() => monthGrid(month), [month]);

    useEffect(() => {
        let alive = true;
        calendarEvents(grid[0], grid[grid.length - 1])
            .then((events) => alive && setState({ loading: false, error: null, events: Array.isArray(events) ? events : [] }))
            .catch((err) => alive && setState((s) => ({ ...s, loading: false, error: err.message || 'Nie udało się pobrać kalendarza' })));
        return () => {
            alive = false;
        };
    }, [grid, reload]);

    const byDay = useMemo(() => {
        const map = {};
        for (const e of state.events) (map[e.date] = map[e.date] || []).push(e);
        return map;
    }, [state.events]);

    const monthMoney = useMemo(
        () => state.events.filter((e) => e.kind === 'payment' && e.date.startsWith(month)).reduce((sum, e) => sum + (e.amount || 0), 0),
        [state.events, month]
    );

    const goMonth = (next) => {
        setState((s) => ({ ...s, loading: true }));
        setMonth(next);
        writeSession(MONTH_KEY, next);
    };
    const pickDay = (ymd) => {
        setDay(ymd);
        writeSession(DAY_KEY, ymd);
        if (!ymd.startsWith(month)) goMonth(ymd.slice(0, 7));
    };
    const goToday = () => pickDay(today);
    const reloadAll = () => {
        setReload((n) => n + 1);
        refreshDashboard();
    };

    const monthLabel = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(ymdToDate(`${month}-01`));
    const dayEvents = byDay[day] || [];

    return (
        <div className="space-y-4 animate-fade-in">
            <section className="card p-3 sm:p-4">
                <div className="flex items-center gap-2 px-1 pb-3">
                    <h2 className="flex-1 font-display text-xl font-semibold tracking-tight text-ink capitalize">{monthLabel}</h2>
                    {state.loading && <Loader2 size={16} className="animate-spin text-ink-muted" />}
                    {(month !== today.slice(0, 7) || day !== today) && (
                        <button type="button" onClick={goToday} className="h-9 px-3 rounded-full border border-line-strong text-xs font-semibold text-ink hover:bg-surface-2">
                            Dziś
                        </button>
                    )}
                    <button type="button" onClick={() => goMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc" className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-surface-2">
                        <ChevronLeft size={20} />
                    </button>
                    <button type="button" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc" className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-surface-2">
                        <ChevronRight size={20} />
                    </button>
                </div>
                {monthMoney > 0 && (
                    <p className="px-1 pb-3 text-sm text-ink-muted">
                        Płatności w tym miesiącu: <span className="amount font-semibold text-emerald-700">{formatCurrency(monthMoney)}</span>
                    </p>
                )}

                <div className="grid grid-cols-7 text-center text-[11px] font-medium text-ink-muted pb-1">
                    {WEEKDAYS.map((w) => (
                        <span key={w}>{w}</span>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {grid.map((ymd) => {
                        const events = byDay[ymd] || [];
                        const inMonth = ymd.startsWith(month);
                        const isToday = ymd === today;
                        const selected = ymd === day;
                        const tones = [...new Set(events.map((e) => e.tone))].slice(0, 3);
                        return (
                            <button
                                key={ymd}
                                type="button"
                                onClick={() => pickDay(ymd)}
                                aria-pressed={selected}
                                aria-label={`${ymd}${events.length ? `, ${events.length}` : ''}`}
                                className={`h-12 sm:h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                                    selected ? 'bg-ink text-canvas' : isToday ? 'bg-accent text-on-accent' : 'hover:bg-surface-2'
                                } ${inMonth ? '' : 'opacity-40'} ${ymd < today && !selected ? 'text-ink-muted' : ''}`}
                            >
                                <span className={`text-sm ${isToday || selected ? 'font-bold' : 'font-medium'}`}>{Number(ymd.slice(8))}</span>
                                <span className="flex gap-0.5 h-1.5">
                                    {tones.map((t) => (
                                        <span key={t} className={`w-1.5 h-1.5 rounded-full ${TONE[t]?.dot || 'bg-line-strong'}`} />
                                    ))}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pt-3 text-[11px] text-ink-muted">
                    <Legend tone="late" label="po terminie" />
                    <Legend tone="money" label="płatność" />
                    <Legend tone="deadline" label="termin" />
                    <Legend tone="plan" label="do zrobienia" />
                </div>
            </section>

            <section className="card p-2 pt-4">
                <h3 className="px-3 mb-1 text-base font-semibold text-ink first-letter:uppercase">{dayTitle(day, today)}</h3>
                {state.error ? (
                    <p className="px-3 py-2 text-sm text-red-700">{state.error}</p>
                ) : dayEvents.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-ink-muted">{state.loading ? 'Wczytuję…' : 'Nic na ten dzień.'}</p>
                ) : (
                    dayEvents.map((e, i) => <EventRow key={`${e.kind}${e.title}${i}`} event={e} />)
                )}
                {day >= today && <AddForDay day={day} toast={toast} onAdded={reloadAll} />}
            </section>
        </div>
    );
}

function Legend({ tone, label }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${TONE[tone].dot}`} /> {label}
        </span>
    );
}

function EventRow({ event }) {
    const Icon = ICON[event.kind] || CalendarClock;
    const tone = TONE[event.tone] || TONE.plan;
    return (
        <Link to={event.url} className="flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-surface-2">
            <span className={`w-9 h-9 rounded-full bg-canvas border border-line flex items-center justify-center shrink-0 ${tone.text}`}>
                <Icon size={16} />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-ink truncate">{event.title}</span>
                <span className={`block text-xs ${event.tone === 'late' ? 'text-red-700 font-medium' : 'text-ink-muted'}`}>
                    {event.time && <span className="font-semibold text-ink-soft">{event.time} · </span>}
                    {event.meta}
                </span>
            </span>
            {event.amount > 0 && <span className={`amount text-sm font-semibold shrink-0 ${event.kind === 'payment' ? tone.text : 'text-ink'}`}>{formatCurrency(event.amount)}</span>}
            <ArrowRight size={15} className="text-ink-muted shrink-0" />
        </Link>
    );
}

/** One field: a task on this day; a time makes it a reminder with a push. */
function AddForDay({ day, toast, onAdded }) {
    const [title, setTitle] = useState('');
    const [time, setTime] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        const text = title.trim();
        if (!text || saving) return;
        setSaving(true);
        try {
            const res = await createTask(text, day, time ? `${day} ${time}` : undefined);
            setTitle('');
            setTime('');
            onAdded();
            toast.success(res?.remind_at ? `Zapisane — przypomnę o ${res.remind_at.slice(11, 16)}` : 'Zapisane na ten dzień', {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => deleteTask(res.id).then(onAdded) },
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-2 mx-1 p-2 rounded-2xl bg-canvas flex gap-2">
            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dodaj zadanie…"
                aria-label="Dodaj na ten dzień"
                className="input !h-11 !rounded-xl flex-1 min-w-0"
                enterKeyHint="done"
            />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Godzina przypomnienia (opcjonalnie)" title="Godzina przypomnienia (opcjonalnie)" className="input !h-11 !rounded-xl !px-2 w-[92px] shrink-0" />
            <button type="submit" disabled={saving || !title.trim()} aria-label="Zapisz" className="w-11 h-11 rounded-xl bg-ink text-canvas flex items-center justify-center shrink-0 disabled:opacity-40">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={18} />}
            </button>
        </form>
    );
}
