import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import statsService from '../services/stats';
import { formatCurrency, getCollabTypeLabel } from '../utils/format';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Statistics() {
    const [socialStats, setSocialStats] = useState(null);
    const [editingPlatform, setEditingPlatform] = useState(null);
    const [editValue, setEditValue] = useState('');

    useEffect(() => {
        loadStats();
    }, []);

    const [error, setError] = useState(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            setError(null);

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

    // Social Media Platforms config
    const socialPlatforms = [
        { id: 'instagram', label: 'Instagram', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500', icon: '📸' },
        { id: 'tiktok', label: 'TikTok', color: 'bg-black', icon: '🎵' },
        { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', icon: '👍' },
        { id: 'youtube', label: 'YouTube', color: 'bg-red-600', icon: '▶️' }
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

                        return (
                            <div key={platform.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-full">
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-xl ${platform.color} flex items-center justify-center text-white text-xl shadow-md`}>
                                        {platform.icon}
                                    </div>
                                    <button
                                        onClick={() => handleEditSocial(platform.id, data.count)}
                                        className="text-gray-400 hover:text-primary transition-colors text-xs font-semibold uppercase tracking-wider"
                                    >
                                        Edytuj
                                    </button>
                                </div>

                                <div>
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
