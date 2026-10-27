import { useState } from 'react';
import { KeyRound, Trash2, HardDrive, Share, LogOut, Bell, BellOff, ChevronRight, Sparkles, Moon, Sun, Smartphone, EyeOff, Pencil, Users, Check } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Logo from '../ui/Logo';
import Switch from '../ui/Switch';
import { userName } from '../../utils/format';
import { updateProfile } from '../../services/users';
import { useToast } from '../../context/ToastContext';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import NotificationsSheet from '../settings/NotificationsSheet';
import UsersSheet from '../settings/UsersSheet';
import SecuritySheet from '../settings/SecuritySheet';
import TrashSheet from '../settings/TrashSheet';
import BackupSheet from '../settings/BackupSheet';
import ShareSheet from '../settings/ShareSheet';
import { useAuth } from '../../context/AuthContext';
import { usePush } from '../../hooks/usePush';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { usePreferences } from '../../context/PreferencesContext';

const THEMES = [
    { value: 'dark', label: 'Noc', icon: Moon },
    { value: 'light', label: 'Dzień', icon: Sun },
    { value: 'auto', label: 'Auto', icon: Smartphone },
];

/** A labelled group of rows - the menu reads as a few short lists, not one long one. */
function Section({ title, children }) {
    return (
        <section className="mb-4">
            <h3 className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
            <div className="card divide-y divide-line overflow-hidden">{children}</div>
        </section>
    );
}

/** One setting: icon, name, current state / what it does, then a chevron (or a switch). */
function Row({ icon, title, text, onClick, right, active = false, switchOn }) {
    const Icon = icon;
    const isSwitch = switchOn !== undefined;
    return (
        <button
            type="button"
            onClick={onClick}
            role={isSwitch ? 'switch' : undefined}
            aria-checked={isSwitch ? switchOn : undefined}
            className="row w-full text-left hover:bg-surface-2"
        >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-primary-50 text-primary-700' : 'bg-surface-2 text-ink-soft'}`}>
                <Icon size={18} />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-ink">{title}</span>
                {text && <span className="block text-xs text-ink-muted">{text}</span>}
            </span>
            {right || <ChevronRight size={18} className="text-ink-muted shrink-0" />}
        </button>
    );
}

/**
 * Profile menu (avatar): look, privacy, notifications and account - in short labelled groups.
 */
