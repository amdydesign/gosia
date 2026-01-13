import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import statsService from '../services/stats';
import { formatCurrency, formatDate, getCollabTypeLabel, getReturnUrgency } from '../utils/format';
import { Briefcase, ShoppingBag, TrendingUp, AlertCircle, Calendar, CreditCard } from 'lucide-react';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            setLoading(true);
            const response = await statsService.getDashboard();
            if (response.success) {
                setStats(response.data);
            }
        } catch (err) {
            setError(err.message || 'Błąd ładowania danych');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="loading">Ładowanie statystyk...</div>;
    }

    if (error) {
        return (
            <div className="error-container p-4">
                <div className="error text-red-500 mb-4">{error}</div>
                <button onClick={loadStats} className="bg-primary text-white px-4 py-2 rounded-lg">
                    Spróbuj ponownie
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <Link to="/collaborations/new" className="bg-gradient-to-br from-purple-500 to-pink-500 text-white p-4 rounded-2xl shadow-lg shadow-purple-200 transform hover:scale-[1.02] transition-transform flex flex-col items-center justify-center gap-2">
                    <Briefcase size={28} strokeWidth={2.5} />
                    <span className="font-semibold text-sm">+ Nowe zlecenie</span>
                </Link>
                <Link to="/purchases/new" className="bg-gradient-to-br from-teal-500 to-emerald-500 text-white p-4 rounded-2xl shadow-lg shadow-teal-200 transform hover:scale-[1.02] transition-transform flex flex-col items-center justify-center gap-2">
                    <ShoppingBag size={28} strokeWidth={2.5} />
                    <span className="font-semibold text-sm">+ Nowy zakup</span>
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Yearly Earnings - Highlighted */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100 col-span-2 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-purple-600 mb-1">
                            <TrendingUp size={16} />
                            <span className="text-xs font-semibold uppercase tracking-wider">Rok {new Date().getFullYear()}</span>
                        </div>
                        <span className="text-2xl font-bold text-gray-900 block mt-1">
                            {formatCurrency(stats?.yearly_earnings || 0)}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-xs font-medium mb-1 truncate">Ten miesiąc</div>
                    <span className="text-lg font-bold text-gray-900 block">
                        {formatCurrency(stats?.monthly_earnings || 0)}
                    </span>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-xs font-medium mb-1 truncate">Oczekujące</div>
                    <span className="text-lg font-bold text-gray-900 block">
                        {formatCurrency(stats?.pending_payments || 0)}
                    </span>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-xs font-medium mb-1 truncate">Współprace</div>
                    <span className="text-lg font-bold text-gray-900 block">
                        {stats?.active_collaborations || 0}
                    </span>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-xs font-medium mb-1 truncate">Zakupy (aktywne)</div>
                    <span className="text-lg font-bold text-gray-900 block hover:text-primary transition-colors">
                        {stats?.active_purchases || 0}
                    </span>
                </div>
            </div>

            {/* Urgent Purchases Alert */}
            {stats?.urgent_purchases?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                            <h3 className="font-bold text-red-700 text-sm mb-3">Pilne zwroty!</h3>
                            <div className="space-y-2">
                                {stats.urgent_purchases.map(purchase => (
                                    <Link
                                        key={purchase.id}
                                        to={`/purchases/${purchase.id}`}
                                        className="block text-sm bg-white p-3 rounded-lg hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-red-700 truncate">{purchase.store}</div>
                                                <div className="text-xs text-red-600 mt-0.5">{purchase.items}</div>
                                            </div>
                                            <div className="flex-shrink-0 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded whitespace-nowrap">
                                                {getReturnUrgency(purchase.days_remaining).message}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Upcoming Items */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex items-center gap-2">
                    <Calendar size={20} className="text-primary" />
                    <h3 className="font-bold text-gray-800">Najbliższe terminy</h3>
                </div>

                <div className="divide-y divide-gray-50">
                    {(!stats?.upcoming_collaborations?.length && !stats?.upcoming_purchases?.length) ? (
                        <div className="p-8 text-center text-gray-400">
                            <div className="text-4xl mb-2">✨</div>
                            <p>Brak nadchodzących terminów</p>
                        </div>
                    ) : (
                        <>
                            {stats?.upcoming_collaborations?.map(collab => (
                                <div key={`collab-${collab.id}`} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0">
                                        <Briefcase size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 truncate">{collab.brand}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span>{getCollabTypeLabel(collab.type)}</span>
                                            <span>•</span>
                                            <span className="text-gray-700">{formatCurrency(collab.amount)}</span>
                                        </div>
                                    </div>
                                    <div className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md whitespace-nowrap">
                                        {formatDate(collab.date)}
                                    </div>
                                </div>
                            ))}
                            {stats?.upcoming_purchases?.map(purchase => {
                                const urgency = getReturnUrgency(purchase.days_remaining);
                                return (
                                    <div key={`purchase-${purchase.id}`} className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                                            <ShoppingBag size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-900 truncate">{purchase.store}</div>
                                            <div className="text-xs text-gray-500 truncate">{purchase.items}</div>
                                        </div>
                                        <div className={`text-xs font-bold px-2 py-1 rounded-md whitespace-nowrap ${urgency.className.replace('badge-', 'text-').replace('badge', 'bg-opacity-10 bg-current')}`}>
                                            {urgency.message}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
