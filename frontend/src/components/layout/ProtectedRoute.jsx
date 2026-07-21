/**
 * Protected Route Component
 * Redirects to login if not authenticated
 */

import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Ładowanie...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Wspiera zarówno zagnieżdżone trasy (<Outlet/>), jak i pojedyncze dziecko
    return children ?? <Outlet />;
}
