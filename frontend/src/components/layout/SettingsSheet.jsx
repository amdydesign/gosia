import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Trash2, HardDrive, Share, LogOut, Bell, BellOff, Download, ChevronRight, Sparkles, FolderLock, Moon, Sun, Smartphone, EyeOff, Pencil, Users, Check } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Logo from '../ui/Logo';
import Switch from '../ui/Switch';
import { userName } from '../../utils/format';
import { updateProfile } from '../../services/users';
import { useToast } from '../../context/ToastContext';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import ExportModal from '../../pages/collaborations/ExportModal';
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

/**
 * Profile menu (avatar): look, privacy, notifications and account.
 */
export default function SettingsSheet({ open, onClose }) {
    const navigate = useNavigate();
    const { user, logout, updateUser } = useAuth();
    const toast = useToast();
    const push = usePush();
    const confirm = useConfirm();
    const { data: dashboard } = useDashboard();
    const { openAiSettings } = useQuickActions();
    const { theme, setTheme, hideByDefault, setHideByDefault } = usePreferences();
    const ai = dashboard?.ai;
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);
    const [securityOpen, setSecurityOpen] = useState(false);
    const [trashOpen, setTrashOpen] = useState(false);
    const [backupOpen, setBackupOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const name = userName(user);

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
            <Sheet open={open && !passwordOpen && !exportOpen && !notificationsOpen && !usersOpen && !securityOpen && !trashOpen && !backupOpen && !shareOpen} onClose={onClose} title="Profil i ustawienia" size="sm">
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

                <div className="mb-5">
                    <div className="text-sm font-semibold text-ink mb-2">Wygląd</div>
                    <div role="group" aria-label="Wygląd" className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-canvas border border-line">
                        {THEMES.map((t) => {
                            const active = theme === t.value;
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setTheme(t.value)}
                                    className={`h-11 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                                        active ? 'bg-ink text-canvas' : 'text-ink-soft hover:text-ink'
                                    }`}
                                >
                                    <t.icon size={16} /> {t.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="hint">„Auto” przełącza się samo według ustawień telefonu.</p>
                </div>

                <div className="card divide-y divide-line overflow-hidden">
                    <button type="button" role="switch" aria-checked={hideByDefault} onClick={() => setHideByDefault(!hideByDefault)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <EyeOff size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Zawsze ukrywaj kwoty</span>
                            <span className="block text-xs text-ink-muted">Rozmyte po otwarciu, pokażesz je okiem u góry</span>
                        </span>
                        <Switch on={hideByDefault} />
                    </button>
                    <button type="button" onClick={() => setNotificationsOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${push.status === 'subscribed' ? 'bg-primary-50 text-primary-700' : 'bg-surface-2 text-ink-muted'}`}>
                            {push.status === 'subscribed' ? <Bell size={18} /> : <BellOff size={18} />}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Powiadomienia</span>
                            <span className="block text-xs text-ink-muted">{pushText}</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            navigate('/documents');
                        }}
                        className="row w-full text-left hover:bg-surface-2"
                    >
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <FolderLock size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Dokumenty</span>
                            <span className="block text-xs text-ink-muted">Archiwum umów z wyszukiwarką</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            openAiSettings();
                        }}
                        className="row w-full text-left hover:bg-surface-2"
                    >
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${ai?.enabled ? 'bg-primary-50 text-primary-700' : 'bg-surface-2 text-ink-muted'}`}>
                            <Sparkles size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Czytanie screenów (AI)</span>
                            <span className="block text-xs text-ink-muted">
                                {ai?.enabled ? `Włączone · ${ai.provider === 'gemini' ? 'Gemini' : 'Claude'}` : 'Wyłączone — wpisz klucz API'}
                            </span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setShareOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <Share size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Udostępnianie z iPhone’a</span>
                            <span className="block text-xs text-ink-muted">Screen → Udostępnij → Gonia</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setExportOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <Download size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Eksport współprac (CSV)</span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setTrashOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <Trash2 size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Kosz</span>
                            <span className="block text-xs text-ink-muted">Usunięte w ostatnich 30 dniach</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    {user?.is_admin && (
                        <button type="button" onClick={() => setUsersOpen(true)} className="row w-full text-left hover:bg-surface-2">
                            <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                                <Users size={18} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-ink">Konta</span>
                                <span className="block text-xs text-ink-muted">Dodaj osobę, nowe hasło, blokada</span>
                            </span>
                            <ChevronRight size={18} className="text-ink-muted" />
                        </button>
                    )}
                    {user?.is_admin && (
                        <button type="button" onClick={() => setBackupOpen(true)} className="row w-full text-left hover:bg-surface-2">
                            <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                                <HardDrive size={18} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-ink">Kopie zapasowe</span>
                                <span className="block text-xs text-ink-muted">Co noc, sama się robi</span>
                            </span>
                            <ChevronRight size={18} className="text-ink-muted" />
                        </button>
                    )}
                    <button type="button" onClick={() => setSecurityOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <KeyRound size={18} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Logowanie</span>
                            <span className="block text-xs text-ink-muted">E-mail do odzyskania, hasło</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={handleLogout} className="row w-full text-left hover:bg-red-50">
                        <span className="w-9 h-9 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
                            <LogOut size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-red-700">Wyloguj</span>
                    </button>
                </div>

                <div className="flex justify-center mt-5 pb-1 opacity-80">
                    <Logo size="sm" />
                </div>
            </Sheet>

            <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
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

