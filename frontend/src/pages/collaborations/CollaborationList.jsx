import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Briefcase, Download, Lock } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Segmented from '../../components/ui/Segmented';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { ListSkeleton } from '../../components/ui/Skeleton';
import ExportModal from './ExportModal';
import { formatCurrency, formatDateShort, getCollabTypeLabel, getBillingLabel, getPaymentStatusInfo, daysFromToday } from '../../utils/format';

const FILTERS = [
    { value: 'all', label: 'Wszystkie' },
    { value: 'unpaid', label: 'Do zapłaty' },
    { value: 'paid', label: 'Opłacone' },
];

export default function CollaborationList() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [collabs, setCollabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [year, setYear] = useState('all');
    const [exportOpen, setExportOpen] = useState(false);

    const filter = FILTERS.some((f) => f.value === searchParams.get('filter')) ? searchParams.get('filter') : 'all';
    const setFilter = (value) => {
        const next = new URLSearchParams(searchParams);
        if (value === 'all') next.delete('filter');
        else next.set('filter', value);
        setSearchParams(next, { replace: true });
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await apiRequest('/collaborations/index.php');
                if (!cancelled) setCollabs(Array.isArray(data) ? data : []);
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

    const years = useMemo(() => {
        const set = new Set(collabs.map((c) => (c.date || '').slice(0, 4)).filter(Boolean));
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [collabs]);

    const counts = useMemo(
        () => ({
            all: collabs.length,
            unpaid: collabs.filter((c) => c.payment_status !== 'paid').length,
            paid: collabs.filter((c) => c.payment_status === 'paid').length,
        }),
        [collabs]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return collabs.filter((c) => {
            if (filter === 'unpaid' && c.payment_status === 'paid') return false;
            if (filter === 'paid' && c.payment_status !== 'paid') return false;
            if (year !== 'all' && !(c.date || '').startsWith(year)) return false;
            if (q) {
                const haystack = `${c.brand} ${c.notes || ''} ${getCollabTypeLabel(c.type)} ${getBillingLabel(c.collab_type)}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
    }, [collabs, filter, year, query]);

    const totals = useMemo(
        () =>
            filtered.reduce(
                (acc, c) => {
                    acc.gross += Number(c.amount_gross) || Number(c.amount_net) || 0;
                    acc.net += Number(c.amount_net) || 0;
                    return acc;
                },
                { gross: 0, net: 0 }
            ),
        [filtered]
    );


    return (
        <div className="animate-fade-in">
            <PageHeader
                title="Współprace"
                subtitle="Zlecenia, rozliczenia i płatności"
                actions={
                    <>
                        <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)} className="hidden sm:inline-flex">
                            Eksport
                        </Button>
                        <Button to="/collaborations/new" variant="primary" icon={Plus} className="hidden lg:inline-flex">
                            Nowa współpraca
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <SearchInput value={query} onChange={setQuery} placeholder="Szukaj marki, typu, notatki…" className="flex-1" />
                    <Segmented
                        className="sm:w-auto"
                        value={filter}
                        onChange={setFilter}
                        options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))}
                    />
                </div>
                {years.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                        <button type="button" onClick={() => setYear('all')} className={`chip ${year === 'all' ? 'chip-active' : ''}`}>
                            Wszystkie lata
                        </button>
                        {years.map((y) => (
                            <button key={y} type="button" onClick={() => setYear(y)} className={`chip ${year === y ? 'chip-active' : ''}`}>
                                {y}
                            </button>
                        ))}
                    </div>
                )}
            </PageHeader>

            {loading ? (
                <ListSkeleton rows={6} />
            ) : error ? (
                <EmptyState icon={Briefcase} title="Nie udało się pobrać współprac" text={error} />
            ) : filtered.length === 0 ? (
                <div className="card">
                    <EmptyState
                        icon={Briefcase}
                        title={collabs.length === 0 ? 'Brak współprac' : 'Nic nie pasuje do filtrów'}
                        text={collabs.length === 0 ? 'Dodaj swoje pierwsze zlecenie, aby zacząć śledzić zarobki.' : 'Zmień filtr lub wyczyść wyszukiwanie.'}
                        action={collabs.length === 0 ? <Button to="/collaborations/new" variant="primary" icon={Plus}>Dodaj współpracę</Button> : null}
                    />
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Summary strip */}
                    <div className="card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                        <span className="font-semibold text-ink">{filtered.length} {filtered.length === 1 ? 'współpraca' : 'współprac'}</span>
                        <span className="text-ink-muted">Brutto <span className="font-bold text-ink">{formatCurrency(totals.gross)}</span></span>
                        <span className="text-ink-muted">Na rękę <span className="font-bold text-emerald-700">{formatCurrency(totals.net)}</span></span>
                    </div>

                    <div className="card divide-y divide-line overflow-hidden">
                        {filtered.map((c) => (
                            <CollabRow key={c.id} collab={c} />
                        ))}
                    </div>
                </div>
            )}

            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </div>
    );
}

function CollabRow({ collab }) {
    const status = getPaymentStatusInfo(collab.payment_status);
    const isPaid = collab.payment_status === 'paid';
    const isOverdue = collab.payment_status === 'overdue';
    const waiting = !isPaid ? -(daysFromToday(collab.date) ?? 0) : 0;
    const billing = getBillingLabel(collab.collab_type, { short: true });
    const isPrivate = collab.fiscal_tracking !== undefined && collab.fiscal_tracking !== null && Number(collab.fiscal_tracking) === 0;
    const statusColor = isPaid ? 'text-emerald-600' : isOverdue ? 'text-red-600' : 'text-amber-600';
    const dotColor = isPaid ? 'bg-emerald-500' : isOverdue ? 'bg-red-500' : 'bg-amber-400';

    return (
        <Link to={`/collaborations/${collab.id}`} className="row-link !py-3">
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink text-[15px] truncate flex items-center gap-1.5">
                    {collab.brand}
                    {isPrivate && <Lock size={12} className="text-ink-muted shrink-0" title="Poza PIT" />}
                </div>
                <div className="text-xs text-ink-muted truncate mt-0.5">
                    {formatDateShort(collab.date)} · {getCollabTypeLabel(collab.type)}
                    {billing && <> · {billing}</>}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="font-bold text-ink tabular-nums">{formatCurrency(collab.amount_gross || collab.amount_net)}</div>
                <div className={`text-[11px] font-semibold mt-0.5 inline-flex items-center gap-1.5 ${statusColor}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                    {status.short}
                    {!isPaid && waiting > 30 && <span> · {waiting} dni</span>}
                </div>
            </div>
        </Link>
    );
}
