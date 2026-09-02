/**
 * Segmented control (filters / status pickers).
 * options: [{ value, label, count?, tone? }]
 */
export default function Segmented({ options, value, onChange, className = '', activeTone }) {
    return (
        <div className={`segmented ${className}`} role="tablist">
            {options.map((opt) => {
                const active = opt.value === value;
                const toneClass = active && (opt.tone || activeTone) ? TONES[opt.tone || activeTone] : '';
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(opt.value)}
                        className={`segmented-item ${active ? 'segmented-item-active' : ''} ${toneClass}`}
                    >
                        <span className="inline-flex items-center gap-1.5">
                            {opt.icon && <opt.icon size={14} />}
                            {opt.label}
                            {opt.count !== undefined && opt.count !== null && (
                                <span
                                    className={`text-[10px] px-1.5 rounded-full ${active ? 'bg-ink/10 text-ink' : 'bg-black/5 text-ink-muted'}`}
                                >
                                    {opt.count}
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

const TONES = {
    success: '!bg-emerald-600 !text-white',
    warning: '!bg-amber-500 !text-white',
    danger: '!bg-red-600 !text-white',
    brand: '!bg-primary-600 !text-white',
    dark: '!bg-ink !text-white',
};
