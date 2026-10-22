import { useState } from 'react';
import { Briefcase, Link2, X, FileText, Receipt } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { formatCurrency } from '../../utils/format';

const KIND_LABEL = { umowa: 'Umowa', rachunek: 'Rachunek', faktura: 'Faktura' };

function formatDay(value) {
    if (!value) return '';
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)).replace('.', '');
}

/**
 * Collaboration suggestions built from contracts and bills. Nothing is saved without
 * a tap: "Utwórz" opens the prefilled collaboration form, "Połącz" links the documents
 * with the matching existing collaboration, "Pomiń" stops suggesting them.
 */
export default function CollabSuggestionsSheet({ open, suggestions, onClose, onCreate, onLink, onDismiss }) {
    const [busy, setBusy] = useState(null);

    const run = async (key, fn) => {
        setBusy(key);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Propozycje współprac" description="Z umów i rachunków. Umowa i rachunek do tej samej pracy to jedna propozycja." size="lg">
            {suggestions.length === 0 ? (
                <p className="text-sm text-ink-muted py-6 text-center">Brak nowych propozycji.</p>
            ) : (
                <div className="space-y-3 pb-1">
                    {suggestions.map((s) => {
                        const link = s.action === 'link';
                        return (
                            <div key={s.key} className="rounded-2xl border border-line p-3.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-bold text-ink truncate">{link ? s.collaboration.brand : s.prefill.brand}</div>
                                        <div className="text-sm text-ink-soft">
                                            {formatCurrency(s.amount)} brutto · {formatDay(s.date)}
                                        </div>
                                    </div>
                                    <span className={`badge shrink-0 ${link ? 'badge-info' : 'badge-brand'}`}>{link ? 'Już jest' : 'Nowa'}</span>
                                </div>
                                <ul className="mt-2 space-y-1">
                                    {s.documents.map((d) => (
                                        <li key={d.id} className="flex items-center gap-1.5 text-xs text-ink-muted min-w-0">
                                            {d.doc_kind === 'umowa' ? <FileText size={12} className="shrink-0" /> : <Receipt size={12} className="shrink-0" />}
                                            <span className="font-semibold shrink-0">{KIND_LABEL[d.doc_kind] || 'Dokument'}:</span>
                                            <span className="truncate">{d.title}</span>
                                        </li>
                                    ))}
                                </ul>
                                {link && (
                                    <p className="text-xs text-ink-soft mt-2">
                                        Pasuje do współpracy z {formatDay(s.collaboration.date)} ({formatCurrency(s.collaboration.amount_gross)}) — dokumenty zostaną do niej podpięte, bez dublowania.
                                    </p>
                                )}
                                <div className="flex gap-2 mt-3">
                                    {link ? (
                                        <button type="button" disabled={busy === s.key} onClick={() => run(s.key, () => onLink(s))} className="btn btn-primary btn-sm flex-1">
                                            <Link2 size={14} /> Połącz
                                        </button>
                                    ) : (
                                        <button type="button" disabled={busy === s.key} onClick={() => onCreate(s)} className="btn btn-primary btn-sm flex-1">
                                            <Briefcase size={14} /> Utwórz współpracę…
                                        </button>
                                    )}
                                    <button type="button" disabled={busy === s.key} onClick={() => run(s.key, () => onDismiss(s))} className="btn btn-ghost btn-sm">
                                        <X size={14} /> Pomiń
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Sheet>
    );
}
