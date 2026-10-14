/**
 * One-tap choice row (replaces <select>). options: [{ value, label, icon? }]
 */
export default function ChoiceChips({ options, value, onChange, className = '' }) {
    return (
        <div className={`flex flex-wrap gap-2 ${className}`} role="radiogroup">
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(opt.value)}
                        className={`choice ${active ? 'choice-active' : ''}`}
                    >
                        {opt.icon && <opt.icon size={15} />}
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
