/**
 * Protected Route - redirects to login if not authenticated
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../ui/Skeleton';

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-ink-muted">
                <Spinner size={28} />
                <p className="text-sm">Ładowanie…</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}
