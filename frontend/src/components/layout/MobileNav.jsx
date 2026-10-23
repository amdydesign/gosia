import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { useDashboard } from '../../context/DashboardContext';

/**
 * Floating pill tab bar (phone). Sits above the iOS home indicator thanks to
 * viewport-fit=cover + safe-area padding; every tab keeps a text label.
 */
export default function MobileNav() {
    const { badges } = useDashboard();

    return (
        <nav
            aria-label="Główna"
            className="lg:hidden fixed inset-x-3 z-40 h-[66px] p-1.5 grid grid-cols-5 gap-0.5 rounded-full bg-surface border border-line shadow-float"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
            {NAV_ITEMS.filter((item) => item.mobile !== false).map((item) => {
                const Icon = item.icon;
                const badge = badges[item.key];
                return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        draggable={false}
                        className={({ isActive }) =>
                            `relative rounded-full flex flex-col items-center justify-center gap-0.5 select-none transition-colors ${
                                isActive ? 'nav-active' : 'text-ink-muted active:text-ink'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className="relative">
                                    <Icon size={20} strokeWidth={isActive ? 2.3 : 1.9} />
                                    {badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-secondary text-on-secondary text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                                            {badge}
                                        </span>
                                    )}
                                </span>
                                <span className={`text-[10.5px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                            </>
                        )}
                    </NavLink>
                );
            })}
        </nav>
    );
}
