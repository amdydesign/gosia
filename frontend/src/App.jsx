import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { DashboardProvider } from './context/DashboardContext';
import { QuickActionsProvider } from './context/QuickActionsContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { Spinner } from './components/ui/Skeleton';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';

// Start and login load with the app; every other screen is fetched when first opened.
// A screen that cannot be fetched (new deploy) lands in ErrorBoundary: "Jest nowa wersja · Odśwież".
const Statistics = lazy(() => import('./pages/Statistics'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Assistant = lazy(() => import('./pages/Assistant'));
const SocialCallback = lazy(() => import('./pages/SocialCallback'));
const Collaborations = lazy(() => import('./pages/collaborations/Collaborations'));
const Purchases = lazy(() => import('./pages/purchases/Purchases'));
const Documents = lazy(() => import('./pages/documents/Documents'));
const Shares = lazy(() => import('./pages/shares/Shares'));
const IdeaList = lazy(() => import('./pages/ideas/IdeaList'));
const IdeaForm = lazy(() => import('./pages/ideas/IdeaForm'));
const IdeaView = lazy(() => import('./pages/ideas/IdeaView'));

import './App.css';

function App() {
    return (
        <ErrorBoundary>
            <PreferencesProvider>
            <AuthProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <DashboardProvider>
                            <BrowserRouter>
                                <QuickActionsProvider>
                                    <Routes>
                                        <Route path="/login" element={<Login />} />
                                        <Route path="/forgot-password" element={<ForgotPassword />} />
                                        <Route path="/reset-password" element={<ResetPassword />} />

                                        <Route
                                            path="/auth/callback/:platform"
                                            element={
                                                <ProtectedRoute>
                                                    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center"><Spinner size={28} /></div>}>
                                                        <SocialCallback />
                                                    </Suspense>
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

                                            <Route path="/collaborations" element={<Collaborations />} />
                                            <Route path="/collaborations/new" element={<Collaborations />} />
                                            <Route path="/collaborations/:id" element={<Collaborations />} />
                                            <Route path="/collaborations/:id/edit" element={<Collaborations />} />

                                            <Route path="/purchases" element={<Purchases />} />
                                            <Route path="/purchases/new" element={<Purchases />} />
                                            <Route path="/purchases/:id" element={<Purchases />} />
                                            <Route path="/purchases/:id/edit" element={<Purchases />} />

                                            <Route path="/ideas" element={<IdeaList />} />
                                            <Route path="/ideas/new" element={<IdeaForm />} />
                                            <Route path="/ideas/:id" element={<IdeaView />} />
                                            <Route path="/ideas/:id/edit" element={<IdeaForm />} />

                                            <Route path="/documents" element={<Documents />} />
                                            <Route path="/share" element={<Shares />} />

                                            <Route path="/statistics" element={<Statistics />} />
                                            <Route path="/calendar" element={<Calendar />} />
                                            <Route path="/assistant" element={<Assistant />} />
                                        </Route>

                                        <Route path="*" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </QuickActionsProvider>
                            </BrowserRouter>
                        </DashboardProvider>
                    </ConfirmProvider>
                </ToastProvider>
            </AuthProvider>
            </PreferencesProvider>
        </ErrorBoundary>
    );
}

export default App;
