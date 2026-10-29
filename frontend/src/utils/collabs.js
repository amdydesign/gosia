/**
 * Collaboration helpers: status, "jak ostatnio" memory and smart defaults.
 */
import { addDays, daysFromToday, toDateInput } from './format';

export const LATE_AFTER_DAYS = 30;

export const BILLING_OPTIONS = [
    { value: 'umowa_50', label: 'UoD 50%' },
    { value: 'umowa_20', label: 'UoD 20%' },
    { value: 'useme_50', label: 'Use.me 50%' },
    { value: 'useme_20', label: 'Use.me 20%' },
    { value: 'gotowka', label: 'Gotówka' },
];

export const TYPE_OPTIONS = [
    { value: 'reel', label: 'Rolka' },
    { value: 'post-instagram', label: 'Post' },
    { value: 'story', label: 'Stories' },
    { value: 'sesja', label: 'Sesja' },
    { value: 'event', label: 'Event' },
    { value: 'konsultacja', label: 'Konsultacja' },
    { value: 'inne', label: 'Inne' },
];

export const WAGE_TYPE = 'umowa-praca';

// "Płatność w ciągu": one tap, the last one with the brand is pre-selected
export const PAYMENT_DAY_PRESETS = [14, 30, 60];
export const DEFAULT_PAYMENT_DAYS = 30;

export function isPaid(c) {
    return c?.payment_status === 'paid';
}

/** Days since the collaboration date (0 for future dates). */
export function daysWaiting(c) {
    return Math.max(0, -(daysFromToday(c?.date) ?? 0));
}

/** Day the payment is due: published (or the deadline / work date) + payment term. */
export function paymentDue(c) {
    if (c?.payment_due) return c.payment_due;
    const base = c?.published_at || c?.publish_by || c?.date;
    return base ? toDateInput(addDays(base, Number(c?.payment_days) || DEFAULT_PAYMENT_DAYS)) : null;
}

/** Unpaid and either marked overdue or past the payment term (30 days unless set). */
export function isLate(c) {
    if (isPaid(c)) return false;
    if (c?.payment_status === 'overdue') return true;
    const due = paymentDue(c);
    return due ? (daysFromToday(due) ?? 0) < 0 : daysWaiting(c) > LATE_AFTER_DAYS;
}

/** Content still to publish (deadline set, not marked published). */
export function toPublish(c) {
    return !!c?.publish_by && !c?.published_at;
}

export function grossOf(c) {
    return Number(c?.amount_gross) > 0 ? Number(c.amount_gross) : Number(c?.amount_net) || 0;
}

export function netOf(c) {
    return Number(c?.amount_net) > 0 ? Number(c.amount_net) : grossOf(c);
}

export function wageLabel(dateString) {
    const d = dateString ? new Date(`${dateString}T12:00:00`) : new Date();
    return `Wypłata ${d.toLocaleString('pl-PL', { month: 'long' })} ${d.getFullYear()}`;
}

function mostCommon(values, fallback) {
    const counts = new Map();
    for (const v of values) {
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best = fallback;
    let max = 0;
    for (const [v, n] of counts) {
        if (n > max) {
            best = v;
            max = n;
        }
    }
    return best;
}

/**
 * From the collaboration history (newest first) build:
 *  - recent: brands for one-tap chips (most recent first, unique)
 *  - last(brand): latest collaboration with that brand
 *  - defaults: most used billing + type when the brand is new
 *  - lastWage: latest salary entry (for the "Wypłata" chip)
 */
export function buildBrandMemory(collabs = []) {
    const sorted = [...collabs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : Number(b.id) - Number(a.id)));
    const work = sorted.filter((c) => c.type !== WAGE_TYPE);
    const byBrand = new Map();
    for (const c of work) {
        const key = (c.brand || '').trim().toLowerCase();
        if (key && !byBrand.has(key)) byBrand.set(key, c);
    }

    const recentSlice = work.slice(0, 20);
    const billingValues = BILLING_OPTIONS.map((o) => o.value);
    const typeValues = TYPE_OPTIONS.map((o) => o.value);

    return {
        recent: Array.from(byBrand.values()).slice(0, 8).map((c) => c.brand.trim()),
        brands: Array.from(byBrand.values()).map((c) => c.brand.trim()),
        last: (brand) => byBrand.get((brand || '').trim().toLowerCase()) || null,
        defaults: {
            collab_type: mostCommon(recentSlice.map((c) => c.collab_type).filter((v) => billingValues.includes(v)), 'umowa_50'),
            type: mostCommon(recentSlice.map((c) => c.type).filter((v) => typeValues.includes(v)), 'reel'),
        },
        lastWage: sorted.find((c) => c.type === WAGE_TYPE) || null,
    };
}

// ---------------------------------------------------------------- brief: what to make

/** Not agreed yet (no contract / money): "W przygotowaniu", not counted as money to come. */
export function isBrief(c) {
    return c?.stage === 'brief' && !isPaid(c);
}

/** One tap adds (or adds one more of) the usual things. */
export const DELIVERABLE_PRESETS = ['Reels IG', 'Stories IG', 'Post IG', 'Karuzela IG', 'TikTok', 'YouTube'];

/** { done, total } over the whole list. */
export function deliverableProgress(c) {
    const list = Array.isArray(c?.deliverables) ? c.deliverables : [];
    return list.reduce((acc, d) => ({ done: acc.done + (Number(d.done) || 0), total: acc.total + (Number(d.count) || 0) }), { done: 0, total: 0 });
}

/** The nearest thing still to make: { index, label, left, due } (dated first, else the publish deadline) or null. */
export function nextDeliverable(c) {
    const list = Array.isArray(c?.deliverables) ? c.deliverables : [];
    let best = null;
    list.forEach((d, index) => {
        const left = (Number(d.count) || 0) - (Number(d.done) || 0);
        if (left <= 0) return;
        const due = d.due || c.publish_by || null;
        if (!best || (due && (!best.due || due < best.due))) best = { index, label: d.label, left, due };
    });
    return best;
}

/** "Co to było" guessed from the list (the most common kind of work). */
export function typeFromDeliverables(list) {
    const guess = (label) => {
        const l = (label || '').toLowerCase();
        if (/reel|rolk|tiktok|youtube|video|film/.test(l)) return 'reel';
        if (/stor|relac/.test(l)) return 'story';
        if (/post|karuzel|zdj[eę]ci|foto/.test(l)) return 'post-instagram';
        if (/sesj/.test(l)) return 'sesja';
        if (/event|wydarzen/.test(l)) return 'event';
        return null;
    };
    return mostCommon((list || []).flatMap((d) => Array(Number(d.count) || 1).fill(guess(d.label))).filter(Boolean), null);
}
