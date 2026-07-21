import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import Spinner from './components/common/Spinner';

// Login ładowany od razu (pierwszy ekran), reszta leniwie (code-splitting)
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Statistics = lazy(() => import('./pages/Statistics'));
const SocialCallback = lazy(() => import('./pages/SocialCallback'));

const CollaborationList = lazy(() => import('./pages/collaborations/CollaborationList'));
const CollaborationNew = lazy(() => import('./pages/collaborations/CollaborationNew'));
const CollaborationEdit = lazy(() => import('./pages/collaborations/CollaborationEdit'));
const CollaborationView = lazy(() => import('./pages/collaborations/CollaborationView'));

const PurchaseList = lazy(() => import('./pages/purchases/PurchaseList'));
const PurchaseNew = lazy(() => import('./pages/purchases/PurchaseNew'));
const PurchaseEdit = lazy(() => import('./pages/purchases/PurchaseEdit'));
const PurchaseView = lazy(() => import('./pages/purchases/PurchaseView'));

const IdeaList = lazy(() => import('./pages/ideas/IdeaList'));
const IdeaForm = lazy(() => import('./pages/ideas/IdeaForm'));
const IdeaView = lazy(() => import('./pages/ideas/IdeaView'));

import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Spinner fullScreen />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Social OAuth callback — chroniony, bez layoutu */}
              <Route element={<ProtectedRoute />}>
                <Route path="/auth/callback/:platform" element={<SocialCallback />} />
              </Route>

              {/* Chronione trasy ze wspólnym layoutem */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />

                  <Route path="/collaborations" element={<CollaborationList />} />
                  <Route path="/collaborations/new" element={<CollaborationNew />} />
                  <Route path="/collaborations/:id" element={<CollaborationView />} />
                  <Route path="/collaborations/:id/edit" element={<CollaborationEdit />} />

                  <Route path="/purchases" element={<PurchaseList />} />
                  <Route path="/purchases/new" element={<PurchaseNew />} />
                  <Route path="/purchases/:id" element={<PurchaseView />} />
                  <Route path="/purchases/:id/edit" element={<PurchaseEdit />} />

                  <Route path="/ideas" element={<IdeaList />} />
                  <Route path="/ideas/new" element={<IdeaForm />} />
                  <Route path="/ideas/:id" element={<IdeaView />} />
                  <Route path="/ideas/:id/edit" element={<IdeaForm />} />

                  <Route path="/statistics" element={<Statistics />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
