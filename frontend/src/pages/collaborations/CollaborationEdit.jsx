import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { apiRequest } from '../../utils/api';

export default function CollaborationEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        brand: '',
        type: 'post-instagram',
        amount_net: '',
        amount_gross: '',
        date: '',
        payment_status: 'pending',
        notes: '',
        team: []
    });

    useEffect(() => {
        loadCollab();
    }, [id]);

    const loadCollab = async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/collaborations/show.php?id=${id}`, 'GET', null, token);
            setFormData({
                brand: data.brand || '',
                type: data.type || 'inne',
                amount_net: data.amount_net || 0,
                amount_gross: data.amount_gross || 0,
                date: data.date || '',
                payment_status: data.payment_status || 'pending',
                notes: data.notes || '',
                team: data.team ? data.team.map(m => ({ name: m.name, role: m.role, amount: m.amount })) : []
            });
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

    const addTeamMember = () => {
        setFormData(prev => ({
            ...prev,
            team: [...prev.team, { name: '', role: 'Fotograf', amount: '' }]
        }));
    };

    const removeTeamMember = (index) => {
        setFormData(prev => ({
            ...prev,
            team: prev.team.filter((_, i) => i !== index)
        }));
    };

    const handleTeamChange = (index, field, value) => {
        const newTeam = [...formData.team];
        newTeam[index][field] = value;
        setFormData(prev => ({ ...prev, team: newTeam }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            await apiRequest(`/collaborations/update.php?id=${id}`, 'PUT', formData, token);
            navigate(`/collaborations/${id}`);
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
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Edytuj zlecenie
                </h1>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
                {error && <div className="bg-red-50 text-red-500 p-4 rounded-xl">{error}</div>}

                {/* Main Info */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="font-semibold text-gray-800">Szczegóły współpracy</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Marka / Klient</label>
                            <input
                                type="text"
                                name="brand"
                                value={formData.brand}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                            <select
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                <option value="post-instagram">Post Instagram</option>
                                <option value="story">Stories</option>
                                <option value="reel">Reels</option>
                                <option value="sesja">Sesja zdjęciowa</option>
                                <option value="event">Event</option>
                                <option value="konsultacja">Konsultacja</option>
                                <option value="inne">Inne</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>
                    </div>
                </div>

                {/* Financials */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="font-semibold text-gray-800">Finanse</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kwota Netto</label>
                            <input
                                type="number"
                                name="amount_net"
                                value={formData.amount_net}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kwota Brutto</label>
                            <input
                                type="number"
                                name="amount_gross"
                                value={formData.amount_gross}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status płatności</label>
                            <div className="flex gap-2">
                                {['pending', 'paid', 'overdue'].map(status => (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={() => handleChange({ target: { name: 'payment_status', value: status } })}
                                        className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border
                                            ${formData.payment_status === status
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        {{
                                            pending: 'Oczekująca',
                                            paid: 'Opłacona',
                                            overdue: 'Zaległa'
                                        }[status]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Team Members */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Zespół</h2>
                        <button type="button" onClick={addTeamMember} className="text-primary hover:bg-primary/10 p-1 rounded-lg transition-colors">
                            <Plus size={20} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {formData.team.map((member, index) => (
                            <div key={index} className="flex gap-2 items-start">
                                <div className="flex-1 space-y-2">
                                    <input
                                        placeholder="Imię i Nazwisko"
                                        value={member.name}
                                        onChange={e => handleTeamChange(index, 'name', e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200"
                                    />
                                </div>
                                <div className="w-1/3">
                                    <input
                                        type="number"
                                        placeholder="Koszt"
                                        value={member.amount}
                                        onChange={e => handleTeamChange(index, 'amount', e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200"
                                    />
                                </div>
                                <button type="button" onClick={() => removeTeamMember(index)} className="p-2 text-gray-400 hover:text-red-500">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notatki</label>
                    <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 h-24 resize-none"
                    ></textarea>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white py-4 rounded-xl font-bold
                             shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                >
                    {saving ? 'Zapisywanie...' : (
                        <>
                            <Save size={20} />
                            Zapisz zmiany
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
