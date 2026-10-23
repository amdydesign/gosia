import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Check, Heart, Pencil, RotateCcw, ShoppingBag } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useQuickActions } from '../../context/QuickActionsContext';
import { usePurchaseActions } from '../../hooks/usePurchaseActions';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import PurchaseDetailSheet from '../../components/purchases/PurchaseDetailSheet';
import { bucket, deadlineText, deadlineTone, groupByStore, withPatch } from '../../utils/purchases';
import { formatCurrency, formatDateShort } from '../../utils/format';
import { takeSharedFiles } from '../../utils/shareTarget';

const HISTORY_FILTERS = [
    { value: 'returned', label: 'Zwrócone' },
    { value: 'kept', label: 'Zostawione' },
];
const HISTORY_STEP = 30;

/**
 * Purchases & returns: add from a screenshot, decide with one tap
 * (Zwrócone / Zostawiam), history below. /purchases/:id opens details.
 */
export default function Purchases() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { openPurchase, versions } = useQuickActions();

    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [historyFilter, setHistoryFilter] = useState('returned');
    const [historyShown, setHistoryShown] = useState(HISTORY_STEP);

    const isNew = location.pathname.endsWith('/new');
    const detailId = !isNew && id ? id : null;

    useEffect(() => {
        let cancelled = false;
        apiRequest('/purchases/index.php')
            .then((data) => !cancelled && setPurchases(Array.isArray(data) ? data : []))
            .catch((err) => !cancelled && setError(err.message || 'Nie udało się pobrać zakupów'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [versions.purchases]);

    // Old links (/purchases/new) and screenshots shared from the phone's gallery
    useEffect(() => {
        if (isNew) {
            openPurchase();
            navigate('/purchases', { replace: true });
        }
    }, [isNew, openPurchase, navigate]);

    useEffect(() => {
        if (searchParams.get('shared') !== '1') return;
        setSearchParams({}, { replace: true });
        takeSharedFiles().then((files) => openPurchase(files.length ? { files } : {}));
    }, [searchParams, setSearchParams, openPurchase]);

    const applyPatch = useCallback((pid, patch) => {
        setPurchases((list) => (patch === null ? list.filter((p) => p.id !== pid) : list.map((p) => (p.id === pid ? withPatch(p, patch) : p))));
    }, []);
    const { settle } = usePurchaseActions({ onChange: applyPatch });
    const keepSelection = useKeepSelection();
    const [settling, setSettling] = useState(null);

    const active = useMemo(() => purchases.filter((p) => bucket(p) === 'active'), [purchases]);
    const returns = useMemo(() => groupByStore(active).sort((a, b) => a.days_remaining - b.days_remaining), [active]);
    const history = useMemo(
        () =>
            purchases
                .filter((p) => bucket(p) === historyFilter)
                .sort((a, b) => ((a.returned_at || a.purchase_date) < (b.returned_at || b.purchase_date) ? 1 : -1)),
        [purchases, historyFilter]
    );

    const year = String(new Date().getFullYear());
    const activeValue = active.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const recovered = purchases
        .filter((p) => bucket(p) === 'returned' && (p.returned_at || p.purchase_date || '').startsWith(year))
        .reduce((s, p) => s + (Number(p.returned_amount) || 0), 0);

    const openDetail = (p) => navigate(`/purchases/${p.id}`, { state: { fromList: true } });
    const closeDetail = () => (location.state?.fromList ? navigate(-1) : navigate('/purchases', { replace: true }));
    const detailPurchase = detailId ? purchases.find((p) => String(p.id) === String(detailId)) : null;

    return (
        <div className="animate-fade-in space-y-5">
            <div className="hidden lg:block">
                <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Zakupy i zwroty</h1>
                <p className="text-sm text-ink-muted">Wrzuć screena zamówienia — przypomnę o terminie zwrotu</p>
            </div>

            {/* Main action */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => openPurchase()}
                    className="flex-1 flex items-center gap-3 rounded-2xl bg-primary-600 hover:bg-primary-700 text-white px-4 py-3.5 shadow-float active:scale-[0.99] transition"
                >
                    <span className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Camera size={22} /></span>
                    <span className="text-left min-w-0">
                        <span className="block font-extrabold">Dodaj ze screena</span>
                        <span className="block text-xs text-white/75 truncate">Zamówienie, mail ze sklepu, paragon</span>
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => openPurchase({ manual: true })}
                    className="shrink-0 w-[72px] rounded-2xl bg-surface border border-line text-ink-soft hover:text-ink flex flex-col items-center justify-center gap-1 text-[11px] font-semibold"
                    aria-label="Wpisz ręcznie"
                >
                    <Pencil size={18} /> Ręcznie
                </button>
            </div>

            {/* Summary */}
            {(activeValue > 0 || recovered > 0) && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="card px-4 py-3">
                        <div className="section-label">Do decyzji</div>
                        <div className="text-lg font-extrabold text-ink mt-0.5 tabular-nums">{formatCurrency(activeValue)}</div>
                        <div className="text-xs text-ink-muted">{active.length} {active.length === 1 ? 'rzecz' : 'rzeczy'} z terminem zwrotu</div>
                    </div>
                    <div className="card px-4 py-3">
                        <div className="section-label">Odzyskane w {year}</div>
                        <div className="text-lg font-extrabold text-emerald-700 mt-0.5 tabular-nums">{formatCurrency(recovered)}</div>
                        <div className="text-xs text-ink-muted">ze zwrotów</div>
                    </div>
                </div>
            )}

            {loading ? (
                <ListSkeleton rows={5} />
            ) : error ? (
                <EmptyState icon={ShoppingBag} title="Nie udało się pobrać zakupów" text={error} />
            ) : purchases.length === 0 ? (
                <div className="card">
                    <EmptyState icon={ShoppingBag} title="Brak zakupów" text="Wrzuć screena zamówienia, a przypomnę Ci o terminie zwrotu." />
                </div>
            ) : (
                <>
                    <section>
                        <h2 className="section-label px-1 mb-2">Zwroty do zrobienia</h2>
                        {returns.length === 0 ? (
                            <div className="card px-4 py-5 text-sm text-ink-muted text-center">Nic nie czeka na zwrot. 🎉</div>
                        ) : (
                            <div className="space-y-3">
                                {returns.map((group) => (
                                    <ReturnCard
                                        key={group.key}
                                        group={group}
                                        kept={keepSelection.ids}
                                        onToggleKeep={keepSelection.toggle}
                                        onOpen={openDetail}
                                        busy={settling === group.key}
                                        onSettle={async (toReturn, toKeep) => {
                                            setSettling(group.key);
                                            if (await settle(toReturn, toKeep)) keepSelection.forget(group.items);
                                            setSettling(null);
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <div className="flex items-center justify-between px-1 mb-2">
                            <h2 className="section-label">Historia</h2>
                            <div className="flex gap-1.5">
                                {HISTORY_FILTERS.map((f) => (
                                    <button key={f.value} type="button" onClick={() => setHistoryFilter(f.value)} className={`chip !py-1 ${historyFilter === f.value ? 'chip-active' : ''}`}>
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {history.length === 0 ? (
                            <div className="card px-4 py-5 text-sm text-ink-muted text-center">
                                {historyFilter === 'returned' ? 'Jeszcze nic nie zwróciłaś.' : 'Brak zostawionych rzeczy.'}
                            </div>
                        ) : (
                            <div className="card divide-y divide-line overflow-hidden">
                                {history.slice(0, historyShown).map((p) => (
                                    <button key={p.id} type="button" onClick={() => openDetail(p)} className="tap-row w-full text-left">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-ink text-[15px] truncate">{p.items}</div>
                                            <div className="text-xs text-ink-muted truncate mt-0.5">{p.store} · {formatDateShort(p.purchase_date)}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="font-bold text-ink tabular-nums">{formatCurrency(p.amount)}</div>
                                            {historyFilter === 'returned' ? (
                                                <div className="text-[11px] font-semibold text-emerald-700">
                                                    {p.status === 'partial' ? `wróciło ${formatCurrency(p.returned_amount)}` : 'zwrócone'}
                                                </div>
                                            ) : (
                                                <div className="text-[11px] font-semibold text-ink-muted">zostaje</div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {history.length > historyShown && (
                            <Button variant="secondary" block className="mt-3" onClick={() => setHistoryShown((n) => n + HISTORY_STEP)}>
                                Pokaż więcej
                            </Button>
                        )}
                    </section>
                </>
            )}

            {detailId && (detailPurchase || !loading) && (
                <PurchaseDetailSheet key={detailId} purchaseId={detailId} initial={detailPurchase} onClose={closeDetail} onChanged={applyPatch} />
            )}
        </div>
    );
}

const KEEP_KEY = 'gosia-return-keep';

/** Items marked "zostawiam" inside a return - remembered on this device until the return is done. */
function useKeepSelection() {
    const [ids, setIds] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(KEEP_KEY) || '[]'));
        } catch {
            return new Set();
        }
    });
    const save = (next) => {
        setIds(next);
        try {
            localStorage.setItem(KEEP_KEY, JSON.stringify([...next]));
        } catch {
            // private mode: selection lives until reload
        }
    };
    const toggle = (id) => {
        const next = new Set(ids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        save(next);
    };
    const forget = (list) => {
        const next = new Set(ids);
        list.forEach((p) => next.delete(p.id));
        save(next);
    };
    return { ids, toggle, forget };
}

/**
 * One return per brand: tap "Zostawiam" on what stays, then one button sends the rest back.
 */
function ReturnCard({ group, kept, onToggleKeep, onOpen, onSettle, busy }) {
    const tone = deadlineTone(group.days_remaining);
    const badge = {
        danger: 'bg-red-600 text-white',
        warning: 'bg-amber-400 text-amber-950',
        ok: 'bg-emerald-50 text-emerald-700',
    }[tone];
    const toReturn = group.items.filter((p) => !kept.has(p.id));
    const toKeep = group.items.filter((p) => kept.has(p.id));
    const returnSum = toReturn.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total = group.items.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return (
        <div className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-canvas/60">
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink truncate">{group.store}</div>
                    <div className="text-xs text-ink-muted">
                        {group.items.length} {group.items.length === 1 ? 'rzecz' : 'rzeczy'} · {formatCurrency(total)}
                        {group.orders > 1 ? ` · ${group.orders} zamówienia` : ''}
                    </div>
                </div>
                <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${badge}`}>{deadlineText(group.days_remaining, group.return_deadline)}</span>
            </div>
            <div className="divide-y divide-line">
                {group.items.map((p) => {
                    const stays = kept.has(p.id);
                    return (
                        <div key={p.id} className={`flex items-center gap-2 pl-4 pr-2.5 py-2.5 ${stays ? 'bg-primary-50/40' : ''}`}>
                            <button type="button" onClick={() => onOpen(p)} className="flex-1 min-w-0 text-left">
                                <div className={`text-[15px] font-semibold truncate ${stays ? 'text-ink-soft' : 'text-ink'}`}>{p.items}</div>
                                <div className="text-xs text-ink-muted tabular-nums">
                                    {formatCurrency(p.amount)}
                                    {group.orders > 1 ? ` · kupione ${formatDateShort(p.purchase_date)}` : ''}
                                    {stays ? ' · zostaje' : ' · do zwrotu'}
                                </div>
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onToggleKeep(p.id)}
                                aria-pressed={stays}
                                className={`shrink-0 h-10 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50 ${
                                    stays ? 'bg-primary-600 text-white' : 'border border-line-strong text-ink-soft hover:text-primary-700'
                                }`}
                                title={stays ? 'Jednak do zwrotu' : 'Zostawiam'}
                            >
                                <Heart size={15} fill={stays ? 'currentColor' : 'none'} /> {stays ? 'Zostaje' : 'Zostawiam'}
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="p-3 border-t border-line">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSettle(toReturn, toKeep)}
                    className={`w-full h-11 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-50 ${
                        toReturn.length ? 'bg-emerald-600 text-white' : 'bg-primary-600 text-white'
                    }`}
                >
                    {toReturn.length ? (
                        <>
                            <RotateCcw size={16} /> Zrobiłam zwrot · {toReturn.length} {toReturn.length === 1 ? 'rzecz' : 'rzeczy'} · {formatCurrency(returnSum)}
                        </>
                    ) : (
                        <>
                            <Check size={16} /> Zostawiam wszystko
                        </>
                    )}
                </button>
                {toReturn.length > 0 && toKeep.length > 0 && (
                    <p className="text-[11px] text-ink-muted text-center mt-1.5">
                        Zostaje: {toKeep.length} {toKeep.length === 1 ? 'rzecz' : 'rzeczy'} — reszta oznaczy się jako zwrócona
                    </p>
                )}
            </div>
        </div>
    );
}
