
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../services/api';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
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
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 sm:p-10 border border-gray-100 relative overflow-hidden">

                <div className="text-center mb-8 relative z-10">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Reset Hasła 🔐</h1>
                    <p className="text-gray-400">Podaj swój email lub login, aby odzyskać dostęp.</p>
                </div>

                {status === 'success' ? (
                    <div className="text-center animate-fade-in">
                        <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center text-green-600 mx-auto mb-4">
                            <Send size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Wysłano!</h3>
                        <p className="text-gray-600 mb-6">{message}</p>
                        <Link to="/login" className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-bold hover:shadow-lg transition-all">
                            Wróć do logowania
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6 relative z-10">
                        {status === 'error' && (
                            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
                                {message}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <label htmlFor="email" className="text-sm font-medium text-gray-700">Email lub Login</label>
                            <input
                                type="text"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Wpisz email lub login"
                                required
                                disabled={status === 'loading'}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold text-base transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {status === 'loading' ? 'Wysyłanie...' : 'Wyślij link resetujący'}
                        </button>
                    </form>
                )}

                <div className="mt-8 text-center relative z-10">
                    <Link to="/login" className="text-gray-500 hover:text-primary transition-colors flex items-center justify-center gap-2 text-sm font-medium">
                        <ArrowLeft size={16} />
                        Wróć do logowania
                    </Link>
                </div>

                {/* Decoration */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-50 rounded-full opacity-50 z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-pink-50 rounded-full opacity-50 z-0 pointer-events-none" />
            </div>
        </div>
    );
}
