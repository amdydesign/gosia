import { NavLink } from 'react-router-dom';
import { ChevronRight, Settings } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { MORE_ITEMS } from './navItems';

/**
 * "Menu" (hamburger): the sections that do not fit the bar, plus settings.
 */
export default function NavMenuSheet({ open, onClose, onOpenSettings }) {
    const rowClass = 'w-full flex items-center gap-4 p-3.5 rounded-2xl border transition-colors text-left';

    return (
        <Sheet open={open} onClose={onClose} title="Menu" size="sm">
            <nav aria-label="Więcej" className="space-y-2 pb-2">
                {MORE_ITEMS.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `${rowClass} ${isActive ? 'border-primary-300 bg-primary-50/60' : 'border-line hover:border-primary-200 hover:bg-primary-50/40'}`
                        }
                    >
                        <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${item.tone}`}>
                            <item.icon size={22} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block font-bold text-ink">{item.label}</span>
                            <span className="block text-xs text-ink-muted">{item.text}</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </NavLink>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        onClose();
                        onOpenSettings();
                    }}
                    className={`${rowClass} border-line hover:border-primary-200 hover:bg-primary-50/40`}
                >
                    <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-surface-2 text-ink-soft">
                        <Settings size={22} />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block font-bold text-ink">Ustawienia</span>
                        <span className="block text-xs text-ink-muted">Powiadomienia, kosz, konto</span>
                    </span>
                    <ChevronRight size={18} className="text-ink-muted" />
                </button>
            </nav>
        </Sheet>
    );
}
