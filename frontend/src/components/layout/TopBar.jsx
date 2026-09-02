import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, BellRing, BellOff, Sparkles, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePush } from '../../hooks/usePush';
import { useToast } from '../../context/ToastContext';
import { formatWeekdayDate } from '../../utils/format';

export default function TopBar({ meta, onOpenSettings }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const push = usePush();

    const handleBell = async () => {
        const result = await push.toggle();
        if (result.ok) {
            toast.success(result.status === 'subscribed' ? 'Powiadomienia włączone. Przyjdzie test 🔔' : 'Powiadomienia wyłączone');
        } else if (result.message) {
            toast.error(result.message);
        }
    };

    const BellIcon = push.status === 'subscribed' ? BellRing : push.status === 'denied' ? BellOff : Bell;

    return (
        <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-md border-b border-line/70">
            <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-10 h-14 lg:h-[72px] flex items-center gap-2">
                {meta.back ? (
                    <button
                        type="button"
                        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(meta.back))}
                        className="p-2 -ml-1 rounded-xl text-ink-soft hover:bg-black/5 hover:text-ink transition-colors"
                        aria-label="Wstecz"
                    >
                        <ArrowLeft size={22} />
                    </button>
                ) : (
                    <Link to="/dashboard" className="lg:hidden w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-float shrink-0">
                        <Sparkles size={17} />
                    </Link>
                )}

                <div className="flex-1 min-w-0 pl-1">
                    {/* Root pages render their own big heading on desktop - show only the date there */}
                    <h1 className={`text-[17px] lg:text-xl font-extrabold tracking-tight text-ink truncate leading-tight ${meta.root ? 'lg:hidden' : ''}`}>
                        {meta.title}
                    </h1>
                    {meta.root && <p className="hidden lg:block text-sm font-medium text-ink-soft">{formatWeekdayDate()}</p>}
                </div>

                <div className="flex items-center gap-1">
                    {push.supported && (
                        <button
                            type="button"
                            onClick={handleBell}
                            disabled={push.busy}
                            className={`p-2.5 rounded-xl transition-colors ${
                                push.status === 'subscribed' ? 'text-primary-600 bg-primary-50' : 'text-ink-soft hover:bg-black/5'
                            }`}
                            title={push.status === 'subscribed' ? 'Powiadomienia włączone' : 'Włącz powiadomienia'}
                            aria-label="Powiadomienia"
                        >
                            <BellIcon size={20} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className="lg:hidden w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary text-white flex items-center justify-center font-bold text-sm ml-1"
                        aria-label="Ustawienia"
                    >
                        {(user?.username || 'G').charAt(0).toUpperCase()}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className="hidden lg:inline-flex p-2.5 rounded-xl text-ink-soft hover:bg-black/5 transition-colors"
                        aria-label="Ustawienia"
                        title="Ustawienia"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>
        </header>
    );
}
