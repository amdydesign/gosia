/** Formatting for "Udostępnij" (sizes in GB / MB, server dates "YYYY-MM-DD HH:MM:SS"). */

export function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n === 0) return '0 MB';
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace(/\.0$/, '').replace('.', ',')} GB`;
    if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Safari cannot parse "YYYY-MM-DD HH:MM:SS" - read it by hand. */
export function parseServerDate(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
}

export function formatShareDate(value, withTime = false) {
    const date = parseServerDate(value);
    if (!date) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const time = withTime ? ` ${date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : '';
    if (date.toDateString() === today.toDateString()) return `dziś${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `wczoraj${time}`;
    const opts = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
    return new Intl.DateTimeFormat('pl-PL', opts).format(date).replace('.', '') + time;
}

export function toDay(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
