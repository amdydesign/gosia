import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import statsService from '../services/stats';
import { formatCurrency, getCollabTypeLabel } from '../utils/format';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Statistics() {
    const [dashboardStats, setDashboardStats] = useState(null);
    const [monthlyStats, setMonthlyStats] = useState(null);
    const [socialStats, setSocialStats] = useState(null);
    const [connectedPlatforms, setConnectedPlatforms] = useState({});

    const [editingPlatform, setEditingPlatform] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            setError(null);

            // Auto-refresh social stats from APIs on page load
            try {
                await statsService.refreshSocialStats();
            } catch (e) { console.error('Social refresh error', e); }

            // Load independent parts
            try {
                const dashRes = await statsService.getDashboard();
                if (dashRes.success) setDashboardStats(dashRes.data);
            } catch (e) { console.error('Dashboard stats error', e); }

            try {
                const monthRes = await statsService.getMonthly();
                if (monthRes.success) setMonthlyStats(monthRes.data);
            } catch (e) { console.error('Monthly stats error', e); }

            try {
                const socialRes = await statsService.getSocialCurrent();
                if (socialRes.success) setSocialStats(socialRes.data);
            } catch (e) { console.error('Social stats error', e); }

            try {
                const statusRes = await statsService.getSocialStatus();
                if (statusRes.success) setConnectedPlatforms(statusRes.data);
            } catch (e) { console.error('Social status error', e); }

        } catch (err) {
            console.error('Error loading stats:', err);
            setError('Wystąpił błąd podczas ładowania danych. Spróbuj odświeżyć stronę.');
        } finally {
            setLoading(false);
        }
    };

    const handleEditSocial = (platform, currentCount) => {
        setEditingPlatform(platform);
        setEditValue(currentCount.toString());
    };

    const handleConnectSocial = async (platform) => {
        if (platform === 'youtube') {
            const channelId = prompt("Wprowadź ID swojego kanału YouTube (np. UC...):");
            if (!channelId) return;

            try {
                const res = await statsService.connectYouTubePublic(channelId);
                if (res.success) {
                    alert(`✅ Sukces! ${res.data.message}\nSubskrypcje: ${res.data.count}`);
                    loadStats();
                } else {
                    alert('Błąd: ' + res.message);
                }
            } catch (e) {
                console.error(e);
                alert('Błąd połączenia z serwerem.');
            }
            return;
        }

        // OAuth for TikTok and others
        try {
            const res = await statsService.getSocialAuthUrl(platform);
            if (res.success && res.data.url) {
                window.location.href = res.data.url;
            } else {
                alert('Funkcja nie jest jeszcze skonfigurowana. Sprawdź api/config/social_credentials.php');
            }
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas inicjowania połączenia.');
        }
    };

    const handleSaveSocial = async () => {
        try {
            const count = parseInt(editValue);
            if (isNaN(count) || count < 0) return;

            const res = await statsService.updateSocialStats(editingPlatform, count);
            if (res.success) {
                setSocialStats(prev => ({
                    ...prev,
                    [editingPlatform]: { ...prev[editingPlatform], count }
                }));
                setEditingPlatform(null);
            }
        } catch (err) {
            console.error('Failed to update social stats', err);
        }
    };

    // SVG Icons for social platforms
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
        )
    };

    // Social Media Platforms config
    const socialPlatforms = [
        { id: 'instagram', label: 'Instagram', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' },
        { id: 'tiktok', label: 'TikTok', color: 'bg-black' },
        { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
        { id: 'youtube', label: 'YouTube', color: 'bg-red-600' }
    ];

    const chartData = {
        labels: monthlyStats?.monthly?.map(m => m.label) || [],
        datasets: [
            {
                label: 'Zarobki (PLN)',
                data: monthlyStats?.monthly?.map(m => m.value) || [],
                backgroundColor: 'rgba(124, 58, 237, 0.6)', // Primary purple
                borderColor: 'rgba(124, 58, 237, 1)',
                borderWidth: 2,
                borderRadius: 8,
                hoverBackgroundColor: 'rgba(124, 58, 237, 0.8)'
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleFont: { size: 13 },
                bodyFont: { size: 14, weight: 'bold' },
                cornerRadius: 8,
                callbacks: {
                    label: (ctx) => formatCurrency(ctx.parsed.y)
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: '#f3f4f6'
                },
                ticks: {
                    callback: (value) => value >= 1000 ? `${value / 1000}k zł` : `${value} zł`,
                    font: { size: 11 }
                }
            },
            x: {
                grid: { display: false }
            }
        }
    };

    const totalAmount = monthlyStats?.by_type?.reduce((sum, t) => sum + parseFloat(t.total || 0), 0) || 1;

    if (loading) return <div className="loading">Ładowanie...</div>;

    if (error) return (
        <div className="p-8 text-center">
            <div className="text-red-500 mb-4 text-xl">⚠️</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Błąd aplikacji</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <button onClick={() => window.location.reload()} className="bg-primary text-white px-6 py-2 rounded-xl">
                Odśwież stronę
            </button>
        </div>
    );

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Statystyki</h1>
                <p className="text-gray-500">Przegląd zarobków, efektywności i zasięgów</p>
            </header>

            {/* Social Media Stats */}
            <section>
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <span>📱</span> Social Media
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {socialPlatforms.map(platform => {
                        const data = socialStats?.[platform.id] || { count: 0 };
                        const isEditing = editingPlatform === platform.id;
                        const isConnected = connectedPlatforms?.[platform.id];

                        // Implemented: YouTube (API Key), TikTok (OAuth), Facebook (OAuth)
                        const canConnect = platform.id === 'youtube' || platform.id === 'tiktok' || platform.id === 'facebook';

                        return (
                            <div key={platform.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-full relative overflow-hidden">
                                {isConnected && (
                                    <div className="absolute top-0 right-0 p-1">
                                        <div className="bg-green-100 text-green-600 text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                            AUTO
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-3 z-10">
                                    <div className={`w-10 h-10 rounded-xl ${platform.color} flex items-center justify-center text-white shadow-md`}>
                                        {SocialIcons[platform.id]}
                                    </div>

                                    <div className="flex gap-1">
                                        {canConnect && (
                                            <button
                                                onClick={() => handleConnectSocial(platform.id)}
                                                className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${isConnected ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'text-white bg-black/80 hover:bg-black'}`}
                                                title={isConnected ? "Zmień ID kanału" : "Połącz konto"}
                                            >
                                                {isConnected ? 'Zmień' : 'Połącz'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="z-10">
                                    <div className="text-gray-500 text-xs font-medium mb-1">{platform.label}</div>
                                    {isEditing ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                autoFocus
                                                onBlur={() => setEditingPlatform(null)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveSocial()}
                                            />
                                        </div>
                                    ) : (
                                        <div className="text-2xl font-bold text-gray-900 group-hover:text-primary transition-colors">
                                            {data.count.toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm font-medium mb-1">Łączne zarobki</div>
                    <span className="text-2xl font-bold text-gray-900">{formatCurrency(dashboardStats?.total_earnings || 0)}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm font-medium mb-1">Liczba współprac</div>
                    <span className="text-2xl font-bold text-gray-900">{dashboardStats?.total_collaborations || 0}</span>
                </div>
            </div>

            {/* Monthly Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-6">Zarobki miesięczne (ostatnie 6 m-cy)</h3>
                <div className="h-64">
                    <Bar data={chartData} options={chartOptions} />
                </div>
            </div>

            {/* Type Breakdown */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-800 mb-6">Według typu współpracy</h3>
                <div className="space-y-6">
                    {!monthlyStats?.by_type?.length ? (
                        <div className="text-center text-gray-400 py-4">Brak danych</div>
                    ) : (
                        monthlyStats.by_type.map(stat => {
                            const percentage = Math.round((parseFloat(stat.total) / totalAmount) * 100);
                            return (
                                <div key={stat.type} className="group">
                                    <div className="flex justify-between items-end mb-2">
                                        <div>
                                            <div className="font-medium text-gray-900">{getCollabTypeLabel(stat.type)}</div>
                                            <div className="text-xs text-gray-500">{stat.count} współprac</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-gray-900">{formatCurrency(stat.total)}</div>
                                            <div className="text-xs text-gray-500">{percentage}% całości</div>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full transition-all duration-500 ease-out group-hover:bg-purple-600"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
