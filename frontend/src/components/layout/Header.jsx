import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';
import './Header.css';

export default function Header({ title, subtitle }) {
    const { user, logout } = useAuth();

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
                <button className="header-logout" onClick={logout} title="Wyloguj">
                    <LogOut size={20} />
                </button>
            </div>
        </header>
    );
}
