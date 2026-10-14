import { useCallback, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDashboard } from '../context/DashboardContext';

/**
 * One-tap purchase decisions with undo:
 *   returned(p)  - sent back, full refund
 *   keep(p)      - "zostawiam" (stops reminders)
 *   update(p, patch)
 * onChange(id, patch) lets the caller update its local list immediately.
 */
export function usePurchaseActions({ onChange } = {}) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [busyId, setBusyId] = useState(null);

    const update = useCallback(
        async (purchase, patch) => {
            setBusyId(purchase.id);
            try {
                await apiRequest(`/purchases/update.php?id=${purchase.id}`, 'PUT', patch);
                onChange?.(purchase.id, patch);
                refresh();
                return true;
            } catch (err) {
                toast.error(err.message || 'Nie udało się zapisać');
                return false;
            } finally {
                setBusyId(null);
            }
        },
        [onChange, refresh, toast]
    );

    const returned = useCallback(
        async (purchase, amount = Number(purchase.amount) || 0) => {
            const full = amount >= (Number(purchase.amount) || 0);
            const ok = await update(purchase, { status: full ? 'returned' : 'partial', returned_amount: amount, kept_confirmed: 0 });
            if (ok) {
                toast.success(`${shortName(purchase)} — zwrócone${amount ? ` (${amount.toLocaleString('pl-PL')} zł)` : ''}`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => update(purchase, { status: 'kept', returned_amount: 0 }) },
                });
            }
            return ok;
        },
        [toast, update]
    );

    const keep = useCallback(
        async (purchase) => {
            const ok = await update(purchase, { kept_confirmed: 1 });
            if (ok) {
                toast.success(`${shortName(purchase)} — zostaje u Ciebie`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => update(purchase, { kept_confirmed: 0 }) },
                });
            }
            return ok;
        },
        [toast, update]
    );

    const keepMany = useCallback(
        async (purchases) => {
            const done = [];
            for (const p of purchases) {
                try {
                    await apiRequest(`/purchases/update.php?id=${p.id}`, 'PUT', { kept_confirmed: 1 });
                    onChange?.(p.id, { kept_confirmed: 1 });
                    done.push(p);
                } catch {
                    // reported below
                }
            }
            refresh();
            if (done.length < purchases.length) toast.error('Nie wszystko udało się zapisać');
            if (done.length) {
                toast.success(`${done.length} ${done.length === 1 ? 'rzecz zostaje' : 'rzeczy zostaje'} u Ciebie`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => done.forEach((p) => update(p, { kept_confirmed: 0 })) },
                });
            }
        },
        [onChange, refresh, toast, update]
    );

    return { update, returned, keep, keepMany, busyId };
}

function shortName(p) {
    const name = p.items || p.store || 'Zakup';
    return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}
