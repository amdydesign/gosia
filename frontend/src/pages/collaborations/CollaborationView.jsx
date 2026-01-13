import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Edit2, User, Calendar, DollarSign, CheckCircle, Clock } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate, getCollabTypeLabel } from '../../utils/format';

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

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <Link
                    to={`/collaborations/${id}/edit`}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                >
                    <Edit2 size={16} />
                    Edytuj
                </Link>
            </header>

            {/* Main Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-purple-50 to-transparent pointer-events-none" />

                <div className="relative z-10">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{collab.brand}</h1>
                    <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium mb-6">
                        {getCollabTypeLabel(collab.type)}
                    </span>

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

                    <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                        <div className="bg-gray-50 p-4 rounded-2xl">
                            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Netto</div>
                            <div className="text-xl font-bold text-gray-900">{formatCurrency(collab.amount_net)}</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-2xl">
                            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Brutto</div>
                            <div className="text-xl font-bold text-gray-900">{formatCurrency(collab.amount_gross)}</div>
                        </div>
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
