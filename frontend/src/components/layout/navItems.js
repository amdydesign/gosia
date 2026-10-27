import { LayoutDashboard, ShoppingBag, Briefcase, BarChart2, Lightbulb, FolderLock, Send } from 'lucide-react';

// Always visible (bottom bar on the phone, pills on the desktop)
export const NAV_ITEMS = [
    { path: '/dashboard', label: 'Start', icon: LayoutDashboard, key: 'dashboard' },
    { path: '/collaborations', label: 'Współprace', icon: Briefcase, key: 'collaborations' },
    { path: '/purchases', label: 'Zakupy', icon: ShoppingBag, key: 'purchases' },
    { path: '/ideas', label: 'Pomysły', icon: Lightbulb, key: 'ideas' },
];

// Behind "Menu" - less often used, so the bar stays short
export const MORE_ITEMS = [
    { path: '/share', label: 'Udostępnij', text: 'Rolki dla marek — wyślij link', icon: Send, key: 'share', tone: 'bg-primary-50 text-primary-600' },
    { path: '/documents', label: 'Dokumenty', text: 'Umowy i dokumenty poufne', icon: FolderLock, key: 'documents', tone: 'bg-sky-50 text-sky-600' },
    { path: '/statistics', label: 'Statystyki', text: 'Zarobki i social media', icon: BarChart2, key: 'statistics', tone: 'bg-amber-50 text-amber-600' },
];

/** The "Menu" item for the current page, if it is one of them. */
export function activeMoreItem(pathname) {
    return MORE_ITEMS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`)) || null;
}
