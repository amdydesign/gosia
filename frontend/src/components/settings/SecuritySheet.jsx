import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Mail, ScanFace, Trash2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { updateProfileFields } from '../../services/users';
import { formatDateShort } from '../../utils/format';
import { isCancelled, listPasskeys, passkeysSupported, registerPasskey, removePasskey } from '../../services/passkeys';

/**
 * Logowanie: Face ID, e-mail for "Nie pamiętam hasła" and the password.
 */
export default function SecuritySheet({ open, onClose, onChangePassword }) {
    const { user, updateUser } = useAuth();
    const toast = useToast();
    const [supported, setSupported] = useState(false);
    const [keys, setKeys] = useState([]);
    const [busy, setBusy] = useState(false);
    const [email, setEmail] = useState('');
    const [savingEmail, setSavingEmail] = useState(false);

    const load = useCallback(() => {
        listPasskeys()
            .then((list) => setKeys(Array.isArray(list) ? list : []))
            .catch(() => setKeys([]));
    }, []);

    useEffect(() => {
        if (!open) return;
        setEmail(user?.email || '');
        passkeysSupported().then(setSupported);
        load();
    }, [open, user?.email, load]);

    const enable = async () => {
        setBusy(true);
        try {
            await registerPasskey();
            toast.success('Face ID włączone — następnym razem bez hasła');
            load();
        } catch (err) {
            if (!isCancelled(err)) toast.error(err.message || 'Nie udało się włączyć Face ID');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (key) => {
        try {
            await removePasskey(key.id);
            toast.success(`${key.name}: logowanie hasłem`);
            load();
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć');
        }
    };

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
                <section>
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
                        <ScanFace size={17} /> Face ID / Touch ID
                    </div>
                    {keys.length > 0 && (
                        <div className="card divide-y divide-line overflow-hidden mb-2">
                            {keys.map((k) => (
                                <div key={k.id} className="row">
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-ink">{k.name}</span>
                                        <span className="block text-xs text-ink-muted">
                                            {k.last_used_at ? `ostatnio ${formatDateShort(k.last_used_at.slice(0, 10))}` : `dodane ${formatDateShort(k.created_at.slice(0, 10))}`}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => remove(k)}
                                        aria-label={`Usuń Face ID: ${k.name}`}
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-ink-muted hover:bg-red-50 hover:text-red-700"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {supported ? (
                        <Button variant={keys.length ? 'secondary' : 'primary'} block icon={ScanFace} loading={busy} onClick={enable}>
                            {keys.length ? 'Dodaj to urządzenie' : 'Włącz Face ID'}
                        </Button>
                    ) : (
                        <p className="hint">{keys.length ? 'Na tym urządzeniu logujesz się hasłem.' : 'To urządzenie nie obsługuje Face ID w przeglądarce.'}</p>
                    )}
                </section>

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
