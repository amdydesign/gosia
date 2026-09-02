import { Search, X } from 'lucide-react';

export default function SearchInput({ value, onChange, placeholder = 'Szukaj…', className = '', autoFocus = false }) {
    return (
        <div className={`relative ${className}`}>
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className="input !pl-10 !pr-9 !py-2.5 !rounded-xl"
                enterKeyHint="search"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-muted hover:bg-black/5 hover:text-ink"
                    aria-label="Wyczyść"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
