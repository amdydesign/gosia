import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import statsService from '../services/stats';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/Skeleton';
import { AuthShell } from './Login';

export default function SocialCallback() {
    const [searchParams] = useSearchParams();
    const { platform } = useParams();
    const navigate = useNavigate();
    const code = searchParams.get('code');
    const oauthError = searchParams.get('error');
    const [status, setStatus] = useState(() => (oauthError || !code ? 'error' : 'processing'));
    const [message, setMessage] = useState(() =>
        oauthError ? 'Logowanie zostało anulowane lub platforma zwróciła błąd.' : !code ? 'Brak kodu autoryzacji.' : 'Łączenie z usługą…'
    );

    useEffect(() => {
        if (!code || oauthError) return undefined;
        let cancelled = false;

        (async () => {
            try {
                const targetPlatform = platform || 'youtube';
                const res = await statsService.exchangeSocialCode(targetPlatform, code);
                if (cancelled) return;
                if (res.success) {
                    setStatus('success');
                    setMessage(`Połączono z ${targetPlatform}. ${res.data?.channel ? `Konto: ${res.data.channel}` : ''}`);
                } else {
                    setStatus('error');
                    setMessage(res.message || 'Wystąpił błąd podczas wymiany tokena.');
                }
            } catch {
                if (!cancelled) {
                    setStatus('error');
                    setMessage('Błąd komunikacji z serwerem.');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [code, oauthError, platform]);

    return (
        <AuthShell>
            <div className="text-center">
                {status === 'processing' && (
                    <>
                        <Spinner size={36} className="mx-auto mb-5" />
                        <h2 className="text-xl font-extrabold text-ink tracking-tight">Autoryzacja…</h2>
                        <p className="text-sm text-ink-muted mt-1">Trwa łączenie z kontem {platform}.</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <CheckCircle2 size={44} className="mx-auto text-emerald-500 mb-4" />
                        <h2 className="text-xl font-extrabold text-ink tracking-tight">Połączono</h2>
                        <p className="text-sm text-ink-soft mt-1 mb-6 whitespace-pre-line">{message}</p>
                        <Button variant="primary" block onClick={() => navigate('/statistics')}>Wróć do statystyk</Button>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <XCircle size={44} className="mx-auto text-red-500 mb-4" />
                        <h2 className="text-xl font-extrabold text-ink tracking-tight">Nie udało się</h2>
                        <p className="text-sm text-ink-soft mt-1 mb-6">{message}</p>
                        <Button variant="secondary" block onClick={() => navigate('/statistics')}>Wróć</Button>
                    </>
                )}
            </div>
        </AuthShell>
    );
}
