import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Briefcase, CalendarClock, Camera, Check, ChevronDown, FileText, Loader2, Plus, Trash2, Wallet, X } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import ChoiceChips from '../ui/ChoiceChips';
import { apiRequest } from '../../utils/api';
import { readScreens } from '../../services/ai';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { addDays, formatCurrency, getTaxBreakdown, getTodayDate, openPicker, parseAmount, yesterdayDate, formatDateShort } from '../../utils/format';
import { BILLING_OPTIONS, PAYMENT_DAY_PRESETS, TYPE_OPTIONS, WAGE_TYPE, buildBrandMemory, grossOf, typeFromDeliverables, wageLabel } from '../../utils/collabs';
import { uploadAttachment } from '../../services/attachments';
import DeliverablesEditor from './DeliverablesEditor';

const today = getTodayDate();

const STAGE_OPTIONS = [
    { value: 'brief', label: 'Brief — jeszcze bez umowy' },
    { value: 'agreed', label: 'Ustalona' },
];

/**
 * Quick add / edit collaboration. Minimum input: brand + amount - everything
 * else is pre-filled from the last collaboration with that brand (payment term too).
 * A brief (PDF / screen) fills it too: "Brief" stage, the list of things to make,
 * and the file gets attached to the collaboration.
 * initialFiles: a screen handed over from the inbox - read right away.
 */
