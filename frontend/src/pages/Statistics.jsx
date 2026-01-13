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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            const [dashRes, monthRes] = await Promise.all([
                statsService.getDashboard(),
                statsService.getMonthly()
            ]);
            if (dashRes.success) setDashboardStats(dashRes.data);
            if (monthRes.success) setMonthlyStats(monthRes.data);
        } catch (err) {
            console.error('Error loading stats:', err);
        } finally {
            setLoading(false);
        }
    };

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

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Statystyki</h1>
                <p className="text-gray-500">Przegląd zarobków i efektywności</p>
            </header>

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
