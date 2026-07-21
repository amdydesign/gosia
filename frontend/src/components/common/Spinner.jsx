/**
 * Współdzielony wskaźnik ładowania. `fullScreen` — wyśrodkowany na całym ekranie
 * (np. fallback Suspense), domyślnie wariant inline do wstawienia w treść.
 */
export default function Spinner({ fullScreen = false, label = 'Ładowanie...' }) {
    const spinner = (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            {label && <p className="text-sm text-gray-500">{label}</p>}
        </div>
    );

    if (fullScreen) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50">{spinner}</div>;
    }
    return spinner;
}
