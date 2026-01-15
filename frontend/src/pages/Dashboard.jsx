import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import statsService from '../services/stats';
import { formatCurrency, formatDate, getCollabTypeLabel, getReturnUrgency } from '../utils/format';
import { Briefcase, ShoppingBag, TrendingUp, AlertCircle, Calendar, Users, Wallet, Lock, Building2, Sparkles } from 'lucide-react';

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
        return (
            <div className="flex justify-center items-center h-64">
                <div className="loading-spinner"></div>
            </div>
        );
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

    const { financials, counts, upcoming } = stats || {};

    return (
        <div className="space-y-8 pb-20">


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

            {/* NEW: Primary Stats Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Gross Year */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-5 rounded-3xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                            <TrendingUp size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider">Przychód {financials?.year}</span>
                        </div>
                        <div className="text-2xl font-bold tracking-tight">
                            {formatCurrency(financials?.yearly_gross || 0)}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 font-medium">
                            Na rękę: {formatCurrency(financials?.yearly_net || 0)}
                        </div>
                    </div>
                </div>

                {/* 2. Purchases Count */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <ShoppingBag size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Zakupy {financials?.year}</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                        {stats?.counts?.purchases_year || 0}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Sztuk zakupionych
                    </div>
                </div>

                {/* 3. Collabs Count */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-gray-500 mb-2">
                        <Users size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Współprace {financials?.year}</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                        {stats?.counts?.collabs_year || 0}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Zrealizowanych zleceń
                    </div>
                </div>

                {/* 4. Pending Payments */}
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-yellow-600 mb-2">
                        <Calendar size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Oczekujące</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        {formatCurrency(financials?.pending?.gross || 0)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 font-medium">
                        Na rękę: {formatCurrency(financials?.pending?.net || 0)}
                    </div>
                </div>
            </div>


            {/* Urgent Purchases Alert */}
            {stats?.urgent_purchases?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 animate-pulse-subtle">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-800 text-sm mb-3">Pilne zwroty!</h3>
                            <div className="space-y-2">
                                {stats.urgent_purchases.map(purchase => {
                                    const urgency = getReturnUrgency(purchase.days_remaining);
                                    let itemStyle = "bg-white border-transparent hover:border-red-200";
                                    let textStyle = "text-gray-900";

                                    if (urgency.level === 'urgent' || urgency.level === 'overdue' || urgency.level === 'today') {
                                        itemStyle = "bg-red-100 border-red-200";
                                        textStyle = "text-red-900";
                                    } else if (urgency.level === 'soon') {
                                        itemStyle = "bg-orange-100 border-orange-200";
                                        textStyle = "text-orange-900";
                                    }

                                    return (
                                        <Link
                                            key={purchase.id}
                                            to={`/purchases/${purchase.id}`}
                                            className={`block text-sm p-3 rounded-lg border hover:shadow-md transition-all ${itemStyle}`}
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className={`font-semibold truncate ${textStyle}`}>{purchase.store}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">{purchase.items}</div>
                                                </div>
                                                <div className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded whitespace-nowrap ${urgency.className.replace('badge-', 'text-').replace('badge', 'bg-white/50')}`}>
                                                    {urgency.message}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
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
                    {(!upcoming?.collaborations?.length && !upcoming?.purchases?.length) ? (
                        <div className="p-8 text-center text-gray-400">
                            <div className="mb-2 text-purple-300">
                                <Sparkles size={48} strokeWidth={1.5} />
                            </div>
                            <p>Brak nadchodzących terminów</p>
                        </div>
                    ) : (
                        <>
                            {upcoming?.collaborations?.map(collab => (
                                <Link
                                    key={`collab-${collab.id}`}
                                    to={`/collaborations/${collab.id}`}
                                    className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4 cursor-pointer"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center flex-shrink-0 relative">
                                        <Briefcase size={18} />
                                        {!collab.fiscal_tracking && (
                                            <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                                                <Lock size={10} className="text-gray-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 truncate">{collab.brand}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span>{getCollabTypeLabel(collab.type)}</span>
                                            <span>•</span>
                                            <span className="text-gray-700 font-medium">
                                                {formatCurrency(collab.amount || 0)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md whitespace-nowrap">
                                        {formatDate(collab.date)}
                                    </div>
                                </Link>
                            ))}
                            {upcoming?.purchases?.map(purchase => {
                                const urgency = getReturnUrgency(purchase.days_remaining);
                                return (
                                    <Link
                                        key={`purchase-${purchase.id}`}
                                        to={`/purchases/${purchase.id}`}
                                        className="p-4 hover:bg-gray-50 transition-colors flex items-center gap-4 cursor-pointer"
                                    >
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
                                    </Link>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
