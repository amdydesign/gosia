import { useState } from 'react';
import { Download, X, FileText, Lock, Archive } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ExportModal({ isOpen, onClose }) {
    const { token } = useAuth();
    const [mode, setMode] = useState('official');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleDownload = async () => {
        setLoading(true);
        setError('');

        try {
            // Append token to URL as fallback for servers that strip Auth headers on file downloads
            const downloadUrl = `${import.meta.env.VITE_API_URL || '/api'}/collaborations/export.php?mode=${mode}&token=${token}`;

            const response = await fetch(downloadUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Błąd pobierania');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wspolprace_${new Date().getFullYear()}_${mode}.csv`; // Dynamic filename
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            onClose();
        } catch (err) {
            setError('Nie udało się pobrać pliku. Spróbuj ponownie.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative animate-scaleIn">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                >
                    <X size={20} />
                </button>

                <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-blue-50 p-3 rounded-2xl text-blue-600">
                            <Download size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Eksportuj dane</h2>
                            <p className="text-sm text-gray-500">Wybierz format raportu</p>
                        </div>
                    </div>

                    <div className="space-y-3 mb-8">
                        <button
                            onClick={() => setMode('official')}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 group
                                ${mode === 'official'
                                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                                    : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'}`}
                        >
                            <div className={`p-2 rounded-lg ${mode === 'official' ? 'bg-white text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                <FileText size={20} />
                            </div>
                            <div>
                                <div className="font-bold">Oficjalne (PIT)</div>
                                <div className="text-xs opacity-70">Tylko faktury i umowy</div>
                            </div>
                            <div className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center
                                ${mode === 'official' ? 'border-blue-500' : 'border-gray-300'}`}>
                                {mode === 'official' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                            </div>
                        </button>

                        <button
                            onClick={() => setMode('full')}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 group
                                ${mode === 'full'
                                    ? 'border-purple-500 bg-purple-50 text-purple-900'
                                    : 'border-gray-100 hover:border-purple-200 hover:bg-gray-50'}`}
                        >
                            <div className={`p-2 rounded-lg ${mode === 'full' ? 'bg-white text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                                <Archive size={20} />
                            </div>
                            <div>
                                <div className="font-bold">Pełny raport</div>
                                <div className="text-xs opacity-70">Oficjalne + Prywatne (2 sekcje)</div>
                            </div>
                            <div className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center
                                ${mode === 'full' ? 'border-purple-500' : 'border-gray-300'}`}>
                                {mode === 'full' && <div className="w-2 h-2 bg-purple-500 rounded-full" />}
                            </div>
                        </button>

                        <button
                            onClick={() => setMode('private')}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 group
                                ${mode === 'private'
                                    ? 'border-green-500 bg-green-50 text-green-900'
                                    : 'border-gray-100 hover:border-green-200 hover:bg-gray-50'}`}
                        >
                            <div className={`p-2 rounded-lg ${mode === 'private' ? 'bg-white text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                <Lock size={20} />
                            </div>
                            <div>
                                <div className="font-bold">Tylko prywatne</div>
                                <div className="text-xs opacity-70">Gotówka i nieformalne</div>
                            </div>
                            <div className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center
                                ${mode === 'private' ? 'border-green-500' : 'border-gray-300'}`}>
                                {mode === 'private' && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                            </div>
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-500 text-sm p-3 rounded-lg mb-4 text-center">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        disabled={loading}
                        className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl shadow-lg shadow-gray-200 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-70 disabled:hover:scale-100"
                    >
                        {loading ? 'Pobieranie...' : 'Pobierz .csv'}
                    </button>
                </div>
            </div>
        </div>
    );
}
