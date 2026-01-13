import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ideasService from '../../services/ideas';
import { ArrowLeft, Edit2, Play, CheckCircle, Trash2, X, Type } from 'lucide-react';

export default function IdeaView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();

    const [idea, setIdea] = useState(null);
    const [loading, setLoading] = useState(true);
    const [prompterMode, setPrompterMode] = useState(false);
    const [fontSize, setFontSize] = useState(36); // Prompter font size

    useEffect(() => {
        loadIdea();
    }, [id]);

    const loadIdea = async () => {
        try {
            const data = await ideasService.getOne(token, id);
            setIdea(data);
        } catch (err) {
            navigate('/ideas');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRecorded = async () => {
        try {
            await ideasService.update(token, id, { status: 'recorded' });
            setIdea({ ...idea, status: 'recorded' });
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Czy na pewno chcesz usunąć ten pomysł?')) {
            try {
                await ideasService.delete(token, id);
                navigate('/ideas');
            } catch (err) {
                console.error(err);
            }
        }
    };

    if (loading) return <div className="loading">Ładowanie...</div>;
    if (!idea) return null;

    // --- PROMPTER MODE ---
    if (prompterMode) {
        return (
            <div className="fixed inset-0 bg-black z-50 overflow-y-auto min-h-screen flex flex-col">
                {/* Prompter Controls */}
                <div className="fixed top-0 left-0 right-0 p-4 bg-black/80 backdrop-blur-sm flex justify-between items-center border-b border-gray-800 z-50">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setPrompterMode(false)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={32} />
                        </button>
                        <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1">
                            <button
                                onClick={() => setFontSize(s => Math.max(18, s - 4))}
                                className="p-2 text-gray-400 hover:text-white"
                            >
                                <Type size={16} />
                            </button>
                            <span className="text-gray-500 text-xs w-8 text-center">{fontSize}</span>
                            <button
                                onClick={() => setFontSize(s => Math.min(72, s + 4))}
                                className="p-2 text-gray-400 hover:text-white"
                            >
                                <Type size={24} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Prompter Content */}
                <div className="flex-grow flex items-center justify-center p-8 pt-24 pb-32">
                    <div
                        className="text-white font-sans leading-relaxed max-w-4xl mx-auto text-center whitespace-pre-wrap"
                        style={{ fontSize: `${fontSize}px` }}
                    >
                        {idea.content}
                    </div>
                </div>
            </div>
        );
    }

    // --- STANDARD MODE ---
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link to="/ideas" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <ArrowLeft size={24} className="text-gray-600" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            {idea.status === 'recorded' && (
                                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                                    <CheckCircle size={12} /> Nagrane
                                </span>
                            )}
                            <span className="text-gray-400 text-xs">Utworzono: {new Date(idea.created_at).toLocaleDateString()}</span>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">{idea.title}</h1>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Link
                        to={`/ideas/${id}/edit`}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Edit2 size={20} />
                    </Link>
                    <button
                        onClick={handleDelete}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 size={20} />
                    </button>
                </div>
            </header>

            {/* Main Content Card */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 md:p-8 min-h-[300px] text-lg leading-relaxed text-gray-700 whitespace-pre-wrap">
                    {idea.content || <span className="text-gray-400 italic">Brak treści scenariusza. Kliknij edytuj aby dodać tekst.</span>}
                </div>
            </div>

            {/* Actions Bar (Sticky Bottom on Mobile) */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 md:static md:bg-transparent md:border-0 md:backdrop-blur-none flex flex-row gap-3 z-10 safe-area-bottom">
                <button
                    onClick={() => setPrompterMode(true)}
                    className="flex-1 bg-black text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-gray-900 hover:scale-[1.02] transition-all text-lg"
                >
                    <Play size={24} fill="currentColor" />
                    <span className="truncate">PROMPTER</span>
                </button>

                {idea.status !== 'recorded' && (
                    <button
                        onClick={handleMarkAsRecorded}
                        className="flex-none bg-green-50 text-green-600 border-2 border-green-500 px-4 py-3 rounded-xl font-bold hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
                        title="Oznacz jako nagrane"
                    >
                        <CheckCircle size={24} />
                        <span className="hidden sm:inline">Nagrane</span>
                    </button>
                )}
            </div>
            {/* Spacer for sticky bottom on mobile */}
            <div className="h-24 md:h-0" />
        </div>
    );
}
