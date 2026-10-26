import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { useToast } from '../../context/ToastContext';

export default function ChangePasswordModal({ isOpen, onClose }) {
    const toast = useToast();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const reset = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setError(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError('Nowe hasła nie są identyczne.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Hasło musi mieć minimum 8 znaków.');
            return;
        }

        setLoading(true);
        try {
            await apiRequest('/auth/change_password.php', 'POST', {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success('Hasło zostało zmienione');
            handleClose();
        } catch (err) {
            setError(err.message || 'Wystąpił błąd');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet
            open={isOpen}
            onClose={handleClose}
            title="Zmień hasło"
            description="Minimum 8 znaków. Po zmianie inne sesje zostaną wylogowane."
            size="sm"
            footer={
                <>
                    <Button variant="secondary" className="flex-1" onClick={handleClose}>
                        Anuluj
                    </Button>
                    <Button variant="primary" className="flex-1" icon={KeyRound} loading={loading} form="change-password-form" type="submit">
                        Zmień hasło
                    </Button>
                </>
            }
        >
            <form id="change-password-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
                {error && <div className="bg-red-50 text-red-700 p-3 rounded-xl text-sm border border-red-100">{error}</div>}
                <Field label="Obecne hasło">
                    <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
                </Field>
                <Field label="Nowe hasło">
                    <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
                </Field>
                <Field label="Powtórz nowe hasło">
                    <input type="password" className="input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
                </Field>
            </form>
        </Sheet>
    );
}
