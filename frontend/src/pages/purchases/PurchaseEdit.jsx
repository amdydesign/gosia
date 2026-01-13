import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Save } from 'lucide-react';
import { apiRequest } from '../../utils/api';

export default function PurchaseEdit() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const isReturnMode = searchParams.get('return') === '1'; // Check if "Make Return" mode

    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        store: '',
        items: '',
        purchase_date: '',
        return_days: 14,
        amount: '',
        returned_amount: '',
        purchase_url: '',
        notes: '',
        status: 'kept'
    });

    useEffect(() => {
        loadPurchase();
    }, [id]);

    const loadPurchase = async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/purchases/show.php?id=${id}`, 'GET', null, token);
            setFormData({
                store: data.store || '',
                items: data.items || '',
                purchase_date: data.purchase_date || '',
                return_days: data.return_days || 14,
                amount: data.amount || 0,
                returned_amount: data.returned_amount || 0,
                purchase_url: data.purchase_url || '',
                notes: data.notes || '',
                status: isReturnMode ? 'returned' : (data.status || 'kept')
            });

            // Auto-fill returned amount if switching to returned mode
            if (isReturnMode && (!data.returned_amount || data.returned_amount == 0)) {
                setFormData(prev => ({ ...prev, returned_amount: prev.amount }));
            }

        } catch (err) {
            setError(err.message || 'Błąd ładowania');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            await apiRequest(`/purchases/update.php?id=${id}`, 'PUT', formData, token);
            navigate(`/purchases/${id}`);
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            setSaving(false);
        }
    };

    if (loading) return <div className="loading">Ładowanie...</div>;

    return (
        <div className="max-w-2xl mx-auto">
            <header className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                    {isReturnMode ? 'Dokonaj zwrotu' : 'Edytuj zakup'}
                </h1>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <div className="bg-red-50 text-red-500 p-4 rounded-xl">{error}</div>}

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    {!isReturnMode && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sklep / Marka</label>
                                <input
                                    type="text"
                                    name="store"
                                    value={formData.store}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Przedmioty</label>
                                <input
                                    type="text"
                                    name="items"
                                    value={formData.items}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200"
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
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dni na zwrot</label>
                                    <input
                                        type="number"
                                        name="return_days"
                                        value={formData.return_days}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kwota zakupu (zł)</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleChange}
                                    step="0.01"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200"
                                />
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200"
                            >
                                <option value="kept">Zostawione</option>
                                <option value="partial">Częściowy zwrot</option>
                                <option value="returned">Zwrócone</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {formData.status === 'returned' ? 'Kwota zwrotu' : 'Kwota zwrotu (opcjonalnie)'}
                            </label>
                            <input
                                type="number"
                                name="returned_amount"
                                value={formData.returned_amount}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-green-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                    <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 h-24 resize-none"
                    ></textarea>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg"
                >
                    {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                </button>
            </form>
        </div>
    );
}
