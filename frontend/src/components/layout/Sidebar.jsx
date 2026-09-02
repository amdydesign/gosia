import { NavLink } from 'react-router-dom';
import { Settings, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { NAV_ITEMS } from './navItems';

export default function Sidebar({ onOpenSettings }) {
    const { user } = useAuth();
    const { badges } = useDashboard();

    return (
        <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-40 bg-surface border-r border-line">
            <div className="h-[72px] px-6 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-float">
                    <Sparkles size={18} />
                </div>
                <div className="leading-tight">
                    <div className="font-extrabold tracking-tight text-ink">Gosia</div>
                    <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Panel stylistki</div>
                </div>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const badge = badges[item.key];
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    isActive ? 'bg-primary-50 text-primary-800' : 'text-ink-soft hover:bg-black/[0.035] hover:text-ink'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <Icon size={19} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-primary-600' : 'text-ink-muted group-hover:text-ink'} />
                                    <span className="flex-1">{item.label}</span>
                                    {badge > 0 && (
                                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                                            {badge}
                                        </span>
                                    )}
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            <div className="p-3 border-t border-line">
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-black/[0.035] transition-colors text-left"
                >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary text-white flex items-center justify-center font-bold text-sm">
                        {(user?.username || 'G').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{user?.username || 'Użytkownik'}</div>
                        <div className="text-xs text-ink-muted">Ustawienia i konto</div>
                    </div>
                    <Settings size={17} className="text-ink-muted" />
                </button>
            </div>
        </aside>
    );
}
