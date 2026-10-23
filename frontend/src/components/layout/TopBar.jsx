import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import { usePreferences } from '../../context/PreferencesContext';
import Logo from '../ui/Logo';
import { NAV_ITEMS } from './navItems';

/**
 * Desktop: logo, pill navigation, "Dodaj" and the profile avatar in one row.
 * Phone: logo (Start) or page title, amount privacy toggle and avatar; navigation lives in MobileNav.
 */
export default function TopBar({ meta, onOpenProfile, onAdd }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { badges } = useDashboard();
    const { amountsHidden, toggleAmounts } = usePreferences();
    const initial = (user?.username || 'G').charAt(0).toUpperCase();

    const privacyButton = (
        <button
            type="button"
            onClick={toggleAmounts}
            aria-pressed={amountsHidden}
            aria-label={amountsHidden ? 'Pokaż kwoty' : 'Ukryj kwoty'}
            title={amountsHidden ? 'Pokaż kwoty' : 'Ukryj kwoty'}
            className={`w-11 h-11 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                amountsHidden ? 'bg-ink text-canvas border-ink' : 'bg-surface text-ink border-line-strong hover:bg-surface-2'
            }`}
        >
            {amountsHidden ? <Eye size={19} /> : <EyeOff size={19} />}
        </button>
    );

    const avatar = (
        <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Profil i ustawienia"
            title="Profil i ustawienia"
            className="w-11 h-11 rounded-full bg-surface-2 border border-line text-ink font-semibold flex items-center justify-center hover:border-line-strong transition-colors shrink-0"
        >
            {initial}
        </button>
    );

    return (
        <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            {/* Desktop */}
            <div className="hidden lg:flex mx-auto w-full max-w-6xl px-10 h-[76px] items-center gap-6">
                <Link to="/dashboard" className="shrink-0" aria-label="Start">
                    <Logo />
                </Link>
                <nav aria-label="Główna" className="flex items-center gap-1 p-1 bg-surface border border-line rounded-full">
                    {NAV_ITEMS.map((item) => {
                        const badge = badges[item.key];
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `h-9 px-4 rounded-full inline-flex items-center gap-2 text-sm font-medium transition-colors ${
                                        isActive ? 'nav-active' : 'text-ink-muted hover:text-ink'
                                    }`
                                }
                            >
                                {item.label}
                                {badge > 0 && (
                                    <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-secondary text-on-secondary text-[11px] font-semibold inline-flex items-center justify-center">
                                        {badge}
                                    </span>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>
                <div className="flex-1" />
                {privacyButton}
                <button type="button" onClick={onAdd} className="btn btn-primary !rounded-full !h-11 !px-5">
                    <Plus size={17} strokeWidth={2.5} /> Dodaj
                </button>
                {avatar}
            </div>

            {/* Phone */}
            <div className="lg:hidden px-4 h-16 flex items-center gap-2">
                {meta.back ? (
                    <>
                        <button
                            type="button"
                            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(meta.back))}
                            className="w-11 h-11 -ml-2 rounded-full text-ink flex items-center justify-center hover:bg-ink/5"
                            aria-label="Wstecz"
                        >
                            <ArrowLeft size={22} />
                        </button>
                        <h1 className="flex-1 min-w-0 font-display text-lg font-semibold tracking-tight text-ink truncate">{meta.title}</h1>
                    </>
                ) : meta.section === 'dashboard' ? (
                    <Link to="/dashboard" className="flex-1" aria-label="Start">
                        <Logo size="sm" />
                    </Link>
                ) : (
                    <h1 className="flex-1 min-w-0 font-display text-xl font-semibold tracking-tight text-ink truncate">{meta.title}</h1>
                )}
                {privacyButton}
                {avatar}
            </div>
        </header>
    );
}