export default function CollabFormSheet({ collabId, prefill, initialFiles, onClose, onSaved }) {
    const isEdit = !!collabId;
    const toast = useToast();
    const { data: dashboard, refresh } = useDashboard();
    const aiEnabled = !!dashboard?.ai?.enabled;

    const [form, setForm] = useState(() => ({
        brand: '',
        amount: '',
        collab_type: 'umowa_50',
        type: 'reel',
        date: today,
        paid: false,
        notes: '',
        team: [],
        payment_days: null, // null = 30 days (default)
        publish_by: '',
        paid_at: '',
        brief: false, // not agreed yet - "W przygotowaniu"
        deliverables: [], // [{ label, count, done, due }]
        ...normalizePrefill(prefill),
    }));
    const [sourceFiles, setSourceFiles] = useState([]); // the brief / screen read by AI - attached after saving
    const [originalStatus, setOriginalStatus] = useState('pending');
    const [memory, setMemory] = useState(null);
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState('');
    const [moreOpen, setMoreOpen] = useState(() => !!(prefill?.notes || prefill?.team?.length));
    const touched = useRef(new Set(prefill ? ['collab_type', 'type', 'amount'] : []));
    const fileRef = useRef(null);

    const isWage = form.type === WAGE_TYPE;

    // History -> brand chips + defaults
    useEffect(() => {
        let cancelled = false;
        apiRequest('/collaborations/index.php')
            .then((list) => {
                if (cancelled || !Array.isArray(list)) return;
                const mem = buildBrandMemory(list);
                setMemory(mem);
                if (!isEdit) {
                    setForm((f) => ({
                        ...f,
                        collab_type: touched.current.has('collab_type') ? f.collab_type : mem.defaults.collab_type,
                        type: touched.current.has('type') ? f.type : mem.defaults.type,
                    }));
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isEdit]);

    // Edit: load the collaboration
    useEffect(() => {
        if (!isEdit) return undefined;
        let cancelled = false;
        apiRequest(`/collaborations/show.php?id=${collabId}`)
            .then((c) => {
                if (cancelled) return;
                touched.current = new Set(['collab_type', 'type', 'amount']);
                setOriginalStatus(c.payment_status || 'pending');
                setForm({
                    brand: c.brand || '',
                    amount: grossOf(c) ? String(grossOf(c)) : '',
                    collab_type: c.collab_type || 'umowa_50',
                    type: c.type || 'inne',
                    date: c.date || today,
                    paid: c.payment_status === 'paid',
                    notes: c.notes || '',
                    team: (c.team || []).map((m) => ({ name: m.name, amount: m.amount ? String(Number(m.amount)) : '', is_paid: isTrue(m.is_paid) })),
                    payment_days: c.payment_days ? Number(c.payment_days) : null,
                    publish_by: c.publish_by || '',
                    paid_at: c.paid_at || '',
                    brief: c.stage === 'brief' && c.payment_status !== 'paid',
                    deliverables: (c.deliverables || []).map((d) => ({ ...d, due: d.due || '' })),
                });
                if (c.notes || c.team?.length) setMoreOpen(true);
            })
            .catch((err) => !cancelled && setError(err.message || 'Nie udało się wczytać'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [collabId, isEdit]);

    const set = (name, value) => {
        touched.current.add(name);
        setForm((f) => {
            const next = { ...f, [name]: value };
            if (name === 'collab_type' && !isEdit) {
                // cash is usually received on the spot
                if (value === 'gotowka') next.paid = true;
                else if (f.collab_type === 'gotowka') next.paid = false;
            }
            if (name === 'date' && f.type === WAGE_TYPE) next.brand = wageLabel(value);
            return next;
        });
    };

    // "Jak ostatnio" - copy billing, type and amount from the last collab with this brand
    const applyBrand = (brand, { fromChip = false } = {}) => {
        const last = memory?.last(brand);
        setForm((f) => {
            const next = { ...f, brand };
            if (f.type === WAGE_TYPE) next.type = memory?.defaults.type || 'reel';
            if (last) {
                if (!touched.current.has('payment_days') && last.payment_days) next.payment_days = Number(last.payment_days);
                if (fromChip || !touched.current.has('collab_type')) next.collab_type = last.collab_type || next.collab_type;
                if (fromChip || !touched.current.has('type')) next.type = last.type && last.type !== WAGE_TYPE ? last.type : next.type;
                if (!f.amount && grossOf(last)) next.amount = String(grossOf(last));
                if (!isEdit) next.paid = next.collab_type === 'gotowka';
            } else if (f.type === WAGE_TYPE && !isEdit) {
                next.collab_type = memory?.defaults.collab_type || 'umowa_50';
                next.paid = false;
            }
            return next;
        });
    };

    const applyWage = () => {
        const last = memory?.lastWage;
        setForm((f) => ({
            ...f,
            brand: wageLabel(f.date),
            type: WAGE_TYPE,
            collab_type: 'umowa_praca',
            amount: f.amount || (last ? String(grossOf(last)) : ''),
            paid: true,
        }));
    };

    const handleScreen = (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length) readFiles(files);
    };

    const readFiles = async (files) => {
        setReading(true);
        setError('');
        try {
            const r = await readScreens('collaboration', files);
            touched.current.add('amount');
            const deliverables = (r.deliverables || []).map((d) => ({ label: d.label, count: d.count, done: 0, due: d.due || '' }));
            setForm((f) => ({
                ...f,
                brand: r.brand || f.brand,
                amount: r.amount_gross > 0 ? String(r.amount_gross) : f.amount,
                collab_type: r.collab_type || memory?.last(r.brand)?.collab_type || f.collab_type,
                type: r.type && r.type !== 'inne' ? r.type : typeFromDeliverables(deliverables) || f.type,
                date: r.date || f.date,
                notes: r.notes || f.notes,
                publish_by: r.publish_by || f.publish_by,
                payment_days: r.payment_days || f.payment_days,
                deliverables: deliverables.length ? deliverables : f.deliverables,
                // a brief without a fee is not money yet; with a confirmed rate it is a normal collaboration
                brief: isEdit ? f.brief : !!r.is_brief,
                paid: r.is_brief ? false : f.paid,
            }));
            if (!isEdit) setSourceFiles((prev) => [...prev, ...files]);
            if (r.payment_days) touched.current.add('payment_days');
            if (r.notes) setMoreOpen(true);
            toast.success(r.is_brief ? 'Brief odczytany — sprawdź i zapisz' : 'Uzupełnione — sprawdź i zapisz');
        } catch (err) {
            setError(err.message || 'Nie udało się odczytać screena');
        } finally {
            setReading(false);
        }
    };

    // A screen from the inbox ("Ze screena: ...") is read as soon as the form opens
    const startedWith = useRef(false);
    useEffect(() => {
        if (!startedWith.current && initialFiles?.length && aiEnabled) {
            startedWith.current = true;
            readFiles(initialFiles);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFiles, aiEnabled]);

    const amount = parseAmount(form.amount);
    const breakdown = useMemo(() => getTaxBreakdown(amount, form.collab_type, form.date), [amount, form.collab_type, form.date]);
    const teamTotal = form.team.reduce((s, m) => s + parseAmount(m.amount), 0);

    const submit = async (e) => {
        e?.preventDefault();
        if (!form.brand.trim()) {
            setError('Wpisz markę albo wybierz ją z listy.');
            return;
        }
        setSaving(true);
        setError('');
        const payload = {
            brand: form.brand.trim(),
            // a brief has no "Co to było" - guessed from the list (Reels -> Rolka…)
            type: form.brief ? typeFromDeliverables(form.deliverables) || form.type : form.type,
            collab_type: form.collab_type,
            fiscal_tracking: form.collab_type !== 'gotowka',
            amount_gross: amount,
            amount_net: Math.round(breakdown.net * 100) / 100,
            date: form.date || today,
            payment_status: form.paid ? 'paid' : originalStatus === 'overdue' ? 'overdue' : 'pending',
            notes: form.notes.trim(),
            team: form.team.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), amount: parseAmount(m.amount), is_paid: !!m.is_paid })),
            payment_days: form.payment_days || null,
            publish_by: form.publish_by || null,
            ...(form.paid && form.paid_at ? { paid_at: form.paid_at } : {}),
            stage: !isWage && form.brief && !form.paid ? 'brief' : null,
            deliverables: isWage ? [] : form.deliverables.filter((d) => d.label.trim()).map((d) => ({ ...d, label: d.label.trim(), due: d.due || null })),
        };
        try {
            let savedId = collabId;
            if (isEdit) {
                await apiRequest(`/collaborations/update.php?id=${collabId}`, 'PUT', payload);
                toast.success('Zapisano zmiany');
            } else {
                const created = await apiRequest('/collaborations/create.php', 'POST', payload);
                savedId = created?.id;
                toast.success(payload.stage === 'brief' ? `Dodano brief: ${payload.brand} — w przygotowaniu` : `Dodano: ${payload.brand} · ${formatCurrency(amount)}`);
                // the brief / screen it was read from stays with the collaboration
                if (savedId && sourceFiles.length) {
                    Promise.all(sourceFiles.map((file) => uploadAttachment('collaboration', savedId, file))).catch(() =>
                        toast.error('Współpraca zapisana, ale nie udało się przypiąć pliku briefu')
                    );
                }
            }
            refresh();
            onSaved?.(savedId);
            onClose();
        } catch (err) {
            setError(err.message || 'Nie udało się zapisać');
            setSaving(false);
        }
    };

    const dateChoice = form.date === today ? 'today' : form.date === yesterdayDate() ? 'yesterday' : 'other';
    const brandChips = (memory?.recent || []).filter((b) => b.toLowerCase() !== form.brand.trim().toLowerCase()).slice(0, 7);

    return (
        <Sheet
            open
            onClose={onClose}
            title={isEdit ? 'Edytuj współpracę' : 'Nowa współpraca'}
            size="lg"
            footer={
                <Button type="submit" form="collab-form" variant="primary" size="lg" block icon={Check} loading={saving} disabled={loading || reading}>
                    {isEdit ? 'Zapisz zmiany' : 'Zapisz'}
                </Button>
            }
        >
            {loading ? (
                <div className="py-16 flex justify-center text-ink-muted"><Loader2 className="animate-spin" /></div>
            ) : (
                <form id="collab-form" onSubmit={submit} className="space-y-5 pt-1">
                    {error && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">{error}</div>}

                    {aiEnabled && !isEdit && (
                        <>
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={reading}
                                className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-primary-300 bg-primary-50/50 px-4 py-3 text-left hover:bg-primary-50 transition-colors"
                            >
                                <span className="w-9 h-9 rounded-xl bg-surface text-primary-600 flex items-center justify-center shrink-0 shadow-sm">
                                    {reading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold text-primary-800">{reading ? 'Czytam…' : 'Wrzuć brief albo screena'}</span>
                                    <span className="block text-xs text-primary-700/80">Brief (PDF), mail od marki, zlecenie Use.me, umowa</span>
                                </span>
                            </button>
                            <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" onChange={handleScreen} />
                            {sourceFiles.length > 0 && (
                                <p className="-mt-3 flex items-center gap-1.5 text-xs text-ink-muted px-1">
                                    <FileText size={13} /> {sourceFiles.length === 1 ? sourceFiles[0].name : `${sourceFiles.length} pliki`} — przypnę do współpracy
                                </p>
                            )}
                        </>
                    )}

                    {/* Brand */}
                    <div>
                        <label className="label" htmlFor="collab-brand">Marka / klient</label>
                        <input
                            id="collab-brand"
                            className="input !text-lg !font-semibold"
                            value={form.brand}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (memory?.last(v)) applyBrand(v);
                                else setForm((f) => ({ ...f, brand: v }));
                            }}
                            placeholder="np. Zalando"
                            autoComplete="off"
                            list="collab-brands"
                            disabled={isWage}
                        />
                        <datalist id="collab-brands">
                            {(memory?.brands || []).map((b) => <option key={b} value={b} />)}
                        </datalist>
                        {(brandChips.length > 0 || memory?.lastWage) && !isEdit && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 mt-2.5 pb-0.5">
                                {brandChips.map((b) => (
                                    <button key={b} type="button" onClick={() => applyBrand(b, { fromChip: true })} className="chip !py-2 !text-[13px] shrink-0">
                                        {b}
                                    </button>
                                ))}
                                {memory?.lastWage && (
                                    <button type="button" onClick={isWage ? () => applyBrand('') : applyWage} className={`chip !py-2 !text-[13px] shrink-0 ${isWage ? 'chip-active' : ''}`}>
                                        <Briefcase size={13} /> Wypłata z etatu
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {!isWage && (
                        <div>
                            <div className="section-label mb-2">Etap</div>
                            <ChoiceChips
                                options={STAGE_OPTIONS}
                                value={form.brief ? 'brief' : 'agreed'}
                                onChange={(v) => setForm((f) => ({ ...f, brief: v === 'brief', paid: v === 'brief' ? false : f.paid }))}
                            />
                            {form.brief && <p className="hint">Czeka w „W przygotowaniu”. Kwotę i rozliczenie uzupełni umowa — teraz tylko co i do kiedy.</p>}
                        </div>
                    )}

                    {/* Amount (a brief has none yet - the contract brings it) */}
                    {!form.brief && (
                    <div>
                        <label className="label" htmlFor="collab-amount">
                            {form.collab_type === 'gotowka' ? 'Kwota' : 'Kwota brutto'}
                            {form.brief && <span className="font-normal text-ink-muted"> (jeśli już znana)</span>}
                        </label>
                        <div className="relative">
                            <input
                                id="collab-amount"
                                className="input !text-2xl !font-display font-semibold !py-3 !pr-12 tabular-nums"
                                value={form.amount}
                                onChange={(e) => set('amount', e.target.value)}
                                inputMode="decimal"
                                placeholder="0"
                                autoComplete="off"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-ink-muted">zł</span>
                        </div>
                        {amount > 0 && form.collab_type !== 'gotowka' && (
                            <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700">
                                <Wallet size={15} /> Na rękę ok. <strong className="amount tabular-nums">{formatCurrency(breakdown.net)}</strong>
                                {teamTotal > 0 && <span className="text-ink-muted">· po zespole <span className="amount">{formatCurrency(breakdown.net - teamTotal)}</span></span>}
                            </p>
                        )}
                    </div>
                    )}

                    {!isWage && (
                        <>
                            {!form.brief && (
                                <>
                                    <div>
                                        <div className="section-label mb-2">Rozliczenie</div>
                                        <ChoiceChips options={BILLING_OPTIONS} value={form.collab_type} onChange={(v) => set('collab_type', v)} />
                                    </div>
                                    <div>
                                        <div className="section-label mb-2">Co to było</div>
                                        <ChoiceChips options={TYPE_OPTIONS} value={form.type} onChange={(v) => set('type', v)} />
                                    </div>
                                </>
                            )}
                            <DeliverablesEditor list={form.deliverables} onChange={(deliverables) => setForm((f) => ({ ...f, deliverables }))} />
                        </>
                    )}

                    {/* Date (a brief: the day it came in) */}
                    {!form.brief && (
                    <div>
                        <div className="section-label mb-2">Kiedy</div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => set('date', today)} className={`choice ${dateChoice === 'today' ? 'choice-active' : ''}`}>Dziś</button>
                            <button type="button" onClick={() => set('date', yesterdayDate())} className={`choice ${dateChoice === 'yesterday' ? 'choice-active' : ''}`}>Wczoraj</button>
                            <label className={`choice relative cursor-pointer ${dateChoice === 'other' ? 'choice-active' : ''}`}>
                                {dateChoice === 'other' ? formatDateShort(form.date) : 'Inna data'}
                                <input
                                    type="date" onClick={openPicker}
                                    value={form.date}
                                    onChange={(e) => e.target.value && set('date', e.target.value)}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label="Wybierz datę"
                                />
                            </label>
                        </div>
                    </div>
                    )}

                    {!isWage && (
                        <Deadlines
                            form={form}
                            onPublishBy={(v) => setForm((f) => ({ ...f, publish_by: v }))}
                            onPaymentDays={(v) => set('payment_days', v)}
                            onPaidAt={(v) => setForm((f) => ({ ...f, paid_at: v }))}
                            isEdit={isEdit}
                        />
                    )}

                    <ExclusivityNote brand={form.brand} exclusivities={dashboard?.exclusivities} />

                    {/* Paid */}
                    {!form.brief && (
                    <button
                        type="button"
                        onClick={() => set('paid', !form.paid)}
                        className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                            form.paid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50/60 border-amber-200'
                        }`}
                        aria-pressed={form.paid}
                    >
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 ${form.paid ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-amber-400 bg-surface'}`}>
                            {form.paid && <Check size={15} strokeWidth={3} />}
                        </span>
                        <span className="flex-1">
                            <span className="block text-sm font-bold text-ink">{form.paid ? 'Pieniądze już są' : 'Czekam na przelew'}</span>
                            <span className="block text-xs text-ink-muted">{form.paid ? 'Opłacone' : 'Przypomnę, jeśli przelew się spóźni'}</span>
                        </span>
                    </button>
                    )}

                    {/* More */}
                    <div className="rounded-2xl border border-line">
                        <button type="button" onClick={() => setMoreOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-ink-soft">
                            <span>Zespół i notatka <span className="font-normal text-ink-muted">(opcjonalnie)</span></span>
                            <ChevronDown size={18} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {moreOpen && (
                            <div className="px-4 pb-4 space-y-4 border-t border-line pt-4">
                                <TeamEditor team={form.team} onChange={(team) => setForm((f) => ({ ...f, team }))} />
                                <div>
                                    <label className="label" htmlFor="collab-notes">Notatka</label>
                                    <textarea
                                        id="collab-notes"
                                        className="input min-h-[80px]"
                                        value={form.notes}
                                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                        placeholder="Ustalenia, nr faktury…"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </form>
            )}
        </Sheet>
    );
}

/** Payment term (14 / 30 / 60 days, "jak ostatnio"), optional publish deadline, paid on (edit). */
function Deadlines({ form, onPublishBy, onPaymentDays, onPaidAt, isEdit }) {
    const [publishOpen, setPublishOpen] = useState(!!form.publish_by);
    const days = form.payment_days || 30;
    const base = form.publish_by || form.date;
    const due = base ? addDays(base, days) : null;
    const custom = form.payment_days && !PAYMENT_DAY_PRESETS.includes(Number(form.payment_days));

    return (
        <div className="space-y-4">
            <div>
                <div className="section-label mb-2">Termin publikacji</div>
                {form.publish_by || publishOpen ? (
                    <div className="flex items-center gap-2">
                        <label className="choice choice-active relative cursor-pointer inline-flex items-center gap-1.5">
                            <CalendarClock size={15} />
                            {form.publish_by ? `do ${formatDateShort(form.publish_by)}` : 'Wybierz datę'}
                            <input
                                type="date" onClick={openPicker}
                                value={form.publish_by}
                                onChange={(e) => onPublishBy(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                aria-label="Termin publikacji"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                onPublishBy('');
                                setPublishOpen(false);
                            }}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:bg-ink/5"
                            aria-label="Bez terminu publikacji"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setPublishOpen(true)} className="choice inline-flex items-center gap-1.5">
                        <Plus size={14} /> Dodaj termin
                    </button>
                )}
                {form.publish_by && <p className="hint">Przypomnę na Starcie 2 dni wcześniej.</p>}
            </div>

            {form.brief ? null : !form.paid ? (
                <div>
                    <div className="section-label mb-2">Płatność w ciągu</div>
                    <div className="flex flex-wrap gap-2">
                        {PAYMENT_DAY_PRESETS.map((d) => (
                            <button key={d} type="button" onClick={() => onPaymentDays(d)} className={`choice ${days === d && !custom ? 'choice-active' : ''}`}>
                                {d} dni
                            </button>
                        ))}
                        <label className={`choice inline-flex items-center gap-1 ${custom ? 'choice-active' : ''}`}>
                            <input
                                className="w-10 bg-transparent text-center outline-none"
                                inputMode="numeric"
                                placeholder="inne"
                                value={custom ? form.payment_days : ''}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                    onPaymentDays(n > 0 && n <= 365 ? n : null);
                                }}
                                aria-label="Inna liczba dni"
                            />
                            dni
                        </label>
                    </div>
                    {due && (
                        <p className="hint">
                            Przelew do <strong>{formatDateShort(due)}</strong>
                            {form.publish_by ? ' (liczę od publikacji)' : ''} — potem przypomnę, że się spóźnia.
                        </p>
                    )}
                </div>
            ) : (
                isEdit && (
                    <div>
                        <div className="section-label mb-2">Wpłynęło</div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => onPaidAt(getTodayDate())} className={`choice ${form.paid_at === getTodayDate() ? 'choice-active' : ''}`}>Dziś</button>
                            <button type="button" onClick={() => onPaidAt(yesterdayDate())} className={`choice ${form.paid_at === yesterdayDate() ? 'choice-active' : ''}`}>Wczoraj</button>
                            <label className={`choice relative cursor-pointer ${form.paid_at && form.paid_at !== getTodayDate() && form.paid_at !== yesterdayDate() ? 'choice-active' : ''}`}>
                                {form.paid_at && form.paid_at !== getTodayDate() && form.paid_at !== yesterdayDate() ? formatDateShort(form.paid_at) : 'Inna data'}
                                <input type="date" onClick={openPicker} value={form.paid_at} max={getTodayDate()} onChange={(e) => e.target.value && onPaidAt(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Data wpłaty" />
                            </label>
                        </div>
                        <p className="hint">Liczy się do miesiąca i roku podatkowego, w którym pieniądze przyszły.</p>
                    </div>
                )
            )}
        </div>
    );
}

/** Active exclusivity from a contract - a gentle check before taking a competitor. */
function ExclusivityNote({ brand, exclusivities }) {
    const name = (brand || '').trim().toLowerCase();
    const others = (exclusivities || []).filter((e) => !name || !e.brand.toLowerCase().includes(name.split(' ')[0]));
    if (!name || others.length === 0) return null;
    return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 text-sm">
            <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-ink-soft">
                {others.map((e) => (
                    <p key={e.document_id}>
                        Masz wyłączność z <strong className="text-ink">{e.brand}</strong>
                        {e.scope ? ` (${e.scope})` : ''} do <strong className="text-ink">{formatDateShort(e.until)}</strong>.
                    </p>
                ))}
                <p className="text-xs text-ink-muted mt-0.5">Sprawdź, czy ta współpraca jej nie łamie.</p>
            </div>
        </div>
    );
}

function TeamEditor({ team, onChange }) {
    const update = (i, field, value) => onChange(team.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="label !mb-0">Zespół</span>
                <button type="button" onClick={() => onChange([...team, { name: '', amount: '', is_paid: false }])} className="btn btn-soft btn-sm">
                    <Plus size={14} /> Osoba
                </button>
            </div>
            {team.length === 0 ? (
                <p className="text-xs text-ink-muted">Fotograf, wizażystka… zapisz komu i ile płacisz.</p>
            ) : (
                <div className="space-y-2">
                    {team.map((m, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input className="input !py-2 flex-1 min-w-0" placeholder="Imię" value={m.name} onChange={(e) => update(i, 'name', e.target.value)} />
                            <input className="input !py-2 w-24" placeholder="zł" inputMode="decimal" value={m.amount} onChange={(e) => update(i, 'amount', e.target.value)} />
                            <button
                                type="button"
                                onClick={() => update(i, 'is_paid', !m.is_paid)}
                                className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${m.is_paid ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-line-strong text-ink-muted'}`}
                                title={m.is_paid ? 'Opłacone' : 'Do zapłaty'}
                                aria-label={m.is_paid ? 'Opłacone' : 'Do zapłaty'}
                            >
                                <Check size={16} />
                            </button>
                            <button type="button" onClick={() => onChange(team.filter((_, idx) => idx !== i))} className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-red-600" aria-label="Usuń osobę">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function isTrue(v) {
    return v === true || v === 'true' || Number(v) === 1;
}

function normalizePrefill(prefill) {
    if (!prefill) return {};
    return {
        brand: prefill.brand || '',
        amount: prefill.amount_gross ? String(Number(prefill.amount_gross)) : '',
        collab_type: prefill.collab_type || 'umowa_50',
        type: prefill.type || 'reel',
        paid: prefill.collab_type === 'gotowka',
        notes: prefill.notes || '',
        ...(prefill.date ? { date: prefill.date } : {}),
        ...(prefill.publish_by ? { publish_by: prefill.publish_by } : {}),
        ...(prefill.payment_days ? { payment_days: Number(prefill.payment_days) } : {}),
        ...(prefill.stage === 'brief' ? { brief: true } : {}),
        ...(prefill.deliverables?.length ? { deliverables: prefill.deliverables.map((d) => ({ ...d, done: 0, due: d.due || '' })) } : {}),
        team: (prefill.team || []).map((m) => ({ name: m.name, amount: m.amount ? String(Number(m.amount)) : '', is_paid: false })),
    };
}
