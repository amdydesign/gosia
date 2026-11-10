import { RefreshCw } from 'lucide-react';

/** A list that failed to load: say so and offer one retry (never pretend it is empty). */
export default function LoadError({ message = 'Nie udało się wczytać', onRetry, className = '' }) {
    return (
        <div className={`flex items-center gap-3 bg-red-50 text-red-700 border border-red-100 px-4 py-2 rounded-xl text-sm ${className}`} role="alert">
            <span className="flex-1 min-w-0 py-1.5">{message}</span>
            {onRetry && (
                <button type="button" onClick={onRetry} className="shrink-0 inline-flex items-center gap-1.5 min-h-11 px-2 -mr-2 font-bold hover:opacity-80">
                    <RefreshCw size={15} /> Spróbuj ponownie
                </button>
            )}
        </div>
    );
}