export default function SettingsSheet({ open, onClose }) {
    const { user, logout, updateUser } = useAuth();
    const toast = useToast();
    const push = usePush();
    const confirm = useConfirm();
    const { data: dashboard } = useDashboard();
    const { openAiSettings } = useQuickActions();
    const { theme, setTheme, hideByDefault, setHideByDefault } = usePreferences();
    const ai = dashboard?.ai;
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const [trashOpen, setTrashOpen] = useState(false);
    const [backupOpen, setBackupOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const name = userName(user);
    const ThemeIcon = (THEMES.find((t) => t.value === theme) || THEMES[2]).icon;

    const saveName = async (e) => {
        e.preventDefault();
        const next = nameDraft.trim();
        setEditingName(false);
        if (!next || next === name) return;
        try {
            const data = await updateProfile(next);
            updateUser(data.user);
            toast.success(`Zapisane — cześć, ${data.user.display_name}!`);
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać imienia');
        }
    };

    const handleLogout = async () => {
        if (await confirm({ title: 'Wylogować?', message: 'Żeby wrócić, zaloguj się ponownie.', confirmLabel: 'Wyloguj' })) {
            await logout();
        }
    };

    const pushText =
        push.status === 'subscribed'
            ? 'Włączone na tym urządzeniu'
            : push.status === 'denied'
                ? 'Zablokowane w ustawieniach telefonu'
                : push.needsInstall
                    ? 'Dodaj Gonię do ekranu głównego'
                    : 'Wyłączone';

    return (
        <>
            <Sheet open={open && !passwordOpen && !notificationsOpen && !usersOpen && !securityOpen && !trashOpen && !backupOpen && !shareOpen} onClose={onClose} title="Profil i ustawienia" size="sm">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-surface-2 border border-line text-ink flex items-center justify-center font-semibold text-lg">
                        {name.charAt(0).toUpperCase()}
                    </div>
                    {editingName ? (
                        <form onSubmit={saveName} className="flex-1 min-w-0 flex gap-2">
                            <input
                                className="input flex-1 min-w-0 !py-2"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                maxLength={100}
                                autoFocus
                                aria-label="Twoje imię"
                            />
                            <button type="submit" className="btn btn-sm btn-primary" aria-label="Zapisz imię">
                                <Check size={16} />
                            </button>
                        </form>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setNameDraft(name);
                                setEditingName(true);
                            }}
                            className="min-w-0 flex-1 text-left group"
                            title="Zmień imię"
                        >
                            <span className="flex items-center gap-1.5 font-semibold text-ink">
                                <span className="truncate">{name}</span>
                                <Pencil size={13} className="shrink-0 text-ink-muted group-hover:text-ink" />
                            </span>
                            <span className="block text-xs text-ink-muted truncate">Login: {user?.username || '—'}</span>
                        </button>
                    )}
                </div>

                <Section title="Na co dzień">
                    <div className="row">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center shrink-0">
                            <ThemeIcon size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Wygląd</span>
                        <div role="group" aria-label="Wygląd" title="„Auto” przełącza się samo według ustawień telefonu" className="flex gap-0.5 p-0.5 rounded-xl bg-canvas border border-line shrink-0">
                            {THEMES.map((t) => {
                                const active = theme === t.value;
                                return (
                                    <button
                                        key={t.value}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setTheme(t.value)}
                                        className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-ink text-canvas' : 'text-ink-soft hover:text-ink'}`}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <Row
                        icon={EyeOff}
                        title="Zawsze ukrywaj kwoty"
                        text="Rozmyte po otwarciu, odkryjesz okiem u góry"
                        onClick={() => setHideByDefault(!hideByDefault)}
                        right={<Switch on={hideByDefault} />}
                        switchOn={hideByDefault}
                    />
                    <Row
                        icon={push.status === 'subscribed' ? Bell : BellOff}
                        active={push.status === 'subscribed'}
                        title="Powiadomienia"
                        text={pushText}
                        onClick={() => setNotificationsOpen(true)}
                    />
                </Section>

                <Section title="Dodawanie">
                    <Row
                        icon={Sparkles}
                        active={!!ai?.enabled}
                        title="Czytanie screenów (AI)"
                        text={ai?.enabled ? `Włączone · ${ai.provider === 'gemini' ? 'Gemini' : 'Claude'}` : 'Wyłączone — wpisz klucz API'}
                        onClick={() => {
                            onClose();
                            openAiSettings();
                        }}
                    />
                    <Row icon={Share} title="Screeny z iPhone’a" text="Screen → Udostępnij → Gonia" onClick={() => setShareOpen(true)} />
                </Section>

                <Section title="Dane">
                    <Row icon={Trash2} title="Kosz" text="Usunięte w ostatnich 30 dniach" onClick={() => setTrashOpen(true)} />
                    {user?.is_admin && <Row icon={HardDrive} title="Kopie zapasowe" text="Co noc, same się robią" onClick={() => setBackupOpen(true)} />}
                </Section>

                <Section title="Konto">
                    <Row icon={KeyRound} title="Logowanie" text="Hasło, e-mail do odzyskania" onClick={() => setSecurityOpen(true)} />
                    {user?.is_admin && <Row icon={Users} title="Konta" text="Dodaj osobę, nowe hasło, blokada" onClick={() => setUsersOpen(true)} />}
                </Section>

                <button type="button" onClick={handleLogout} className="btn btn-ghost w-full !text-red-600 hover:!bg-red-50">
                    <LogOut size={17} /> Wyloguj
                </button>

                <div className="flex justify-center mt-3 pb-1 opacity-80">
                    <Logo size="sm" />
                </div>
            </Sheet>

            <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
            <NotificationsSheet open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
            <UsersSheet open={usersOpen} onClose={() => setUsersOpen(false)} />
            <TrashSheet open={trashOpen} onClose={() => setTrashOpen(false)} />
            <BackupSheet open={backupOpen} onClose={() => setBackupOpen(false)} />
            <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} />
            <SecuritySheet
                open={securityOpen}
                onClose={() => setSecurityOpen(false)}
                onChangePassword={() => {
                    setSecurityOpen(false);
                    setPasswordOpen(true);
                }}
            />
        </>
    );
}

