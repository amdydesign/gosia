import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Bell, BellOff, Download, ChevronRight, Sparkles, FolderLock, Moon, Sun, Smartphone, EyeOff } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Logo from '../ui/Logo';
import Switch from '../ui/Switch';
import { OWNER_NAME } from '../../utils/format';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import ExportModal from '../../pages/collaborations/ExportModal';
import NotificationsSheet from '../settings/NotificationsSheet';
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
    const { user, logout } = useAuth();
    const push = usePush();
    const confirm = useConfirm();
    const { data: dashboard } = useDashboard();
    const { openAiSettings } = useQuickActions();
    const { theme, setTheme, hideByDefault, setHideByDefault } = usePreferences();
    const ai = dashboard?.ai;
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    const handleLogout = async () => {
        if (await confirm({ title: 'Wylogować?', message: 'Będziesz musiała zalogować się ponownie.', confirmLabel: 'Wyloguj' })) {
            logout();
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
            <Sheet open={open && !passwordOpen && !exportOpen && !notificationsOpen} onClose={onClose} title="Profil i ustawienia" size="sm">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-full bg-surface-2 border border-line text-ink flex items-center justify-center font-semibold text-lg">
                        {OWNER_NAME.charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">{OWNER_NAME}</div>
                        <div className="text-xs text-ink-muted truncate">Login: {user?.username || '—'}</div>
                    </div>
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
                    <button type="button" onClick={() => setExportOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <Download size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Eksport współprac (CSV)</span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setPasswordOpen(true)} className="row w-full text-left hover:bg-surface-2">
                        <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center">
                            <KeyRound size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Zmień hasło</span>
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
        </>
    );
}

