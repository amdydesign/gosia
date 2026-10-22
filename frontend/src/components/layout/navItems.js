import { LayoutDashboard, ShoppingBag, Briefcase, BarChart2, Lightbulb, FolderLock } from 'lucide-react';

export const NAV_ITEMS = [
    { path: '/dashboard', label: 'Start', icon: LayoutDashboard, key: 'dashboard' },
    { path: '/collaborations', label: 'Współprace', icon: Briefcase, key: 'collaborations' },
    { path: '/purchases', label: 'Zakupy', icon: ShoppingBag, key: 'purchases' },
    { path: '/ideas', label: 'Pomysły', icon: Lightbulb, key: 'ideas' },
    { path: '/statistics', label: 'Statystyki', icon: BarChart2, key: 'statistics' },
    // Bottom tab bar has room for 5 - on mobile the archive is opened from Settings
    { path: '/documents', label: 'Dokumenty', icon: FolderLock, key: 'documents', mobile: false },
];
