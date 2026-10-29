import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import SettingsSheet from './SettingsSheet';
import NavMenuSheet from './NavMenuSheet';
import PullToRefresh from './PullToRefresh';
import { getRouteMeta } from './routeMeta';
import { useQuickActions } from '../../context/QuickActionsContext';
import { resyncPush } from '../../services/push';

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { openQuickAdd } = useQuickActions();
    const [profileOpen, setProfileOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const meta = getRouteMeta(location.pathname);

    // Keep this device's push subscription fresh (iOS may rotate it)
    useEffect(() => {
        resyncPush();
    }, []);

    // Tapping a notification while the app is open: the service worker asks us to route
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return undefined;
        const onMessage = (e) => {
            if (e.data?.type === 'open-url' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) navigate(e.data.url);
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [navigate]);

    // One "Dodaj" per screen: the other lists have their own add button at the top, ideas get the "+"
    const showFab = meta.root && meta.section === 'ideas';

    return (
        <div className="min-h-dvh bg-canvas">
            <TopBar meta={meta} onOpenProfile={() => setProfileOpen(true)} onAdd={openQuickAdd} onOpenMenu={() => setMenuOpen(true)} />

            <main className="px-4 pt-2 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-4 lg:pb-14">
                <div className="mx-auto w-full max-w-6xl">
                    <Outlet />
                </div>
            </main>

            {showFab && (
                <button
                    type="button"
                    onClick={() => navigate('/ideas/new')}
                    className="lg:hidden fixed right-4 z-40 w-14 h-14 rounded-full bg-accent text-on-accent shadow-float flex items-center justify-center active:scale-95 transition-transform"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)' }}
                    aria-label="Dodaj"
                >
                    <Plus size={26} strokeWidth={2.5} />
                </button>
            )}

            <MobileNav onOpenMenu={() => setMenuOpen(true)} />
            <NavMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} onOpenSettings={() => setProfileOpen(true)} />
            <PullToRefresh />
            <SettingsSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
        </div>
    );
}
