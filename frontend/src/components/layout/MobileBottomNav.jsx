import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Briefcase, BarChart2, Lightbulb } from 'lucide-react';
import { useUrgentReturns } from '../../hooks/useUrgentReturns';
import './BottomNav.css';

export default function MobileBottomNav() {
    const location = useLocation();
    const urgentCount = useUrgentReturns();

    const navItems = [
        { path: '/dashboard', label: 'Start', icon: LayoutDashboard },
        { path: '/collaborations', label: 'Współprace', icon: Briefcase },
        { path: '/purchases', label: 'Zakupy', icon: ShoppingBag, badge: urgentCount > 0 ? urgentCount : null },
        { path: '/ideas', label: 'Pomysły', icon: Lightbulb },
        { path: '/statistics', label: 'Statystyki', icon: BarChart2 },
    ];

    return (
        <nav className="bottom-nav">
            <div className="bottom-nav-content">
                {navItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`nav-item relative ${isActive ? 'active' : ''}`}
                        >
                            <div className="relative">
                                <Icon className="nav-icon" size={24} strokeWidth={isActive ? 2.5 : 2} />
                                {item.badge && (
                                    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-[16px] flex items-center justify-center border-2 border-white">
                                        {item.badge}
                                    </span>
                                )}
                            </div>
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
