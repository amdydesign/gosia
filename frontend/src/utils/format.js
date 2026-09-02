/**
 * Formatting helpers + domain dictionaries (labels, statuses, tax rules)
 */

// ---------- Money ----------
export function formatCurrency(amount, { compact = false } = {}) {
    const value = Number(amount) || 0;
    if (compact && Math.abs(value) >= 10000) {
        return `${(value / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}k zł`;
    }
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(value);
}

// ---------- Dates ----------
export function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    // "YYYY-MM-DD" -> local midnight (avoid TZ shift)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(dateString) {
    const date = parseDate(dateString);
    if (!date) return '';
    return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function formatDateShort(dateString) {
    const date = parseDate(dateString);
    if (!date) return '';
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
}

export function formatDateLong(dateString) {
    const date = parseDate(dateString);
    if (!date) return '';
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatWeekdayDate(date = new Date()) {
    const text = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatMonthYear(monthKey) {
    // monthKey: "YYYY-MM"
    const [y, m] = monthKey.split('-').map(Number);
    const text = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toDateInput(date = new Date()) {
    const d = date instanceof Date ? date : parseDate(date) || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getTodayDate() {
    return toDateInput(new Date());
}

export function addDays(dateString, days) {
    const d = parseDate(dateString);
    if (!d) return null;
    const copy = new Date(d);
    copy.setDate(copy.getDate() + Number(days || 0));
    return copy;
}

export function daysFromToday(dateString) {
    const d = parseDate(dateString);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
}

export function pluralDays(n) {
    const abs = Math.abs(n);
    if (abs === 1) return 'dzień';
    return 'dni';
}

export function greetingForHour(hour = new Date().getHours()) {
    if (hour < 5) return 'Dobrej nocy';
    if (hour < 11) return 'Dzień dobry';
    if (hour < 18) return 'Miłego dnia';
    return 'Dobry wieczór';
}

// ---------- Collaboration dictionaries ----------
export const COLLAB_TYPES = [
    { value: 'post-instagram', label: 'Post Instagram' },
    { value: 'story', label: 'Stories' },
    { value: 'reel', label: 'Reels' },
    { value: 'sesja', label: 'Sesja zdjęciowa' },
    { value: 'event', label: 'Event' },
    { value: 'konsultacja', label: 'Konsultacja' },
    { value: 'umowa-praca', label: 'Umowa o pracę (wypłata)' },
    { value: 'inne', label: 'Inne' },
];

export function getCollabTypeLabel(type) {
    const found = COLLAB_TYPES.find((t) => t.value === type);
    if (found) return found.label;
    const legacy = { paid: 'Płatna', barter: 'Barter', ambasador: 'Ambasadorska' };
    return legacy[type] || type || 'Inne';
}

export function getPaymentStatusInfo(status) {
    const statuses = {
        pending: { label: 'Czeka na płatność', short: 'Oczekuje', tone: 'warning' },
        paid: { label: 'Opłacona', short: 'Opłacona', tone: 'success' },
        overdue: { label: 'Zaległa płatność', short: 'Zaległa', tone: 'danger' },
    };
    return statuses[status] || { label: status, short: status, tone: 'neutral' };
}

// ---------- Purchases ----------
export function getReturnUrgency(daysRemaining) {
    const days = Number(daysRemaining);
    if (Number.isNaN(days)) return { level: 'unknown', tone: 'neutral', message: '', short: '' };
    if (days < 0) {
        return { level: 'overdue', tone: 'neutral', message: 'Termin minął', short: 'Minął' };
    }
    if (days === 0) {
        return { level: 'today', tone: 'danger', message: 'Dziś ostatni dzień!', short: 'Dziś!' };
    }
    if (days <= 3) {
        return { level: 'urgent', tone: 'danger', message: `Zostały ${days} ${pluralDays(days)}`, short: `${days} dni` };
    }
    if (days <= 7) {
        return { level: 'soon', tone: 'warning', message: `Zostało ${days} dni`, short: `${days} dni` };
    }
    return { level: 'ok', tone: 'success', message: `Zostało ${days} dni`, short: `${days} dni` };
}

export function getPurchaseStatusInfo(status, daysRemaining) {
    if (status === 'returned') return { label: 'Zwrócone', tone: 'success' };
    if (status === 'partial') return { label: 'Częściowy zwrot', tone: 'info' };
    if (Number(daysRemaining) < 0) return { label: 'Zostawione', tone: 'neutral' };
    return { label: 'Do decyzji', tone: 'warning' };
}

export const RETURN_DAY_PRESETS = [14, 30, 60, 100];

// ---------- Billing / tax ----------
export const BILLING_TYPES = {
    umowa_50: { label: 'Umowa o dzieło (50% KUP)', short: 'UoD 50%', kup: 0.50, tax: 0.12 },
    umowa_20: { label: 'Umowa o dzieło (20% KUP)', short: 'UoD 20%', kup: 0.20, tax: 0.12 },
    useme_50: { label: 'Use.me (50% KUP)', short: 'Use.me 50%', kup: 0.50, useme: true },
    useme_20: { label: 'Use.me (20% KUP)', short: 'Use.me 20%', kup: 0.20, useme: true },
    umowa_praca: { label: 'Umowa o pracę', short: 'UoP', tax: 0.12, private: false },
    gotowka: { label: 'Gotówka prywatna (nieformalna)', short: 'Gotówka', private: true },
};

export function getBillingLabel(collabType, { short = false } = {}) {
    const config = BILLING_TYPES[collabType];
    if (config) return short ? config.short : config.label;
    const legacy = { barter: 'Barter', other: short ? 'UoD 50%' : 'Umowa o dzieło (50% KUP)' };
    return legacy[collabType] || '';
}

// Calculate net amount ("na rękę")
export function calculateNetAmount(gross, type) {
    if (!gross) return 0;
    return getTaxBreakdown(gross, type).net;
}

// Full tax breakdown - the numbers Gosia sees in the form
export function getTaxBreakdown(grossInput, type) {
    const gross = parseFloat(grossInput || 0);
    if (!gross) return { gross: 0, net: 0, type, details: {} };

    const result = {
        gross,
        net: gross,
        type,
        details: {
            commission: 0,
            afterCommission: gross,
            kup: 0,
            taxBase: 0,
            tax: 0,
            zus: 0,
            health: 0
        }
    };

    if (!type || !BILLING_TYPES[type]) return result;
    const config = BILLING_TYPES[type];

    if (config.private) return result;

    if (type === 'umowa_praca') {
        const zus = gross * 0.1371;
        result.details.zus = zus;
        const healthBase = gross - zus;
        const health = healthBase * 0.09;
        result.details.health = health;
        const kup = 250;
        result.details.kup = kup;
        const taxBase = Math.max(0, gross - zus - kup);
        result.details.taxBase = taxBase;
        const taxVal = Math.max(0, (taxBase * 0.12) - 300);
        result.details.tax = taxVal;
        result.net = gross - zus - health - taxVal;
        return result;
    }

    let currentAmount = gross;

    if (config.useme) {
        let commission = currentAmount * 0.078;
        if (commission < 29) commission = 29;
        if (commission > currentAmount) commission = currentAmount;
        result.details.commission = commission;
        currentAmount -= commission;
        result.details.afterCommission = currentAmount;
    }

    const kupRate = config.kup || 0;
    const kupAmount = currentAmount * kupRate;
    result.details.kup = kupAmount;
    result.details.taxBase = currentAmount - kupAmount;

    const taxRate = config.tax || 0.12;
    const taxAmount = result.details.taxBase * taxRate;
    result.details.tax = taxAmount;

    result.net = currentAmount - taxAmount;
    return result;
}

// ---------- Text ----------
export function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

export function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
}

// Approximate speaking time for a script (Polish speech ~2.3 words/s)
export function estimateSpeechSeconds(text) {
    return Math.round(countWords(text) / 2.3);
}

export function formatSeconds(total) {
    const s = Math.max(0, Math.round(total));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0) return `${r} s`;
    return `${m}:${String(r).padStart(2, '0')} min`;
}

export function initials(text) {
    if (!text) return '?';
    return text.trim().charAt(0).toUpperCase();
}

// ---------- Grouping ----------
export function groupByMonth(items, dateKey = 'date') {
    const groups = new Map();
    for (const item of items) {
        const key = (item[dateKey] || '').slice(0, 7) || 'brak';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return Array.from(groups.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([key, list]) => ({ key, label: key === 'brak' ? 'Bez daty' : formatMonthYear(key), items: list }));
}

export function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean).map((v) => String(v).trim()))).sort((a, b) =>
        a.localeCompare(b, 'pl')
    );
}
