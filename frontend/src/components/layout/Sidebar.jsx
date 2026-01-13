import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, ShoppingBag, Briefcase, BarChart2, LogOut, User, Lightbulb } from 'lucide-react';


export default function Sidebar() {
    const { user, logout } = useAuth();
    const location = useLocation();

    const menuItems = [
        { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/collaborations', label: 'Współprace', icon: Briefcase },
        { path: '/purchases', label: 'Zakupy', icon: ShoppingBag },
        { path: '/ideas', label: 'Pomysły', icon: Lightbulb },
        { path: '/statistics', label: 'Statystyki', icon: BarChart2 },
    ];

    return (
        <aside className="sidebar hidden lg:flex flex-col w-72 bg-white border-r border-gray-100 fixed inset-y-0 left-0 z-50">
            {/* Logo Area */}
            <div className="h-20 flex items-center px-8 border-b border-gray-50">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
                    Gosia 2.0
                </h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-8 space-y-2">
                {menuItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                ${isActive
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <Icon
                                size={22}
                                className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'text-gray-400 group-hover:text-gray-600'}`}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            <span>{item.label}</span>

                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* User Section */}
            <div className="p-4 border-t border-gray-50">
                <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-sm">
                        <User size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                            {user?.username || 'Użytkownik'}
                        </p>
                        <p className="text-xs text-gray-500">Stylista</p>
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                        title="Wyloguj"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
