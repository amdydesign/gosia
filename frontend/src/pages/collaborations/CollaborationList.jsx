import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Plus, Search, Calendar, CheckCircle, Clock } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/format';

export default function CollaborationList() {
    const { token } = useAuth();
    const [collabs, setCollabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all'); // all, unpaid

    useEffect(() => {
        loadCollabs();
    }, []);

    const loadCollabs = async () => {
        try {
            setLoading(true);
            const data = await apiRequest('/collaborations/index.php', 'GET', null, token);
            // Ensure we always have an array, even if API returns error/null
            setCollabs(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Błąd ładowania');
            setCollabs([]); // Reset to empty array on error
        } finally {
            setLoading(false);
        }
    };

    const filteredCollabs = collabs.filter(c => {
        if (filter === 'unpaid') return c.payment_status !== 'paid';
        return true;
    });

    return (
        <div className="space-y-6 md:pb-10">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Współprace</h1>
                    <p className="text-gray-500">Zarządzaj swoimi zleceniami</p>
                </div>
                <div className="flex gap-3">
                    <Link
                        to="/collaborations/new"
                        className="bg-primary text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-105 transition-all"
                    >
                        <Plus size={20} />
                        Nowa współpraca
                    </Link>
                </div>
            </header>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                        ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Wszystkie
                </button>
                <button
                    onClick={() => setFilter('unpaid')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                        ${filter === 'unpaid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Nieopłacone
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="loading">Ładowanie...</div>
            ) : filteredCollabs.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-gray-100">
                    <div className="text-4xl mb-4">📭</div>
                    <h3 className="text-lg font-semibold text-gray-900">Brak współpracy</h3>
                    <p className="text-gray-500 mb-6">Dodaj swoje pierwsze zlecenie, aby zacząć.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredCollabs.map(collab => (
                        <Link
                            key={collab.id}
                            to={`/collaborations/${collab.id}`}
                            className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-primary/30 transition-colors flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">
                                    {collab.brand.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">{collab.brand}</h3>
                                    <div className="text-sm text-gray-500 flex items-center gap-3">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={14} />
                                            {formatDate(collab.date)}
                                        </span>
                                        <span>•</span>
                                        <span>{collab.type}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="font-bold text-gray-900">{formatCurrency(collab.amount_net || collab.amount)}</div>
                                <div className="flex justify-end mt-1">
                                    {collab.payment_status === 'paid' ? (
                                        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <CheckCircle size={10} /> Opłacone
                                        </span>
                                    ) : (
                                        <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <Clock size={10} /> Oczekuje
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
