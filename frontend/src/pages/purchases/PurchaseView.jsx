import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, Edit2, ShoppingBag, Calendar, ExternalLink, RotateCcw, Clock } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/format';

export default function PurchaseView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    const [purchase, setPurchase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadPurchase();
    }, [id]);

    const loadPurchase = async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/purchases/show.php?id=${id}`, 'GET', null, token);
            setPurchase(data);
        } catch (err) {
            setError(err.message || 'Błąd ładowania');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Ładowanie...</div>;
    if (error) return <div className="error">{error}</div>;
    if (!purchase) return null;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <header className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </button>
                <div className="flex gap-3">
                    {purchase.status !== 'returned' && (
                        <Link
                            to={`/purchases/${id}/edit?return=1`}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-xl hover:bg-orange-100 font-medium transition-colors"
                        >
                            <RotateCcw size={16} />
                            Zrób zwrot
                        </Link>
                    )}
                    <Link
                        to={`/purchases/${id}/edit`}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                    >
                        <Edit2 size={16} />
                        Edytuj
                    </Link>
                </div>
            </header>

            {/* Main Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-teal-50 to-transparent pointer-events-none" />

                <div className="relative z-10">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{purchase.store}</h1>
                    <p className="text-gray-600 mb-6">{purchase.items}</p>

                    <div className="flex justify-center gap-8 text-gray-600 mb-8">
                        <div className="flex flex-col items-center gap-1">
                            <Calendar size={20} className="text-gray-400" />
                            <span className="font-medium">
                                {purchase.purchase_date ? formatDate(purchase.purchase_date) : 'Data nieznana'}
                            </span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded text-sm font-medium capitalize
                                ${purchase.status === 'returned' ? 'bg-green-100 text-green-700' :
                                    purchase.status === 'kept' ? 'bg-gray-100 text-gray-700' : 'bg-orange-100 text-orange-700'}`}>
                                {purchase.status === 'kept' ? 'Zostawione' :
                                    purchase.status === 'returned' ? 'Zwrócone' : 'Częściowo'}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-center gap-4">
                        <div className="bg-gray-50 p-4 rounded-2xl min-w-[120px]">
                            <div className="text-gray-500 text-xs uppercase font-semibold mb-1">Koszt</div>
                            <div className="text-xl font-bold text-gray-900">
                                {formatCurrency(Number(purchase.amount))}
                            </div>
                        </div>
                        {Number(purchase.returned_amount) > 0 && (
                            <div className="bg-green-50 p-4 rounded-2xl min-w-[120px]">
                                <div className="text-green-600 text-xs uppercase font-semibold mb-1">Zwrócono</div>
                                <div className="text-xl font-bold text-green-700">
                                    {formatCurrency(Number(purchase.returned_amount))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Additional Info */}
            {/* Additional Info */}
            {(purchase.purchase_url || purchase.notes) && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    {purchase.purchase_url && (
                        <a
                            href={purchase.purchase_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-teal-600 hover:underline"
                        >
                            <ExternalLink size={16} />
                            Link do przedmiotu
                        </a>
                    )}

                    {purchase.notes && (
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-2">Notatki</h3>
                            <p className="text-gray-600 whitespace-pre-line">{purchase.notes}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Deadline Info */}
            {purchase.status === 'kept' && (
                <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 flex items-start gap-4">
                    <Clock className="text-orange-500 mt-1" />
                    <div>
                        <h3 className="font-bold text-orange-800 mb-1">Termin zwrotu</h3>
                        <p className="text-orange-700">
                            Masz czas do <strong>{formatDate(purchase.return_deadline)}</strong> na zwrot.
                            Pozostało <strong>{purchase.days_remaining} dni</strong>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
