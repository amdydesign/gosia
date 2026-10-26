import { useState } from 'react';
import { CalendarClock, Check, Pencil, ShieldAlert } from 'lucide-react';
import Button from '../ui/Button';
import documentsService from '../../services/documents';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { daysFromToday, formatDateLong } from '../../utils/format';

const DATE_FIELDS = [
    { key: 'publish_by', label: 'Publikacja do' },
    { key: 'exclusivity_until', label: 'Wyłączność do' },
    { key: 'license_until', label: 'Licencja na wizerunek do' },
    { key: 'payment_due', label: 'Płatność do' },
];

function tone(date) {
    const days = daysFromToday(date);
    if (days === null) return 'text-ink';
    if (days < 0) return 'text-ink-muted line-through';
    if (days <= 3) return 'text-secondary font-semibold';
    return 'text-ink';
}

/**
 * "Warunki z umowy": deadlines and limits read from the contract (AI or the text) -
 * they become reminders on Start and fill the linked collaboration.
 */
export default function ContractTerms({ doc, onSaved }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const terms = doc.terms || {};
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(terms);
    const [saving, setSaving] = useState(false);
    const hasAny = Object.keys(terms).length > 0;

    if (!hasAny && !editing) {
        return (
            <button type="button" onClick={() => setEditing(true)} className="w-full rounded-2xl border border-dashed border-line-strong px-3 py-2.5 text-left text-xs text-ink-muted hover:bg-surface-2">
                <span className="font-semibold text-ink">Warunki z umowy</span> — terminy, wyłączność, licencja. Uzupełnią się same po „Rozpoznaj AI”, albo wpisz je tutaj.
            </button>
        );
    }

    const save = async () => {
        setSaving(true);
        try {
            await documentsService.update(doc.id, { terms: draft });
            toast.success('Zapisane — przypomnę o terminach');
            setEditing(false);
            refresh();
            onSaved?.();
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    if (editing) {
        const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
        return (
            <div className="rounded-2xl border border-line p-3 space-y-3">
                <div className="text-sm font-semibold text-ink">Warunki z umowy</div>
                <div className="grid grid-cols-2 gap-2">
                    {DATE_FIELDS.map((f) => (
                        <label key={f.key} className="text-xs text-ink-muted">
                            {f.label}
                            <input type="date" className="input !py-2 mt-1" value={draft[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
                        </label>
                    ))}
                    <label className="text-xs text-ink-muted">
                        Płatność w ciągu (dni)
                        <input className="input !py-2 mt-1" inputMode="numeric" value={draft.payment_days || ''} onChange={(e) => set('payment_days', e.target.value.replace(/\D/g, ''))} />
                    </label>
                    <label className="text-xs text-ink-muted">
                        Poprawki w cenie
                        <input className="input !py-2 mt-1" inputMode="numeric" value={draft.revisions || ''} onChange={(e) => set('revisions', e.target.value.replace(/\D/g, ''))} />
                    </label>
                </div>
                <label className="block text-xs text-ink-muted">
                    Wyłączność dotyczy
                    <input className="input !py-2 mt-1" value={draft.exclusivity_scope || ''} onChange={(e) => set('exclusivity_scope', e.target.value)} placeholder="np. kosmetyki do włosów" />
                </label>
                <label className="block text-xs text-ink-muted">
                    Co trzeba zrobić
                    <input className="input !py-2 mt-1" value={draft.deliverables || ''} onChange={(e) => set('deliverables', e.target.value)} placeholder="np. 1 rolka + 3 stories" />
                </label>
                <label className="block text-xs text-ink-muted">
                    Kary umowne
                    <input className="input !py-2 mt-1" value={draft.penalty || ''} onChange={(e) => set('penalty', e.target.value)} />
                </label>
                <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => { setDraft(terms); setEditing(false); }}>Anuluj</Button>
                    <Button variant="primary" className="flex-1" icon={Check} loading={saving} onClick={save}>Zapisz</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-line p-3">
            <div className="flex items-center gap-2 mb-1">
                <CalendarClock size={16} className="text-primary-500 shrink-0" />
                <span className="text-sm font-semibold text-ink flex-1">Warunki z umowy</span>
                <button type="button" onClick={() => { setDraft(terms); setEditing(true); }} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:bg-ink/5" aria-label="Popraw warunki">
                    <Pencil size={14} />
                </button>
            </div>
            <dl className="text-sm divide-y divide-line">
                {terms.deliverables && <Item label="Do zrobienia">{terms.deliverables}</Item>}
                {DATE_FIELDS.filter((f) => terms[f.key]).map((f) => (
                    <Item key={f.key} label={f.label}>
                        <span className={tone(terms[f.key])}>
                            {formatDateLong(terms[f.key])}
                            {f.key === 'exclusivity_until' && terms.exclusivity_scope ? ` · ${terms.exclusivity_scope}` : ''}
                        </span>
                    </Item>
                ))}
                {terms.payment_days && <Item label="Płatność w ciągu">{terms.payment_days} dni</Item>}
                {terms.revisions && <Item label="Poprawki w cenie">{terms.revisions}</Item>}
                {terms.penalty && (
                    <Item label="Kary umowne">
                        <span className="inline-flex items-start gap-1.5"><ShieldAlert size={14} className="text-secondary mt-0.5 shrink-0" />{terms.penalty}</span>
                    </Item>
                )}
            </dl>
        </div>
    );
}

function Item({ label, children }) {
    return (
        <div className="flex justify-between gap-3 py-1.5">
            <dt className="text-xs text-ink-muted shrink-0 pt-0.5">{label}</dt>
            <dd className="text-right text-ink min-w-0 break-words">{children}</dd>
        </div>
    );
}
