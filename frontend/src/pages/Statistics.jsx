import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Wallet, Building2, Lock, Download, TrendingUp, Award } from 'lucide-react';
import statsService from '../services/stats';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card, { CardHeader } from '../components/ui/Card';
import Segmented from '../components/ui/Segmented';
import { PageSkeleton } from '../components/ui/Skeleton';
import ExportModal from './collaborations/ExportModal';
import SocialSection from '../components/social/SocialSection';
import { formatCurrency, getCollabTypeLabel } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function Statistics() {
    const [dashboardStats, setDashboardStats] = useState(null);
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [months, setMonths] = useState(6);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exportOpen, setExportOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        statsService
            .getDashboard()
            .then((r) => r.success && !cancelled && setDashboardStats(r.data))
            .catch(() => !cancelled && setError('Nie udało się pobrać danych finansowych'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        statsService
            .getMonthly(months)
            .then((r) => r.success && !cancelled && setMonthlyStats(r.data))
            .catch(() => !cancelled && setError('Nie udało się pobrać danych miesięcznych'));
        return () => {
            cancelled = true;
        };
    }, [months]);

    const chartData = useMemo(
        () => ({
            labels: monthlyStats?.monthly?.map((m) => m.short || m.label) || [],
            datasets: [
                {
                    label: 'Na rękę',
                    data: monthlyStats?.monthly?.map((m) => m.value) || [],
                    backgroundColor: 'rgba(209, 90, 134, 0.85)',
                    hoverBackgroundColor: 'rgba(186, 63, 110, 1)',
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 42,
                },
            ],
        }),
        [monthlyStats]
    );

    const chartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f1a1c',
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: (items) => monthlyStats?.monthly?.[items[0].dataIndex]?.label,
                        label: (ctx) => {
                            const m = monthlyStats?.monthly?.[ctx.dataIndex];
                            return [`Na rękę: ${formatCurrency(ctx.parsed.y)}`, m ? `Brutto: ${formatCurrency(m.gross)} · ${m.count} współprac` : ''].filter(Boolean);
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#ece6e8' },
                    border: { display: false },
                    ticks: { callback: (v) => (v >= 1000 ? `${v / 1000}k` : v), font: { size: 11 }, color: '#8f858a' },
                },
                x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, color: '#8f858a' } },
            },
        }),
        [monthlyStats]
    );

    if (loading) return <PageSkeleton />;

    const financials = dashboardStats?.financials || {};
    const official = financials.official || {};
    const progress = Math.min(100, Number(official.tax_threshold_progress) || 0);
    const typeTotal = monthlyStats?.by_type?.reduce((s, t) => s + parseFloat(t.total || 0), 0) || 0;
    const monthlyTotal = monthlyStats?.monthly?.reduce((s, m) => s + m.value, 0) || 0;
    const bestMonth = monthlyStats?.monthly?.reduce((best, m) => (m.value > (best?.value || 0) ? m : best), null);

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Statystyki"
                subtitle="Finanse, PIT i zasięgi"
                actions={<Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)}>Eksport CSV</Button>}
            />

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            <SocialSection />

            {/* Finance split */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-100/60 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="flex items-center gap-2 text-primary-700 mb-3">
                            <Building2 size={18} />
                            <h2 className="text-sm font-bold">Oficjalne (PIT) · {financials.year}</h2>
                        </div>
                        <div className="text-3xl font-extrabold text-ink tracking-tight">{formatCurrency(official.gross || 0)}</div>
                        <div className="text-xs text-ink-muted mt-0.5">Przychód brutto z opłaconych współprac</div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="rounded-xl bg-canvas border border-line p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Dochód (po KUP)</div>
                                <div className="text-base font-bold text-ink mt-0.5">{formatCurrency(official.income || 0)}</div>
                            </div>
                            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Na rękę</div>
                                <div className="text-base font-bold text-emerald-800 mt-0.5">{formatCurrency(official.net || 0)}</div>
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="flex justify-between text-[11px] font-semibold text-ink-muted mb-1.5">
                                <span>I próg podatkowy (12%)</span>
                                <span className={progress >= 100 ? 'text-red-600' : ''}>{Math.round(progress)}% z {formatCurrency(official.tax_threshold || 120000, { compact: true })}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-700 ${progress >= 90 ? 'bg-red-500' : progress >= 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-primary-400 to-primary-600'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-[11px] text-ink-muted mt-1.5">
                                {progress >= 100
                                    ? 'Przekroczyłaś próg — nadwyżka dochodu opodatkowana 32%.'
                                    : `Do II progu zostało ${formatCurrency(Math.max(0, (official.tax_threshold || 120000) - (official.income || 0)))} dochodu.`}
                            </p>
                        </div>
                    </div>
                </Card>

                <Card className="relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-emerald-100/60 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="flex items-center gap-2 text-emerald-700 mb-3">
                            <Wallet size={18} />
                            <h2 className="text-sm font-bold">Prywatne (gotówka) · {financials.year}</h2>
                        </div>
                        <div className="text-3xl font-extrabold text-ink tracking-tight">{formatCurrency(financials.private?.revenue || 0)}</div>
                        <div className="text-xs text-ink-muted mt-0.5">Środki poza rozliczeniami PIT</div>

                        <div className="rounded-xl bg-canvas border border-line p-3 mt-4 flex gap-3 text-xs text-ink-soft">
                            <Lock size={16} className="shrink-0 text-ink-muted mt-0.5" />
                            <p>Sumowane są opłacone współprace oznaczone jako „Gotówka prywatna”. Nie trafiają do eksportu „Oficjalne”.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="rounded-xl bg-canvas border border-line p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Łącznie na rękę</div>
                                <div className="text-base font-bold text-ink mt-0.5">{formatCurrency(financials.yearly_net || 0)}</div>
                            </div>
                            <div className="rounded-xl bg-canvas border border-line p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">Do zapłaty</div>
                                <div className="text-base font-bold text-amber-700 mt-0.5">{formatCurrency(financials.pending?.gross || 0)}</div>
                            </div>
                        </div>
                    </div>
                </Card>
            </section>

            {/* Chart + breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card padded={false} className="lg:col-span-2">
                    <CardHeader
                        icon={TrendingUp}
                        title="Zarobki miesięczne (na rękę)"
                        action={
                            <Segmented
                                value={months}
                                onChange={setMonths}
                                options={[
                                    { value: 6, label: '6 mies.' },
                                    { value: 12, label: '12 mies.' },
                                    { value: 24, label: '24 mies.' },
                                ]}
                            />
                        }
                    />
                    <div className="card-pad">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted mb-4">
                            <span>Suma: <strong className="text-ink">{formatCurrency(monthlyTotal)}</strong></span>
                            <span>Średnio: <strong className="text-ink">{formatCurrency(months ? monthlyTotal / months : 0)}</strong> / mies.</span>
                            {bestMonth?.value > 0 && <span>Najlepszy: <strong className="text-ink">{bestMonth.label} {bestMonth.year}</strong> · {formatCurrency(bestMonth.value)}</span>}
                        </div>
                        <div className="h-64">
                            <Bar data={chartData} options={chartOptions} />
                        </div>
                    </div>
                </Card>

                <div className="space-y-4">
                    <Card padded={false}>
                        <CardHeader title={`Typy współprac · ${financials.year}`} />
                        <div className="card-pad space-y-4">
                            {!monthlyStats?.by_type?.length ? (
                                <p className="text-sm text-ink-muted text-center py-4">Brak danych</p>
                            ) : (
                                monthlyStats.by_type.map((stat) => {
                                    const pct = typeTotal > 0 ? Math.round((parseFloat(stat.total) / typeTotal) * 100) : 0;
                                    return (
                                        <div key={stat.type}>
                                            <div className="flex justify-between items-baseline gap-2 mb-1.5">
                                                <div className="text-sm font-semibold text-ink truncate">{getCollabTypeLabel(stat.type)}</div>
                                                <div className="text-xs text-ink-muted whitespace-nowrap">{stat.count} · <strong className="text-ink">{formatCurrency(stat.total, { compact: true })}</strong></div>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                                                <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </Card>

                    {monthlyStats?.top_brands?.length > 0 && (
                        <Card padded={false}>
                            <CardHeader icon={Award} title="Najlepsi klienci" />
                            <div className="divide-y divide-line">
                                {monthlyStats.top_brands.map((b, i) => (
                                    <div key={b.brand} className="row !py-2.5">
                                        <span className="w-6 text-xs font-bold text-ink-muted">{i + 1}.</span>
                                        <span className="flex-1 text-sm font-semibold text-ink truncate">{b.brand}</span>
                                        <span className="text-xs text-ink-muted">{b.count}×</span>
                                        <span className="text-sm font-bold text-ink tabular-nums">{formatCurrency(b.total, { compact: true })}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />

        </div>
    );
}
