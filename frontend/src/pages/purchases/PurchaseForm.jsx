import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ShoppingBag, CalendarClock, Link as LinkIcon, StickyNote } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Segmented from '../../components/ui/Segmented';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { RETURN_DAY_PRESETS, addDays, formatDateLong, getTodayDate, uniqueSorted } from '../../utils/format';

const EMPTY = {
    store: '',
    items: '',
    purchase_date: getTodayDate(),
    return_days: 14,
    amount: '',
    returned_amount: '',
    purchase_url: '',
    notes: '',
    status: 'kept',
};

export default function PurchaseForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();

    const [form, setForm] = useState(EMPTY);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [knownStores, setKnownStores] = useState([]);

    useEffect(() => {
        if (!isEdit) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await apiRequest(`/purchases/show.php?id=${id}`);
                if (cancelled) return;
                setForm({
                    store: data.store || '',
                    items: data.items || '',
                    purchase_date: data.purchase_date || '',
                    return_days: data.return_days || 14,
                    amount: data.amount || '',
                    returned_amount: data.returned_amount || '',
                    purchase_url: data.purchase_url || '',
                    notes: data.notes || '',
                    status: data.status || 'kept',
                });
            } catch (err) {
                if (!cancelled) setError(err.message || 'Błąd ładowania');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, isEdit]);

    useEffect(() => {
        let cancelled = false;
        apiRequest('/purchases/index.php')
            .then((data) => {
                if (!cancelled && Array.isArray(data)) setKnownStores(uniqueSorted(data.map((p) => p.store)));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const update = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    const deadline = useMemo(() => addDays(form.purchase_date, form.return_days), [form.purchase_date, form.return_days]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        const payload = {
            ...form,
            store: form.store.trim(),
            items: form.items.trim(),
            return_days: parseInt(form.return_days, 10) || 14,
            amount: parseFloat(form.amount) || 0,
            returned_amount: parseFloat(form.returned_amount) || 0,
            purchase_url: form.purchase_url.trim(),
        };
        try {
            if (isEdit) {
                await apiRequest(`/purchases/update.php?id=${id}`, 'PUT', payload);
                toast.success('Zmiany zapisane');
                refresh();
                navigate(`/purchases/${id}`, { replace: true });
            } else {
                const result = await apiRequest('/purchases/create.php', 'POST', payload);
                toast.success(`Dodano zakup: ${payload.store}`);
                refresh();
                navigate(result?.id ? `/purchases/${result.id}` : '/purchases', { replace: true });
            }
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            setSaving(false);
        }
    };

    if (loading) return <PageSkeleton />;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <div className="hidden lg:block mb-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">{isEdit ? 'Edycja zakupu' : 'Nowy zakup'}</h1>
                <p className="text-sm text-ink-muted">Zapisz co kupiłaś i do kiedy możesz to zwrócić.</p>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            <Card className="space-y-4">
                <h2 className="card-title flex items-center gap-2"><ShoppingBag size={16} className="text-primary-500" /> Co kupiłaś</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Sklep / marka" required>
                        <input
                            type="text"
                            list="store-suggestions"
                            className="input !font-medium"
                            value={form.store}
                            onChange={(e) => update('store', e.target.value)}
                            placeholder="np. Zara, Massimo Dutti…"
                            autoComplete="off"
                            required
                        />
                        <datalist id="store-suggestions">
                            {knownStores.map((s) => (
                                <option key={s} value={s} />
                            ))}
                        </datalist>
                    </Field>
                    <Field label="Kwota" suffix="zł">
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            className="input !font-bold !text-lg !pr-12"
                            value={form.amount}
                            onChange={(e) => update('amount', e.target.value)}
                            placeholder="0"
                        />
                    </Field>
                </div>
                <Field label="Rzeczy" required hint="Możesz wpisać kilka, oddzielając przecinkami.">
                    <input
                        type="text"
                        className="input"
                        value={form.items}
                        onChange={(e) => update('items', e.target.value)}
                        placeholder="np. Sukienka midi, botki, torebka"
                        required
                    />
                </Field>
            </Card>

            <Card className="space-y-4">
                <h2 className="card-title flex items-center gap-2"><CalendarClock size={16} className="text-primary-500" /> Termin zwrotu</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Data zakupu">
                        <input type="date" className="input" value={form.purchase_date} onChange={(e) => update('purchase_date', e.target.value)} required />
                    </Field>
                    <Field label="Dni na zwrot" suffix="dni">
                        <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            className="input !pr-14"
                            value={form.return_days}
                            onChange={(e) => update('return_days', e.target.value)}
                        />
                    </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                    {RETURN_DAY_PRESETS.map((d) => (
                        <button key={d} type="button" onClick={() => update('return_days', d)} className={`chip ${Number(form.return_days) === d ? 'chip-active' : ''}`}>
                            {d} dni
                        </button>
                    ))}
                </div>
                {deadline && (
                    <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-sm text-primary-900">
                        Zwrot możliwy do <strong>{formatDateLong(deadline)}</strong>
                        {Number(form.return_days) <= 7 && <span className="text-primary-700"> — krótko, przypomnimy Ci powiadomieniem.</span>}
                    </div>
                )}
            </Card>

            {isEdit && (
                <Card className="space-y-4">
                    <h2 className="card-title">Status</h2>
                    <Segmented
                        className="w-full"
                        value={form.status}
                        onChange={(v) => update('status', v)}
                        options={[
                            { value: 'kept', label: 'Zostawiam / czekam' },
                            { value: 'partial', label: 'Częściowy zwrot', tone: 'brand' },
                            { value: 'returned', label: 'Zwrócone', tone: 'success' },
                        ]}
                    />
                    {form.status !== 'kept' && (
                        <Field label="Kwota zwrócona" suffix="zł">
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                className="input !pr-12"
                                value={form.returned_amount}
                                onChange={(e) => update('returned_amount', e.target.value)}
                            />
                        </Field>
                    )}
                </Card>
            )}

            <Card className="space-y-4">
                <Field label={<span className="inline-flex items-center gap-1.5"><LinkIcon size={13} /> Link do produktu</span>} hint="Opcjonalnie — przydaje się przy zwrocie online.">
                    <input type="url" className="input" value={form.purchase_url} onChange={(e) => update('purchase_url', e.target.value)} placeholder="https://…" />
                </Field>
                <Field label={<span className="inline-flex items-center gap-1.5"><StickyNote size={13} /> Notatki</span>}>
                    <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Numer zamówienia, rozmiar, do jakiej stylizacji…" />
                </Field>
            </Card>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:static -mx-4 sm:mx-0 px-4 sm:px-0 py-3 lg:py-0 bg-canvas/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-line lg:border-0">
                <div className="flex gap-3">
                    <Button type="button" variant="secondary" onClick={() => navigate(-1)} className="flex-1 lg:flex-none">Anuluj</Button>
                    <Button type="submit" variant="primary" icon={Save} loading={saving} className="flex-[2] lg:flex-none lg:px-8">
                        {isEdit ? 'Zapisz zmiany' : 'Dodaj zakup'}
                    </Button>
                </div>
            </div>
        </form>
    );
}
