import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Plus, Trash2, Save, Lock, Wallet, Info } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { BILLING_TYPES, getTaxBreakdown, formatCurrency } from '../../utils/format';

export default function CollaborationNew() {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        brand: '',
        type: 'post-instagram',
        collab_type: 'umowa_50',
        fiscal_tracking: true,
        // amount_net will be calculated automatically on submit
        amount_gross: '',
        date: new Date().toISOString().split('T')[0],
        payment_status: 'pending',
        notes: '',
        team: [] // { name, role, amount }
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;

        setFormData(prev => {
            const newData = { ...prev, [name]: val };

            // Auto-set fiscal_tracking logic
            if (name === 'collab_type') {
                if (value === 'gotowka') {
                    newData.fiscal_tracking = false;
                    // Reset payment status for cash if needed, or default to received?
                    newData.payment_status = 'paid'; // Usually cash is paid on spot? Or use 'pending' as default. User said 'Otrzymana, Oczekująca' buttons.
                } else {
                    newData.fiscal_tracking = true;
                    newData.payment_status = 'pending';
                }
            }
            return newData;
        });
    };

    const addTeamMember = () => {
        setFormData(prev => ({
            ...prev,
            team: [...prev.team, { name: '', role: 'Fotograf', amount: '', is_paid: false }]
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
        setLoading(true);
        setError('');

        // Calculate Net Amount before submit
        const breakdown = getTaxBreakdown(formData.amount_gross, formData.collab_type);

        const submitData = {
            ...formData,
            amount_net: breakdown.net, // This is the "Na rękę" amount
            amount_gross: parseFloat(formData.amount_gross || 0),
            fiscal_tracking: formData.collab_type !== 'gotowka'
        };

        try {
            await apiRequest('/collaborations/create.php', 'POST', submitData, token);
            navigate('/collaborations');
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
        } finally {
            setLoading(false);
        }
    };

    const breakdown = useMemo(() => {
        return getTaxBreakdown(formData.amount_gross, formData.collab_type);
    }, [formData.amount_gross, formData.collab_type]);

    const isUseme = formData.collab_type.startsWith('useme');
    const isCash = formData.collab_type === 'gotowka';

    return (
        <div className="max-w-2xl mx-auto pb-20">
            <header className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    Nowe zlecenie
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">Typ Zlecenia</label>
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

                {/* Financials - NEW REDESIGN */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Wallet size={20} className="text-primary" />
                        Finanse i Rozliczenie
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Typ Rozliczenia</label>
                            <select
                                name="collab_type"
                                value={formData.collab_type}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {Object.entries(BILLING_TYPES).map(([key, config]) => (
                                    <option key={key} value={key}>
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Gotówka Info Box */}
                        {isCash && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-600">
                                <div className="flex items-center gap-2 mb-1 font-semibold text-gray-800">
                                    <Lock size={16} /> Współpraca nieformalna
                                </div>
                                <p>Ta transakcja nie jest wliczana do oficjalnych rozliczeń podatkowych (PIT).</p>
                            </div>
                        )}

                        {/* INPUT - Only Gross */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {isCash ? 'Kwota otrzymana (gotówka)' : 'Kwota umówiona (brutto)'}
                            </label>
                            <input
                                type="number"
                                name="amount_gross"
                                value={formData.amount_gross}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg font-medium"
                                placeholder="0.00"
                            />
                        </div>


                        {/* BREAKDOWN BOX (Read Only) */}
                        <div className="bg-[#f8f9fa] border border-gray-200 rounded-xl overflow-hidden">
                            {/* CASH VIEW */}
                            {isCash && (
                                <div className="p-4 text-center">
                                    <div className="text-green-600 font-bold text-xl mb-1 flex items-center justify-center gap-2">
                                        💵 Otrzymujesz: {formatCurrency(breakdown.net)}
                                    </div>
                                    <div className="text-xs text-gray-400 font-medium">
                                        Bez odliczeń - kwota do ręki
                                    </div>
                                </div>
                            )}

                            {/* STANDARD VIEW (Umowa) */}
                            {!isCash && !isUseme && (
                                <div className="p-4 space-y-2">
                                    <div className="flex justify-between text-sm text-gray-500">
                                        <span>Kwota brutto:</span>
                                        <span>{formatCurrency(breakdown.gross)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>KUP ({BILLING_TYPES[formData.collab_type]?.kup * 100}%):</span>
                                        <span>-{formatCurrency(breakdown.details.kup)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>Podstawa opodatkowania:</span>
                                        <span>{formatCurrency(breakdown.details.taxBase)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                        <span>Zaliczka na podatek (12%):</span>
                                        <span>-{formatCurrency(breakdown.details.tax)}</span>
                                    </div>
                                    <hr className="border-gray-200 my-2" />
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-700 font-bold text-lg">💵 Na rękę:</span>
                                        <span className="text-green-700 font-bold text-xl">{formatCurrency(breakdown.net)}</span>
                                    </div>
                                </div>
                            )}

                            {/* USE.ME VIEW */}
                            {isUseme && (
                                <div className="p-4 space-y-3">
                                    {/* Step 1 */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-sm text-gray-500">
                                            <span>Kwota brutto:</span>
                                            <span>{formatCurrency(breakdown.gross)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>Prowizja Use.me (7.8%):</span>
                                            <span>-{formatCurrency(breakdown.details.commission)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm font-medium text-gray-700 pt-1">
                                            <span>Po prowizji:</span>
                                            <span>{formatCurrency(breakdown.details.afterCommission)}</span>
                                        </div>
                                    </div>

                                    <div className="border-b border-dotted border-gray-300"></div>

                                    {/* Step 2 */}
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>KUP ({BILLING_TYPES[formData.collab_type]?.kup * 100}%):</span>
                                            <span>-{formatCurrency(breakdown.details.kup)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>Podstawa opodatkowania:</span>
                                            <span>{formatCurrency(breakdown.details.taxBase)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>Zaliczka na podatek (12%):</span>
                                            <span>-{formatCurrency(breakdown.details.tax)}</span>
                                        </div>
                                    </div>

                                    <div className="border-b border-gray-200"></div>

                                    {/* Final */}
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-700 font-bold text-lg">💵 Na rękę:</span>
                                        <span className="text-green-700 font-bold text-xl">{formatCurrency(breakdown.net)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Use.me Info */}
                        {isUseme && (
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-start gap-3">
                                <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-blue-700">
                                    <strong>Info:</strong> Use.me wyśle PIT-11 w lutym 2027.
                                </div>
                            </div>
                        )}

                        {/* Status Buttons */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status płatności</label>
                            <div className="flex gap-2">
                                {isCash ? (
                                    // Cash buttons: Otrzymana, Oczekująca
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => handleChange({ target: { name: 'payment_status', value: 'paid' } })}
                                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border
                                                ${formData.payment_status === 'paid'
                                                    ? 'bg-green-600 text-white border-green-600'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            Otrzymana
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleChange({ target: { name: 'payment_status', value: 'pending' } })}
                                            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border
                                                ${formData.payment_status === 'pending'
                                                    ? 'bg-yellow-500 text-white border-yellow-500'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            Oczekująca
                                        </button>
                                    </>
                                ) : (
                                    // Standard buttons
                                    ['pending', 'paid', 'overdue'].map(status => (
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
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                </div>

                {/* Team Members */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Zespół (opcjonalnie)</h2>
                        <button type="button" onClick={addTeamMember} className="text-primary hover:bg-primary/10 p-1 rounded-lg transition-colors">
                            <Plus size={20} />
                        </button>
                    </div>

                    {formData.team.length === 0 && (
                        <p className="text-sm text-gray-400 italic">Brak dodatkowych osób we współpracy.</p>
                    )}

                    <div className="space-y-3">
                        {formData.team.map((member, index) => (
                            <div key={index} className="flex gap-2 items-start bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <div className="flex-1 space-y-2">
                                    <input
                                        placeholder="Imię i Nazwisko"
                                        value={member.name}
                                        onChange={e => handleTeamChange(index, 'name', e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200"
                                    />
                                </div>
                                <div className="w-1/4">
                                    <input
                                        type="number"
                                        placeholder="Koszt"
                                        value={member.amount}
                                        onChange={e => handleTeamChange(index, 'amount', e.target.value)}
                                        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200"
                                    />
                                </div>
                                <div className="flex items-center pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none">
                                        <input
                                            type="checkbox"
                                            checked={member.is_paid || false}
                                            onChange={e => handleTeamChange(index, 'is_paid', e.target.checked)}
                                            className="w-4 h-4 rounded text-primary focus:ring-primary"
                                        />
                                        <span>Opłacono</span>
                                    </label>
                                </div>
                                <button type="button" onClick={() => removeTeamMember(index)} className="p-2 text-gray-400 hover:text-red-500 self-center">
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
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white py-4 rounded-xl font-bold
                             shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                >
                    {loading ? 'Zapisywanie...' : (
                        <>
                            <Save size={20} />
                            Zapisz współpracę
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
