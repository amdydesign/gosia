import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';
import QuickAddSheet from './QuickAddSheet';
import SettingsSheet from './SettingsSheet';
import { getRouteMeta } from './routeMeta';

const SECTION_NEW = {
    collaborations: '/collaborations/new',
    purchases: '/purchases/new',
    ideas: '/ideas/new',
};

export default function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const meta = getRouteMeta(location.pathname);

    const handleFab = () => {
        const target = SECTION_NEW[meta.section];
        if (target) navigate(target);
        else setQuickAddOpen(true);
    };

    return (
        <div className="min-h-dvh bg-canvas">
            <Sidebar onOpenSettings={() => setSettingsOpen(true)} />

            <div className="lg:pl-64 flex flex-col min-h-dvh">
                <TopBar meta={meta} onOpenSettings={() => setSettingsOpen(true)} />

                <main className="flex-1 px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-14">
                    <div className="mx-auto w-full max-w-5xl">
                        <Outlet />
                    </div>
                </main>
            </div>

            {meta.root && (
                <button
                    type="button"
                    onClick={handleFab}
                    className="lg:hidden fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 w-14 h-14 rounded-2xl bg-primary-600 text-white shadow-float flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Dodaj"
                >
                    <Plus size={26} strokeWidth={2.5} />
                </button>
            )}

            <MobileNav />
            <QuickAddSheet open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
            <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
}
