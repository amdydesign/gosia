/**
 * Purchase helpers: buckets, order grouping, store memory.
 */
import { formatDateShort } from './format';

export const RETURN_DAY_PRESETS = [14, 30, 60, 100];

export function isReturned(p) {
    return p.status === 'returned' || p.status === 'partial';
}

/** "active" = waiting for a decision, "kept" = stays with you, "returned" = sent back */
export function bucket(p) {
    if (isReturned(p)) return 'returned';
    if (Number(p.kept_confirmed) === 1 || Number(p.days_remaining) < 0) return 'kept';
    return 'active';
}

/** Group purchases bought together (same store + date) into one "order". */
export function groupOrders(purchases) {
    const groups = new Map();
    for (const p of purchases) {
        const key = `${(p.store || '').trim().toLowerCase()}|${p.purchase_date}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                store: p.store,
                purchase_date: p.purchase_date,
                return_deadline: p.return_deadline,
                days_remaining: Number(p.days_remaining),
                items: [],
            });
        }
        const g = groups.get(key);
        g.items.push(p);
        if (Number(p.days_remaining) < g.days_remaining) {
            g.days_remaining = Number(p.days_remaining);
            g.return_deadline = p.return_deadline;
        }
    }
    return Array.from(groups.values());
}

export function deadlineTone(days) {
    if (days <= 2) return 'danger';
    if (days <= 6) return 'warning';
    return 'ok';
}

export function deadlineText(days, deadline) {
    if (days < 0) return 'Termin minął';
    if (days === 0) return 'Ostatni dzień!';
    if (days === 1) return 'Jutro koniec';
    return `${days} dni · do ${formatDateShort(deadline)}`;
}

/** Latest return window used per store (lowercase name -> days). */
export function buildStoreMemory(purchases = []) {
    const sorted = [...purchases].sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1));
    const days = new Map();
    const stores = [];
    for (const p of sorted) {
        const key = (p.store || '').trim().toLowerCase();
        if (!key || days.has(key)) continue;
        days.set(key, Number(p.return_days) || 14);
        stores.push(p.store.trim());
    }
    return {
        stores,
        returnDays: (store) => days.get((store || '').trim().toLowerCase()) || null,
    };
}

/** Local copy of a purchase after an update (keeps returned_at in sync). */
export function withPatch(p, patch) {
    if (!p || !patch) return p;
    const next = { ...p, ...patch };
    if (patch.status === 'returned' || patch.status === 'partial') next.returned_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (patch.status === 'kept') next.returned_at = null;
    return next;
}
