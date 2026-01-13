import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Plus, ShoppingBag, Calendar, Clock, RotateCcw } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate, getReturnUrgency } from '../../utils/format';

export default function PurchaseList() {
    const { token } = useAuth();
    const [purchases, setPurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('active'); // active, returned, all

    useEffect(() => {
        loadPurchases();
    }, []);

    const loadPurchases = async () => {
        try {
            setLoading(true);
            setLoading(true);
            const data = await apiRequest('/purchases/index.php', 'GET', null, token);
            setPurchases(data);
        } catch (err) {
            setError(err.message || 'Błąd ładowania');
        } finally {
            setLoading(false);
        }
    };

    const filteredPurchases = purchases.filter(p => {
        if (filter === 'active') return p.status === 'kept' || p.status === 'partial';
        if (filter === 'returned') return p.status === 'returned';
        return true;
    });

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Zakupy</h1>
                    <p className="text-gray-500">Zarządzaj garderobą i zwrotami</p>
                </div>
                <Link
                    to="/purchases/new"
                    className="bg-teal-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-teal-200 hover:shadow-xl hover:scale-105 transition-all"
                >
                    <Plus size={20} />
                    Nowy zakup
                </Link>
            </header>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                    onClick={() => setFilter('active')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                        ${filter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Aktywne (do zwrotu)
                </button>
                <button
                    onClick={() => setFilter('returned')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                        ${filter === 'returned' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Zwrócone
                </button>
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                        ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Wszystkie
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="loading">Ładowanie...</div>
            ) : filteredPurchases.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-gray-100">
                    <div className="text-4xl mb-4">🛍️</div>
                    <h3 className="text-lg font-semibold text-gray-900">Brak zakupów</h3>
                    <p className="text-gray-500 mb-6">Dodaj swój pierwszy zakup, aby kontrolować zwroty.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredPurchases.map(purchase => {
                        const urgency = getReturnUrgency(purchase.days_remaining);
                        return (
                            <Link
                                key={purchase.id}
                                to={`/purchases/${purchase.id}`}
                                className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-teal-500/30 transition-colors flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-lg">
                                        <ShoppingBag size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">{purchase.store}</h3>
                                        <div className="text-sm text-gray-500">{purchase.items}</div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="font-bold text-gray-900">{formatCurrency(purchase.amount)}</div>
                                    <div className="flex justify-end mt-1">
                                        {purchase.status === 'kept' ? (
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${urgency.className.replace('badge-', 'text-').replace('badge', 'bg-opacity-10 bg-current')}`}>
                                                <Clock size={10} /> {urgency.message}
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <RotateCcw size={10} /> Zwrócone
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
