import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Briefcase, Camera, Check, CheckCircle2, ChevronRight, Clock, Lightbulb, Play, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';
import { useQuickActions } from '../context/QuickActionsContext';
import { useMarkPaid } from '../hooks/useMarkPaid';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import SocialSection from '../components/social/SocialSection';
import { formatCurrency, formatDateShort, formatSeconds, formatWeekdayDate, greetingForHour } from '../utils/format';
import { deadlineText, deadlineTone, groupByStore } from '../utils/purchases';
import { LATE_AFTER_DAYS } from '../utils/collabs';

/**
 * Start = shortcuts to everything: add buttons, the 3 numbers that matter,
 * one to-do list with one-tap actions, ideas and followers.
 */
export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { data, loading, error, refresh } = useDashboard();
    const { openCollab, openPurchase } = useQuickActions();
    const { markPaid, busyId: payingId } = useMarkPaid();

    useEffect(() => {
        refresh();
    }, [refresh]);

    const todo = useMemo(() => buildTodo(data), [data]);

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

    const fin = data?.financials || {};
    const counts = data?.counts || {};
    const ideas = data?.draft_ideas || [];
    const nextIdea = ideas.find((i) => Number(i.words) > 0);

    const tiles = [
        { label: 'Współpraca', sub: 'marka + kwota', icon: Plus, tone: 'bg-primary-600 text-white shadow-float', iconTone: 'bg-white/15', onClick: () => openCollab() },
        { label: 'Zakup', sub: 'ze screena', icon: Camera, tone: 'bg-secondary text-white shadow-[0_10px_30px_-10px_rgba(249,115,22,0.55)]', iconTone: 'bg-white/20', onClick: () => openPurchase() },
        { label: 'Pomysł', sub: 'na rolkę', icon: Lightbulb, tone: 'bg-surface text-ink border border-line shadow-card', iconTone: 'bg-amber-50 text-amber-600', onClick: () => navigate('/ideas/new') },
        nextIdea
            ? { label: 'Nagraj', sub: nextIdea.title, icon: Play, tone: 'bg-ink text-white', iconTone: 'bg-white/10', onClick: () => navigate(`/ideas/${nextIdea.id}?prompter=1`) }
            : { label: 'Pomysły', sub: 'scenariusze', icon: Lightbulb, tone: 'bg-surface text-ink border border-line shadow-card', iconTone: 'bg-slate-100 text-ink-soft', onClick: () => navigate('/ideas') },
    ];

    return (
        <div className="space-y-5 animate-fade-in">
            <div>
                <p className="text-sm text-ink-muted font-medium lg:hidden">{formatWeekdayDate()}</p>
                <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-ink mt-0.5">
                    {greetingForHour()}, {user?.username || 'Gosia'}
                </h2>
            </div>

            {/* Add / do */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tiles.map((t) => (
                    <button
                        key={t.label}
                        type="button"
                        onClick={t.onClick}
                        className={`rounded-2xl p-4 text-left flex flex-col gap-3 min-h-[104px] active:scale-[0.98] transition-transform ${t.tone}`}
                    >
                        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.iconTone}`}>
                            <t.icon size={22} strokeWidth={2.4} />
                        </span>
                        <span className="min-w-0">
                            <span className="block font-extrabold leading-tight">{t.label}</span>
                            <span className="block text-xs opacity-75 truncate">{t.sub}</span>
                        </span>
                    </button>
                ))}
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-3 gap-2.5">
                <NumberTile to="/statistics" label="Ten miesiąc" value={formatCurrency(fin.month?.net || 0, { compact: true })} sub="na rękę" />
                <NumberTile
                    to="/collaborations"
                    label="Do zapłaty"
                    value={formatCurrency(fin.pending?.gross || 0, { compact: true })}
                    sub={fin.pending?.count ? `${fin.pending.count} × współpraca` : 'wszystko opłacone'}
                    alert={fin.pending?.overdue_count > 0}
                />
                <NumberTile
                    to="/purchases"
                    label="Do zwrotu"
                    value={formatCurrency(counts.active_returns_value || 0, { compact: true })}
                    sub={counts.active_returns ? `${counts.active_returns} ${counts.active_returns === 1 ? 'rzecz' : 'rzeczy'}` : 'nic nie czeka'}
                />
            </div>

            {/* To do */}
            <section className="card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
                    {todo.length ? <AlertCircle size={17} className="text-amber-500" /> : <CheckCircle2 size={17} className="text-emerald-500" />}
                    <h3 className="card-title flex-1">{todo.length ? 'Do ogarnięcia' : 'Wszystko pod kontrolą'}</h3>
                </div>
                {todo.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-ink-muted">Żadne zwroty się nie kończą i nic nie wisi z płatnościami.</p>
                ) : (
                    <div className="divide-y divide-line">
                        {todo.map((item) =>
                            item.kind === 'return' ? (
                                <Link key={item.key} to="/purchases" className="flex items-center gap-3 pl-4 pr-3 py-2.5 hover:bg-canvas/70">
                                    <RotateCcw size={17} className="text-emerald-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[15px] font-semibold text-ink truncate">Zwrot {item.group.store}</div>
                                        <div className={`text-xs truncate ${item.tone === 'danger' ? 'text-red-600 font-semibold' : 'text-ink-muted'}`}>
                                            {item.group.items.length} {item.group.items.length === 1 ? 'rzecz' : 'rzeczy'} ·{' '}
                                            {formatCurrency(item.group.items.reduce((s, p) => s + (Number(p.amount) || 0), 0))} ·{' '}
                                            {deadlineText(item.group.days_remaining, item.group.return_deadline)}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-ink-muted shrink-0" />
                                </Link>
                            ) : (
                                <div key={item.key} className="flex items-center gap-2 pl-4 pr-2.5 py-2.5">
                                    <Link to={`/collaborations/${item.raw.id}`} className="flex-1 min-w-0">
                                        <div className="text-[15px] font-semibold text-ink truncate">{item.raw.brand}</div>
                                        <div className={`text-xs truncate ${item.late ? 'text-red-600 font-semibold' : 'text-ink-muted'}`}>
                                            {formatCurrency(item.raw.amount_gross)} · {item.raw.days_waiting > 0 ? `czeka ${item.raw.days_waiting} dni` : `od ${formatDateShort(item.raw.date)}`}
                                        </div>
                                    </Link>
                                    <IconAction label="Opłacone" tone="success" busy={payingId === item.raw.id} onClick={() => markPaid(item.raw)} icon={Check} />
                                </div>
                            )
                        )}
                    </div>
                )}
            </section>

            {/* Ideas */}
            <section className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
                    <h3 className="card-title flex items-center gap-2">
                        <Lightbulb size={16} className="text-amber-500" /> Do nagrania
                        {counts.ideas_drafts > 0 && <span className="text-xs font-semibold text-ink-muted">({counts.ideas_drafts})</span>}
                    </h3>
                    <Link to="/ideas" className="text-xs font-semibold text-primary-700 inline-flex items-center gap-0.5">
                        Wszystkie <ChevronRight size={14} />
                    </Link>
                </div>
                {ideas.length === 0 ? (
                    <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                        <p className="text-sm text-ink-muted">Brak scenariuszy. Zapisz pomysł, gdy tylko wpadnie.</p>
                        <Button to="/ideas/new" size="sm" variant="soft" icon={Plus}>Dodaj</Button>
                    </div>
                ) : (
                    <div className="divide-y divide-line">
                        {ideas.slice(0, 3).map((idea) => {
                            const seconds = Math.round((Number(idea.words) || 0) / 2.3);
                            return (
                                <div key={idea.id} className="flex items-center gap-3 pl-4 pr-2.5 py-2.5">
                                    <Link to={`/ideas/${idea.id}`} className="flex-1 min-w-0">
                                        <div className="text-[15px] font-semibold text-ink truncate">{idea.title}</div>
                                        <div className="text-xs text-ink-muted inline-flex items-center gap-1">
                                            {seconds > 0 && <><Clock size={11} /> ~{formatSeconds(seconds)} · </>}
                                            dodano {formatDateShort(idea.created_at?.slice(0, 10))}
                                        </div>
                                    </Link>
                                    <Button size="sm" variant="dark" icon={Play} to={`/ideas/${idea.id}?prompter=1`} disabled={!idea.words} aria-label="Prompter">
                                        <span className="hidden sm:inline">Prompter</span>
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Followers */}
            <section>
                <div className="flex items-center justify-between px-1 mb-2">
                    <h3 className="section-label">Obserwujący</h3>
                    <Link to="/statistics" className="text-xs font-semibold text-primary-700 inline-flex items-center gap-0.5">
                        Statystyki <ChevronRight size={12} />
                    </Link>
                </div>
                <SocialSection compact />
            </section>

            <div className="lg:hidden grid grid-cols-2 gap-2 pb-2">
                <Button to="/collaborations" variant="secondary" icon={Briefcase}>Współprace</Button>
                <Button to="/purchases" variant="secondary" icon={RotateCcw}>Zwroty</Button>
            </div>
        </div>
    );
}

function NumberTile({ to, label, value, sub, alert = false }) {
    return (
        <Link to={to} className={`rounded-2xl p-3 sm:p-4 border transition-colors ${alert ? 'bg-red-50 border-red-100' : 'bg-surface border-line shadow-card hover:border-primary-200'}`}>
            <div className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate ${alert ? 'text-red-700' : 'text-ink-muted'}`}>{label}</div>
            <div className="text-[17px] sm:text-2xl font-extrabold text-ink mt-1 tracking-tight tabular-nums truncate">{value}</div>
            <div className="text-[11px] text-ink-muted truncate">{sub}</div>
        </Link>
    );
}

