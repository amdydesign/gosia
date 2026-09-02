import { useState } from 'react';
import { KeyRound, LogOut, Bell, BellOff, Download, ChevronRight } from 'lucide-react';
import Sheet from '../ui/Sheet';
import ChangePasswordModal from '../auth/ChangePasswordModal';
import ExportModal from '../../pages/collaborations/ExportModal';
import { useAuth } from '../../context/AuthContext';
import { usePush } from '../../hooks/usePush';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

export default function SettingsSheet({ open, onClose }) {
    const { user, logout } = useAuth();
    const push = usePush();
    const toast = useToast();
    const confirm = useConfirm();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);

    const handlePush = async () => {
        const result = await push.toggle();
        if (result.ok) toast.success(result.status === 'subscribed' ? 'Powiadomienia włączone' : 'Powiadomienia wyłączone');
        else if (result.message) toast.error(result.message);
    };

    const handleLogout = async () => {
        if (await confirm({ title: 'Wylogować?', message: 'Będziesz musiała zalogować się ponownie.', confirmLabel: 'Wyloguj' })) {
            logout();
        }
    };

    return (
        <>
            <Sheet open={open && !passwordOpen && !exportOpen} onClose={onClose} title="Ustawienia" size="sm">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-canvas border border-line mb-4">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-400 to-secondary text-white flex items-center justify-center font-bold">
                        {(user?.username || 'G').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-ink truncate">{user?.username || 'Użytkownik'}</div>
                        <div className="text-xs text-ink-muted">Stylistka · Gosia panel</div>
                    </div>
                </div>

                <div className="card divide-y divide-line overflow-hidden">
                    {push.supported && (
                        <button type="button" onClick={handlePush} disabled={push.busy} className="row w-full text-left hover:bg-canvas">
                            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${push.status === 'subscribed' ? 'bg-primary-50 text-primary-600' : 'bg-stone-100 text-ink-muted'}`}>
                                {push.status === 'subscribed' ? <Bell size={18} /> : <BellOff size={18} />}
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-sm font-semibold text-ink">Powiadomienia push</span>
                                <span className="block text-xs text-ink-muted">
                                    {push.status === 'subscribed'
                                        ? 'Włączone: terminy zwrotów i zaległe płatności'
                                        : push.status === 'denied'
                                            ? 'Zablokowane w przeglądarce'
                                            : 'Wyłączone'}
                                </span>
                            </span>
                            <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${push.status === 'subscribed' ? 'bg-primary-600' : 'bg-stone-300'}`}>
                                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${push.status === 'subscribed' ? 'translate-x-5' : ''}`} />
                            </span>
                        </button>
                    )}
                    <button type="button" onClick={() => setExportOpen(true)} className="row w-full text-left hover:bg-canvas">
                        <span className="w-9 h-9 rounded-xl bg-stone-100 text-ink-soft flex items-center justify-center">
                            <Download size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Eksport współprac (CSV)</span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={() => setPasswordOpen(true)} className="row w-full text-left hover:bg-canvas">
                        <span className="w-9 h-9 rounded-xl bg-stone-100 text-ink-soft flex items-center justify-center">
                            <KeyRound size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-ink">Zmień hasło</span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                    <button type="button" onClick={handleLogout} className="row w-full text-left hover:bg-red-50/60">
                        <span className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                            <LogOut size={18} />
                        </span>
                        <span className="flex-1 text-sm font-semibold text-red-700">Wyloguj</span>
                    </button>
                </div>

                <p className="text-center text-[11px] text-ink-muted mt-4 pb-1">Gosia panel · wersja 3.0</p>
            </Sheet>

            <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
            <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />
        </>
    );
}
