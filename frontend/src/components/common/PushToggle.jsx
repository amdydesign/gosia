import { useState, useEffect } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../../services/push';

/**
 * Bell button toggling push notifications.
 * Renders nothing when push is unsupported (e.g. dev mode, old browser, http).
 */
export default function PushToggle() {
    const [status, setStatus] = useState('unsupported');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        getPushStatus().then((s) => mounted && setStatus(s));
        return () => { mounted = false; };
    }, []);

    if (status === 'unsupported') return null;

    const handleClick = async () => {
        if (busy) return;
        setBusy(true);
        try {
            if (status === 'subscribed') {
                await unsubscribeFromPush();
                setStatus('unsubscribed');
            } else if (status === 'denied') {
                alert('Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.');
            } else {
                await subscribeToPush();
                setStatus('subscribed');
            }
        } catch (err) {
            setStatus(await getPushStatus());
            alert(err?.message || 'Nie udało się zmienić ustawień powiadomień');
        } finally {
            setBusy(false);
        }
    };

    const icon = status === 'subscribed'
        ? <BellRing size={20} />
        : status === 'denied'
            ? <BellOff size={20} />
            : <Bell size={20} />;

    return (
        <button
            className="header-logout"
            onClick={handleClick}
            disabled={busy}
            title={status === 'subscribed' ? 'Wyłącz powiadomienia' : 'Włącz powiadomienia o zwrotach i płatnościach'}
            style={status === 'subscribed' ? { color: '#9333ea' } : undefined}
        >
            {icon}
        </button>
    );
}
