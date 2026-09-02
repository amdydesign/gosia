import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Wallet, Building2, Lock, Download, RefreshCw, Pencil, Link2, TrendingUp, Award } from 'lucide-react';
import statsService from '../services/stats';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Card, { CardHeader } from '../components/ui/Card';
import Segmented from '../components/ui/Segmented';
import Sheet from '../components/ui/Sheet';
import Field from '../components/ui/Field';
import { PageSkeleton } from '../components/ui/Skeleton';
import ExportModal from './collaborations/ExportModal';
import { formatCurrency, getCollabTypeLabel } from '../utils/format';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SocialIcons = {
    instagram: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
    ),
    tiktok: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
    ),
    facebook: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    ),
    youtube: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    ),
};

const PLATFORMS = [
    { id: 'instagram', label: 'Instagram', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500', auto: true },
    { id: 'tiktok', label: 'TikTok', color: 'bg-black', connect: true },
    { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', auto: true },
    { id: 'youtube', label: 'YouTube', color: 'bg-red-600', connect: true },
];

export default function Statistics() {
    const toast = useToast();
    const [dashboardStats, setDashboardStats] = useState(null);
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [months, setMonths] = useState(6);
    const [socialStats, setSocialStats] = useState(null);
    const [connected, setConnected] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [exportOpen, setExportOpen] = useState(false);
    const [editing, setEditing] = useState(null); // { platform, value }
    const [youtubeOpen, setYoutubeOpen] = useState(false);
    const [youtubeId, setYoutubeId] = useState('');

    const autoRefreshSocial = useCallback(
        (current) => {
            const today = new Date().toISOString().slice(0, 10);
            const jobs = [
                ['instagram', statsService.scrapeInstagram],
                ['facebook', statsService.scrapeFacebook],
            ];
            jobs.forEach(([platform, fn]) => {
                if (current?.[platform]?.date === today) return;
                fn()
                    .then((res) => {
                        if (res?.success) {
                            setSocialStats((prev) => ({ ...(prev || {}), [platform]: { ...(prev?.[platform] || {}), count: res.followers, date: today } }));
                            toast.info(`${platform === 'instagram' ? 'Instagram' : 'Facebook'}: ${Number(res.followers).toLocaleString('pl-PL')} obserwujących`);
                        }
                    })
                    .catch(() => {});
            });
        },
        [toast]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            let currentSocial = null;
            const tasks = [
                statsService.getDashboard().then((r) => r.success && !cancelled && setDashboardStats(r.data)).catch(() => {}),
                statsService.getSocialCurrent().then((r) => {
                    if (r.success && !cancelled) {
                        setSocialStats(r.data);
                        currentSocial = r.data;
                    }
                }).catch(() => {}),
                statsService.getSocialStatus().then((r) => r.success && !cancelled && setConnected(r.data || {})).catch(() => {}),
            ];
            await Promise.all(tasks);
            if (!cancelled) {
                setLoading(false);
                if (currentSocial) autoRefreshSocial(currentSocial);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [autoRefreshSocial]);

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

    const handleRefreshAll = async () => {
        setRefreshing(true);
        const results = await Promise.allSettled([statsService.scrapeInstagram(), statsService.scrapeFacebook()]);
        const today = new Date().toISOString().slice(0, 10);
        const parts = [];
        results.forEach((r, i) => {
            const platform = i === 0 ? 'instagram' : 'facebook';
            if (r.status === 'fulfilled' && r.value?.success) {
                setSocialStats((prev) => ({ ...(prev || {}), [platform]: { ...(prev?.[platform] || {}), count: r.value.followers, date: today } }));
                parts.push(`${platform === 'instagram' ? 'IG' : 'FB'} ${Number(r.value.followers).toLocaleString('pl-PL')}`);
            }
        });
        setRefreshing(false);
        if (parts.length) toast.success(`Zaktualizowano: ${parts.join(' · ')}`);
        else toast.error('Nie udało się pobrać nowych danych');
    };

    const handleConnect = async (platform) => {
        if (platform === 'youtube') {
            setYoutubeOpen(true);
            return;
        }
        try {
            const res = await statsService.getSocialAuthUrl(platform);
            if (res.success && res.data?.url) window.location.href = res.data.url;
            else toast.error('Połączenie nie jest jeszcze skonfigurowane po stronie serwera.');
        } catch {
            toast.error('Wystąpił błąd podczas inicjowania połączenia.');
        }
    };

    const submitYoutube = async () => {
        if (!youtubeId.trim()) return;
        try {
            const res = await statsService.connectYouTubePublic(youtubeId.trim());
            if (res.success) {
                toast.success(res.data?.message || 'Kanał YouTube połączony');
                setYoutubeOpen(false);
                const s = await statsService.getSocialCurrent();
                if (s.success) setSocialStats(s.data);
            } else toast.error(res.message || 'Błąd połączenia');
        } catch {
            toast.error('Błąd połączenia z serwerem.');
        }
    };

    const saveManual = async () => {
        const count = parseInt(editing.value, 10);
        if (Number.isNaN(count) || count < 0) {
            setEditing(null);
            return;
        }
        try {
            const res = await statsService.updateSocialStats(editing.platform, count);
            if (res.success) {
                setSocialStats((prev) => ({ ...(prev || {}), [editing.platform]: { ...(prev?.[editing.platform] || {}), count } }));
                toast.success('Zapisano liczbę obserwujących');
            }
        } catch {
            toast.error('Nie udało się zapisać');
        } finally {
            setEditing(null);
        }
    };

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

            {/* Social */}
            <section>
                <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Social media</h2>
                    <button type="button" onClick={handleRefreshAll} disabled={refreshing} className="btn btn-ghost btn-sm">
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Odśwież IG i FB
                    </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {PLATFORMS.map((p) => {
                        const data = socialStats?.[p.id] || { count: 0 };
                        const isEditing = editing?.platform === p.id;
                        const isConnected = !!connected?.[p.id];
                        return (
                            <div key={p.id} className="card card-pad relative">
                                <div className="flex items-center gap-3">
                                    <span className={`w-10 h-10 rounded-xl ${p.color} text-white flex items-center justify-center shrink-0 shadow-sm`}>{SocialIcons[p.id]}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">{p.label}</div>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                className="input !py-1 !px-2 !text-base !font-bold mt-0.5"
                                                value={editing.value}
                                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                                onBlur={saveManual}
                                                onKeyDown={(e) => e.key === 'Enter' && saveManual()}
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="text-xl font-extrabold text-ink tracking-tight truncate">{Number(data.count || 0).toLocaleString('pl-PL')}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 text-[11px] text-ink-muted">
                                    <span>{data.date ? `stan z ${data.date.slice(5).split('-').reverse().join('.')}` : 'brak danych'}</span>
                                    <div className="flex items-center gap-1">
                                        {p.connect && !isConnected && (
                                            <button type="button" onClick={() => handleConnect(p.id)} className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-primary-800">
                                                <Link2 size={12} /> Połącz
                                            </button>
                                        )}
                                        <button type="button" onClick={() => setEditing({ platform: p.id, value: String(data.count || 0) })} className="p-1 rounded-md hover:bg-black/5" title="Wpisz ręcznie" aria-label="Wpisz ręcznie">
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

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

            <Sheet
                open={youtubeOpen}
                onClose={() => setYoutubeOpen(false)}
                title="Połącz kanał YouTube"
                description="Wklej ID kanału (zaczyna się od UC…). Znajdziesz je w YouTube Studio → Ustawienia → Kanał."
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" className="flex-1" onClick={() => setYoutubeOpen(false)}>Anuluj</Button>
                        <Button variant="primary" className="flex-1" onClick={submitYoutube}>Połącz</Button>
                    </>
                }
            >
                <Field label="ID kanału">
                    <input className="input" value={youtubeId} onChange={(e) => setYoutubeId(e.target.value)} placeholder="UCxxxxxxxxxxxxxxxx" autoFocus />
                </Field>
            </Sheet>
        </div>
    );
}
