import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/format';
import SearchInput from '../ui/SearchInput';

const norm = (value) => (value || '').toString().trim().toLowerCase();

/**
 * A document without a collaboration: one tap adds it to an existing one.
 * The collaboration of the same brand is guessed and shown first; the rest is behind "Inna współpraca".
 */
export default function LinkToCollab({ doc, onLink, onCreate }) {
    const [collabs, setCollabs] = useState(null); // null = loading
    const [failed, setFailed] = useState(false);
    const [picking, setPicking] = useState(false);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        apiRequest('/collaborations/index.php')
            .then((data) => !cancelled && setCollabs(Array.isArray(data) ? data : []))
            .catch(() => {
                if (cancelled) return;
                setCollabs([]);
                setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [doc.id]);

    // same brand (or contractor) as on the document - newest first, as the list already comes
    const guesses = useMemo(() => {
        const names = [norm(doc.brand), norm(doc.counterparty)].filter((n) => n.length >= 2);
        if (!collabs || !names.length) return [];
        return collabs.filter((c) => names.some((n) => norm(c.brand).includes(n) || n.includes(norm(c.brand)))).slice(0, 2);
    }, [collabs, doc.brand, doc.counterparty]);

    const others = useMemo(() => {
        if (!collabs) return [];
        const q = norm(query);
        const guessed = new Set(guesses.map((c) => c.id));
        return collabs.filter((c) => !guessed.has(c.id) && (!q || norm(c.brand).includes(q))).slice(0, 8);
    }, [collabs, guesses, query]);

    const link = async (collab) => {
        if (busy) return;
        setBusy(true);
        try {
            await onLink(doc, collab);
        } finally {
            setBusy(false);
        }
    };

    const row = (collab, primary) => (
        <button
            key={collab.id}
            type="button"
            onClick={() => link(collab)}
            disabled={busy}
            className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                primary ? 'border-primary-300 bg-primary-50/60 dark:bg-primary-500/10' : 'border-line hover:border-primary-300'
            }`}
        >
            <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink truncate">{collab.brand}</div>
                <div className="text-xs text-ink-muted">
                    {formatDate(collab.date)}
                    {Number(collab.amount_gross) > 0 && <span className="amount"> · {formatCurrency(collab.amount_gross)}</span>}
                </div>
            </div>
            <span className={`text-xs font-bold shrink-0 ${primary ? 'text-primary-700' : 'text-ink-soft'}`}>Dodaj tutaj</span>
        </button>
    );

    const loading = collabs === null;
    const showList = picking || (!loading && !guesses.length && collabs.length > 0);

    return (
        <div className="mt-2.5 space-y-2">
            {loading && <div className="h-11 rounded-xl bg-canvas animate-pulse" />}
            {failed && <p className="text-xs text-ink-muted">Nie udało się wczytać współprac.</p>}

            {guesses.map((c) => row(c, true))}

            {showList && (
                <>
                    {collabs.length > 6 && <SearchInput value={query} onChange={setQuery} placeholder="Szukaj marki…" />}
                    {others.map((c) => row(c, false))}
                    {!others.length && query && <p className="text-xs text-ink-muted">Nie ma takiej współpracy.</p>}
                </>
            )}

            <div className="flex gap-2">
                {!loading && !showList && collabs.length > guesses.length && (
                    <button type="button" onClick={() => setPicking(true)} className="btn btn-ghost btn-sm flex-1">
                        <Briefcase size={14} /> Inna współpraca
                    </button>
                )}
                <button type="button" onClick={() => onCreate(doc)} className={`btn btn-sm flex-1 ${!loading && !collabs.length ? 'btn-soft' : 'btn-ghost'}`}>
                    <Plus size={14} /> Nowa współpraca
                </button>
            </div>
        </div>
    );
}
