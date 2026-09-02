import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, Lock, Wallet, Info, Users, Briefcase, StickyNote } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Segmented from '../../components/ui/Segmented';
import { PageSkeleton } from '../../components/ui/Skeleton';
import TaxBreakdown from '../../components/collaborations/TaxBreakdown';
import { BILLING_TYPES, COLLAB_TYPES, getTaxBreakdown, getTodayDate, uniqueSorted, formatCurrency } from '../../utils/format';

const EMPTY = {
    brand: '',
    type: 'post-instagram',
    collab_type: 'umowa_50',
    fiscal_tracking: true,
    amount_gross: '',
    date: getTodayDate(),
    payment_status: 'pending',
    notes: '',
    team: [],
};

function wageLabel(dateString) {
    const dateObj = dateString ? new Date(dateString) : new Date();
    const monthName = dateObj.toLocaleString('pl-PL', { month: 'long' });
    return `Wypłata ${monthName} ${dateObj.getFullYear()}`;
}

/**
 * Create + edit form for a collaboration. Also handles "duplicate" via location.state.prefill.
 */
export default function CollaborationForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const { refresh } = useDashboard();

    const [form, setForm] = useState(() => ({ ...EMPTY, ...(location.state?.prefill || {}) }));
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [knownBrands, setKnownBrands] = useState([]);

    // Load existing collaboration for edit
    useEffect(() => {
        if (!isEdit) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await apiRequest(`/collaborations/show.php?id=${id}`);
                if (cancelled) return;
                setForm({
                    brand: data.brand || '',
                    type: data.type || 'inne',
                    collab_type: BILLING_TYPES[data.collab_type] ? data.collab_type : 'umowa_50',
                    fiscal_tracking: Number(data.fiscal_tracking) === 1,
                    amount_gross: data.amount_gross && Number(data.amount_gross) > 0 ? data.amount_gross : data.amount_net || '',
                    date: data.date || '',
                    payment_status: data.payment_status || 'pending',
                    notes: data.notes || '',
                    team: (data.team || []).map((m) => ({
                        name: m.name,
                        amount: m.amount || '',
                        is_paid: m.is_paid === true || m.is_paid === 'true' || Number(m.is_paid) === 1,
                    })),
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

    // Brand suggestions from history
    useEffect(() => {
        let cancelled = false;
        apiRequest('/collaborations/index.php')
            .then((data) => {
                if (!cancelled && Array.isArray(data)) {
                    setKnownBrands(uniqueSorted(data.filter((c) => c.type !== 'umowa-praca').map((c) => c.brand)));
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const update = (name, value) => {
        setForm((prev) => {
            const next = { ...prev, [name]: value };

            if (name === 'type') {
                if (value === 'umowa-praca') {
                    next.brand = wageLabel(next.date);
                    next.collab_type = 'umowa_praca';
                    next.fiscal_tracking = true;
                } else if (prev.type === 'umowa-praca') {
                    next.collab_type = 'umowa_50';
                    if (prev.brand.startsWith('Wypłata ')) next.brand = '';
                }
            }
            if (name === 'date' && prev.type === 'umowa-praca') {
                next.brand = wageLabel(value);
            }
            if (name === 'collab_type') {
                if (value === 'gotowka') {
                    next.fiscal_tracking = false;
                    if (!isEdit) next.payment_status = 'paid';
                } else {
                    next.fiscal_tracking = true;
                    if (!isEdit && prev.collab_type === 'gotowka') next.payment_status = 'pending';
                }
            }
            return next;
        });
    };

    const updateTeam = (index, field, value) => {
        setForm((prev) => ({
            ...prev,
            team: prev.team.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
        }));
    };

    const breakdown = useMemo(() => getTaxBreakdown(form.amount_gross, form.collab_type), [form.amount_gross, form.collab_type]);
    const isCash = form.collab_type === 'gotowka';
    const isUseme = form.collab_type.startsWith('useme');
    const isWage = form.type === 'umowa-praca';
    const teamTotal = form.team.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.brand.trim()) {
            setError('Podaj nazwę marki lub klienta.');
            return;
        }
        setSaving(true);
        setError('');

        const payload = {
            ...form,
            brand: form.brand.trim(),
            amount_gross: parseFloat(form.amount_gross || 0),
            amount_net: breakdown.net,
            fiscal_tracking: !isCash,
            team: form.team.filter((m) => m.name && m.name.trim()),
        };

        try {
            if (isEdit) {
                await apiRequest(`/collaborations/update.php?id=${id}`, 'PUT', payload);
                toast.success('Zmiany zapisane');
                refresh();
                navigate(`/collaborations/${id}`, { replace: true });
            } else {
                const result = await apiRequest('/collaborations/create.php', 'POST', payload);
                toast.success(`Dodano współpracę z ${payload.brand}`);
                refresh();
                navigate(result?.id ? `/collaborations/${result.id}` : '/collaborations', { replace: true });
            }
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            setSaving(false);
        }
    };

    if (loading) return <PageSkeleton />;

    const billingOptions = Object.entries(BILLING_TYPES).filter(([key]) => key !== 'umowa_praca' || isWage);
    const statusOptions = isCash
        ? [
            { value: 'paid', label: 'Otrzymana', tone: 'success' },
            { value: 'pending', label: 'Oczekuję', tone: 'warning' },
        ]
        : [
            { value: 'pending', label: 'Oczekuje', tone: 'warning' },
            { value: 'paid', label: 'Opłacona', tone: 'success' },
            { value: 'overdue', label: 'Zaległa', tone: 'danger' },
        ];

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <div className="hidden lg:block mb-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">{isEdit ? 'Edycja współpracy' : 'Nowa współpraca'}</h1>
                <p className="text-sm text-ink-muted">Kwotę wpisujesz brutto, a „na rękę” liczymy automatycznie.</p>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            {/* Details */}
            <Card className="space-y-4">
                <SectionTitle icon={Briefcase} title="Co i dla kogo" />
                <Field label="Marka / klient" required>
                    <input
                        type="text"
                        list="brand-suggestions"
                        className="input !text-base !font-medium"
                        value={form.brand}
                        onChange={(e) => update('brand', e.target.value)}
                        disabled={isWage}
                        placeholder="np. Zalando, Reserved…"
                        autoComplete="off"
                        required
                    />
                    <datalist id="brand-suggestions">
                        {knownBrands.map((b) => (
                            <option key={b} value={b} />
                        ))}
                    </datalist>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Typ zlecenia">
                        <select className="input" value={form.type} onChange={(e) => update('type', e.target.value)}>
                            {COLLAB_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Data">
                        <input type="date" className="input" value={form.date} onChange={(e) => update('date', e.target.value)} required />
                    </Field>
                </div>
            </Card>

            {/* Money */}
            <Card className="space-y-4">
                <SectionTitle icon={Wallet} title="Rozliczenie" />
                <Field label="Forma rozliczenia">
                    <select className="input" value={form.collab_type} onChange={(e) => update('collab_type', e.target.value)} disabled={isWage}>
                        {billingOptions.map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                        ))}
                    </select>
                </Field>

                {isCash && (
                    <div className="flex items-start gap-3 rounded-xl bg-stone-100 p-3 text-xs text-ink-soft">
                        <Lock size={16} className="shrink-0 mt-0.5" />
                        <span><strong className="text-ink">Transakcja prywatna.</strong> Nie wchodzi do oficjalnych rozliczeń PIT i eksportu „Oficjalne”.</span>
                    </div>
                )}

                <Field label={isCash ? 'Kwota otrzymana' : 'Kwota umówiona (brutto)'} suffix="zł">
                    <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        className="input !text-xl !font-bold !pr-12"
                        value={form.amount_gross}
                        onChange={(e) => update('amount_gross', e.target.value)}
                        placeholder="0"
                    />
                </Field>

                <TaxBreakdown breakdown={breakdown} collabType={form.collab_type} />

                {isUseme && (
                    <div className="flex items-start gap-3 rounded-xl bg-sky-50 border border-sky-100 p-3 text-xs text-sky-800">
                        <Info size={16} className="shrink-0 mt-0.5" />
                        <span>Use.me rozlicza podatek za Ciebie i wysyła PIT-11 w lutym kolejnego roku.</span>
                    </div>
                )}

                <Field label="Status płatności">
                    <Segmented options={statusOptions} value={form.payment_status} onChange={(v) => update('payment_status', v)} className="w-full" />
                </Field>
            </Card>

            {/* Team */}
            <Card className="space-y-3">
                <div className="flex items-center justify-between">
                    <SectionTitle icon={Users} title="Zespół" hint="opcjonalnie" />
                    <Button
                        type="button"
                        size="sm"
                        variant="soft"
                        icon={Plus}
                        onClick={() => setForm((p) => ({ ...p, team: [...p.team, { name: '', amount: '', is_paid: false }] }))}
                    >
                        Dodaj osobę
                    </Button>
                </div>
                {form.team.length === 0 ? (
                    <p className="text-sm text-ink-muted">Fotograf, wizażystka, asystentka… Zapisz kto pracował i czy już zapłaciłaś.</p>
                ) : (
                    <div className="space-y-2">
                        {form.team.map((member, index) => (
                            <div key={index} className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl bg-canvas border border-line p-2.5">
                                <input
                                    placeholder="Imię i nazwisko"
                                    value={member.name}
                                    onChange={(e) => updateTeam(index, 'name', e.target.value)}
                                    className="input !py-2 flex-1 min-w-[140px]"
                                />
                                <div className="relative w-32">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        placeholder="Koszt"
                                        value={member.amount}
                                        onChange={(e) => updateTeam(index, 'amount', e.target.value)}
                                        className="input !py-2 !pr-8"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-muted">zł</span>
                                </div>
                                <label className={`chip cursor-pointer select-none ${member.is_paid ? '!bg-emerald-600 !text-white !border-emerald-600' : ''}`}>
                                    <input type="checkbox" className="hidden" checked={!!member.is_paid} onChange={(e) => updateTeam(index, 'is_paid', e.target.checked)} />
                                    {member.is_paid ? 'Opłacono' : 'Do zapłaty'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setForm((p) => ({ ...p, team: p.team.filter((_, i) => i !== index) }))}
                                    className="p-2 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50"
                                    aria-label="Usuń osobę"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {teamTotal > 0 && (
                            <p className="text-xs text-ink-muted text-right">
                                Koszty zespołu: <strong className="text-ink">{formatCurrency(teamTotal)}</strong>
                                {breakdown.net > 0 && <> · zostaje Ci ok. <strong className="text-emerald-700">{formatCurrency(breakdown.net - teamTotal)}</strong></>}
                            </p>
                        )}
                    </div>
                )}
            </Card>

            <Card>
                <SectionTitle icon={StickyNote} title="Notatki" hint="opcjonalnie" />
                <textarea
                    className="input mt-3 min-h-[96px]"
                    value={form.notes}
                    onChange={(e) => update('notes', e.target.value)}
                    placeholder="Ustalenia, terminy publikacji, numer faktury…"
                />
            </Card>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:static -mx-4 sm:mx-0 px-4 sm:px-0 py-3 lg:py-0 bg-canvas/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-line lg:border-0">
                <div className="flex gap-3">
                    <Button type="button" variant="secondary" onClick={() => navigate(-1)} className="flex-1 lg:flex-none">
                        Anuluj
                    </Button>
                    <Button type="submit" variant="primary" icon={Save} loading={saving} className="flex-[2] lg:flex-none lg:px-8">
                        {isEdit ? 'Zapisz zmiany' : 'Zapisz współpracę'}
                    </Button>
                </div>
            </div>
        </form>
    );
}

function SectionTitle({ icon: Icon, title, hint }) {
    return (
        <h2 className="card-title flex items-center gap-2">
            {Icon && <Icon size={16} className="text-primary-500" />}
            {title}
            {hint && <span className="text-xs font-medium text-ink-muted">· {hint}</span>}
        </h2>
    );
}
