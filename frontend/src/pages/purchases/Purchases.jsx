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
import { bucket, deadlineText, deadlineTone, groupOrders, withPatch } from '../../utils/purchases';
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
    const { returned, keep, keepMany, busyId } = usePurchaseActions({ onChange: applyPatch });

    const active = useMemo(() => purchases.filter((p) => bucket(p) === 'active'), [purchases]);
    const orders = useMemo(() => groupOrders(active).sort((a, b) => a.days_remaining - b.days_remaining), [active]);
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
                        <h2 className="section-label px-1 mb-2">Do decyzji</h2>
                        {orders.length === 0 ? (
                            <div className="card px-4 py-5 text-sm text-ink-muted text-center">Nic nie czeka na zwrot. 🎉</div>
                        ) : (
                            <div className="space-y-3">
                                {orders.map((order) => (
                                    <OrderCard
                                        key={order.key}
                                        order={order}
                                        busyId={busyId}
                                        onOpen={openDetail}
                                        onReturned={(p) => returned(p)}
                                        onKeep={(p) => keep(p)}
                                        onKeepAll={() => keepMany(order.items)}
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

function OrderCard({ order, busyId, onOpen, onReturned, onKeep, onKeepAll }) {
    const tone = deadlineTone(order.days_remaining);
    const badge = {
        danger: 'bg-red-600 text-white',
        warning: 'bg-amber-400 text-amber-950',
        ok: 'bg-emerald-50 text-emerald-700',
    }[tone];
    const total = order.items.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return (
        <div className="card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-canvas/60">
                <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink truncate">{order.store}</div>
                    <div className="text-xs text-ink-muted">
                        kupione {formatDateShort(order.purchase_date)} · {formatCurrency(total)}
                    </div>
                </div>
                <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${badge}`}>{deadlineText(order.days_remaining, order.return_deadline)}</span>
            </div>
            <div className="divide-y divide-line">
                {order.items.map((p) => {
                    const busy = busyId === p.id;
                    return (
                        <div key={p.id} className="flex items-center gap-2 pl-4 pr-2.5 py-2.5">
                            <button type="button" onClick={() => onOpen(p)} className="flex-1 min-w-0 text-left">
                                <div className="text-[15px] font-semibold text-ink truncate">{p.items}</div>
                                <div className="text-xs text-ink-muted tabular-nums">{formatCurrency(p.amount)}</div>
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onReturned(p)}
                                className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                                title="Odesłane / zwrócone"
                            >
                                <RotateCcw size={15} /> Zwrot
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onKeep(p)}
                                className="shrink-0 h-10 px-3 rounded-xl border border-line-strong text-ink-soft text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50 hover:text-primary-700"
                                title="Zostawiam"
                            >
                                <Heart size={15} /> Zostaje
                            </button>
                        </div>
                    );
                })}
            </div>
            {order.items.length > 1 && (
                <button type="button" onClick={onKeepAll} className="w-full px-4 py-2 border-t border-line text-xs font-semibold text-ink-muted hover:text-primary-700 inline-flex items-center justify-center gap-1.5">
                    <Check size={13} /> Zostawiam wszystko
                </button>
            )}
        </div>
    );
}
