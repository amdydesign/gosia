import { useCallback, useEffect, useState } from 'react';
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from '../services/push';

/**
 * Push notification state: 'unsupported' | 'install' (iPhone, not on home screen) | 'denied' | 'subscribed' | 'unsubscribed'
 */
export function usePush() {
    const [status, setStatus] = useState('unsupported');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        getPushStatus().then((s) => mounted && setStatus(s));
        return () => {
            mounted = false;
        };
    }, []);

    const toggle = useCallback(async () => {
        if (busy) return { ok: false };
        setBusy(true);
        try {
            if (status === 'subscribed') {
                await unsubscribeFromPush();
                setStatus('unsubscribed');
                return { ok: true, status: 'unsubscribed' };
            }
            if (status === 'install') {
                return { ok: false, message: 'Najpierw dodaj Gonię do ekranu głównego i otwórz ją z ikony.' };
            }
            if (status === 'denied') {
                return { ok: false, message: 'Powiadomienia są zablokowane w ustawieniach przeglądarki dla tej strony.' };
            }
            await subscribeToPush();
            setStatus('subscribed');
            return { ok: true, status: 'subscribed' };
        } catch (err) {
            setStatus(await getPushStatus());
            return { ok: false, message: err?.message || 'Nie udało się zmienić ustawień powiadomień' };
        } finally {
            setBusy(false);
        }
    }, [busy, status]);

    return { status, busy, toggle, supported: status !== 'unsupported', needsInstall: status === 'install' };
}
