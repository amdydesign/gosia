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

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Statistics from './pages/Statistics';
import SocialCallback from './pages/SocialCallback';
import Collaborations from './pages/collaborations/Collaborations';
import Purchases from './pages/purchases/Purchases';

import Documents from './pages/documents/Documents';
import IdeaList from './pages/ideas/IdeaList';
import IdeaForm from './pages/ideas/IdeaForm';
import IdeaView from './pages/ideas/IdeaView';

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

                                            <Route path="/statistics" element={<Statistics />} />
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
