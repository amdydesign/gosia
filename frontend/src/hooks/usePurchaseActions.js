import { useCallback, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDashboard } from '../context/DashboardContext';
import { getTodayDate } from '../utils/format';

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
        async (toReturn, toKeep, returnCost = null) => {
            const patches = [
                // the parcel's postage goes on its first item
                ...toReturn.map((p, i) => [p, { status: 'returned', returned_amount: Number(p.amount) || 0, kept_confirmed: 0, ...(i === 0 && returnCost !== null ? { return_cost: returnCost } : {}) }]),
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
                done.forEach((p) => update(p, back.includes(p) ? { status: 'kept', returned_amount: 0, kept_confirmed: 0, return_cost: null } : { kept_confirmed: 0 }));
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

    /** "Paczka przyszła dziś" for a whole parcel - the return window starts again from today. */
    const delivered = useCallback(
        async (items) => {
            const today = getTodayDate();
            for (const p of items) await update(p, { delivered_at: today });
            toast.success('Termin zwrotu liczę od dziś', {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => items.forEach((p) => update(p, { delivered_at: null })) },
            });
        },
        [toast, update]
    );

    /** "Pieniądze są": the refund is on the account. */
    const refunded = useCallback(
        async (items) => {
            for (const p of items) await update(p, { refunded_at: 'today' });
            const sum = items.reduce((s, p) => s + Math.max(0, (Number(p.returned_amount) || 0) - (Number(p.return_cost) || 0)), 0);
            toast.success(`+${sum.toLocaleString('pl-PL')} zł wróciło`, {
                duration: 5000,
                action: { label: 'Cofnij', onClick: () => items.forEach((p) => update(p, { refunded_at: null })) },
            });
        },
        [toast, update]
    );

    return { update, returned, keep, settle, delivered, refunded, busyId };
}

function shortName(p) {
    const name = p.items || p.store || 'Zakup';
    return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}