function IconAction({ label, tone, busy, onClick, icon: Icon }) {
    const cls = tone === 'success' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-ink-soft border-line-strong';
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className={`shrink-0 h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50 ${cls}`}
            aria-label={label}
            title={label}
        >
            {Icon && <Icon size={15} />}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

/**
 * Returns ending within a week + unpaid collaborations (late first).
 */
function buildTodo(data) {
    if (!data) return [];
    const items = [];
    const seen = new Set();

    const returns = [...(data.urgent_purchases || []), ...(data.upcoming?.purchases || [])]
        .filter((p) => Number(p.days_remaining) <= 7)
        .sort((a, b) => Number(a.days_remaining) - Number(b.days_remaining));
    const unique = returns.filter((p) => !seen.has(p.id) && seen.add(p.id));
    // one return per brand, like on the Zakupy screen
    for (const group of groupByStore(unique).sort((a, b) => a.days_remaining - b.days_remaining)) {
        items.push({ key: `r-${group.key}`, kind: 'return', group, tone: deadlineTone(group.days_remaining) });
    }

    const unpaid = (data.unpaid_collaborations || []).map((c) => ({
        key: `c-${c.id}`,
        kind: 'collab',
        raw: c,
        late: c.payment_status === 'overdue' || Number(c.days_waiting) > LATE_AFTER_DAYS,
    }));
    unpaid.sort((a, b) => Number(b.late) - Number(a.late));
    items.push(...unpaid.slice(0, 6));

    return items;
}
