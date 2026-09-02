import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Sparkles, LogIn, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password, rememberMe);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Nieprawidłowy login lub hasło');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell>
            <div className="text-center mb-8">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-float mb-4">
                    <Sparkles size={26} />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">Cześć, Gosia</h1>
                <p className="text-sm text-ink-muted mt-1">Zaloguj się do swojego panelu</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{error}</div>}

                <Field label="Login">
                    <input
                        type="text"
                        className="input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Twój login"
                        required
                        disabled={loading}
                        autoComplete="username"
                        autoCapitalize="none"
                    />
                </Field>

                <Field label="Hasło">
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            className="input !pr-11"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={loading}
                            autoComplete="current-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-ink-muted hover:text-ink"
                            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </Field>

                <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-ink-soft">
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-line-strong accent-primary-600" />
                        Nie wylogowuj mnie
                    </label>
                    <Link to="/forgot-password" className="font-semibold text-primary-700 hover:text-primary-800">
                        Nie pamiętam hasła
                    </Link>
                </div>

                <Button type="submit" variant="primary" size="lg" block icon={LogIn} loading={loading}>
                    Zaloguj się
                </Button>
            </form>
        </AuthShell>
    );
}

export function AuthShell({ children }) {
    return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-canvas relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary-200/50 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-secondary-light/70 blur-3xl pointer-events-none" />
            <div className="relative w-full max-w-sm bg-surface rounded-3xl shadow-card border border-line p-7 sm:p-9 animate-scale-in">{children}</div>
        </div>
    );
}
