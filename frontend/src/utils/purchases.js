/**
 * Purchase helpers: buckets, order grouping, store memory.
 */
import { addDays, daysFromToday, formatDateShort, toDateInput } from './format';

export const RETURN_DAY_PRESETS = [14, 30, 60, 100];

// What sending a parcel back usually costs (paid label / fee taken off the refund)
export const RETURN_COST_PRESETS = [0, 4.9, 6.9, 9.9];

export function isReturned(p) {
    return p.status === 'returned' || p.status === 'partial';
}

/** Sent back, money not confirmed yet (the shop has 14 days). */
export function refundPending(p) {
    return isReturned(p) && !p.refunded_at && Number(p.returned_amount) > 0;
}

/** What really came back: the refund minus what sending the parcel cost. */
export function recoveredOf(p) {
    return Math.max(0, (Number(p.returned_amount) || 0) - (Number(p.return_cost) || 0));
}

/** "active" = waiting for a decision, "kept" = stays with you, "returned" = sent back */
export function bucket(p) {
    if (isReturned(p)) return 'returned';
    if (Number(p.kept_confirmed) === 1 || Number(p.days_remaining) < 0) return 'kept';
    return 'active';
}

/**
 * One return per brand: everything from the same store waiting for a decision,
 * whichever order it came from. The earliest deadline counts for the whole return.
 */
export function groupByStore(purchases) {
    const groups = new Map();
    for (const p of purchases) {
        const key = (p.store || '').trim().toLowerCase() || `#${p.id}`;
        if (!groups.has(key)) {
            groups.set(key, { key, store: p.store, return_deadline: p.return_deadline, days_remaining: Number(p.days_remaining), items: [] });
        }
        const g = groups.get(key);
        g.items.push(p);
        if (Number(p.days_remaining) < g.days_remaining) {
            g.days_remaining = Number(p.days_remaining);
            g.return_deadline = p.return_deadline;
        }
    }
    for (const g of groups.values()) {
        g.items.sort((a, b) => (a.purchase_date < b.purchase_date ? -1 : a.purchase_date > b.purchase_date ? 1 : a.id - b.id));
        g.orders = new Set(g.items.map((p) => p.purchase_date)).size;
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
    const costs = new Map();
    const stores = [];
    for (const p of sorted) {
        const key = (p.store || '').trim().toLowerCase();
        if (key && !costs.has(key) && p.return_cost !== null && p.return_cost !== undefined) costs.set(key, Number(p.return_cost));
        if (!key || days.has(key)) continue;
        days.set(key, Number(p.return_days) || 14);
        stores.push(p.store.trim());
    }
    return {
        stores,
        returnDays: (store) => days.get((store || '').trim().toLowerCase()) || null,
        // "jak ostatnio": postage of the last parcel to this shop
        returnCost: (store) => (costs.has((store || '').trim().toLowerCase()) ? costs.get((store || '').trim().toLowerCase()) : null),
    };
}

/** Local copy of a purchase after an update (keeps returned_at in sync). */
export function withPatch(p, patch) {
    if (!p || !patch) return p;
    const next = { ...p, ...patch };
    if (patch.status === 'returned' || patch.status === 'partial') next.returned_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (patch.status === 'kept') {
        next.returned_at = null;
        next.refunded_at = null;
    }
    if (patch.refunded_at === 'today') next.refunded_at = toDateInput(new Date());
    // "Paczka przyszła": the window counts from delivery
    if ('delivered_at' in patch || 'return_days' in patch || 'purchase_date' in patch) {
        const deadline = toDateInput(addDays(next.delivered_at || next.purchase_date, Number(next.return_days) || 0));
        next.return_deadline = deadline;
        next.days_remaining = daysFromToday(deadline);
    }
    return next;
}
