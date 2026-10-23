import { useCallback, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDashboard } from '../context/DashboardContext';

/**
 * One-tap purchase decisions with undo:
 *   returned(p)  - sent back, full refund
 *   keep(p)      - "zostawiam" (stops reminders)
 *   settle(toReturn, toKeep) - one return for a brand: these go back, those stay
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

    const settle = useCallback(
        async (toReturn, toKeep) => {
            const patches = [
                ...toReturn.map((p) => [p, { status: 'returned', returned_amount: Number(p.amount) || 0, kept_confirmed: 0 }]),
                ...toKeep.map((p) => [p, { kept_confirmed: 1 }]),
            ];
            const done = [];
            for (const [p, patch] of patches) {
                try {
                    await apiRequest(`/purchases/update.php?id=${p.id}`, 'PUT', patch);
                    onChange?.(p.id, patch);
                    done.push(p);
                } catch {
                    // reported below
                }
            }
            refresh();
            if (done.length < patches.length) toast.error('Nie wszystko udało się zapisać — spróbuj jeszcze raz');
            if (!done.length) return false;
            const back = toReturn.filter((p) => done.includes(p));
            const sum = back.reduce((s, p) => s + (Number(p.amount) || 0), 0);
            const undo = () =>
                done.forEach((p) => update(p, back.includes(p) ? { status: 'kept', returned_amount: 0, kept_confirmed: 0 } : { kept_confirmed: 0 }));
            toast.success(
                back.length
                    ? `Zwrot: ${back.length} ${back.length === 1 ? 'rzecz' : 'rzeczy'} · ${sum.toLocaleString('pl-PL')} zł`
                    : `${done.length} ${done.length === 1 ? 'rzecz zostaje' : 'rzeczy zostaje'} u Ciebie`,
                { duration: 6000, action: { label: 'Cofnij', onClick: undo } }
            );
            return true;
        },
        [onChange, refresh, toast, update]
    );

    return { update, returned, keep, settle, busyId };
}

function shortName(p) {
    const name = p.items || p.store || 'Zakup';
    return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}
