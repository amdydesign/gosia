import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
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
import { PageSkeleton } from '../ui/Skeleton';
import { useVersionCheck } from '../../hooks/useVersionCheck';

const SCROLL_KEY = 'gonia.scroll';

function readScroll() {
    try {
        return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}') || {};
    } catch {
        return {};
    }
}

/**
 * Coming back to a screen shows it where it was left. One position per screen:
 * a list with its detail sheets (/purchases/12) is one screen, so opening a sheet never moves the list.
 * The assistant scrolls its own conversation and is left alone.
 */
function useScrollMemory(pathname, section) {
    const screen = section === 'collaborations' || section === 'purchases' ? section : pathname;
    const skip = section === 'assistant';

    useLayoutEffect(() => {
        if (skip) return undefined;
        const target = Number(readScroll()[screen]) || 0;
        let tries = 0;
        let timer = null;
        let stopped = false;
        const stop = () => {
            stopped = true;
            clearTimeout(timer);
        };
        // the list may still be loading (skeleton is shorter) - keep trying for a moment, stop when she scrolls herself
        const restore = () => {
            if (stopped) return;
            window.scrollTo({ top: target, behavior: 'instant' });
            tries += 1;
            if (Math.abs(window.scrollY - target) > 2 && tries < 25) timer = setTimeout(restore, 120);
            else stopped = true;
        };
        restore();

        let saveTimer = null;
        const save = () => {
            saveTimer = null;
            try {
                sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ ...readScroll(), [screen]: Math.round(window.scrollY) }));
            } catch {
                // storage blocked - nothing remembered
            }
        };
        const onScroll = () => {
            // while we are still putting the page back, positions are not hers
            if (!stopped) return;
            if (!saveTimer) saveTimer = setTimeout(save, 150);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('touchstart', stop, { passive: true });
        window.addEventListener('wheel', stop, { passive: true });
        window.addEventListener('keydown', stop);
        return () => {
            stop();
            clearTimeout(saveTimer);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('wheel', stop);
            window.removeEventListener('keydown', stop);
        };
    }, [screen, skip]);
}

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { openQuickAdd, settingsTarget } = useQuickActions();
    const [profileOpen, setProfileOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const meta = getRouteMeta(location.pathname);
    useScrollMemory(location.pathname, meta.section);
    useVersionCheck();

    // Another screen asked for the settings (Start: "Brak kopii zapasowej")
    const [openedTarget, setOpenedTarget] = useState(null);
    if (settingsTarget && settingsTarget !== openedTarget) {
        setOpenedTarget(settingsTarget);
        setProfileOpen(true);
    }

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
                    <Suspense fallback={<PageSkeleton />}>
                        <Outlet />
                    </Suspense>
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
            <SettingsSheet open={profileOpen} onClose={() => setProfileOpen(false)} target={settingsTarget} />
        </div>
    );
}
