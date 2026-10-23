import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Award, RotateCcw, Landmark, Users, Wallet } from 'lucide-react';
import { apiRequest } from '../utils/api';
import statsService from '../services/stats';
import Button from '../components/ui/Button';
import { PageSkeleton } from '../components/ui/Skeleton';
import SocialSection from '../components/social/SocialSection';
import ExportModal from './collaborations/ExportModal';
import { formatCurrency } from '../utils/format';
import { PLATFORMS } from '../components/social/SocialSection';

const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MONTHS_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const TABS = [
    { value: 'glowna', label: 'Główna', icon: Users },
    { value: 'finanse', label: 'Finanse', icon: Wallet },
];

/**
 * Two tabs: "Główna" = the influencer side (followers and their growth),
 * "Finanse" = money (earnings, clients, tax threshold, returns).
 * The tab lives in the URL (?tab=finanse) so links from Start land on the right one.
 */
export default function Statistics() {
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'finanse' ? 'finanse' : 'glowna';

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
                <h1 className="hidden lg:block font-display text-[28px] font-semibold tracking-tight text-ink">Statystyki</h1>
                <div role="tablist" aria-label="Statystyki" className="grid grid-cols-2 gap-1 p-1 rounded-full bg-surface border border-line w-full lg:w-auto">
                    {TABS.map((t) => (
                        <button
                            key={t.value}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.value}
                            onClick={() => setParams(t.value === 'glowna' ? {} : { tab: t.value }, { replace: true })}
                            className={`h-10 px-5 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                                tab === t.value ? 'nav-active' : 'text-ink-muted hover:text-ink'
                            }`}
                        >
                            <t.icon size={16} /> {t.label}
                        </button>
                    ))}
                </div>
            </div>
            {tab === 'finanse' ? <Finances /> : <Influence />}
        </div>
    );
}

/* ------------------------------------------------------------------ Główna */

const RANGES = [
    { value: 30, label: '30 dni' },
    { value: 90, label: '3 mies.' },
    { value: 365, label: 'Rok' },
];

