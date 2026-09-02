import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { DashboardProvider } from './context/DashboardContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { PageSkeleton } from './components/ui/Skeleton';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import SocialCallback from './pages/SocialCallback';

import CollaborationList from './pages/collaborations/CollaborationList';
import CollaborationForm from './pages/collaborations/CollaborationForm';
import CollaborationView from './pages/collaborations/CollaborationView';

import PurchaseList from './pages/purchases/PurchaseList';
import PurchaseForm from './pages/purchases/PurchaseForm';
import PurchaseView from './pages/purchases/PurchaseView';

import IdeaList from './pages/ideas/IdeaList';
import IdeaForm from './pages/ideas/IdeaForm';
import IdeaView from './pages/ideas/IdeaView';

import './App.css';

// Chart.js is only needed here - keep it out of the main bundle
const Statistics = lazy(() => import('./pages/Statistics'));

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <DashboardProvider>
                            <BrowserRouter>
                                <Routes>
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/forgot-password" element={<ForgotPassword />} />

                                    <Route
                                        path="/auth/callback/:platform"
                                        element={
                                            <ProtectedRoute>
                                                <SocialCallback />
                                            </ProtectedRoute>
                                        }
                                    />

                                    <Route
                                        element={
                                            <ProtectedRoute>
                                                <AppLayout />
                                            </ProtectedRoute>
                                        }
                                    >
                                        <Route path="/" element={<Dashboard />} />
                                        <Route path="/dashboard" element={<Dashboard />} />

                                        <Route path="/collaborations" element={<CollaborationList />} />
                                        <Route path="/collaborations/new" element={<CollaborationForm />} />
                                        <Route path="/collaborations/:id" element={<CollaborationView />} />
                                        <Route path="/collaborations/:id/edit" element={<CollaborationForm />} />

                                        <Route path="/purchases" element={<PurchaseList />} />
                                        <Route path="/purchases/new" element={<PurchaseForm />} />
                                        <Route path="/purchases/:id" element={<PurchaseView />} />
                                        <Route path="/purchases/:id/edit" element={<PurchaseForm />} />

                                        <Route path="/ideas" element={<IdeaList />} />
                                        <Route path="/ideas/new" element={<IdeaForm />} />
                                        <Route path="/ideas/:id" element={<IdeaView />} />
                                        <Route path="/ideas/:id/edit" element={<IdeaForm />} />

                                        <Route
                                            path="/statistics"
                                            element={
                                                <Suspense fallback={<PageSkeleton />}>
                                                    <Statistics />
                                                </Suspense>
                                            }
                                        />
                                    </Route>

                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </BrowserRouter>
                        </DashboardProvider>
                    </ConfirmProvider>
                </ToastProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
