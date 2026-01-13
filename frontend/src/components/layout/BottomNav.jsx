/**
 * Bottom Navigation Component
 * Mobile-friendly tab navigation
 */

import { NavLink } from 'react-router-dom';
import './BottomNav.css';

export default function BottomNav() {
    return (
        <nav className="bottom-nav">
            <div className="bottom-nav-content">
                <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
                    <span className="nav-icon">🏠</span>
                    <span className="nav-label">Dashboard</span>
                </NavLink>
                <NavLink to="/collaborations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <span className="nav-icon">💼</span>
                    <span className="nav-label">Współprace</span>
                </NavLink>
                <NavLink to="/returns" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <span className="nav-icon">🛍️</span>
                    <span className="nav-label">Zwroty</span>
                </NavLink>
                <NavLink to="/statistics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <span className="nav-icon">📊</span>
                    <span className="nav-label">Statystyki</span>
                </NavLink>
            </div>
        </nav>
    );
}
