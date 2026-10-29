import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Briefcase, Check, Plus, Search, X, Lock, Download, FileText, ChevronRight, ClipboardList } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import CollabDetailSheet from '../../components/collaborations/CollabDetailSheet';
import ExportModal from './ExportModal';
import { daysFromToday, formatCurrency, formatDateShort, getBillingLabel, getCollabTypeLabel, getTodayDate, groupByMonth } from '../../utils/format';
import { daysWaiting, deliverableProgress, grossOf, isBrief, isLate, isPaid, netOf, nextDeliverable, paymentDue, toPublish, WAGE_TYPE } from '../../utils/collabs';
import { tickWithUndo } from '../../services/collaborations';

const MONTHS_STEP = 6;

/**
 * Collaborations: unpaid on top (one tap = paid), history grouped by month.
 * /collaborations/:id opens the detail sheet, /collaborations/new the add sheet.
 */
export default function Collaborations() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();
    const { openCollab, versions, bump } = useQuickActions();

    const [collabs, setCollabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [monthsShown, setMonthsShown] = useState(MONTHS_STEP);
    const [busyId, setBusyId] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [docSuggestions, setDocSuggestions] = useState(0); // collaborations proposed from contracts / bills

    const isNew = location.pathname.endsWith('/new');
    const detailId = !isNew && id ? id : null;

    useEffect(() => {
        let cancelled = false;
        apiRequest('/collaborations/index.php')
            .then((data) => !cancelled && setCollabs(Array.isArray(data) ? data : []))
            .catch((err) => !cancelled && setError(err.message || 'Nie udało się pobrać współprac'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [versions.collaborations]);

    useEffect(() => {
        let cancelled = false;
        apiRequest('/documents/suggestions.php')
            .then((data) => !cancelled && setDocSuggestions(Array.isArray(data) ? data.length : 0))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [versions.collaborations]);

    // Old links: /collaborations/new -> open the add sheet
    useEffect(() => {
        if (isNew) {
            openCollab();
            navigate('/collaborations', { replace: true });
        }
    }, [isNew, openCollab, navigate]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return collabs;
        return collabs.filter((c) =>
            `${c.brand} ${c.notes || ''} ${getCollabTypeLabel(c.type)} ${getBillingLabel(c.collab_type)}`.toLowerCase().includes(q)
        );
    }, [collabs, query]);

    // Briefs (no contract / money yet): nearest thing to make first
    const prep = useMemo(
        () =>
            filtered
                .filter(isBrief)
                .sort((a, b) => (nextDeliverable(a)?.due || a.publish_by || '9999').localeCompare(nextDeliverable(b)?.due || b.publish_by || '9999')),
        [filtered]
    );

    // Not settled yet: late first, then waiting for the transfer, then still in progress (future date)
    const unpaid = useMemo(
        () =>
            filtered
                .filter((c) => !isPaid(c) && !isBrief(c))
                .sort((a, b) => STATUS_ORDER[unsettledStatus(a)] - STATUS_ORDER[unsettledStatus(b)] || (a.date < b.date ? -1 : 1)),
        [filtered]
    );
    const unpaidTotal = unpaid.reduce((s, c) => s + grossOf(c), 0);
    const history = useMemo(() => groupByMonth(filtered.filter(isPaid)), [filtered]);

    const yearNet = useMemo(() => {
        const year = String(new Date().getFullYear());
        return collabs.filter((c) => isPaid(c) && (c.date || '').startsWith(year)).reduce((s, c) => s + netOf(c), 0);
    }, [collabs]);

    const openDetail = (collab) => navigate(`/collaborations/${collab.id}`, { state: { fromList: true } });
    const closeDetail = () => (location.state?.fromList ? navigate(-1) : navigate('/collaborations', { replace: true }));

    const setStatus = async (collab, status) => {
        setBusyId(collab.id);
        setCollabs((list) => list.map((c) => (c.id === collab.id ? { ...c, payment_status: status } : c)));
        try {
            await apiRequest(`/collaborations/update.php?id=${collab.id}`, 'PUT', { payment_status: status });
            refresh();
            return true;
        } catch (err) {
            setCollabs((list) => list.map((c) => (c.id === collab.id ? { ...c, payment_status: collab.payment_status } : c)));
            toast.error(err.message || 'Nie udało się zapisać');
            return false;
        } finally {
            setBusyId(null);
        }
    };

    // "Zrobione" on the nearest thing from the brief, right from the list
    const tickNext = async (collab) => {
        const next = nextDeliverable(collab);
        if (!next) return;
        setBusyId(collab.id);
        try {
            await tickWithUndo(toast, collab, next.index, ({ deliverables, published }) => {
                setCollabs((list) =>
                    list.map((c) =>
                        c.id === collab.id
                            ? { ...c, deliverables, ...(published === true ? { published_at: getTodayDate() } : published === false ? { published_at: null } : {}) }
                            : c
                    )
                );
                refresh();
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setBusyId(null);
        }
    };

    const markPaid = async (collab) => {
        if (await setStatus(collab, 'paid')) {
            toast.success(`${collab.brand} — opłacone`, {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => setStatus({ ...collab, payment_status: 'paid' }, collab.payment_status) },
            });
        }
    };

    return (
        <div className="animate-fade-in space-y-5">
            {/* Header (desktop) */}
            <div className="hidden lg:flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-display font-semibold tracking-tight text-ink">Współprace</h1>
                    <p className="text-sm text-ink-muted">Dodajesz w 10 sekund, płatności pilnujemy razem</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)}>Eksport</Button>
                    <Button variant="primary" icon={Plus} onClick={() => openCollab()}>Nowa współpraca</Button>
                </div>
            </div>

            {docSuggestions > 0 && (
                <button
                    type="button"
                    onClick={() => navigate('/documents?suggestions=1')}
                    className="w-full flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 hover:bg-primary-50 px-4 py-3 text-left transition-colors"
                >
                    <span className="w-9 h-9 rounded-xl bg-accent text-on-accent flex items-center justify-center shrink-0">
                        <FileText size={17} />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-ink">Do uzupełnienia z umów i rachunków: {docSuggestions}</span>
                        <span className="block text-xs text-ink-soft truncate">Sprawdź propozycje i potwierdź jednym kliknięciem</span>
                    </span>
                    <ChevronRight size={18} className="text-primary-600 shrink-0" />
                </button>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl p-4 border ${unpaid.length ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <div className={`section-label ${unpaid.length ? '!text-amber-700' : '!text-emerald-700'}`}>Czeka na przelew</div>
                    <div className="amount text-xl sm:text-2xl font-display font-semibold text-ink mt-1 tabular-nums">{formatCurrency(unpaidTotal)}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{unpaid.length ? `${unpaid.length} ${plural(unpaid.length)}` : 'Wszystko opłacone'}</div>
                </div>
                <div className="rounded-2xl p-4 bg-surface border border-line shadow-card">
                    <div className="section-label">Na rękę w {new Date().getFullYear()}</div>
                    <div className="amount text-xl sm:text-2xl font-display font-semibold text-ink mt-1 tabular-nums">{formatCurrency(yearNet)}</div>
                    <div className="text-xs text-ink-muted mt-0.5">z opłaconych współprac</div>
                </div>
            </div>

            {/* Search */}
            {searchOpen ? (
                <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                    <input
                        autoFocus
                        type="search"
                        className="input !pl-10 !pr-10"
                        placeholder="Szukaj marki lub notatki…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button type="button" onClick={() => { setQuery(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-muted hover:bg-ink/5" aria-label="Zamknij wyszukiwanie">
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => openCollab()} className="flex-1 lg:hidden">Dodaj współpracę</Button>
                    <Button variant="secondary" icon={Search} onClick={() => setSearchOpen(true)} className="lg:flex-none" aria-label="Szukaj">
                        <span className="hidden lg:inline">Szukaj</span>
                    </Button>
                </div>
            )}

            {loading ? (
                <ListSkeleton rows={6} />
            ) : error ? (
                <EmptyState icon={Briefcase} title="Nie udało się pobrać współprac" text={error} />
            ) : collabs.length === 0 ? (
                <div className="card">
                    <EmptyState
                        icon={Briefcase}
                        title="Brak współprac"
                        text="Dodaj pierwszą — wystarczy marka i kwota."
                        action={<Button variant="primary" icon={Plus} onClick={() => openCollab()}>Dodaj współpracę</Button>}
                    />
                </div>
            ) : (
                <>
                    {prep.length > 0 && (
                        <section>
                            <div className="flex items-baseline justify-between px-1 mb-2">
                                <h2 className="text-base font-semibold text-ink">
                                    W przygotowaniu <span className="text-ink-muted font-medium">· {prep.length}</span>
                                </h2>
                                <span className="text-xs text-ink-muted">briefy bez umowy</span>
                            </div>
                            <div className="rounded-3xl border-2 border-sky-200 bg-sky-50 divide-y divide-sky-100 overflow-hidden">
                                {prep.map((c) => (
                                    <PrepRow key={c.id} collab={c} busy={busyId === c.id} onOpen={() => openDetail(c)} onTick={() => tickNext(c)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {unpaid.length > 0 && (
                        <section>
                            <div className="flex items-baseline justify-between px-1 mb-2">
                                <h2 className="text-base font-semibold text-ink">
                                    Nierozliczone <span className="text-ink-muted font-medium">· {unpaid.length}</span>
                                </h2>
                                <span className="amount text-sm font-semibold text-ink tabular-nums">{formatCurrency(unpaidTotal)}</span>
                            </div>
                            <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 divide-y divide-amber-200 overflow-hidden">
                                {unpaid.map((c) => (
                                    <UnpaidRow key={c.id} collab={c} busy={busyId === c.id} onOpen={() => openDetail(c)} onPaid={() => markPaid(c)} />
                                ))}
                            </div>
                        </section>
                    )}

                    {history.length > 0 ? (
                        <section className="space-y-4">
                            {history.slice(0, monthsShown).map((group) => (
                                <div key={group.key}>
                                    <div className="flex items-baseline justify-between px-1 mb-2">
                                        <h2 className="section-label">{group.label}</h2>
                                        <span className="text-xs font-semibold text-ink-muted tabular-nums">
                                            <span className="amount">{formatCurrency(group.items.reduce((s, c) => s + netOf(c), 0))}</span> na rękę
                                        </span>
                                    </div>
                                    <div className="card divide-y divide-line overflow-hidden">
                                        {group.items.map((c) => (
                                            <PaidRow key={c.id} collab={c} onOpen={() => openDetail(c)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                            {history.length > monthsShown && (
                                <Button variant="secondary" block onClick={() => setMonthsShown((n) => n + MONTHS_STEP)}>
                                    Pokaż starsze
                                </Button>
                            )}
                        </section>
                    ) : (
                        query && unpaid.length === 0 && prep.length === 0 && <p className="text-center text-sm text-ink-muted py-8">Nic nie pasuje do „{query}”.</p>
                    )}
                </>
            )}

            <div className="lg:hidden text-center">
                <button type="button" onClick={() => setExportOpen(true)} className="text-xs font-semibold text-ink-muted inline-flex items-center gap-1.5 py-2">
                    <Download size={13} /> Eksport CSV dla księgowej
                </button>
            </div>

            {detailId && <CollabDetailSheet key={detailId} collabId={detailId} onClose={closeDetail} onChanged={() => bump('collaborations')} />}
            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </div>
    );
}

const STATUS_ORDER = { late: 0, publish: 1, waiting: 2, progress: 3 };
const STATUS_STYLE = {
    late: { label: 'Po terminie', pill: 'bg-red-600 text-white' },
    publish: { label: 'Do publikacji', pill: 'bg-violet-600 text-white' },
    waiting: { label: 'Czeka na przelew', pill: 'bg-amber-500 text-white' },
    progress: { label: 'W trakcie', pill: 'bg-sky-600 text-white' },
};

/**
 * The stage follows from the dates - nothing to drag: late (past the payment term),
 * publish (deadline set, not published yet), progress (date still ahead), waiting (transfer due).
 */
function unsettledStatus(c) {
    if (isLate(c)) return 'late';
    if (toPublish(c)) return 'publish';
    return (daysFromToday(c.date) ?? 0) > 0 ? 'progress' : 'waiting';
}

function UnpaidRow({ collab, busy, onOpen, onPaid }) {
    const status = unsettledStatus(collab);
    const style = STATUS_STYLE[status];
    const waiting = daysWaiting(collab);
    const ahead = daysFromToday(collab.date) ?? 0;
    const due = paymentDue(collab);
    const dueIn = daysFromToday(due) ?? 0;
    const publishIn = daysFromToday(collab.publish_by) ?? 0;
    const when =
        status === 'publish'
            ? publishIn < 0 ? 'termin publikacji minął' : publishIn === 0 ? 'opublikuj dziś' : `opublikuj do ${formatDateShort(collab.publish_by)}`
            : status === 'progress'
                ? ahead === 1 ? 'jutro' : `za ${ahead} dni`
                : status === 'late'
                    ? `termin minął ${-dueIn} dni temu`
                    : dueIn >= 0 ? `przelew do ${formatDateShort(due)}` : waiting > 0 ? `czeka ${waiting} dni` : 'od dziś';
    const progress = deliverableProgress(collab);
    return (
        <div className="flex items-center gap-3 pl-4 pr-3 py-3">
            <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-ink text-[15px] truncate">{collab.brand}</div>
                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.pill}`}>{style.label}</span>
                    {progress.total > 0 && progress.done < progress.total && (
                        <span className="shrink-0 text-xs font-bold text-ink tabular-nums">{progress.done}/{progress.total}</span>
                    )}
                    <span className={`text-xs truncate ${status === 'late' ? 'text-red-700 font-semibold' : 'text-ink-muted'}`}>
                        {formatDateShort(collab.date)} · {when}
                    </span>
                </div>
            </button>
            <div className="text-right shrink-0">
                <div className="amount font-bold text-ink tabular-nums">{formatCurrency(grossOf(collab))}</div>
            </div>
            <button
                type="button"
                onClick={onPaid}
                disabled={busy}
                className="shrink-0 w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                aria-label={`Oznacz ${collab.brand} jako opłacone`}
                title="Przelew doszedł"
            >
                <Check size={20} strokeWidth={2.75} />
            </button>
        </div>
    );
}

/** A brief: what is next and how far along; ✓ = the nearest thing made. */
function PrepRow({ collab, busy, onOpen, onTick }) {
    const next = nextDeliverable(collab);
    const progress = deliverableProgress(collab);
    const days = next?.due ? daysFromToday(next.due) : null;
    const tone = days === null ? 'text-ink-muted' : days < 0 ? 'text-red-700 font-semibold' : days <= 2 ? 'text-amber-700 font-semibold' : 'text-ink-muted';
    const when = days === null ? '' : days < 0 ? ' · termin minął' : days === 0 ? ' · dziś' : days === 1 ? ' · jutro' : ` · do ${formatDateShort(next.due)}`;
    return (
        <div className="flex items-center gap-3 pl-4 pr-3 py-3">
            <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-ink text-[15px] truncate">{collab.brand}</div>
                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold bg-sky-600 text-white">Brief</span>
                    {progress.total > 0 && <span className="shrink-0 text-xs font-bold text-ink tabular-nums">{progress.done}/{progress.total}</span>}
                    <span className={`text-xs truncate ${tone}`}>
                        {next ? `${next.label}${next.left > 1 ? ` ×${next.left}` : ''}${when}` : progress.total ? 'wszystko zrobione' : 'czeka na umowę'}
                    </span>
                </div>
            </button>
            {grossOf(collab) > 0 && <div className="amount font-bold text-ink-soft tabular-nums shrink-0">{formatCurrency(grossOf(collab))}</div>}
            {next ? (
                <button
                    type="button"
                    onClick={onTick}
                    disabled={busy}
                    className="shrink-0 w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm active:scale-95 transition-transform disabled:opacity-50"
                    aria-label={`${next.label} — zrobione`}
                    title={`${next.label} — zrobione`}
                >
                    <Check size={20} strokeWidth={2.75} />
                </button>
            ) : (
                <ClipboardList size={18} className="shrink-0 text-sky-600" />
            )}
        </div>
    );
}

function PaidRow({ collab, onOpen }) {
    const isPrivate = Number(collab.fiscal_tracking) === 0;
    const label = collab.type === WAGE_TYPE ? 'Etat' : getCollabTypeLabel(collab.type);
    const billing = collab.type === WAGE_TYPE ? '' : getBillingLabel(collab.collab_type, { short: true });
    return (
        <button type="button" onClick={onOpen} className="tap-row w-full text-left">
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink text-[15px] truncate flex items-center gap-1.5">
                    {collab.brand}
                    {isPrivate && <Lock size={12} className="text-ink-muted shrink-0" />}
                </div>
                <div className="text-xs text-ink-muted truncate mt-0.5">
                    {formatDateShort(collab.date)} · {label}{billing && ` · ${billing}`}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="amount font-bold text-ink tabular-nums">{formatCurrency(grossOf(collab))}</div>
                <div className="amount text-[11px] text-emerald-700 font-semibold tabular-nums">{formatCurrency(netOf(collab))}</div>
            </div>
        </button>
    );
}

function plural(n) {
    if (n === 1) return 'współpraca';
    const last = n % 10;
    const lastTwo = n % 100;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'współprace';
    return 'współprac';
}
