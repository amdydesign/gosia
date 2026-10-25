import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, KeyRound, Lock, LockOpen, Loader2, UserPlus } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { createUser, listUsers, suggestPassword, updateUser } from '../../services/users';
import { formatDateShort } from '../../utils/format';

/** "Ola Nowak" -> "ola.nowak" (no Polish letters - easier to type on any phone). */
function loginFromName(name) {
    const map = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
    return name
        .toLowerCase()
        .replace(/[ąćęłńóśźż]/g, (c) => map[c])
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 50);
}

async function copy(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Admin: add accounts, give a new password, block/unblock.
 * Every account sees only its own data - this screen never shows anyone's data, only the accounts.
 */
export default function UsersSheet({ open, onClose }) {
    const toast = useToast();
    const { user: me } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [openId, setOpenId] = useState(null);
    const [handover, setHandover] = useState(null); // { name, username, password } to pass on

    const load = useCallback(async () => {
        try {
            setUsers(await listUsers());
        } catch (err) {
            toast.error(err.message || 'Nie udało się pobrać kont');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const replace = (u) => setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));

    const setActive = async (u, active) => {
        try {
            replace(await updateUser(u.id, { is_active: active }));
            toast.success(active ? `${u.display_name} — odblokowane` : `${u.display_name} — zablokowane`, {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => setActive(u, !active) },
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        }
    };

    const newPassword = async (u) => {
        const password = suggestPassword();
        try {
            await updateUser(u.id, { password });
            setHandover({ name: u.display_name, username: u.username, password, reset: true });
            setOpenId(null);
        } catch (err) {
            toast.error(err.message || 'Nie udało się zmienić hasła');
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Konta" description="Każde konto widzi tylko swoje rzeczy" size="md">
            <div className="space-y-4">
                {handover && <Handover data={handover} onDone={() => setHandover(null)} />}

                {adding ? (
                    <AddForm
                        onCancel={() => setAdding(false)}
                        onCreated={(u, password) => {
                            setUsers((prev) => [...prev, u]);
                            setAdding(false);
                            setHandover({ name: u.display_name, username: u.username, password });
                        }}
                    />
                ) : (
                    !handover && (
                        <Button variant="primary" icon={UserPlus} block onClick={() => setAdding(true)}>
                            Dodaj konto
                        </Button>
                    )
                )}

                {loading ? (
                    <div className="py-6 flex justify-center">
                        <Loader2 size={22} className="animate-spin text-ink-muted" />
                    </div>
                ) : (
                    <div className="card divide-y divide-line overflow-hidden">
                        {users.map((u) => {
                            const isMe = u.id === me?.id;
                            const expanded = openId === u.id;
                            return (
                                <div key={u.id}>
                                    <button
                                        type="button"
                                        onClick={() => setOpenId(expanded ? null : u.id)}
                                        aria-expanded={expanded}
                                        className="row w-full text-left hover:bg-surface-2"
                                    >
                                        <span className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold ${u.is_active ? 'bg-surface-2 text-ink' : 'bg-red-50 text-red-700'}`}>
                                            {u.display_name.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-sm font-semibold text-ink truncate">{u.display_name}</span>
                                                {isMe && <span className="badge bg-accent text-on-accent">Ty</span>}
                                                {!u.is_active && <span className="badge bg-red-50 text-red-700">Zablokowane</span>}
                                            </span>
                                            <span className="block text-xs text-ink-muted truncate">
                                                {u.username} · {u.last_login ? `ostatnio ${formatDateShort(u.last_login.slice(0, 10))}` : 'jeszcze się nie logowano'}
                                            </span>
                                        </span>
                                        <ChevronDown size={18} className={`text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expanded && (
                                        <div className="px-4 pb-3 flex gap-2">
                                            {!isMe && (
                                                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => newPassword(u)} className="flex-1">
                                                    Nowe hasło
                                                </Button>
                                            )}
                                            {!u.is_admin && (
                                                <Button
                                                    size="sm"
                                                    variant={u.is_active ? 'ghost' : 'secondary'}
                                                    icon={u.is_active ? Lock : LockOpen}
                                                    onClick={() => setActive(u, !u.is_active)}
                                                    className={`flex-1 ${u.is_active ? '!text-red-700' : ''}`}
                                                >
                                                    {u.is_active ? 'Zablokuj' : 'Odblokuj'}
                                                </Button>
                                            )}
                                            {isMe && <p className="text-xs text-ink-muted py-1.5">Swoje hasło zmienisz w „Zmień hasło”.</p>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Sheet>
    );
}

function AddForm({ onCancel, onCreated }) {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [loginTouched, setLoginTouched] = useState(false);
    const [password, setPassword] = useState(suggestPassword);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const u = await createUser({ display_name: name.trim(), username: username.trim(), password });
            onCreated(u, password);
        } catch (err) {
            setError(err.message || 'Nie udało się założyć konta');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="card card-pad space-y-3">
            <Field label="Imię" htmlFor="new-account-name">
                <input
                    id="new-account-name"
                    className="input"
                    value={name}
                    autoFocus
                    onChange={(e) => {
                        setName(e.target.value);
                        if (!loginTouched) setUsername(loginFromName(e.target.value));
                    }}
                    placeholder="np. Ola"
                />
            </Field>
            <Field label="Login" htmlFor="new-account-login">
                <input
                    id="new-account-login"
                    className="input"
                    value={username}
                    autoCapitalize="none"
                    autoCorrect="off"
                    onChange={(e) => {
                        setLoginTouched(true);
                        setUsername(e.target.value);
                    }}
                />
            </Field>
            <Field label="Hasło" htmlFor="new-account-password" hint="Łatwe do przepisania — możesz zmienić.">
                <input id="new-account-password" className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoCapitalize="none" autoCorrect="off" />
            </Field>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex gap-2 pt-1">
                <Button variant="ghost" onClick={onCancel} className="flex-1">
                    Anuluj
                </Button>
                <Button type="submit" variant="primary" icon={Check} loading={saving} disabled={!name.trim() || !username.trim() || password.length < 8} className="flex-[2]">
                    Załóż konto
                </Button>
            </div>
        </form>
    );
}

/** Login + password to pass on - shown once, with one-tap copy. */
function Handover({ data, onDone }) {
    const toast = useToast();
    const text = `Gonia: ${window.location.origin}\nLogin: ${data.username}\nHasło: ${data.password}`;
    return (
        <div className="rounded-2xl border border-accent/60 bg-accent/10 p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">
                {data.reset ? `Nowe hasło dla: ${data.name}` : `Konto gotowe: ${data.name}`}
            </p>
            <div className="rounded-xl bg-surface border border-line p-3 font-mono text-sm text-ink whitespace-pre-line">
                Login: {data.username}
                {'\n'}Hasło: <strong>{data.password}</strong>
            </div>
            <p className="text-xs text-ink-muted">Przekaż te dane tej osobie — hasło widać tylko teraz.</p>
            <div className="flex gap-2">
                <Button
                    variant="primary"
                    icon={Copy}
                    className="flex-[2]"
                    onClick={async () => ((await copy(text)) ? toast.success('Skopiowane — wklej w wiadomości') : toast.error('Nie udało się skopiować'))}
                >
                    Kopiuj dane
                </Button>
                <Button variant="ghost" onClick={onDone} className="flex-1">
                    Gotowe
                </Button>
            </div>
        </div>
    );
}
