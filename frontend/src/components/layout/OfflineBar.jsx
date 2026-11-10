import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** One thin line while the phone is offline, so a failed save is not a surprise. */
export default function OfflineBar() {
    const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);

    useEffect(() => {
        const on = () => setOffline(false);
        const off = () => setOffline(true);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    if (!offline) return null;
    return (
        <div role="status" className="flex items-center justify-center gap-1.5 bg-amber-100 text-amber-900 text-xs font-semibold px-4 py-1.5">
            <WifiOff size={13} /> Brak internetu — zmiany się nie zapiszą
        </div>
    );
}
