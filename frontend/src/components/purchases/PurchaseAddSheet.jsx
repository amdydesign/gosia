import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ClipboardPaste, ImagePlus, Pencil, Plus, Sparkles } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { apiRequest, getStoredToken } from '../../utils/api';
import { readScreens } from '../../services/ai';
import { imagesFromClipboard, imagesFromDataTransfer } from '../../utils/images';
import { RETURN_DAY_PRESETS, buildStoreMemory } from '../../utils/purchases';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import { addDays, formatCurrency, formatDateLong, formatDateShort, getTodayDate, parseAmount, yesterdayDate } from '../../utils/format';

const today = getTodayDate();
const emptyItem = () => ({ name: '', amount: '', include: true });

/**
 * Add purchases from a screenshot: pick / paste / photo -> AI reads store, date,
 * items and prices -> quick review -> save (one entry per item).
 * Falls back to a short manual form when AI is off.
 */
export default function PurchaseAddSheet({ initialFiles, manual = false, onClose, onSaved }) {
    const toast = useToast();
    const { data: dashboard, refresh } = useDashboard();
    const aiEnabled = dashboard?.ai?.enabled !== false;

    const [step, setStep] = useState(manual || !aiEnabled ? 'review' : 'pick');
    const [files, setFiles] = useState([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [keepScreens, setKeepScreens] = useState(true);
    const [totalOnScreen, setTotalOnScreen] = useState(0);
    const [memory, setMemory] = useState(() => buildStoreMemory([]));
    const [form, setForm] = useState({ store: '', purchase_date: today, return_days: 14, notes: '', items: [emptyItem()] });
    const daysTouched = useRef(false);
    const galleryRef = useRef(null);
    const cameraRef = useRef(null);
    const startedWith = useRef(false);

    useEffect(() => {
        let cancelled = false;
        apiRequest('/purchases/index.php')
            .then((list) => !cancelled && Array.isArray(list) && setMemory(buildStoreMemory(list)))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const read = useCallback(
        async (newFiles) => {
            if (!newFiles.length) return;
            const appending = step === 'review';
            setFiles((prev) => (appending ? [...prev, ...newFiles] : newFiles));
            setError('');
            setStep('reading');
            try {
                const r = await readScreens('purchase', newFiles);
                let items = (r.items || []).map((it) => ({ name: it.name, amount: it.amount ? String(it.amount) : '', include: true }));
                if (!items.length && r.total > 0) items = [{ name: 'Zakupy', amount: String(r.total), include: true }];
                if (!items.length && !r.is_purchase) {
                    throw new Error('To nie wygląda na zakup. Spróbuj innego screena albo wpisz ręcznie.');
                }
                setTotalOnScreen((t) => (appending ? t + (r.total || 0) : r.total || 0));
                setForm((f) => {
                    const store = f.store || r.store || '';
                    const remembered = memory.returnDays(store);
                    const keepOld = appending && f.items.some((it) => it.name.trim());
                    return {
                        ...f,
                        store,
                        purchase_date: (appending && f.purchase_date) || r.purchase_date || today,
                        return_days: daysTouched.current ? f.return_days : remembered || r.return_days || f.return_days || 14,
                        notes: f.notes || (r.order_number ? `Zamówienie ${r.order_number}` : ''),
                        items: keepOld ? [...f.items.filter((it) => it.name.trim()), ...items] : items.length ? items : [emptyItem()],
                    };
                });
                setStep('review');
            } catch (err) {
                setError(err.message || 'Nie udało się odczytać screena');
                setStep(appending ? 'review' : 'pick');
            }
        },
        [memory, step]
    );

    // Files handed over (share target, Start tile)
    useEffect(() => {
        if (!startedWith.current && initialFiles?.length) {
            startedWith.current = true;
            read(initialFiles);
        }
    }, [initialFiles, read]);

    // Ctrl+V / long-press paste anywhere while the sheet is open
    useEffect(() => {
        const onPaste = (e) => {
            const pasted = imagesFromDataTransfer(e.clipboardData);
            if (pasted.length && step !== 'reading') {
                e.preventDefault();
                read(pasted);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [read, step]);

    const pickFiles = (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        read(picked);
    };

    const pasteButton = async () => {
        const pasted = await imagesFromClipboard();
        if (pasted.length) read(pasted);
        else toast.info('W schowku nie ma obrazka. Zrób screena, skopiuj go i spróbuj ponownie.');
    };

    const updateItem = (i, patch) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));

    const included = form.items.filter((it) => it.include && it.name.trim());
    const sum = included.reduce((s, it) => s + parseAmount(it.amount), 0);
    const deadline = addDays(form.purchase_date, form.return_days);

    const save = async () => {
        if (!form.store.trim()) return setError('Wpisz sklep.');
        if (!included.length) return setError('Dodaj przynajmniej jedną rzecz.');
        setSaving(true);
        setError('');
        try {
            const result = await apiRequest('/purchases/create.php', 'POST', {
                store: form.store.trim(),
                purchase_date: form.purchase_date || today,
                return_days: Number(form.return_days) || 0,
                notes: form.notes.trim(),
                items: included.map((it) => ({ name: it.name.trim(), amount: parseAmount(it.amount) })),
            });
            const ids = result?.ids || (result?.id ? [result.id] : []);
            if (keepScreens && files.length && ids.length) uploadScreens(files, ids, toast);
            toast.success(
                included.length === 1
                    ? `Zapisano: ${form.store.trim()} · ${formatCurrency(sum)}`
                    : `Zapisano ${included.length} rzeczy z ${form.store.trim()} · ${formatCurrency(sum)}`
            );
            refresh();
            onSaved?.();
            onClose();
        } catch (err) {
            setError(err.message || 'Nie udało się zapisać');
            setSaving(false);
        }
    };

    const dateChoice = form.purchase_date === today ? 'today' : form.purchase_date === yesterdayDate() ? 'yesterday' : 'other';
    const customDays = !RETURN_DAY_PRESETS.includes(Number(form.return_days));

    return (
        <Sheet
            open
            onClose={onClose}
            title={step === 'review' ? 'Sprawdź i zapisz' : 'Nowy zakup'}
            description={step === 'pick' ? 'Wrzuć screena zamówienia lub zdjęcie paragonu — resztę uzupełnię.' : undefined}
            size="lg"
            footer={
                step === 'review' ? (
                    <Button variant="primary" size="lg" block icon={Check} loading={saving} onClick={save}>
                        {included.length > 1 ? `Zapisz ${included.length} rzeczy` : 'Zapisz zakup'}
                    </Button>
                ) : null
            }
        >
            {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm px-3.5 py-2.5">{error}</div>}

            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={pickFiles} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFiles} />

            {step === 'pick' && (
                <div className="space-y-3 pt-1">
                    <button
                        type="button"
                        onClick={() => galleryRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            read(imagesFromDataTransfer(e.dataTransfer));
                        }}
                        className="w-full rounded-3xl border-2 border-dashed border-primary-300 bg-primary-50/60 hover:bg-primary-50 px-6 py-9 flex flex-col items-center text-center transition-colors"
                    >
                        <span className="w-14 h-14 rounded-2xl bg-white text-primary-600 shadow-sm flex items-center justify-center mb-3">
                            <ImagePlus size={28} />
                        </span>
                        <span className="text-base font-extrabold text-primary-900">Wybierz screena</span>
                        <span className="text-xs text-primary-800/70 mt-1">Potwierdzenie zamówienia, mail ze sklepu, koszyk albo paragon. Możesz zaznaczyć kilka.</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" icon={Camera} onClick={() => cameraRef.current?.click()}>Zrób zdjęcie</Button>
                        <Button variant="secondary" icon={ClipboardPaste} onClick={pasteButton}>Wklej</Button>
                    </div>
                    <button type="button" onClick={() => setStep('review')} className="w-full py-2.5 text-sm font-semibold text-ink-muted hover:text-ink inline-flex items-center justify-center gap-1.5">
                        <Pencil size={14} /> Wpiszę ręcznie
                    </button>
                </div>
            )}

            {step === 'reading' && (
                <div className="py-10 flex flex-col items-center text-center">
                    <Thumbs files={files} />
                    <div className="mt-5 flex items-center gap-2 text-primary-700 font-bold">
                        <Sparkles size={18} className="animate-pulse" /> Czytam screena…
                    </div>
                    <p className="text-xs text-ink-muted mt-1">Zwykle kilka sekund.</p>
                </div>
            )}

            {step === 'review' && (
                <div className="space-y-5 pt-1">
                    {!aiEnabled && (
                        <p className="text-xs text-ink-muted rounded-xl bg-canvas border border-line px-3 py-2">
                            Czytanie screenów jest wyłączone — dodaj klucz AI w <code>api/.env</code>, a wystarczy wrzucić screena.
                        </p>
                    )}
                    {files.length > 0 && (
                        <div className="flex items-center gap-3">
                            <Thumbs files={files} small />
                            <button type="button" onClick={() => galleryRef.current?.click()} className="chip !py-2 shrink-0">
                                <Plus size={13} /> Kolejny screen
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="label" htmlFor="purchase-store">Sklep</label>
                        <input
                            id="purchase-store"
                            className="input !text-lg !font-semibold"
                            value={form.store}
                            onChange={(e) => {
                                const store = e.target.value;
                                const remembered = memory.returnDays(store);
                                setForm((f) => ({ ...f, store, return_days: remembered && !daysTouched.current ? remembered : f.return_days }));
                            }}
                            placeholder="np. Zara"
                            list="purchase-stores"
                            autoComplete="off"
                        />
                        <datalist id="purchase-stores">
                            {memory.stores.map((s) => <option key={s} value={s} />)}
                        </datalist>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="section-label">Rzeczy</span>
                            {included.length > 0 && (
                                <span className="text-xs text-ink-muted">
                                    Razem <strong className="text-ink tabular-nums">{formatCurrency(sum)}</strong>
                                    {totalOnScreen > 0 && Math.abs(totalOnScreen - sum) > 1 && <> · na screenie {formatCurrency(totalOnScreen)}</>}
                                </span>
                            )}
                        </div>
                        <div className="space-y-2">
                            {form.items.map((it, i) => (
                                <div key={i} className={`flex items-center gap-2 ${it.include ? '' : 'opacity-50'}`}>
                                    {form.items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => updateItem(i, { include: !it.include })}
                                            className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center ${it.include ? 'bg-primary-600 border-primary-600 text-white' : 'border-line-strong bg-white'}`}
                                            aria-label={it.include ? 'Pomiń tę rzecz' : 'Uwzględnij tę rzecz'}
                                        >
                                            {it.include && <Check size={14} strokeWidth={3} />}
                                        </button>
                                    )}
                                    <input className="input !py-2.5 !px-3 flex-1 min-w-0" placeholder="Co kupiłaś" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                                    <div className="relative w-24 shrink-0">
                                        <input className="input !py-2.5 !pl-2.5 !pr-7 tabular-nums" placeholder="0" inputMode="decimal" value={it.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} aria-label="Cena" />
                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">zł</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))} className="mt-2 text-sm font-semibold text-primary-700 inline-flex items-center gap-1">
                            <Plus size={15} /> Dodaj rzecz
                        </button>
                    </div>

                    <div>
                        <div className="section-label mb-2">Kupione</div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setForm((f) => ({ ...f, purchase_date: today }))} className={`choice ${dateChoice === 'today' ? 'choice-active' : ''}`}>Dziś</button>
                            <button type="button" onClick={() => setForm((f) => ({ ...f, purchase_date: yesterdayDate() }))} className={`choice ${dateChoice === 'yesterday' ? 'choice-active' : ''}`}>Wczoraj</button>
                            <label className={`choice relative cursor-pointer ${dateChoice === 'other' ? 'choice-active' : ''}`}>
                                {dateChoice === 'other' ? formatDateShort(form.purchase_date) : 'Inna data'}
                                <input type="date" value={form.purchase_date} max={today} onChange={(e) => e.target.value && setForm((f) => ({ ...f, purchase_date: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Data zakupu" />
                            </label>
                        </div>
                    </div>

                    <div>
                        <div className="section-label mb-2">Czas na zwrot</div>
                        <div className="flex flex-wrap gap-2">
                            {RETURN_DAY_PRESETS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => {
                                        daysTouched.current = true;
                                        setForm((f) => ({ ...f, return_days: d }));
                                    }}
                                    className={`choice ${Number(form.return_days) === d ? 'choice-active' : ''}`}
                                >
                                    {d} dni
                                </button>
                            ))}
                            <div className={`choice !px-2 ${customDays ? 'choice-active' : ''}`}>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="365"
                                    value={customDays ? form.return_days : ''}
                                    onChange={(e) => {
                                        daysTouched.current = true;
                                        setForm((f) => ({ ...f, return_days: e.target.value }));
                                    }}
                                    placeholder="inne"
                                    className="w-12 bg-transparent text-center outline-none placeholder:text-ink-muted"
                                    aria-label="Inna liczba dni"
                                />
                            </div>
                        </div>
                        {deadline && Number(form.return_days) > 0 && (
                            <p className="mt-2 text-sm text-primary-800">
                                Zwrot do <strong>{formatDateLong(deadline)}</strong> — przypomnę dzień wcześniej.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="label" htmlFor="purchase-notes">Notatka <span className="font-normal text-ink-muted">(opcjonalnie)</span></label>
                        <input id="purchase-notes" className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Nr zamówienia, dla kogo, do jakiej sesji…" />
                    </div>

                    {files.length > 0 && (
                        <label className="flex items-center gap-2.5 text-sm text-ink-soft cursor-pointer select-none">
                            <input type="checkbox" checked={keepScreens} onChange={(e) => setKeepScreens(e.target.checked)} className="w-4 h-4 accent-primary-600" />
                            Zachowaj screena jako dowód zakupu
                        </label>
                    )}
                </div>
            )}
        </Sheet>
    );
}

function Thumbs({ files, small = false }) {
    const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
    useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
    if (!urls.length) return null;
    const size = small ? 'w-10 h-14' : 'w-20 h-28';
    return (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {urls.slice(0, 6).map((u, i) => (
                <img key={u} src={u} alt={`Screen ${i + 1}`} className={`${size} object-cover object-top rounded-lg border border-line shadow-sm shrink-0`} />
            ))}
        </div>
    );
}

/** Attach the original screenshots to every saved item (runs after the sheet closes). */
async function uploadScreens(files, ids, toast) {
    let failed = 0;
    for (const id of ids) {
        for (const [i, file] of files.entries()) {
            if (file.size > 10 * 1024 * 1024) continue;
            const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
            const form = new FormData();
            form.append('file', file, file.name && file.name.includes('.') ? file.name : `screen-${i + 1}.${ext}`);
            form.append('entity_type', 'purchase');
            form.append('entity_id', id);
            try {
                const res = await fetch('/api/attachments/upload.php', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getStoredToken()}` },
                    body: form,
                });
                if (!res.ok) failed += 1;
            } catch {
                failed += 1;
            }
        }
    }
    if (failed) toast.error('Nie udało się dołączyć screena do części rzeczy.');
}
