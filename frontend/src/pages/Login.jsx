import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Eye, EyeOff, ScanFace } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Logo from '../components/ui/Logo';
import {
    declinePasskeyOffer,
    isCancelled,
    loginWithPasskey,
    passkeyOnThisDevice,
    passkeysSupported,
    registerPasskey,
    shouldOfferPasskey,
} from '../services/passkeys';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [faceId, setFaceId] = useState(false); // this device can do Face ID / Touch ID
    const [offer, setOffer] = useState(false); // after a password login: "Logować się Face ID?"

    const { login, loginWithUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    useEffect(() => {
        passkeysSupported().then(setFaceId);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password, rememberMe);
            if (faceId && shouldOfferPasskey()) {
                setOffer(true);
                return;
            }
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Nieprawidłowy login lub hasło');
        } finally {
            setLoading(false);
        }
    };

    const handleFaceId = async () => {
        setError('');
        setLoading(true);
        try {
            const user = await loginWithPasskey();
            loginWithUser(user);
            navigate(from, { replace: true });
        } catch (err) {
            if (!isCancelled(err)) setError(err.message || 'Nie udało się zalogować Face ID. Zaloguj się hasłem.');
        } finally {
            setLoading(false);
        }
    };

    const enableFaceId = async () => {
        setLoading(true);
        try {
            await registerPasskey();
        } catch (err) {
            if (!isCancelled(err)) declinePasskeyOffer();
        } finally {
            setLoading(false);
            navigate(from, { replace: true });
        }
    };

    if (offer) {
        return (
            <AuthShell>
                <div className="text-center">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mb-4">
                        <ScanFace size={28} />
                    </div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Logować się Face ID?</h1>
                    <p className="text-sm text-ink-muted mt-1 mb-6">Bez wpisywania hasła — wystarczy spojrzeć na telefon.</p>
                    <Button variant="primary" size="lg" block icon={ScanFace} loading={loading} onClick={enableFaceId}>
                        Włącz Face ID
                    </Button>
                    <button
                        type="button"
                        onClick={() => {
                            declinePasskeyOffer();
                            navigate(from, { replace: true });
                        }}
                        className="mt-3 w-full h-11 text-sm font-semibold text-ink-muted hover:text-ink"
                    >
                        Nie teraz
                    </button>
                </div>
            </AuthShell>
        );
    }

    const faceIdFirst = faceId && passkeyOnThisDevice();

    return (
        <AuthShell>
            <div className="text-center mb-8">
                <div className="flex justify-center mb-5">
                    <Logo size="lg" />
                </div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Cześć, Gosia</h1>
                <p className="text-sm text-ink-muted mt-1">Zaloguj się do swojego panelu</p>
            </div>

            {error && <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{error}</div>}

            {faceIdFirst && (
                <>
                    <Button variant="primary" size="lg" block icon={ScanFace} loading={loading} onClick={handleFaceId}>
                        Zaloguj Face ID
                    </Button>
                    <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
                        <span className="h-px flex-1 bg-line" /> albo hasłem <span className="h-px flex-1 bg-line" />
                    </div>
                </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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

                <Button type="submit" variant={faceIdFirst ? 'secondary' : 'primary'} size="lg" block icon={LogIn} loading={loading && !faceIdFirst}>
                    Zaloguj się
                </Button>
            </form>
        </AuthShell>
    );
}

export function AuthShell({ children }) {
    return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-canvas">
            <div className="w-full max-w-sm bg-surface rounded-[28px] border border-line p-7 sm:p-9 animate-scale-in">{children}</div>
        </div>
    );
}
