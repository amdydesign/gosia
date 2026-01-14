import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';

// Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import SocialCallback from './pages/SocialCallback';

// Collaborations Pages
import CollaborationList from './pages/collaborations/CollaborationList';
import CollaborationNew from './pages/collaborations/CollaborationNew';
import CollaborationEdit from './pages/collaborations/CollaborationEdit';
import CollaborationView from './pages/collaborations/CollaborationView';

// Purchases Pages (formerly Returns)
import PurchaseList from './pages/purchases/PurchaseList';
import PurchaseNew from './pages/purchases/PurchaseNew';
import PurchaseEdit from './pages/purchases/PurchaseEdit';
import PurchaseView from './pages/purchases/PurchaseView';

// Ideas Pages
import IdeaList from './pages/ideas/IdeaList';
import IdeaForm from './pages/ideas/IdeaForm';
import IdeaView from './pages/ideas/IdeaView';

// Global styles
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Protected routes with layout */}
            <Route path="/" element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              </ProtectedRoute>
            } />

            {/* Collaborations Routes */}
            <Route path="/collaborations" element={
              <ProtectedRoute>
                <AppLayout>
                  <CollaborationList />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/collaborations/new" element={
              <ProtectedRoute>
                <AppLayout>
                  <CollaborationNew />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/collaborations/:id" element={
              <ProtectedRoute>
                <AppLayout>
                  <CollaborationView />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/collaborations/:id/edit" element={
              <ProtectedRoute>
                <AppLayout>
                  <CollaborationEdit />
                </AppLayout>
              </ProtectedRoute>
            } />

            {/* Purchases Routes */}
            <Route path="/purchases" element={
              <ProtectedRoute>
                <AppLayout>
                  <PurchaseList />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/purchases/new" element={
              <ProtectedRoute>
                <AppLayout>
                  <PurchaseNew />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/purchases/:id" element={
              <ProtectedRoute>
                <AppLayout>
                  <PurchaseView />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/purchases/:id/edit" element={
              <ProtectedRoute>
                <AppLayout>
                  <PurchaseEdit />
                </AppLayout>
              </ProtectedRoute>
            } />

            {/* Ideas Routes */}
            <Route path="/ideas" element={
              <ProtectedRoute>
                <AppLayout>
                  <IdeaList />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/ideas/new" element={
              <ProtectedRoute>
                <AppLayout>
                  <IdeaForm />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/ideas/:id" element={
              <ProtectedRoute>
                <AppLayout>
                  <IdeaView />
                </AppLayout>
              </ProtectedRoute>
            } />
            <Route path="/ideas/:id/edit" element={
              <ProtectedRoute>
                <AppLayout>
                  <IdeaForm />
                </AppLayout>
              </ProtectedRoute>
            } />

            {/* Statistics Route */}
            <Route path="/statistics" element={
              <ProtectedRoute>
                <AppLayout>
                  <Statistics />
                </AppLayout>
              </ProtectedRoute>
            } />

            {/* Social Auth Callback */}
            <Route path="/auth/callback/:platform" element={
              <ProtectedRoute>
                {/* No layout, just clean generic callback page */}
                <SocialCallback />
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
