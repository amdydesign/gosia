import { useState } from 'react';
import { ChevronDown, HardDrive } from 'lucide-react';
import { formatBytes } from '../../utils/shares';

const OPEN_KEY = 'gosia-storage-open';

const PARTS = [
    { key: 'shares', label: 'Udostępnione rolki i pliki', color: 'bg-accent' },
    { key: 'documents', label: 'Dokumenty', color: 'bg-sky-400' },
    { key: 'attachments', label: 'Załączniki', color: 'bg-amber-400' },
    { key: 'inbox', label: 'Screeny', color: 'bg-violet-400' },
    { key: 'backups', label: 'Kopie zapasowe', color: 'bg-slate-400' },
];

function readOpen() {
    try {
        return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * How much the app keeps on the server: the total at a glance (green / amber / red
 * against the hosting plan when STORAGE_QUOTA_GB is set), the breakdown on tap.
 */
export default function StorageCard({ storage }) {
    const [open, setOpenState] = useState(readOpen);
    if (!storage) return null;

    const setOpen = (value) => {
        setOpenState(value);
        try {
            localStorage.setItem(OPEN_KEY, value ? '1' : '0');
        } catch {
            // storage blocked
        }
    };

    const { total, parts, quota, shares_bin: bin } = storage;
    const ratio = quota ? total / quota : null;
    const tone = ratio === null ? 'text-ink' : ratio < 0.7 ? 'text-emerald-600' : ratio < 0.9 ? 'text-amber-600' : 'text-red-600';
    const barTone = ratio === null ? '' : ratio < 0.7 ? 'bg-emerald-500' : ratio < 0.9 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div className="card overflow-hidden">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                <span className="w-9 h-9 rounded-xl bg-surface-2 text-ink-soft flex items-center justify-center shrink-0">
                    <HardDrive size={18} />
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-soft">
                        Zajęte miejsce: <b className={tone}>{formatBytes(total)}</b>
                        {quota ? (
                            <>
                                {' '}z {formatBytes(quota)} <span className="text-ink-muted">({Math.round(ratio * 100)}%)</span>
                            </>
                        ) : null}
                    </span>
                    {quota ? (
                        <span className="mt-1.5 block h-1.5 rounded-full bg-ink/5 overflow-hidden">
                            <span className={`block h-full ${barTone}`} style={{ width: `${Math.min(100, Math.max(1, ratio * 100))}%` }} />
                        </span>
                    ) : (
                        <span className="block text-xs text-ink-muted">wszystko, co aplikacja trzyma na serwerze</span>
                    )}
                </span>
                <ChevronDown size={18} className={`text-ink-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="px-4 pb-4 pt-1 space-y-2.5">
                    {PARTS.map((part) => {
                        const size = parts[part.key] || 0;
                        return (
                            <div key={part.key}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="text-ink-soft truncate">{part.label}</span>
                                    <b className="text-ink shrink-0">{formatBytes(size)}</b>
                                </div>
                                <div className="mt-1 h-1.5 rounded-full bg-ink/5 overflow-hidden">
                                    <div className={`h-full ${part.color}`} style={{ width: `${total ? Math.max(size ? 1 : 0, (size / total) * 100) : 0}%` }} />
                                </div>
                                {part.key === 'shares' && bin > 1024 * 1024 && (
                                    <div className="text-xs text-ink-muted mt-1">
                                        w tym <b className="text-ink-soft">{formatBytes(bin)}</b> w koszu — zniknie samo po 30 dniach
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
