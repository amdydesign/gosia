import { useEffect, useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { updateProfileFields } from '../../services/users';

/**
 * Logowanie: e-mail for "Nie pamiętam hasła" and the password.
 */
export default function SecuritySheet({ open, onClose, onChangePassword }) {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [email, setEmail] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);

    useEffect(() => {
        if (open) setEmail(user?.email || '');
    }, [open, user?.email]);

    const saveEmail = async (e) => {
        e.preventDefault();
        setSavingEmail(true);
        try {
            const data = await updateProfileFields({ email: email.trim() });
            updateUser(data.user);
            toast.success(email.trim() ? 'E-mail zapisany' : 'E-mail usunięty');
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSavingEmail(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Logowanie" size="sm">
            <div className="space-y-5">
                <form onSubmit={saveEmail}>
                    <label htmlFor="recovery-email" className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
                        <Mail size={17} /> E-mail do odzyskiwania hasła
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="recovery-email"
                            type="email"
                            className="input flex-1 min-w-0"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="np. gosia@gmail.com"
                            autoComplete="email"
                        />
                        <Button type="submit" variant="secondary" loading={savingEmail} disabled={email.trim() === (user?.email || '')}>
                            Zapisz
                        </Button>
                    </div>
                    <p className="hint">Tu przyjdzie link, gdy zapomnisz hasła.</p>
                </form>

                <Button variant="secondary" block icon={KeyRound} onClick={onChangePassword}>
                    Zmień hasło
                </Button>
            </div>
        </Sheet>
    );
}
