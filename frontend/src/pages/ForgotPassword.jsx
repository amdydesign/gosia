import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, KeyRound } from 'lucide-react';
import api from '../services/api';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import { AuthShell } from './Login';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | success | error
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('loading');
        try {
            const response = await api.post('/auth/reset_password_request.php', { email });
            if (response.success) {
                setStatus('success');
                setMessage(response.message || 'Sprawdź swoją skrzynkę odbiorczą.');
            } else {
                throw new Error(response.message || 'Wystąpił błąd.');
            }
        } catch (err) {
            setStatus('error');
            setMessage(err.message || 'Wystąpił błąd podczas wysyłania żądania.');
        }
    };

    return (
        <AuthShell>
            <div className="text-center mb-8">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center mb-4">
                    <KeyRound size={26} />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">Reset hasła</h1>
                <p className="text-sm text-ink-muted mt-1">Podaj e-mail lub login, aby odzyskać dostęp.</p>
            </div>

            {status === 'success' ? (
                <div className="text-center animate-fade-in">
                    <div className="bg-emerald-50 w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-4">
                        <Send size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-ink mb-1">Wysłano!</h3>
                    <p className="text-sm text-ink-soft mb-6">{message}</p>
                    <Button to="/login" variant="primary" block>Wróć do logowania</Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {status === 'error' && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">{message}</div>}
                    <Field label="E-mail lub login">
                        <input type="text" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Wpisz e-mail lub login" required disabled={status === 'loading'} />
                    </Field>
                    <Button type="submit" variant="primary" size="lg" block loading={status === 'loading'}>
                        Wyślij link resetujący
                    </Button>
                </form>
            )}

            <Link to="/login" className="mt-6 text-ink-muted hover:text-primary-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                <ArrowLeft size={16} /> Wróć do logowania
            </Link>
        </AuthShell>
    );
}
