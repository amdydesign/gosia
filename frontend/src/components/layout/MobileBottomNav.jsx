import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingBag, Briefcase, BarChart2 } from 'lucide-react';
import './BottomNav.css';

export default function MobileBottomNav() {
    const location = useLocation();

    const navItems = [
        { path: '/dashboard', label: 'Start', icon: LayoutDashboard },
        { path: '/collaborations', label: 'Współprace', icon: Briefcase },
        { path: '/purchases', label: 'Zakupy', icon: ShoppingBag },
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
                            className={`nav-item ${isActive ? 'active' : ''}`}
                        >
                            <Icon className="nav-icon" size={24} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="nav-label">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
