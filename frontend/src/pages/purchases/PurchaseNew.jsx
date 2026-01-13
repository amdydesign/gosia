import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { apiRequest } from '../../utils/api';

export default function PurchaseNew() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        store: '',
        items: '',
        purchase_date: new Date().toISOString().split('T')[0],
        return_days: 14,
        amount: '',
        purchase_url: '',
        notes: '',
        status: 'kept'
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await apiRequest('/purchases/create.php', 'POST', formData, token);
            navigate('/purchases');
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <header className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                    Nowy zakup
                </h1>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <div className="bg-red-50 text-red-500 p-4 rounded-xl">{error}</div>}

                {/* Main Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="font-semibold text-gray-800">Szczegóły zakupu</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sklep / Marka</label>
                        <input
                            type="text"
                            name="store"
                            value={formData.store}
                            onChange={handleChange}
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Przedmioty</label>
                        <input
                            type="text"
                            name="items"
                            value={formData.items}
                            onChange={handleChange}
                            placeholder="np. Sukienka, buty, torebka"
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data zakupu</label>
                            <input
                                type="date"
                                name="purchase_date"
                                value={formData.purchase_date}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Czas na zwrot (dni)</label>
                            <input
                                type="number"
                                name="return_days"
                                value={formData.return_days}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                            />
                        </div>
                    </div>
                </div>

                {/* Additional Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kwota</label>
                            <input
                                type="number"
                                name="amount"
                                value={formData.amount}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                            >
                                <option value="kept">Zostawione</option>
                                <option value="partial">Częściowy zwrot</option>
                                <option value="returned">Zwrócone</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Link do zakupu (opcjonalnie)</label>
                        <input
                            type="url"
                            name="purchase_url"
                            value={formData.purchase_url}
                            onChange={handleChange}
                            placeholder="https://..."
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 h-24 resize-none"
                        ></textarea>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white py-4 rounded-xl font-bold
                             shadow-lg shadow-teal-200 hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                >
                    {loading ? 'Zapisywanie...' : (
                        <>
                            <Save size={20} />
                            Dodaj zakup
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
