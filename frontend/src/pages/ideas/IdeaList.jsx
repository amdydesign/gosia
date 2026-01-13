import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ideasService from '../../services/ideas';
import { Plus, Lightbulb, CheckCircle, Clock } from 'lucide-react';

export default function IdeaList() {
    const { token } = useAuth();
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all'); // all, draft, recorded

    useEffect(() => {
        loadIdeas();
    }, [filter]);

    const loadIdeas = async () => {
        try {
            setLoading(true);
            const data = await ideasService.getAll(token, filter);
            setIdeas(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Błąd ładowania pomysłów');
            setIdeas([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pomysły na rolki</h1>
                    <p className="text-gray-500">Twoje scenariusze i inspiracje</p>
                </div>
                <Link
                    to="/ideas/new"
                    className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-purple-200 hover:shadow-xl hover:scale-105 transition-all w-fit"
                >
                    <Plus size={20} />
                    Dodaj pomysł
                </Link>
            </header>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {[
                    { value: 'all', label: 'Wszystkie' },
                    { value: 'draft', label: 'Do zrobienia' },
                    { value: 'recorded', label: 'Nagrane' },
                ].map(f => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
                            ${filter === f.value
                                ? 'bg-gray-900 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="loading">Ładowanie...</div>
            ) : ideas.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-gray-100">
                    <div className="text-4xl mb-4">💡</div>
                    <h3 className="text-lg font-semibold text-gray-900">Brak pomysłów</h3>
                    <p className="text-gray-500 mb-6">Dodaj swój pierwszy scenariusz na rolkę.</p>
                    <Link
                        to="/ideas/new"
                        className="inline-flex items-center gap-2 text-purple-600 font-bold hover:underline"
                    >
                        <Plus size={18} /> Dodaj teraz
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {ideas.map(idea => (
                        <Link
                            key={idea.id}
                            to={`/ideas/${idea.id}`}
                            className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-purple-300 hover:shadow-md transition-all group flex flex-col h-full"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-100 transition-colors">
                                    <Lightbulb size={20} />
                                </div>
                                {idea.status === 'recorded' ? (
                                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md flex items-center gap-1">
                                        <CheckCircle size={10} /> Nagrane
                                    </span>
                                ) : (
                                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-md flex items-center gap-1">
                                        <Clock size={10} /> Do zrobienia
                                    </span>
                                )}
                            </div>

                            <h3 className="font-bold text-lg text-gray-900 mb-2 group-hover:text-purple-700 transition-colors line-clamp-2">
                                {idea.title}
                            </h3>

                            <p className="text-gray-500 text-sm line-clamp-3 mb-4 flex-grow">
                                {idea.content || <span className="italic opacity-50">Brak treści scenariusza...</span>}
                            </p>

                            <div className="text-xs text-gray-400 pt-4 border-t border-gray-50 mt-auto">
                                Utworzono: {new Date(idea.created_at).toLocaleDateString()}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
