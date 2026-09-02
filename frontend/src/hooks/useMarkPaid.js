import { useCallback, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useToast } from '../context/ToastContext';
import { useDashboard } from '../context/DashboardContext';

/**
 * One-tap "mark as paid" with undo. Returns { markPaid, setStatus, busyId }.
 */
export function useMarkPaid() {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [busyId, setBusyId] = useState(null);

    const setStatus = useCallback(
        async (id, payment_status) => {
            setBusyId(id);
            try {
                await apiRequest(`/collaborations/update.php?id=${id}`, 'PUT', { payment_status });
                refresh();
                return true;
            } catch (err) {
                toast.error(err.message || 'Nie udało się zapisać statusu');
                return false;
            } finally {
                setBusyId(null);
            }
        },
        [refresh, toast]
    );

    const markPaid = useCallback(
        async (collab, { onChange } = {}) => {
            const previous = collab.payment_status;
            const ok = await setStatus(collab.id, 'paid');
            if (!ok) return false;
            onChange?.(collab.id, 'paid');
            toast.success(`${collab.brand} — oznaczono jako opłacone`, {
                duration: 5000,
                action: {
                    label: 'Cofnij',
                    onClick: async () => {
                        const reverted = await setStatus(collab.id, previous || 'pending');
                        if (reverted) onChange?.(collab.id, previous || 'pending');
                    },
                },
            });
            return true;
        },
        [setStatus, toast]
    );

    return { markPaid, setStatus, busyId };
}
