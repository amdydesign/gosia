import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';
import PushToggle from '../common/PushToggle';
import './Header.css';

export default function Header({ title, subtitle }) {
    const { logout } = useAuth();

    return (
        <header className="header">
            <div className="header-content">
                <div className="header-title-group">
                    <div className="lg:hidden text-xs font-extra-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-1">
                        GOSIA 2.0
                    </div>
                    <h1 className="header-title">{title}</h1>
                    {subtitle && <p className="header-subtitle">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-1">
                    <PushToggle />
                    <button className="header-logout" onClick={logout} title="Wyloguj">
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </header>
    );
}
