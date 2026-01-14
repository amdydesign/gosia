import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Edit2, User, Calendar, DollarSign, CheckCircle, Clock, Trash2, Wallet, Lock, Building2 } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate, getCollabTypeLabel, BILLING_TYPES, calculateNetAmount } from '../../utils/format';

export default function CollaborationView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [collab, setCollab] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadCollab();
    }, [id]);

    const loadCollab = async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/collaborations/show.php?id=${id}`, 'GET', null, token);
            setCollab(data);
        } catch (err) {
            setError(err.message || 'Błąd ładowania');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Ładowanie...</div>;
    if (error) return <div className="error">{error}</div>;
    if (!collab) return null;

    const billingInfo = BILLING_TYPES[collab.collab_type] || {};
    const netToHand = calculateNetAmount(collab.amount_gross || collab.amount_net, collab.collab_type);

    return (
        <div className="max-w-2xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <header className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <div className="flex gap-2">
                    <Link
                        to={`/collaborations/${id}/edit`}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Edit2 size={24} />
                    </Link>
                    <button
                        onClick={async () => {
                            if (window.confirm('Czy na pewno chcesz usunąć tę współpracę?')) {
                                try {
                                    await apiRequest(`/collaborations/delete.php?id=${id}`, 'DELETE', null, token);
                                    navigate('/collaborations');
                                } catch (err) {
                                    alert(err.message || 'Błąd usuwania');
                                }
                            }
                        }}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 size={24} />
                    </button>
                </div>
            </header>

            {/* Main Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-purple-50 to-transparent pointer-events-none" />

                <div className="relative z-10">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{collab.brand}</h1>
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
                            {getCollabTypeLabel(collab.type)}
                        </span>
                        {billingInfo.label && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                                {billingInfo.label}
                            </span>
                        )}
                    </div>

                    <div className="flex justify-center gap-8 text-gray-600 mb-8">
                        <div className="flex flex-col items-center gap-1">
                            <Calendar size={20} className="text-gray-400" />
                            <span className="font-medium">{formatDate(collab.date)}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            {collab.payment_status === 'paid' ? (
                                <CheckCircle size={20} className="text-green-500" />
                            ) : (
                                <Clock size={20} className="text-orange-500" />
                            )}
                            <span className="font-medium capitalize">{collab.payment_status === 'paid' ? 'Opłacone' : 'Oczekujące'}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto mb-4">
                        <div className="bg-gray-50 p-4 rounded-2xl">
                            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Netto</div>
                            <div className="text-xl font-bold text-gray-900">{formatCurrency(collab.amount_net)}</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl">
                            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Brutto</div>
                            <div className="text-xl font-bold text-gray-900">{formatCurrency(collab.amount_gross)}</div>
                        </div>
                    </div>

                    {/* Na rękę highlighting */}
                    {billingInfo.label && (
                        <div className="max-w-sm mx-auto bg-green-50 rounded-xl p-3 border border-green-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                                <Wallet size={16} />
                                {collab.collab_type === 'gotowka' ? 'Otrzymujesz:' : 'Na rękę (szacunkowo):'}
                            </div>
                            <div className="text-lg font-bold text-green-800">
                                {formatCurrency(netToHand)}
                            </div>
                        </div>
                    )}

                    {/* Fiscal status */}
                    <div className="mt-4 flex justify-center">
                        {collab.fiscal_tracking ? (
                            <div className="flex items-center gap-2 text-xs text-purple-600 px-3 py-1 bg-purple-50 rounded-full border border-purple-100">
                                <Building2 size={12} />
                                Wliczane do PIT (Oficjalne)
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-xs text-gray-500 px-3 py-1 bg-gray-50 rounded-full border border-gray-200">
                                <Lock size={12} />
                                Transakcja prywatna (Poza PIT)
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Team Section */}
            {collab.team && collab.team.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <User size={20} />
                        Zespół
                    </h2>
                    <div className="space-y-3">
                        {collab.team.map((member, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-gray-400 font-bold border border-gray-200">
                                        {member.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900">{member.name}</div>
                                        {member.is_paid && (
                                            <div className="text-[10px] text-green-600 flex items-center gap-1 font-bold uppercase tracking-wide">
                                                <CheckCircle size={10} /> Opłacono
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="font-mono text-gray-600">
                                    {formatCurrency(member.amount)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            {collab.notes && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-2">Notatki</h2>
                    <p className="text-gray-600 whitespace-pre-line">{collab.notes}</p>
                </div>
            )}
        </div>
    );
}
