import { useState } from 'react';
import { X, Lock, Save } from 'lucide-react';
import api from '../../services/api';

export default function ChangePasswordModal({ isOpen, onClose }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (newPassword !== confirmPassword) {
            setError('Nowe hasła nie są identyczne.');
            return;
        }

        if (newPassword.length < 6) {
            setError('Hasło musi mieć minimum 6 znaków.');
            return;
        }

        setLoading(true);

        try {
            const response = await api.post('/auth/change_password.php', {
                current_password: currentPassword,
                new_password: newPassword
            });

            if (!response.success) {
                throw new Error(response.message || 'Błąd zmiany hasła');
            }

            setSuccess(true);
            setTimeout(() => {
                onClose();
                // Reset form
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setSuccess(false);
            }, 2000);

        } catch (err) {
            console.error(err);
            setError(err.message || 'Wystąpił błąd');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Lock size={20} />
                        <h2 className="text-xl font-bold">Zmień hasło</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                                <Save size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Sukces!</h3>
                            <p className="text-gray-500">Twoje hasło zostało zmienione.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Obecne hasło</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nowe hasło</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Powtórz nowe hasło</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                    required
                                />
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
                                >
                                    {loading ? 'Zapisywanie...' : 'Zmień hasło'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
