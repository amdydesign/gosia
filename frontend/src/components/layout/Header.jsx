/**
 * Header Component
 */

import { useAuth } from '../../context/AuthContext';
import './Header.css';

export default function Header({ title, subtitle }) {
    const { user, logout } = useAuth();

    return (
        <header className="header">
            <div className="header-content">
                <div className="header-title-group">
                    <h1 className="header-title">{title}</h1>
                    {subtitle && <p className="header-subtitle">{subtitle}</p>}
                </div>
                <button className="header-logout" onClick={logout} title="Wyloguj">
                    🚪
                </button>
            </div>
        </header>
    );
}
