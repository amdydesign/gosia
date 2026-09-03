import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Briefcase, ShoppingBag, Lightbulb, Wallet, CalendarClock, AlertCircle, CheckCircle2,
    ChevronRight, Sparkles, Plus, Play, TrendingUp, RotateCcw, Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../context/DashboardContext';
import { useMarkPaid } from '../hooks/useMarkPaid';
import StatTile from '../components/ui/StatTile';
import Card, { CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import ReturnSheet from '../components/purchases/ReturnSheet';
import SocialSection from '../components/social/SocialSection';
import {
    formatCurrency, formatDateShort, formatWeekdayDate, getCollabTypeLabel, getReturnUrgency,
    greetingForHour, getPaymentStatusInfo, initials
} from '../utils/format';

export default function Dashboard() {
    const { user } = useAuth();
    const { data, loading, error, refresh } = useDashboard();
    const { markPaid, busyId } = useMarkPaid();
    const [returning, setReturning] = useState(null);

    useEffect(() => {
        refresh();
    }, [refresh]);

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
    const unpaid = data?.unpaid_collaborations || [];
    const urgent = data?.urgent_purchases || [];
    const upcomingPurchases = data?.upcoming?.purchases || [];
    const overdue = unpaid.filter((c) => c.payment_status === 'overdue');
    const attentionCount = urgent.length + overdue.length;
    const year = financials.year || new Date().getFullYear();

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Greeting */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="lg:hidden text-sm text-ink-muted font-medium">{formatWeekdayDate()}</p>
                    <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-ink mt-0.5">
                        {greetingForHour()}, {user?.username || 'Gosia'} 👋
                    </h2>
                </div>
                <div className="hidden lg:flex items-center gap-2">
                    <Button to="/collaborations/new" variant="primary" icon={Plus}>Współpraca</Button>
                    <Button to="/purchases/new" variant="secondary" icon={ShoppingBag}>Zakup</Button>
                    <Button to="/ideas/new" variant="secondary" icon={Lightbulb}>Pomysł</Button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="col-span-2 lg:col-span-1">
                    <StatTile
                        tone="brand"
                        icon={TrendingUp}
                        label="Ten miesiąc"
                        value={formatCurrency(financials.month?.gross || 0)}
                        sub={`Na rękę ${formatCurrency(financials.month?.net || 0)} · ${financials.month?.count || 0} opłaconych`}
                    />
                </div>
                <StatTile
                    icon={Wallet}
                    label={`Rok ${year}`}
                    value={formatCurrency(financials.yearly_gross || 0, { compact: true })}
                    sub={`Na rękę ${formatCurrency(financials.yearly_net || 0, { compact: true })}`}
                    to="/statistics"
                />
                <StatTile
                    icon={CalendarClock}
                    tone={overdue.length ? 'danger' : 'warning'}
                    label="Do zapłaty"
                    value={formatCurrency(financials.pending?.gross || 0, { compact: true })}
                    sub={
                        financials.pending?.count
                            ? `${financials.pending.count} ${financials.pending.count === 1 ? 'współpraca' : 'współprac'}${overdue.length ? ` · ${overdue.length} zaległe` : ''}`
                            : 'Wszystko opłacone'
                    }
                    to="/collaborations?filter=unpaid"
                />
            </div>

            {/* Social snapshot (auto-fetched) */}
            <Link to="/statistics" className="block">
                <SocialSection compact />
            </Link>

            {/* Attention */}
            {attentionCount > 0 ? (
                <Card padded={false} className="border-red-100 overflow-hidden">
                    <CardHeader
                        icon={AlertCircle}
                        title={`Wymaga uwagi (${attentionCount})`}
                        className="bg-red-50/60 border-red-100 [&_svg]:text-red-500"
                    />
                    <div className="divide-y divide-line">
                        {urgent.map((p) => {
                            const urgency = getReturnUrgency(p.days_remaining);
                            return (
                                <div key={`p-${p.id}`} className="row">
                                    <Link to={`/purchases/${p.id}`} className="row-avatar bg-red-50 text-red-600">
                                        <ShoppingBag size={20} />
                                    </Link>
                                    <Link to={`/purchases/${p.id}`} className="flex-1 min-w-0">
                                        <div className="font-semibold text-ink truncate">{p.store}</div>
                                        <div className="text-xs text-ink-muted truncate">{p.items} · {formatCurrency(p.amount)}</div>
                                    </Link>
                                    <Badge tone={urgency.tone}>{urgency.message}</Badge>
                                    <Button size="sm" variant="success" icon={RotateCcw} onClick={() => setReturning(p)} className="hidden sm:inline-flex">
                                        Zwrócone
                                    </Button>
                                    <button type="button" onClick={() => setReturning(p)} className="sm:hidden btn btn-icon btn-success !p-2" aria-label="Zwrócone">
                                        <RotateCcw size={16} />
                                    </button>
                                </div>
                            );
                        })}
                        {overdue.map((c) => (
                            <div key={`c-${c.id}`} className="row">
                                <Link to={`/collaborations/${c.id}`} className="row-avatar bg-red-50 text-red-600">
                                    {initials(c.brand)}
                                </Link>
                                <Link to={`/collaborations/${c.id}`} className="flex-1 min-w-0">
                                    <div className="font-semibold text-ink truncate">{c.brand}</div>
                                    <div className="text-xs text-ink-muted truncate">
                                        Zaległa płatność · {formatCurrency(c.amount_gross)} · czeka {c.days_waiting} dni
                                    </div>
                                </Link>
                                <Button size="sm" variant="success" icon={Check} loading={busyId === c.id} onClick={() => markPaid(c)}>
                                    Opłacone
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : (
                <div className="card card-pad flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-white border-emerald-100">
                    <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <CheckCircle2 size={20} />
                    </span>
                    <div>
                        <div className="font-bold text-ink text-sm">Wszystko pod kontrolą</div>
                        <div className="text-xs text-ink-muted">Brak pilnych zwrotów i zaległych płatności.</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Unpaid */}
                <Card padded={false}>
                    <CardHeader icon={Wallet} title="Czekają na płatność" to="/collaborations?filter=unpaid" />
                    {unpaid.length === 0 ? (
                        <EmptyState compact icon={CheckCircle2} title="Brak nieopłaconych współprac" text="Wszystkie zlecenia są rozliczone." />
                    ) : (
                        <div className="divide-y divide-line">
                            {unpaid.slice(0, 6).map((c) => {
                                const status = getPaymentStatusInfo(c.payment_status);
                                return (
                                    <div key={c.id} className="row">
                                        <Link to={`/collaborations/${c.id}`} className={`row-avatar ${c.payment_status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}>
                                            {initials(c.brand)}
                                        </Link>
                                        <Link to={`/collaborations/${c.id}`} className="flex-1 min-w-0">
                                            <div className="font-semibold text-ink truncate">{c.brand}</div>
                                            <div className="text-xs text-ink-muted truncate">
                                                {getCollabTypeLabel(c.type)} · {formatDateShort(c.date)}
                                                {c.days_waiting > 0 && <span className={c.days_waiting > 30 ? ' text-red-600 font-semibold' : ''}> · czeka {c.days_waiting} dni</span>}
                                            </div>
                                        </Link>
                                        <div className="text-right">
                                            <div className="font-bold text-ink text-sm">{formatCurrency(c.amount_gross)}</div>
                                            <Badge tone={status.tone} className="mt-0.5">{status.short}</Badge>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => markPaid(c)}
                                            disabled={busyId === c.id}
                                            className="w-9 h-9 rounded-xl border border-line text-ink-muted hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 flex items-center justify-center shrink-0 transition-colors"
                                            title="Oznacz jako opłacone"
                                            aria-label="Oznacz jako opłacone"
                                        >
                                            <Check size={17} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                {/* Returns */}
                <Card padded={false}>
                    <CardHeader icon={CalendarClock} title="Najbliższe zwroty" to="/purchases" />
                    {upcomingPurchases.length === 0 ? (
                        <EmptyState compact icon={ShoppingBag} title="Brak zbliżających się terminów" text="Zakupy z terminem zwrotu w ciągu 14 dni pojawią się tutaj." />
                    ) : (
                        <div className="divide-y divide-line">
                            {upcomingPurchases.map((p) => {
                                const urgency = getReturnUrgency(p.days_remaining);
                                const progress = Math.max(0, Math.min(100, 100 - (Number(p.days_remaining) / Number(p.return_days || 14)) * 100));
                                return (
                                    <div key={p.id} className="row">
                                        <Link to={`/purchases/${p.id}`} className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="font-semibold text-ink truncate">{p.store}</div>
                                                <Badge tone={urgency.tone}>{urgency.short}</Badge>
                                            </div>
                                            <div className="text-xs text-ink-muted truncate mt-0.5">{p.items} · {formatCurrency(p.amount)} · do {formatDateShort(p.return_deadline)}</div>
                                            <div className="h-1 rounded-full bg-stone-100 mt-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${urgency.tone === 'danger' ? 'bg-red-500' : urgency.tone === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => setReturning(p)}
                                            className="w-9 h-9 rounded-xl border border-line text-ink-muted hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 flex items-center justify-center shrink-0 transition-colors"
                                            title="Zwrócone"
                                            aria-label="Zwrócone"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>

            {/* Ideas + summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Link
                    to={data?.next_idea ? `/ideas/${data.next_idea.id}` : '/ideas/new'}
                    className="lg:col-span-2 card card-pad flex items-center gap-4 hover:border-secondary/40 transition-colors group"
                >
                    <span className="w-12 h-12 rounded-2xl bg-secondary-light text-secondary-dark flex items-center justify-center shrink-0">
                        <Lightbulb size={22} />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                            Do nagrania · {counts.ideas_drafts || 0} {counts.ideas_drafts === 1 ? 'pomysł' : 'pomysłów'}
                        </span>
                        <span className="block font-bold text-ink truncate mt-0.5">
                            {data?.next_idea?.title || 'Dodaj pierwszy scenariusz na rolkę'}
                        </span>
                    </span>
                    <span className="btn btn-dark btn-sm group-hover:bg-black">
                        {data?.next_idea ? <Play size={14} fill="currentColor" /> : <Plus size={14} />}
                        {data?.next_idea ? 'Prompter' : 'Dodaj'}
                    </span>
                </Link>

                <div className="card card-pad flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                            <Briefcase size={18} />
                        </span>
                        <div>
                            <div className="text-lg font-extrabold text-ink leading-none">{counts.collabs_year || 0}</div>
                            <div className="text-[11px] text-ink-muted font-medium mt-1">współprac w {year}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                            <ShoppingBag size={18} />
                        </span>
                        <div>
                            <div className="text-lg font-extrabold text-ink leading-none">{counts.active_returns || 0}</div>
                            <div className="text-[11px] text-ink-muted font-medium mt-1">
                                do decyzji · {formatCurrency(counts.active_returns_value || 0, { compact: true })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile quick actions */}
            <div className="lg:hidden grid grid-cols-3 gap-3">
                <Link to="/collaborations/new" className="card p-3 flex flex-col items-center gap-2 text-center hover:border-primary-200">
                    <span className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center"><Briefcase size={18} /></span>
                    <span className="text-xs font-bold text-ink">Współpraca</span>
                </Link>
                <Link to="/purchases/new" className="card p-3 flex flex-col items-center gap-2 text-center hover:border-primary-200">
                    <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center"><ShoppingBag size={18} /></span>
                    <span className="text-xs font-bold text-ink">Zakup</span>
                </Link>
                <Link to="/ideas/new" className="card p-3 flex flex-col items-center gap-2 text-center hover:border-primary-200">
                    <span className="w-10 h-10 rounded-xl bg-secondary text-white flex items-center justify-center"><Lightbulb size={18} /></span>
                    <span className="text-xs font-bold text-ink">Pomysł</span>
                </Link>
            </div>

            <Link to="/statistics" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-primary-700 py-1">
                <Sparkles size={14} /> Zobacz pełne statystyki <ChevronRight size={14} />
            </Link>

            <ReturnSheet purchase={returning} open={!!returning} onClose={() => setReturning(null)} onDone={() => refresh()} />
        </div>
    );
}
