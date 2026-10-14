import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Briefcase, Check, Plus, Search, X, Lock, Download } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import CollabDetailSheet from '../../components/collaborations/CollabDetailSheet';
import ExportModal from './ExportModal';
import { formatCurrency, formatDateShort, getBillingLabel, getCollabTypeLabel, groupByMonth } from '../../utils/format';
import { daysWaiting, grossOf, isLate, isPaid, netOf, WAGE_TYPE } from '../../utils/collabs';

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

    const unpaid = useMemo(() => filtered.filter((c) => !isPaid(c)).sort((a, b) => (a.date < b.date ? -1 : 1)), [filtered]);
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
                    <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Współprace</h1>
                    <p className="text-sm text-ink-muted">Dodajesz w 10 sekund, płatności pilnujemy razem</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)}>Eksport</Button>
                    <Button variant="primary" icon={Plus} onClick={() => openCollab()}>Nowa współpraca</Button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl p-4 border ${unpaid.length ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <div className={`section-label ${unpaid.length ? '!text-amber-700' : '!text-emerald-700'}`}>Czeka na przelew</div>
                    <div className="text-xl sm:text-2xl font-extrabold text-ink mt-1 tabular-nums">{formatCurrency(unpaidTotal)}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{unpaid.length ? `${unpaid.length} ${plural(unpaid.length)}` : 'Wszystko opłacone'}</div>
                </div>
                <div className="rounded-2xl p-4 bg-surface border border-line shadow-card">
                    <div className="section-label">Na rękę w {new Date().getFullYear()}</div>
                    <div className="text-xl sm:text-2xl font-extrabold text-ink mt-1 tabular-nums">{formatCurrency(yearNet)}</div>
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
                    <button type="button" onClick={() => { setQuery(''); setSearchOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-muted hover:bg-black/5" aria-label="Zamknij wyszukiwanie">
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
                    {unpaid.length > 0 && (
                        <section>
                            <h2 className="section-label px-1 mb-2">Czeka na przelew</h2>
                            <div className="card divide-y divide-line overflow-hidden">
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
                                            {formatCurrency(group.items.reduce((s, c) => s + netOf(c), 0))} na rękę
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
                        query && unpaid.length === 0 && <p className="text-center text-sm text-ink-muted py-8">Nic nie pasuje do „{query}”.</p>
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

function UnpaidRow({ collab, busy, onOpen, onPaid }) {
    const late = isLate(collab);
    const waiting = daysWaiting(collab);
    return (
        <div className="flex items-center gap-3 pl-4 pr-3 py-3">
            <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-ink text-[15px] truncate">{collab.brand}</div>
                <div className={`text-xs mt-0.5 truncate ${late ? 'text-red-600 font-semibold' : 'text-ink-muted'}`}>
                    {formatDateShort(collab.date)} · {waiting > 0 ? `czeka ${waiting} dni` : 'czeka na przelew'}
                </div>
            </button>
            <div className="text-right shrink-0">
                <div className="font-bold text-ink tabular-nums">{formatCurrency(grossOf(collab))}</div>
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
                <div className="font-bold text-ink tabular-nums">{formatCurrency(grossOf(collab))}</div>
                <div className="text-[11px] text-emerald-700 font-semibold tabular-nums">{formatCurrency(netOf(collab))}</div>
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
