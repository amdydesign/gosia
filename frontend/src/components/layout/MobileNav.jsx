import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { useDashboard } from '../../context/DashboardContext';

/**
 * Bottom tab bar (mobile). Sits above the iOS home indicator thanks to
 * viewport-fit=cover + safe-area padding; taps use touch-action: manipulation.
 */
export default function MobileNav() {
    const { badges } = useDashboard();

    return (
        <nav
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line shadow-[0_-4px_16px_-8px_rgba(31,26,28,0.15)]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
            <div className="flex items-stretch h-[62px] max-w-lg mx-auto">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const badge = badges[item.key];
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            draggable={false}
                            className={({ isActive }) =>
                                `flex-1 flex flex-col items-center justify-center gap-0.5 relative select-none transition-colors ${
                                    isActive ? 'text-primary-700' : 'text-ink-muted active:text-ink'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <span className={`w-12 h-7 rounded-full flex items-center justify-center transition-colors ${isActive ? 'bg-primary-50' : ''}`}>
                                        <span className="relative">
                                            <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                                            {badge > 0 && (
                                                <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                                                    {badge}
                                                </span>
                                            )}
                                        </span>
                                    </span>
                                    <span className={`text-[10.5px] tracking-wide leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
