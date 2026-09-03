import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Wallet, CalendarClock, AlertCircle, CheckCircle2, ChevronRight, TrendingUp, RotateCcw, Check, Play, Lightbulb, Plus, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';
import { useMarkPaid } from '../hooks/useMarkPaid';
import StatTile from '../components/ui/StatTile';
import Card, { CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import ReturnSheet from '../components/purchases/ReturnSheet';
import SocialSection from '../components/social/SocialSection';
import { formatCurrency, formatDateShort, formatWeekdayDate, getReturnUrgency, greetingForHour, formatSeconds } from '../utils/format';

/**
 * Start: greeting, 3 numbers, one "to do" list, social strip.
 */
export default function Dashboard() {
    const { user } = useAuth();
    const { data, loading, error, refresh } = useDashboard();
    const { markPaid, busyId } = useMarkPaid();
    const [returning, setReturning] = useState(null);

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

    const financials = data?.financials || {};
    const counts = data?.counts || {};
    const year = financials.year || new Date().getFullYear();
    const overdueCount = financials.pending?.overdue_count || 0;
    const hasUrgent = todo.some((t) => t.urgent);

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Greeting */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="lg:hidden text-sm text-ink-muted font-medium">{formatWeekdayDate()}</p>
                    <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-ink mt-0.5">
                        {greetingForHour()}, {user?.username || 'Gosia'}
                    </h2>
                </div>
                <div className="hidden lg:flex items-center gap-2">
                    <Button to="/collaborations/new" variant="primary">Nowa współpraca</Button>
                    <Button to="/purchases/new" variant="secondary">Nowy zakup</Button>
                </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="col-span-2 lg:col-span-1">
                    <StatTile
                        tone="brand"
                        icon={TrendingUp}
                        label="Ten miesiąc"
                        value={formatCurrency(financials.month?.gross || 0)}
                        sub={`Na rękę ${formatCurrency(financials.month?.net || 0)}`}
                        to="/collaborations?filter=paid"
                    />
                </div>
                <StatTile
                    icon={CalendarClock}
                    tone={overdueCount ? 'danger' : 'warning'}
                    label="Do zapłaty"
                    value={formatCurrency(financials.pending?.gross || 0, { compact: true })}
                    sub={
                        financials.pending?.count
                            ? `${financials.pending.count} ${financials.pending.count === 1 ? 'współpraca' : 'współprac'}${overdueCount ? ` · ${overdueCount} zaległe` : ''}`
                            : 'Wszystko opłacone'
                    }
                    to="/collaborations?filter=unpaid"
                />
                <StatTile
                    icon={Wallet}
                    label={`Rok ${year}`}
                    value={formatCurrency(financials.yearly_gross || 0, { compact: true })}
                    sub={`Na rękę ${formatCurrency(financials.yearly_net || 0, { compact: true })}`}
                    to="/statistics"
                />
            </div>

            {/* To do */}
            <Card padded={false}>
                <CardHeader
                    icon={todo.length ? AlertCircle : CheckCircle2}
                    title={todo.length ? `Do zrobienia (${todo.length})` : 'Wszystko pod kontrolą'}
                    className={hasUrgent ? '[&_svg]:text-red-500' : '[&_svg]:text-emerald-500'}
                />
                {todo.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-ink-muted">Brak pilnych zwrotów i nieopłaconych współprac.</p>
                ) : (
                    <div className="divide-y divide-line">
                        {todo.map((item) => (
                            <div key={item.key} className="row !py-3">
                                <Link to={item.to} className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.urgent ? 'bg-red-500' : item.tone === 'warning' ? 'bg-amber-400' : item.tone === 'info' ? 'bg-secondary' : 'bg-primary-400'}`} />
                                        <span className="font-semibold text-ink truncate">{item.title}</span>
                                    </div>
                                    <div className={`text-xs mt-0.5 truncate pl-4 ${item.urgent ? 'text-red-600 font-semibold' : 'text-ink-muted'}`}>{item.meta}</div>
                                </Link>
                                {item.amount && <div className="text-sm font-bold text-ink tabular-nums shrink-0">{item.amount}</div>}
                                {item.action === 'paid' && (
                                    <Button size="sm" variant="success" icon={Check} loading={busyId === item.id} onClick={() => markPaid(item.raw)} aria-label="Oznacz jako opłacone">
                                        <span className="hidden sm:inline">Opłacone</span>
                                    </Button>
                                )}
                                {item.action === 'return' && (
                                    <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setReturning(item.raw)} aria-label="Zwrócone">
                                        <span className="hidden sm:inline">Zwrócone</span>
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {(counts.unpaid > 0 || counts.active_returns > 0) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 border-t border-line text-xs text-ink-muted">
                        <Link to="/collaborations?filter=unpaid" className="inline-flex items-center gap-1 hover:text-primary-700">
                            {counts.unpaid} do zapłaty <ChevronRight size={12} />
                        </Link>
                        <Link to="/purchases" className="inline-flex items-center gap-1 hover:text-primary-700">
                            <ShoppingBag size={12} /> {counts.active_returns} do decyzji · {formatCurrency(counts.active_returns_value || 0, { compact: true })} <ChevronRight size={12} />
                        </Link>
                    </div>
                )}
            </Card>

            {/* Ideas to record */}
            <IdeasWidget ideas={data?.draft_ideas || []} total={counts.ideas_drafts || 0} />

            {/* Social (auto-fetched) */}
            <div>
                <div className="flex items-center justify-between px-1 mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Obserwujący</h3>
                    <Link to="/statistics" className="text-xs font-semibold text-primary-700 inline-flex items-center gap-0.5">
                        Statystyki <ChevronRight size={12} />
                    </Link>
                </div>
                <SocialSection compact />
            </div>

            <ReturnSheet purchase={returning} open={!!returning} onClose={() => setReturning(null)} onDone={() => refresh()} />
        </div>
    );
}

function IdeasWidget({ ideas, total }) {
    return (
        <Card padded={false}>
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-line">
                <h2 className="card-title flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-secondary-light text-secondary-dark flex items-center justify-center">
                        <Lightbulb size={14} />
                    </span>
                    Pomysły do nagrania
                    {total > 0 && <span className="text-xs font-semibold text-ink-muted">({total})</span>}
                </h2>
                <Link to="/ideas" className="text-xs font-semibold text-primary-700 hover:text-primary-800 inline-flex items-center gap-0.5">
                    Wszystkie <ChevronRight size={14} />
                </Link>
            </div>
            {ideas.length === 0 ? (
                <div className="px-5 py-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-ink-muted">Brak scenariuszy do nagrania. Zapisz pomysł, gdy tylko wpadnie Ci do głowy.</p>
                    <Button to="/ideas/new" size="sm" variant="soft" icon={Plus}>Dodaj</Button>
                </div>
            ) : (
                <>
                    <div className="divide-y divide-line">
                        {ideas.slice(0, 3).map((idea) => {
                            const seconds = Math.round((Number(idea.words) || 0) / 2.3);
                            return (
                                <div key={idea.id} className="row !py-3">
                                    <Link to={`/ideas/${idea.id}`} className="flex-1 min-w-0">
                                        <div className="font-semibold text-ink truncate">{idea.title}</div>
                                        <div className="text-xs text-ink-muted mt-0.5 inline-flex items-center gap-1">
                                            {seconds > 0 ? <><Clock size={11} /> ~{formatSeconds(seconds)} · </> : null}
                                            dodano {formatDateShort(idea.created_at?.slice(0, 10))}
                                        </div>
                                    </Link>
                                    <Button size="sm" variant="dark" icon={Play} to={`/ideas/${idea.id}?prompter=1`} aria-label="Prompter" disabled={!idea.words}>
                                        <span className="hidden sm:inline">Prompter</span>
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-line">
                        <span className="text-xs text-ink-muted">{total > 3 ? `i jeszcze ${total - 3}…` : 'Nagraj i oznacz jako „nagrane”.'}</span>
                        <Link to="/ideas/new" className="text-xs font-semibold text-primary-700 inline-flex items-center gap-1"><Plus size={12} /> Nowy pomysł</Link>
                    </div>
                </>
            )}
        </Card>
    );
}

/**
 * One prioritized list: urgent returns, overdue, unpaid (oldest), upcoming returns.
 */
function buildTodo(data) {
    if (!data) return [];
    const items = [];
    const seenPurchases = new Set();

    for (const p of data.urgent_purchases || []) {
        seenPurchases.add(p.id);
        const u = getReturnUrgency(p.days_remaining);
        items.push({ key: `p-${p.id}`, id: p.id, raw: p, to: `/purchases/${p.id}`, title: `${p.store} · zwrot`, meta: `${u.message} · ${p.items}`, amount: formatCurrency(p.amount), urgent: true, tone: 'danger', action: 'return' });
    }
    for (const c of data.unpaid_collaborations || []) {
        const overdue = c.payment_status === 'overdue';
        items.push({
            key: `c-${c.id}`,
            id: c.id,
            raw: c,
            to: `/collaborations/${c.id}`,
            title: c.brand,
            meta: overdue ? `Zaległa płatność · czeka ${c.days_waiting} dni` : `Czeka na płatność${c.days_waiting > 0 ? ` od ${c.days_waiting} dni` : ''} · ${formatDateShort(c.date)}`,
            amount: formatCurrency(c.amount_gross),
            urgent: overdue,
            tone: overdue ? 'danger' : 'warning',
            action: 'paid',
        });
    }
    for (const p of data.upcoming?.purchases || []) {
        if (seenPurchases.has(p.id)) continue;
        const u = getReturnUrgency(p.days_remaining);
        items.push({ key: `u-${p.id}`, id: p.id, raw: p, to: `/purchases/${p.id}`, title: `${p.store} · zwrot`, meta: `${u.message} · do ${formatDateShort(p.return_deadline)}`, amount: formatCurrency(p.amount), urgent: false, tone: u.tone, action: 'return' });
    }
    return items.slice(0, 8);
}
