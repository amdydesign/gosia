import { NavLink, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { NAV_ITEMS, activeMoreItem } from './navItems';
import { useDashboard } from '../../context/DashboardContext';

/**
 * Floating pill tab bar (phone). Sits above the iOS home indicator thanks to
 * viewport-fit=cover + safe-area padding; every tab keeps a text label.
 * Four main sections + "Menu" with the rest - the bar never gets crowded.
 */
export default function MobileNav({ onOpenMenu }) {
    const { badges } = useDashboard();
    const { pathname } = useLocation();
    const more = activeMoreItem(pathname);
    const MoreIcon = more ? more.icon : Menu;

    const tabClass = (isActive) =>
        `relative rounded-full flex flex-col items-center justify-center gap-0.5 select-none transition-colors ${
            isActive ? 'nav-active' : 'text-ink-muted active:text-ink'
        }`;

    return (
        <nav
            aria-label="Główna"
            className="lg:hidden fixed inset-x-2 z-40 h-[66px] p-1.5 grid grid-cols-5 gap-0.5 rounded-full bg-surface border border-line shadow-float"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const badge = badges[item.key];
                return (
                    <NavLink key={item.path} to={item.path} draggable={false} className={({ isActive }) => tabClass(isActive)}>
                        {({ isActive }) => (
                            <>
                                <span className="relative">
                                    <Icon size={19} strokeWidth={isActive ? 2.3 : 1.9} />
                                    {badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                                            {badge}
                                        </span>
                                    )}
                                </span>
                                <span className={`text-[10px] leading-none tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                            </>
                        )}
                    </NavLink>
                );
            })}
            <button type="button" onClick={onOpenMenu} className={tabClass(!!more)} aria-label="Menu" aria-haspopup="dialog">
                <MoreIcon size={19} strokeWidth={more ? 2.3 : 1.9} />
                <span className={`text-[10px] leading-none tracking-tight ${more ? 'font-semibold' : 'font-medium'}`}>{more ? more.label : 'Menu'}</span>
            </button>
        </nav>
    );
}
