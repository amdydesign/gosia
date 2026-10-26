import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { AuthShell } from './Login';

/** Link from the e-mail: new password, then straight into the app. */
export default function ResetPassword() {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { loginWithUser } = useAuth();
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) {
            setError('Hasło musi mieć co najmniej 8 znaków.');
            return;
        }
        setLoading(true);
        try {
            const data = await apiRequest('/auth/reset_password.php', 'POST', { token, password });
            loginWithUser(data.user);
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message || 'Nie udało się zmienić hasła');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell>
            <div className="text-center mb-8">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mb-4">
                    <KeyRound size={26} />
                </div>
                <h1 className="text-2xl font-display font-semibold tracking-tight text-ink">Nowe hasło</h1>
                <p className="text-sm text-ink-muted mt-1">Po zapisaniu od razu wejdziesz do aplikacji.</p>
            </div>
            {!token ? (
                <p className="text-sm text-ink-soft text-center">Ten link jest niepełny. Poproś o nowy na ekranie logowania.</p>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{error}</div>}
                    <Field label="Nowe hasło" hint="Co najmniej 8 znaków">
                        <div className="relative">
                            <input
                                type={show ? 'text' : 'password'}
                                className="input !pr-11"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                                disabled={loading}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShow((s) => !s)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-ink-muted hover:text-ink"
                                aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}
                            >
                                {show ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </Field>
                    <Button type="submit" variant="primary" size="lg" block loading={loading}>
                        Zapisz i wejdź
                    </Button>
                </form>
            )}
            <Link to="/login" className="mt-6 text-ink-muted hover:text-primary-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                <ArrowLeft size={16} /> Wróć do logowania
            </Link>
        </AuthShell>
    );
}
