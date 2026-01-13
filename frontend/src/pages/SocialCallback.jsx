import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import statsService from '../services/stats';

export default function SocialCallback() {
    const [searchParams] = useSearchParams();
    const { platform } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('processing');
    const [message, setMessage] = useState('Łączenie z usługą...');
    const [processed, setProcessed] = useState(false);

    useEffect(() => {
        if (processed) return;

        const code = searchParams.get('code');
        const error = searchParams.get('error');

        if (error) {
            setStatus('error');
            setMessage('Użytkownik anulował logowanie lub wystąpił błąd po stronie platformy.');
            setProcessed(true);
            return;
        }

        if (!code) {
            setStatus('error');
            setMessage('Brak kodu autoryzacji.');
            setProcessed(true);
            return;
        }

        const exchange = async () => {
            try {
                // Determine platform from URL param or default
                const targetPlatform = platform || 'youtube';

                const res = await statsService.exchangeSocialCode(targetPlatform, code);
                if (res.success) {
                    setStatus('success');
                    setMessage(`Pomyślnie połączono z ${targetPlatform === 'youtube' ? 'YouTube' : targetPlatform}!\nKonto: ${res.data?.channel || ''}`);
                } else {
                    setStatus('error');
                    setMessage(res.message || 'Wystąpił błąd podczas wymiany tokena.');
                }
            } catch (err) {
                console.error(err);
                setStatus('error');
                setMessage('Błąd komunikacji z serwerem.');
            } finally {
                setProcessed(true);
            }
        };

        exchange();
    }, [searchParams, platform, processed]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
                {status === 'processing' && (
                    <>
                        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Autoryzacja...</h2>
                        <p className="text-gray-500">Trwa łączenie z kontem {platform}...</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <div className="text-green-500 text-5xl mb-4">✅</div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Sukces!</h2>
                        <p className="text-gray-500 mb-6 whitespace-pre-line">{message}</p>
                        <button onClick={() => navigate('/statistics')} className="bg-primary text-white px-6 py-2 rounded-xl w-full hover:bg-purple-700 transition-colors">
                            Wróć do statystyk
                        </button>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <div className="text-red-500 text-5xl mb-4">❌</div>
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Błąd</h2>
                        <p className="text-gray-500 mb-6">{message}</p>
                        <button onClick={() => navigate('/statistics')} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-xl w-full hover:bg-gray-200 transition-colors">
                            Wróć
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
