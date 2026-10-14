import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Award, RotateCcw, Landmark } from 'lucide-react';
import { apiRequest } from '../utils/api';
import Button from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/Skeleton';
import SocialSection from '../components/social/SocialSection';
import ExportModal from './collaborations/ExportModal';
import { formatCurrency } from '../utils/format';

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MONTHS_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

/**
 * One year at a glance: how much you earned, month by month, who paid the most,
 * how far from the tax threshold, what returns saved.
 */
export default function Statistics() {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [picked, setPicked] = useState(null);
    const [exportOpen, setExportOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        apiRequest(`/stats/summary.php?year=${year}`)
            .then((d) => {
                if (cancelled) return;
                setData(d);
                setError('');
                setPicked(null);
            })
            .catch((err) => !cancelled && setError(err.message || 'Nie udało się pobrać statystyk'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [year]);

    const months = useMemo(() => data?.months || [], [data]);
    const max = Math.max(1, ...months.map((m) => m.net));
    const monthsSoFar = year === currentYear ? new Date().getMonth() + 1 : 12;
    const best = months.reduce((b, m) => (m.net > (b?.net || 0) ? m : b), null);
    const selectedMonth = picked ?? (year === currentYear ? new Date().getMonth() + 1 : best?.month || 12);
    const selected = months.find((m) => m.month === selectedMonth);
    const years = data?.years?.length ? data.years : [currentYear];
    const idx = years.indexOf(year);
    const changeYear = (y) => {
        if (!y || y === year) return;
        setLoading(true);
        setYear(y);
    };

    if (loading && !data) return <PageSkeleton />;

    const totals = data?.totals || { net: 0, gross: 0, count: 0 };
    const tax = data?.tax || { income: 0, threshold: 120000, progress: 0 };
    const progress = Math.min(100, tax.progress || 0);
    const pur = data?.purchases || {};
    const topMax = Math.max(1, ...(data?.top_brands || []).map((b) => b.net));

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Year switcher */}
            <div className="flex items-center justify-between gap-3">
                <h1 className="hidden lg:block text-[28px] font-extrabold tracking-tight text-ink">Statystyki</h1>
                <div className="flex items-center gap-1 mx-auto lg:mx-0 bg-surface border border-line rounded-2xl p-1 shadow-card">
                    <button type="button" onClick={() => changeYear(years[idx + 1])} disabled={idx === -1 || idx >= years.length - 1} className="p-2 rounded-xl text-ink-soft hover:bg-black/5 disabled:opacity-30" aria-label="Poprzedni rok">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="px-4 text-lg font-extrabold tabular-nums text-ink">{year}</span>
                    <button type="button" onClick={() => changeYear(years[idx - 1])} disabled={idx <= 0} className="p-2 rounded-xl text-ink-soft hover:bg-black/5 disabled:opacity-30" aria-label="Następny rok">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            {/* Hero */}
            <section className="rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 text-white p-5 sm:p-6 shadow-float">
                <div className="text-sm font-semibold text-white/75">Zarobione na rękę w {year}</div>
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-1 tabular-nums">{formatCurrency(totals.net)}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-white/80">
                    <span>brutto <strong className="text-white">{formatCurrency(totals.gross)}</strong></span>
                    <span><strong className="text-white">{totals.count}</strong> opłaconych współprac</span>
                    <span>średnio <strong className="text-white">{formatCurrency(Math.round(totals.net / monthsSoFar))}</strong> / mies.</span>
                </div>
                {data?.pending?.count > 0 && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm">
                        Czeka jeszcze <strong>{formatCurrency(data.pending.gross)}</strong> ({data.pending.count})
                    </div>
                )}
            </section>

            {/* Months */}
            <section className="card card-pad">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="card-title">Miesiąc po miesiącu</h2>
                    {best?.net > 0 && <span className="text-xs text-ink-muted">najlepszy: {MONTHS[best.month - 1].toLowerCase()}</span>}
                </div>
                <div className="flex items-end gap-1 sm:gap-2 h-40">
                    {months.map((m) => {
                        const h = m.net > 0 ? Math.max(4, (m.net / max) * 100) : 2;
                        const active = m.month === selectedMonth;
                        const future = year === currentYear && m.month > new Date().getMonth() + 1;
                        return (
                            <button
                                key={m.month}
                                type="button"
                                onClick={() => setPicked(m.month)}
                                className="flex-1 h-full flex flex-col justify-end items-center gap-1.5 group"
                                aria-label={`${MONTHS[m.month - 1]}: ${formatCurrency(m.net)}`}
                            >
                                <div
                                    className={`w-full rounded-t-lg rounded-b-sm transition-all ${active ? 'bg-secondary' : future ? 'bg-slate-100' : 'bg-primary-500 group-hover:bg-primary-600'}`}
                                    style={{ height: `${h}%` }}
                                />
                                <span className={`text-[10px] sm:text-[11px] font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}>{MONTHS_SHORT[m.month - 1]}</span>
                            </button>
                        );
                    })}
                </div>
                {selected && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-canvas border border-line px-4 py-3">
                        <span className="font-bold text-ink">{MONTHS[selected.month - 1]}</span>
                        <span className="text-sm text-ink-muted text-right">
                            <strong className="text-ink text-base tabular-nums">{formatCurrency(selected.net)}</strong> na rękę
                            {selected.count > 0 && <> · {selected.count} {selected.count === 1 ? 'współpraca' : 'współprac'}</>}
                        </span>
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top brands */}
                <section className="card card-pad">
                    <h2 className="card-title flex items-center gap-2 mb-3"><Award size={16} className="text-secondary" /> Najlepsi klienci</h2>
                    {!data?.top_brands?.length ? (
                        <p className="text-sm text-ink-muted">Brak opłaconych współprac w {year}.</p>
                    ) : (
                        <div className="space-y-3">
                            {data.top_brands.map((b, i) => (
                                <div key={b.brand}>
                                    <div className="flex items-baseline justify-between gap-2 text-sm">
                                        <span className="font-semibold text-ink truncate">{i + 1}. {b.brand}</span>
                                        <span className="text-ink-muted whitespace-nowrap"><strong className="text-ink tabular-nums">{formatCurrency(b.net)}</strong> · {b.count}×</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
                                        <div className="h-full rounded-full bg-primary-500" style={{ width: `${(b.net / topMax) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Tax + returns */}
                <div className="space-y-4">
                    <section className="card card-pad">
                        <h2 className="card-title flex items-center gap-2"><Landmark size={16} className="text-primary-500" /> Próg podatkowy</h2>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-3">
                            <div className={`h-full rounded-full ${progress >= 90 ? 'bg-red-500' : progress >= 70 ? 'bg-amber-400' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-sm text-ink-soft mt-2">
                            {progress >= 100
                                ? 'Próg przekroczony — nadwyżka liczona jest według 32%.'
                                : <>Do progu 120 tys. zostało <strong className="text-ink">{formatCurrency(Math.max(0, tax.threshold - tax.income))}</strong> dochodu.</>}
                        </p>
                        {data?.cash > 0 && <p className="text-xs text-ink-muted mt-1">Gotówka poza PIT: {formatCurrency(data.cash)}</p>}
                    </section>

                    <section className="card card-pad">
                        <h2 className="card-title flex items-center gap-2"><RotateCcw size={16} className="text-emerald-600" /> Zakupy i zwroty</h2>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                            <MiniStat label="Odzyskane" value={formatCurrency(pur.returned_value, { compact: true })} sub={`${pur.returned_count || 0} zwrotów`} tone="text-emerald-700" />
                            <MiniStat label="Zostawione" value={formatCurrency(pur.kept_value, { compact: true })} sub={`${pur.kept_count || 0} rzeczy`} />
                            <MiniStat label="Do decyzji" value={formatCurrency(pur.active_value, { compact: true })} sub={`${pur.active_count || 0} rzeczy`} />
                        </div>
                    </section>
                </div>
            </div>

            <SocialSection />

            <div className="flex justify-center pt-1">
                <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)}>Eksport CSV dla księgowej</Button>
            </div>

            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </div>
    );
}

function MiniStat({ label, value, sub, tone = 'text-ink' }) {
    return (
        <div className="rounded-xl bg-canvas border border-line px-2 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
            <div className={`text-base font-extrabold mt-0.5 tabular-nums ${tone}`}>{value}</div>
            <div className="text-[11px] text-ink-muted">{sub}</div>
        </div>
    );
}
