import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { useDashboard } from '../../context/DashboardContext';

export default function MobileNav() {
    const { badges } = useDashboard();

    return (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line safe-bottom">
            <div className="flex items-stretch h-16 max-w-lg mx-auto">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const badge = badges[item.key];
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors ${
                                    isActive ? 'text-primary-700' : 'text-ink-muted active:text-ink'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <span
                                        className={`absolute top-0 h-0.5 w-8 rounded-b-full bg-primary-600 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                    />
                                    <span className="relative">
                                        <Icon size={23} strokeWidth={isActive ? 2.4 : 2} />
                                        {badge > 0 && (
                                            <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
                                                {badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`text-[10.5px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