function Influence() {
    const [days, setDays] = useState(30);
    const [history, setHistory] = useState(null);

    useEffect(() => {
        let cancelled = false;
        statsService
            .getSocialHistory(days)
            .then((res) => !cancelled && setHistory(res?.data || {}))
            .catch(() => !cancelled && setHistory({}));
        return () => {
            cancelled = true;
        };
    }, [days]);

    // Sum of all platforms per day (missing days carry the last known count forward)
    const series = useMemo(() => {
        if (!history) return [];
        const dates = [...new Set(Object.values(history).flat().map((r) => r.date))].sort();
        const last = {};
        return dates.map((date) => {
            for (const p of PLATFORMS) {
                const row = (history[p.id] || []).find((r) => r.date === date);
                if (row) last[p.id] = row.count;
            }
            return { date, total: Object.values(last).reduce((a, b) => a + b, 0) };
        });
    }, [history]);

    const total = series.length ? series[series.length - 1].total : 0;
    const growth = series.length > 1 ? total - series[0].total : 0;

    return (
        <>
            <section className="rounded-[28px] bg-accent text-on-accent p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold opacity-80">Obserwujący razem</div>
                        <div className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-1 tabular-nums">{total.toLocaleString('pl-PL')}</div>
                        <div className="text-sm font-semibold mt-1">
                            {growth === 0 ? 'bez zmian' : `${growth > 0 ? '+' : ''}${growth.toLocaleString('pl-PL')}`} w {RANGES.find((r) => r.value === days)?.label.replace('3 mies.', '3 miesiące').replace('Rok', 'rok')}
                        </div>
                    </div>
                    <div role="group" aria-label="Zakres" className="flex gap-1 p-1 rounded-full bg-black/10">
                        {RANGES.map((r) => (
                            <button
                                key={r.value}
                                type="button"
                                aria-pressed={days === r.value}
                                onClick={() => setDays(r.value)}
                                className={`h-9 px-3 rounded-full text-xs font-semibold ${days === r.value ? 'bg-on-accent text-accent' : ''}`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>
                <GrowthChart series={series} />
            </section>

            <SocialSection />
        </>
    );
}

function GrowthChart({ series }) {
    if (series.length < 2) {
        return <p className="text-sm mt-4 opacity-80">Wykres pojawi się, gdy zbierze się kilka dni danych (liczby odświeżają się same raz dziennie).</p>;
    }
    const W = 600;
    const H = 120;
    const values = series.map((s) => s.total);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const pts = series.map((s, i) => [(i / (series.length - 1)) * W, H - 8 - ((s.total - min) / span) * (H - 24)]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28 mt-4" role="img" aria-label="Wzrost liczby obserwujących">
            <path d={`${line} L${W},${H} L0,${H} Z`} fill="currentColor" opacity="0.08" />
            <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
    );
}

/* ------------------------------------------------------------------ Finanse */

/**
 * One year at a glance: how much you earned, month by month, who paid the most,
 * how far from the tax threshold, what returns saved.
 */
function Finances() {
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
        <div className="space-y-5">
            {/* Year switcher */}
            <div className="flex items-center justify-center lg:justify-start gap-3">
                <div className="flex items-center gap-1 bg-surface border border-line rounded-full p-1">
                    <button type="button" onClick={() => changeYear(years[idx + 1])} disabled={idx === -1 || idx >= years.length - 1} className="p-2 rounded-xl text-ink-soft hover:bg-ink/5 disabled:opacity-30" aria-label="Poprzedni rok">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="px-4 font-display text-lg font-semibold tabular-nums text-ink">{year}</span>
                    <button type="button" onClick={() => changeYear(years[idx - 1])} disabled={idx <= 0} className="p-2 rounded-xl text-ink-soft hover:bg-ink/5 disabled:opacity-30" aria-label="Następny rok">
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            {/* Hero */}
            <section className="rounded-[28px] bg-accent text-on-accent p-5 sm:p-6">
                <div className="text-sm font-semibold opacity-80">Zarobione na rękę w {year}</div>
                <div className="amount font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-1 tabular-nums inline-block">{formatCurrency(totals.net)}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm opacity-90">
                    <span>brutto <strong className="amount">{formatCurrency(totals.gross)}</strong></span>
                    <span><strong>{totals.count}</strong> opłaconych współprac</span>
                    <span>średnio <strong className="amount">{formatCurrency(Math.round(totals.net / monthsSoFar))}</strong> / mies.</span>
                </div>
                {data?.pending?.count > 0 && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/10 px-3 py-1.5 text-sm">
                        Czeka jeszcze <strong className="amount">{formatCurrency(data.pending.gross)}</strong> ({data.pending.count})
                    </div>
                )}
            </section>

            {/* Months */}
            <section className="card card-pad">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="card-title">Miesiąc po miesiącu</h2>
                    {best?.net > 0 && <span className="text-xs text-ink-muted">najlepszy: {MONTHS[best.month - 1].toLowerCase()}</span>}
                </div>
                <div className="amount flex items-end gap-1 sm:gap-2 h-40">
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
                                    className={`w-full rounded-t-lg rounded-b-sm transition-all ${active ? 'bg-chart' : future ? 'bg-surface-2' : 'bg-line-strong group-hover:bg-ink-muted'}`}
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
                            <strong className="amount text-ink text-base tabular-nums">{formatCurrency(selected.net)}</strong> na rękę
                            {selected.count > 0 && <> · {selected.count} {selected.count === 1 ? 'współpraca' : 'współprac'}</>}
                        </span>
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top brands */}
                <section className="card card-pad">
                    <h2 className="card-title flex items-center gap-2 mb-3"><Award size={16} className="text-primary-600" /> Najlepsi klienci</h2>
                    {!data?.top_brands?.length ? (
                        <p className="text-sm text-ink-muted">Brak opłaconych współprac w {year}.</p>
                    ) : (
                        <div className="space-y-3">
                            {data.top_brands.map((b, i) => (
                                <div key={b.brand}>
                                    <div className="flex items-baseline justify-between gap-2 text-sm">
                                        <span className="font-semibold text-ink truncate">{i + 1}. {b.brand}</span>
                                        <span className="text-ink-muted whitespace-nowrap"><strong className="amount text-ink tabular-nums">{formatCurrency(b.net)}</strong> · {b.count}×</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-line mt-1.5 overflow-hidden">
                                        <div className="h-full rounded-full bg-chart" style={{ width: `${(b.net / topMax) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Tax + returns */}
                <div className="space-y-4">
                    <section className="card card-pad">
                        <h2 className="card-title flex items-center gap-2"><Landmark size={16} className="text-primary-600" /> Próg podatkowy</h2>
                        <div className="h-2.5 rounded-full bg-line overflow-hidden mt-3">
                            <div className={`h-full rounded-full ${progress >= 90 ? 'bg-secondary' : progress >= 70 ? 'bg-amber-400' : 'bg-chart'}`} style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-sm text-ink-soft mt-2">
                            {progress >= 100
                                ? 'Próg przekroczony — nadwyżka liczona jest według 32%.'
                                : <>Do progu 120 tys. zostało <strong className="amount text-ink">{formatCurrency(Math.max(0, tax.threshold - tax.income))}</strong> dochodu.</>}
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
            <div className={`amount font-display text-base font-semibold mt-0.5 tabular-nums ${tone}`}>{value}</div>
            <div className="text-[11px] text-ink-muted">{sub}</div>
        </div>
    );
}
