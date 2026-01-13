/**
 * Login Page
 */

import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
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
            await login(username, password, rememberMe);
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Błąd logowania');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 sm:p-10 border border-gray-100">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">👗 Gosia 2.0</h1>
                    <p className="text-gray-400">Zaloguj się do systemu</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {error && (
                        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm text-center border border-red-200">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2">
                        <label htmlFor="username" className="text-sm font-medium text-gray-700">Login</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Wpisz login"
                            required
                            disabled={loading}
                            autoComplete="username"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label htmlFor="password" className="text-sm font-medium text-gray-700">Hasło</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Wpisz hasło"
                            required
                            disabled={loading}
                            autoComplete="current-password"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="rememberMe"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <label htmlFor="rememberMe" className="text-sm text-gray-600">Nie wylogowuj mnie</label>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold text-base transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        disabled={loading}
                    >
                        {loading ? 'Logowanie...' : 'Zaloguj się'}
                    </button>
                </form>
            </div>
        </div>
    );
}
