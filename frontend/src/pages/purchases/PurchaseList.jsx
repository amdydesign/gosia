import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShoppingBag, ExternalLink } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Segmented from '../../components/ui/Segmented';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDateShort, getReturnUrgency, getPurchaseStatusInfo } from '../../utils/format';

const FILTERS = [
    { value: 'active', label: 'Do decyzji' },
    { value: 'kept', label: 'Zostawione' },
    { value: 'returned', label: 'Zwrócone' },
    { value: 'all', label: 'Wszystkie' },
];

function bucket(p) {
    if (p.status === 'returned' || p.status === 'partial') return 'returned';
    if (Number(p.days_remaining) < 0) return 'kept';
    return 'active';
}

export default function PurchaseList() {
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('active');
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await apiRequest('/purchases/index.php');
                if (!cancelled) setPurchases(Array.isArray(data) ? data : []);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Błąd ładowania');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const counts = useMemo(() => {
        const c = { active: 0, kept: 0, returned: 0, all: purchases.length };
        purchases.forEach((p) => {
            c[bucket(p)] += 1;
        });
        return c;
    }, [purchases]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = purchases.filter((p) => {
            if (filter !== 'all' && bucket(p) !== filter) return false;
            if (q && !`${p.store} ${p.items} ${p.notes || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        if (filter === 'active') {
            list.sort((a, b) => Number(a.days_remaining) - Number(b.days_remaining));
        } else {
            list.sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1));
        }
        return list;
    }, [purchases, filter, query]);

    const activeValue = useMemo(
        () => purchases.filter((p) => bucket(p) === 'active').reduce((s, p) => s + (Number(p.amount) || 0), 0),
        [purchases]
    );
    const returnedValue = useMemo(
        () => purchases.filter((p) => bucket(p) === 'returned').reduce((s, p) => s + (Number(p.returned_amount) || 0), 0),
        [purchases]
    );

    return (
        <div className="animate-fade-in">
            <PageHeader
                title="Zakupy i zwroty"
                subtitle="Pilnuj terminów, nie trać pieniędzy"
                actions={
                    <Button to="/purchases/new" variant="primary" icon={Plus} className="hidden lg:inline-flex">
                        Nowy zakup
                    </Button>
                }
            >
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <SearchInput value={query} onChange={setQuery} placeholder="Szukaj sklepu lub rzeczy…" className="flex-1" />
                </div>
                <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
                    className="w-full overflow-x-auto no-scrollbar"
                />
            </PageHeader>

            {loading ? (
                <ListSkeleton rows={6} />
            ) : error ? (
                <EmptyState icon={ShoppingBag} title="Nie udało się pobrać zakupów" text={error} />
            ) : (
                <div className="space-y-4">
                    {(counts.active > 0 || returnedValue > 0) && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="card px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Do decyzji</div>
                                <div className="text-lg font-extrabold text-ink mt-0.5">{formatCurrency(activeValue)}</div>
                                <div className="text-xs text-ink-muted">{counts.active} {counts.active === 1 ? 'rzecz' : 'rzeczy'} z otwartym terminem</div>
                            </div>
                            <div className="card px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Odzyskane</div>
                                <div className="text-lg font-extrabold text-emerald-700 mt-0.5">{formatCurrency(returnedValue)}</div>
                                <div className="text-xs text-ink-muted">{counts.returned} zwrotów łącznie</div>
                            </div>
                        </div>
                    )}

                    {filtered.length === 0 ? (
                        <div className="card">
                            <EmptyState
                                icon={ShoppingBag}
                                title={purchases.length === 0 ? 'Brak zakupów' : filter === 'active' ? 'Nic nie czeka na decyzję' : 'Nic nie pasuje do filtrów'}
                                text={purchases.length === 0 ? 'Dodaj zakup, a przypomnimy o terminie zwrotu.' : 'Zmień filtr lub wyczyść wyszukiwanie.'}
                                action={purchases.length === 0 ? <Button to="/purchases/new" variant="primary" icon={Plus}>Dodaj zakup</Button> : null}
                            />
                        </div>
                    ) : (
                        <div className="card divide-y divide-line overflow-hidden">
                            {filtered.map((p) => (
                                <PurchaseRow key={p.id} purchase={p} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function PurchaseRow({ purchase }) {
    const b = bucket(purchase);
    const urgency = getReturnUrgency(purchase.days_remaining);
    const status = getPurchaseStatusInfo(purchase.status, purchase.days_remaining);
    const colors = { danger: 'text-red-600', warning: 'text-amber-600', success: 'text-emerald-600', neutral: 'text-ink-muted', info: 'text-primary-700' };
    const label = b === 'active' ? urgency.message : status.label;
    const color = b === 'active' ? colors[urgency.tone] : colors[status.tone];

    return (
        <Link to={`/purchases/${purchase.id}`} className="row-link !py-3">
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink text-[15px] truncate flex items-center gap-1.5">
                    {purchase.store}
                    {purchase.purchase_url && <ExternalLink size={12} className="text-ink-muted shrink-0" />}
                </div>
                <div className="text-xs text-ink-muted truncate mt-0.5">
                    {purchase.items}
                    {b === 'active' ? <> · do {formatDateShort(purchase.return_deadline)}</> : <> · {formatDateShort(purchase.purchase_date)}</>}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="font-bold text-ink tabular-nums">{formatCurrency(purchase.amount)}</div>
                <div className={`text-[11px] font-semibold mt-0.5 ${color}`}>
                    {label}
                    {b === 'returned' && Number(purchase.returned_amount) > 0 && purchase.status === 'partial' && <> · {formatCurrency(purchase.returned_amount)}</>}
                </div>
            </div>
        </Link>
    );
}
