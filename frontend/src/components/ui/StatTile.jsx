import { Link } from 'react-router-dom';

/**
 * Compact KPI tile. `tone`: default | brand | dark | warning | danger | success
 */
export default function StatTile({ label, value, sub, icon: Icon, tone = 'default', to, className = '' }) {
    const tones = {
        default: 'card text-ink',
        brand: 'bg-gradient-to-br from-primary-600 to-primary-800 text-white shadow-float border-0',
        dark: 'bg-gradient-to-br from-ink to-[#3a3034] text-white border-0 shadow-card',
        warning: 'card text-ink',
        danger: 'card text-ink',
        success: 'card text-ink',
    };
    const inverted = tone === 'brand' || tone === 'dark';
    const iconTone = {
        default: 'bg-primary-50 text-primary-600',
        brand: 'bg-white/15 text-white',
        dark: 'bg-white/10 text-white',
        warning: 'bg-amber-50 text-amber-600',
        danger: 'bg-red-50 text-red-600',
        success: 'bg-emerald-50 text-emerald-600',
    }[tone];

    const body = (
        <div className={`rounded-2xl p-4 sm:p-5 h-full flex flex-col justify-between gap-3 ${tones[tone]} ${to ? 'transition-transform hover:-translate-y-0.5' : ''} ${className}`}>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${inverted ? 'text-white/70' : 'text-ink-muted'}`}>
                    {label}
                </span>
                {Icon && (
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconTone}`}>
                        <Icon size={16} />
                    </span>
                )}
            </div>
            <div>
                <div className={`text-2xl sm:text-[26px] font-extrabold tracking-tight leading-none ${inverted ? 'text-white' : 'text-ink'}`}>
                    {value}
                </div>
                {sub && <div className={`text-xs mt-1.5 font-medium ${inverted ? 'text-white/70' : 'text-ink-muted'}`}>{sub}</div>}
            </div>
        </div>
    );

    return to ? (
        <Link to={to} className="block h-full">
            {body}
        </Link>
    ) : (
        body
    );
}
