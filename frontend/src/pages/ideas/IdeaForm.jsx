import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ideasService from '../../services/ideas';
import { Save, ArrowLeft } from 'lucide-react';

export default function IdeaForm() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        status: 'draft'
    });
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!id);
    const [error, setError] = useState('');

    useEffect(() => {
        if (id) {
            loadIdea();
        }
    }, [id]);

    const loadIdea = async () => {
        try {
            const data = await ideasService.getOne(token, id);
            setFormData({
                title: data.title,
                content: data.content,
                status: data.status
            });
        } catch (err) {
            setError('Błąd ładowania danych');
        } finally {
            setInitialLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (id) {
                await ideasService.update(token, id, formData);
            } else {
                await ideasService.create(token, formData);
            }
            navigate('/ideas');
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            setLoading(false);
        }
    };

    if (initialLoading) return <div className="loading">Ładowanie...</div>;

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <header className="flex items-center gap-4">
                <Link to="/ideas" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-gray-600" />
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">
                    {id ? 'Edytuj pomysł' : 'Nowy pomysł'}
                </h1>
            </header>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Tytuł / Temat
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none text-lg font-medium"
                        placeholder="np. 3 błędy w stylizacji..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Scenariusz (Tekst do promptera)
                    </label>
                    <textarea
                        value={formData.content}
                        onChange={e => setFormData({ ...formData, content: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all outline-none min-h-[300px] text-base leading-relaxed"
                        placeholder="Wpisz tutaj tekst, który będziesz czytać podczas nagrywania..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                        Status
                    </label>
                    <div className="flex gap-4">
                        <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.status === 'draft' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-100 hover:border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                                <input
                                    type="radio"
                                    name="status"
                                    value="draft"
                                    checked={formData.status === 'draft'}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="hidden"
                                />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.status === 'draft' ? 'border-purple-500' : 'border-gray-300'}`}>
                                    {formData.status === 'draft' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                                </div>
                                <span className="font-bold">Do zrobienia</span>
                            </div>
                        </label>

                        <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.status === 'recorded' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 hover:border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                                <input
                                    type="radio"
                                    name="status"
                                    value="recorded"
                                    checked={formData.status === 'recorded'}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="hidden"
                                />
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.status === 'recorded' ? 'border-green-500' : 'border-gray-300'}`}>
                                    {formData.status === 'recorded' && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                                </div>
                                <span className="font-bold">Nagrane</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                    <Link
                        to="/ideas"
                        className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Anuluj
                    </Link>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-purple-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={20} />
                        {loading ? 'Zapisywanie...' : 'Zapisz'}
                    </button>
                </div>
            </form>
        </div>
    );
}
