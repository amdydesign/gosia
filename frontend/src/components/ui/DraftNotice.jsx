/** One quiet line above a form that was filled in from a saved draft. */
export default function DraftNotice({ onDiscard, className = '' }) {
    return (
        <p className={`flex items-center gap-1 text-xs text-ink-muted ${className}`}>
            Przywrócono szkic ·
            <button type="button" onClick={onDiscard} className="min-h-11 px-1.5 -my-3 font-semibold text-primary-700 hover:text-primary-800">
                Wyczyść
            </button>
        </p>
    );
}
