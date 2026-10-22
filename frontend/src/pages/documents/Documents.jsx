import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FolderLock, FileText, Image as ImageIcon, Download, Eye, Pencil, Trash2, Lock, Upload, CheckCircle2, PenLine, Loader2, AlertCircle, X, ScanLine, FolderOpen, Building2, Sparkles, ChevronRight, Briefcase } from 'lucide-react';
import documentsService from '../../services/documents';
import { documentText, ocrImage } from '../../utils/ocr';
import { pagesToPdf } from '../../utils/scanner';
import DocumentScanner from '../../components/documents/DocumentScanner';
import DocumentDetailSheet from '../../components/documents/DocumentDetailSheet';
import CollabSuggestionsSheet from '../../components/documents/CollabSuggestionsSheet';
import { useQuickActions } from '../../context/QuickActionsContext';
import { forgetThumbnail } from '../../utils/thumbnail';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import { apiRequest } from '../../utils/api';
import { formatCurrency, getTaxBreakdown, getTodayDate } from '../../utils/format';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import Sheet from '../../components/ui/Sheet';
import Field from '../../components/ui/Field';
import ChoiceChips from '../../components/ui/ChoiceChips';
import Segmented from '../../components/ui/Segmented';
import { CardSkeleton } from '../../components/ui/Skeleton';

const ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp,.heic';
const MAX_SIZE = 20 * 1024 * 1024;
const PREVIEW_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const SORT_OPTIONS = [
    { value: 'date_desc', label: 'Najnowsze' },
    { value: 'date_asc', label: 'Najstarsze' },
    { value: 'name', label: 'Nazwa A–Z' },
];

/** Date that counts for sorting / year filter: document date, else upload date. */
function docDate(doc) {
    return doc.doc_date || doc.created_at?.slice(0, 10) || '';
}

function formatDocDate(value) {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d)).replace('.', '');
}

const STATUS_OPTIONS = [
    { value: 'signed', label: 'Podpisane', icon: CheckCircle2 },
    { value: 'to_sign', label: 'Do podpisu', icon: PenLine },
];

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bold the searched words inside a text fragment. */
function Highlight({ text, query }) {
    const words = query.trim().split(/\s+/).filter((w) => w.length >= 2);
    if (!text || !words.length) return text || null;
    const parts = text.split(new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi'));
    return parts.map((part, i) =>
        i % 2 === 1 ? (
            <mark key={i} className="bg-secondary-light text-ink rounded px-0.5">
                {part}
            </mark>
        ) : (
            part
        )
    );
}

/**
 * Adding is one step: scan with the camera or pick files - they go up right away.
 * Name, date and counterparty are read from the document (OCR on the device,
 * guesses on our server); nothing is sent to outside services.
 */
const IS_IOS = typeof navigator !== 'undefined'
    && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function UploadSheet({ open, onClose, onPick, onScan, aiAvailable }) {
    const filesRef = useRef(null);
    const [status, setStatus] = useState('signed');
    const [ai, setAi] = useState(false); // optional, off by default: the file goes to Anthropic

    const picked = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;
        onClose();
        onPick(files, status, ai);
        setAi(false);
    };

    return (
        <Sheet open={open} onClose={onClose} title="Dodaj dokument">
            <Field label="Status">
                <ChoiceChips options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            </Field>
            {aiAvailable && (
                <label className="mt-4 flex items-start gap-3 rounded-2xl border border-line p-3 cursor-pointer">
                    <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} className="mt-0.5 w-5 h-5 accent-primary-600 shrink-0" />
                    <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                            <Sparkles size={15} className="text-primary-500" /> Analiza AI (Claude Haiku)
                        </span>
                        <span className="block text-xs text-ink-muted mt-0.5 leading-relaxed">
                            Dokładniej odczyta tekst, pismo odręczne, kontrahenta, datę i streszczenie. Dokument zostanie wysłany do Anthropic —
                            nie zaznaczaj przy umowach, których NDA zabrania udostępniać.
                        </span>
                    </span>
                </label>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                    type="button"
                    onClick={() => {
                        onClose();
                        onScan(status, ai);
                        setAi(false);
                    }}
                    className="rounded-2xl border-2 border-primary-200 bg-primary-50/60 hover:border-primary-400 px-3 py-6 text-center transition-colors"
                >
                    <ScanLine size={28} className="mx-auto text-primary-600 mb-2" />
                    <div className="text-[15px] font-bold text-ink">Skanuj aparatem</div>
                    <div className="text-[11px] text-ink-muted mt-0.5">kilka stron → PDF</div>
                </button>
                <button
                    type="button"
                    onClick={() => filesRef.current?.click()}
                    className="rounded-2xl border-2 border-line bg-canvas hover:border-primary-300 px-3 py-6 text-center transition-colors"
                >
                    <FolderOpen size={28} className="mx-auto text-ink-soft mb-2" />
                    <div className="text-[15px] font-bold text-ink">Wybierz pliki</div>
                    <div className="text-[11px] text-ink-muted mt-0.5">PDF, Word, zdjęcia</div>
                </button>
            </div>
            <input ref={filesRef} type="file" accept={ACCEPT} onChange={picked} className="hidden" multiple />
            {IS_IOS && (
                <div className="mt-4 rounded-2xl bg-sky-50 border border-sky-100 p-3 text-[13px] text-sky-900 leading-relaxed">
                    <div className="font-bold mb-1">Najlepsza jakość: skaner iPhone'a</div>
                    W aplikacji <b>Pliki</b> stuknij <b>•••</b> → <b>Skanuj dokumenty</b> (albo w <b>Notatkach</b>: ikona aparatu → Skanuj dokumenty)
                    i zapisz skan. Potem tutaj <b>Wybierz pliki</b> → <b>Wybierz pliki</b> i wskaż zapisany PDF — tekst, kontrahent i data rozpoznają się same.
                </div>
            )}
            <p className="text-xs text-ink-muted mt-4 leading-relaxed">
                {ai
                    ? 'Dokument zostanie przeczytany przez Claude (Anthropic). Wszystko możesz potem poprawić ołówkiem przy dokumencie.'
                    : 'Tekst skanów i zdjęć rozpoznaje Twój telefon (OCR), a kontrahenta, nazwę i datę — Twój serwer. Dokumenty nie trafiają do żadnych zewnętrznych usług. Poprawić możesz potem ołówkiem przy dokumencie.'}
            </p>
        </Sheet>
    );
}

function EditSheet({ doc, onClose, onSaved, aiAvailable }) {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [signStatus, setSignStatus] = useState('signed');
    const [date, setDate] = useState('');
    const [counterparty, setCounterparty] = useState('');
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [text, setText] = useState(null); // recognised text, loaded on demand
    const [reading, setReading] = useState('');

    useEffect(() => {
        if (doc) {
            setTitle(doc.title || '');
            setNotes(doc.notes || '');
            setSignStatus(doc.status || 'signed');
            setDate(doc.doc_date || '');
            setCounterparty(doc.counterparty || '');
            setAmount(doc.amount != null ? String(doc.amount).replace('.', ',') : '');
            setText(null);
            setReading('');
        }
    }, [doc]);

    const analyzeWithAi = async () => {
        setReading('AI analizuje…');
        try {
            const result = await documentsService.analyze(doc.id);
            if (result.title) setTitle(result.title);
            if (result.counterparty) setCounterparty(result.counterparty);
            if (result.doc_date) setDate(result.doc_date);
            if (result.status) setSignStatus(result.status);
            if (result.notes) setNotes(result.notes);
            setText(null);
            toast.success('Dane uzupełnione przez AI ✨');
            onSaved();
        } catch (err) {
            toast.error(err.message || 'Analiza AI nie powiodła się');
        } finally {
            setReading('');
        }
    };

    const showText = async () => {
        try {
            const data = await documentsService.getText(doc.id);
            setText(data?.content_text || '');
        } catch (err) {
            toast.error(err.message || 'Nie udało się pobrać tekstu');
        }
    };

    // Read the stored file again on this device (OCR), then let the server re-guess date and counterparty
    const reread = async () => {
        setReading('Pobieram plik…');
        try {
            const file = await documentsService.file(doc);
            const recognised = await documentText(file, setReading);
            if (!recognised.trim()) throw new Error('Nie udało się rozpoznać tekstu — spróbuj lepszego skanu.');
            setReading('Zapisuję…');
            const result = await documentsService.saveText(doc.id, recognised);
            setText(result.content_text);
            if (result.doc_date) setDate(result.doc_date);
            if (result.counterparty) setCounterparty(result.counterparty);
            toast.success('Tekst rozpoznany ponownie');
            onSaved();
        } catch (err) {
            toast.error(err.message || 'Nie udało się rozpoznać tekstu');
        } finally {
            setReading('');
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        try {
            await documentsService.update(doc.id, { title: title.trim(), notes, status: signStatus, doc_date: date, counterparty, amount: amount.trim() || null });
            toast.success('Zapisano');
            onSaved();
            onClose();
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open={Boolean(doc)}
            onClose={onClose}
            title="Edytuj dokument"
            description={doc?.original_name}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} className="flex-1">
                        Anuluj
                    </Button>
                    <Button variant="primary" type="submit" form="document-edit" loading={saving} className="flex-1">
                        Zapisz
                    </Button>
                </>
            }
        >
            <form id="document-edit" onSubmit={handleSubmit} className="space-y-4">
                <Field label="Nazwa dokumentu" required>
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />
                </Field>
                <Field label="Kontrahent">
                    <input className="input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="np. Zalando Polska sp. z o.o." maxLength={255} />
                </Field>
                <Field label="Status">
                    <ChoiceChips options={STATUS_OPTIONS} value={signStatus} onChange={setSignStatus} />
                </Field>
                <Field label="Data dokumentu" hint="Np. data podpisania. Puste = data dodania.">
                    <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Kwota brutto" suffix="zł" hint="Z umowy lub rachunku — na jej podstawie powstają propozycje współprac.">
                    <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="np. 5000" />
                </Field>
                <Field label="Notatka">
                    <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </Field>

                <div className="rounded-2xl border border-line bg-canvas p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">Rozpoznany tekst</span>
                        <div className="flex gap-1.5">
                            {text === null && (
                                <button type="button" onClick={showText} className="btn btn-ghost btn-sm">
                                    Pokaż
                                </button>
                            )}
                            <button type="button" onClick={reread} disabled={Boolean(reading)} className="btn btn-soft btn-sm">
                                {reading ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                                {reading || 'Rozpoznaj ponownie'}
                            </button>
                        </div>
                    </div>
                    {aiAvailable && (
                        <button type="button" onClick={analyzeWithAi} disabled={Boolean(reading)} className="btn btn-ghost btn-sm mt-2 !px-0 text-primary-700">
                            <Sparkles size={14} /> Analiza AI (Claude) — dokument zostanie wysłany do Anthropic
                        </button>
                    )}
                    {text !== null && (
                        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-xs text-ink-soft font-sans leading-relaxed">
                            {text || 'Brak rozpoznanego tekstu — dokument można znaleźć tylko po nazwie, kontrahencie i notatce.'}
                        </pre>
                    )}
                </div>
            </form>
        </Sheet>
    );
}

export default function Documents() {
    const toast = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [selectedId, setSelectedId] = useState(null); // document card
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsOpen, setSuggestionsOpen] = useState(false);
    const { openCollab, bump } = useQuickActions();
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('date_desc');
    const [year, setYear] = useState('all');
    const [counterparty, setCounterparty] = useState('all');
    const [uploads, setUploads] = useState([]); // files on their way to the server
    const [dragging, setDragging] = useState(false);
    const [scan, setScan] = useState(null); // { status, ai } while the scanner is open
    const { data: dashboard, refresh: refreshDashboard } = useDashboard();
    const aiAvailable = Boolean(dashboard?.ai?.documents);
    const requestId = useRef(0);
    const queryRef = useRef(query);
    queryRef.current = query;

    const load = useCallback(async (q) => {
        const id = ++requestId.current;
        try {
            setError('');
            const data = await documentsService.search(q);
            if (id === requestId.current) setDocs(Array.isArray(data) ? data : []);
        } catch (err) {
            if (id === requestId.current) setError(err.message || 'Błąd ładowania dokumentów');
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, []);

    const loadSuggestions = useCallback(async () => {
        try {
            const data = await documentsService.collabSuggestions();
            setSuggestions(Array.isArray(data) ? data : []);
        } catch {
            setSuggestions([]);
        }
    }, []);

    useEffect(() => {
        loadSuggestions();
    }, [loadSuggestions]);

    const refreshAll = () => {
        load(queryRef.current);
        loadSuggestions();
    };

    // One tap: the collaboration is saved straight from the contract / bill data and the
    // documents are linked to it; "Edytuj" in the toast opens it for corrections.
    // Without an amount there is nothing sensible to save, so the form opens instead.
    const createCollabFrom = async (prefill, documentIds) => {
        setSuggestionsOpen(false);
        setSelectedId(null);
        const amount = Number(prefill.amount_gross) || 0;
        const brand = (prefill.brand || '').trim();

        if (!brand || amount <= 0) {
            openCollab({
                prefill,
                onSaved: async (id) => {
                    if (!id) return;
                    await documentsService.linkCollab(documentIds, id).catch(() => {});
                    refreshAll();
                },
            });
            return;
        }

        const collabType = prefill.collab_type || 'umowa_50';
        const breakdown = getTaxBreakdown(amount, collabType);
        try {
            const created = await apiRequest('/collaborations/create.php', 'POST', {
                brand,
                type: prefill.type || 'inne',
                collab_type: collabType,
                fiscal_tracking: collabType !== 'gotowka',
                amount_gross: amount,
                amount_net: Math.round(breakdown.net * 100) / 100,
                date: prefill.date || getTodayDate(),
                payment_status: 'pending',
                notes: prefill.notes || '',
                team: [],
            });
            await documentsService.linkCollab(documentIds, created.id);
            bump('collaborations');
            refreshDashboard();
            toast.success(`Dodano współpracę: ${brand} · ${formatCurrency(amount)}`, {
                duration: 7000,
                action: { label: 'Edytuj', onClick: () => openCollab({ id: created.id }) },
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się utworzyć współpracy');
        }
        refreshAll();
    };

    const linkSuggestion = async (s) => {
        try {
            await documentsService.linkCollab(s.document_ids, s.collaboration.id);
            toast.success(`Połączono ze współpracą ${s.collaboration.brand}`);
            refreshAll();
        } catch (err) {
            toast.error(err.message || 'Nie udało się połączyć');
        }
    };

    const dismissSuggestion = async (s) => {
        try {
            await documentsService.dismissCollab(s.document_ids);
            setSuggestions((prev) => prev.filter((x) => x.key !== s.key));
        } catch (err) {
            toast.error(err.message || 'Nie udało się pominąć');
        }
    };

    const unlinkDoc = async (doc) => {
        try {
            await documentsService.unlinkCollab([doc.id]);
            toast.success('Odłączono od współpracy');
            refreshAll();
        } catch (err) {
            toast.error(err.message || 'Nie udało się odłączyć');
        }
    };

    // Server-side search (also inside document text), debounced while typing
    useEffect(() => {
        const timer = setTimeout(() => load(query), query ? 300 : 0);
        return () => clearTimeout(timer);
    }, [query, load]);

    // "+" button on mobile opens the upload sheet via ?add=1; Współprace links to ?suggestions=1 and ?doc=ID
    useEffect(() => {
        if (searchParams.get('add') === '1') {
            setUploadOpen(true);
            navigate('/documents', { replace: true });
        } else if (searchParams.get('suggestions') === '1') {
            setSuggestionsOpen(true);
            navigate('/documents', { replace: true });
        } else if (Number(searchParams.get('doc')) > 0) {
            // link from a collaboration: open that document's card
            setSelectedId(Number(searchParams.get('doc')));
            navigate('/documents', { replace: true });
        }
    }, [searchParams, navigate]);

    const years = useMemo(() => [...new Set(docs.map((d) => docDate(d).slice(0, 4)).filter(Boolean))].sort().reverse(), [docs]);

    // Counterparties of the current results, most documents first
    // One entry per company: "XX sp. z o.o." and "XX Spółka z o.o." share the server-side key
    const counterparties = useMemo(() => {
        const byKey = new Map();
        for (const d of docs) {
            if (!d.counterparty) continue;
            const key = d.counterparty_key || d.counterparty;
            const entry = byKey.get(key) || { key, name: d.counterparty, count: 0 };
            entry.count += 1;
            byKey.set(key, entry);
        }
        return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pl'));
    }, [docs]);

    // Year and counterparty filters first, so the status counts match what the list can show
    const inYear = useMemo(
        () =>
            docs.filter(
                (d) =>
                    (year === 'all' || docDate(d).startsWith(year)) &&
                    (counterparty === 'all' || (counterparty === 'none' ? !d.counterparty : (d.counterparty_key || d.counterparty) === counterparty))
            ),
        [docs, year, counterparty]
    );

    const counts = useMemo(
        () => ({
            all: inYear.length,
            to_sign: inYear.filter((d) => d.status === 'to_sign').length,
            signed: inYear.filter((d) => d.status !== 'to_sign').length,
        }),
        [inYear]
    );

    const visible = useMemo(() => {
        const list = filter === 'all' ? [...inYear] : inYear.filter((d) => (d.status === 'to_sign' ? 'to_sign' : 'signed') === filter);
        if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title, 'pl', { sensitivity: 'base', numeric: true }));
        const dir = sort === 'date_asc' ? 1 : -1;
        return list.sort((a, b) => dir * (docDate(a).localeCompare(docDate(b)) || a.id - b.id));
    }, [inYear, filter, sort]);

    const toggleStatus = async (doc) => {
        const next = doc.status === 'to_sign' ? 'signed' : 'to_sign';
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: next } : d)));
        try {
            await documentsService.update(doc.id, { status: next });
            toast.success(next === 'signed' ? `„${doc.title}” — podpisane ✍️` : `„${doc.title}” — do podpisu`);
        } catch (err) {
            setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: doc.status } : d)));
            toast.error(err.message || 'Nie udało się zmienić statusu');
        }
    };

    const setUploadRow = (key, patch) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));

    /**
     * Each job: { key, name, prepare(onStatus) -> { file, text } }. Jobs run one by one
     * (OCR is heavy); each shows a row with its progress until it lands in the list.
     */
    const runUploads = async (jobs, status, ai = false) => {
        setUploads((prev) => [...jobs.map(({ key, name, error }) => ({ key, name, error: error || '', stage: 'Czekam…' })), ...prev]);
        let done = 0;
        for (const job of jobs.filter((j) => !j.error)) {
            try {
                const { file, text } = await job.prepare((stage) => setUploadRow(job.key, { stage }));
                setUploadRow(job.key, { stage: 'Wysyłanie…' });
                const uploaded = await documentsService.upload({ file, title: '', status, contentText: text });
                if (ai) {
                    setUploadRow(job.key, { stage: 'AI analizuje dokument…' });
                    load(queryRef.current);
                    try {
                        await documentsService.analyze(uploaded.id);
                    } catch (err) {
                        setUploadRow(job.key, { error: `Dodano, ale analiza AI się nie udała: ${err.message}` });
                        load(queryRef.current);
                        continue;
                    }
                }
                setUploads((prev) => prev.filter((u) => u.key !== job.key));
                done += 1;
                load(queryRef.current);
            } catch (err) {
                setUploadRow(job.key, { error: err.message || 'Nie udało się dodać pliku' });
            }
        }
        if (done) {
            toast.success(done === 1 ? 'Dokument dodany' : `Dodano dokumenty: ${done}`);
            loadSuggestions();
        }
    };

    const uploadFiles = (files, status = 'signed', ai = false) =>
        runUploads(
            files.map((file, i) => ({
                key: `${Date.now()}-${i}`,
                name: file.name,
                error: file.size > MAX_SIZE ? 'Za duży plik (max 20 MB)' : '',
                prepare: async (onStatus) => ({ file, text: await documentText(file, onStatus) }),
            })),
            status,
            ai
        );

    // Scanner finished: OCR the cleaned pages, join them into one PDF and upload it
    const uploadScan = (pages, status, ai = false) => {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '-');
        const name = `Skan ${stamp}.pdf`;
        setScan(null);
        runUploads(
            [
                {
                    key: `scan-${Date.now()}`,
                    name,
                    prepare: async (onStatus) => {
                        const texts = [];
                        for (let i = 0; i < pages.length; i += 1) {
                            onStatus(`Rozpoznaję tekst… strona ${i + 1}/${pages.length}`);
                            try {
                                texts.push(await ocrImage(pages[i]));
                            } catch {
                                texts.push('');
                            }
                        }
                        onStatus('Tworzę PDF…');
                        const file = await pagesToPdf(pages, name);
                        if (file.size > MAX_SIZE) throw new Error('Skan jest za duży (max 20 MB) — podziel go na mniej stron');
                        return { file, text: texts.join('\n\n') };
                    },
                },
            ],
            status,
            ai
        );
    };

    // Desktop: drop files anywhere on the page
    const dropHandlers = {
        onDragOver: (e) => {
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            setDragging(true);
        },
        onDragLeave: (e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        },
        onDrop: (e) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length) uploadFiles(files);
        },
    };

    const handleOpen = async (doc) => {
        try {
            if (PREVIEW_TYPES.includes(doc.mime_type)) await documentsService.preview(doc);
            else await documentsService.download(doc);
        } catch (err) {
            toast.error(err.message || 'Nie udało się otworzyć pliku');
        }
    };

    const handleDownload = async (doc) => {
        try {
            await documentsService.download(doc);
        } catch (err) {
            toast.error(err.message || 'Nie udało się pobrać pliku');
        }
    };

    const handleDelete = async (doc) => {
        if (!(await confirm({ title: 'Usunąć dokument?', message: `${doc.title} — plik zostanie trwale usunięty z serwera.`, confirmLabel: 'Usuń', danger: true }))) return;
        try {
            await documentsService.delete(doc.id);
            setDocs((prev) => prev.filter((d) => d.id !== doc.id));
            forgetThumbnail(doc.id);
            setSelectedId((id) => (id === doc.id ? null : id));
            toast.success('Dokument usunięty');
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć dokumentu');
        }
    };

    // Sheets render outside the animated wrapper - its transform would trap their z-index under the nav
    return (
        <>
        <div className="animate-fade-in relative" {...dropHandlers}>
            {dragging && (
                <div className="absolute inset-0 z-20 rounded-3xl border-2 border-dashed border-primary-400 bg-primary-50/80 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <Upload size={30} className="mx-auto text-primary-600 mb-2" />
                        <div className="font-bold text-primary-800">Upuść pliki, żeby dodać</div>
                    </div>
                </div>
            )}
            <PageHeader
                title="Dokumenty"
                subtitle="Umowy i dokumenty poufne — widoczne tylko po zalogowaniu"
                actions={
                    <Button variant="primary" icon={Plus} onClick={() => setUploadOpen(true)} className="hidden lg:inline-flex">
                        Dodaj dokument
                    </Button>
                }
            >
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <SearchInput value={query} onChange={setQuery} placeholder="Szukaj po nazwie, kontrahencie lub treści…" className="flex-1" />
                    <Segmented
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'all', label: 'Wszystkie', count: counts.all },
                            { value: 'to_sign', label: 'Do podpisu', count: counts.to_sign, tone: 'warning' },
                            { value: 'signed', label: 'Podpisane', count: counts.signed },
                        ]}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:flex">
                    <select value={sort} onChange={(e) => setSort(e.target.value)} className="input !py-2 !rounded-xl min-w-0 sm:w-44" aria-label="Sortowanie">
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <select value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="input !py-2 !rounded-xl col-span-2 order-last sm:order-none min-w-0 sm:w-60" aria-label="Kontrahent">
                        <option value="all">Wszyscy kontrahenci</option>
                        {counterparties.map((c) => (
                            <option key={c.key} value={c.key}>
                                {c.name} ({c.count})
                            </option>
                        ))}
                        <option value="none">Bez kontrahenta</option>
                    </select>
                    <select value={year} onChange={(e) => setYear(e.target.value)} className="input !py-2 !rounded-xl min-w-0 sm:w-40" aria-label="Rok">
                        <option value="all">Wszystkie lata</option>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </PageHeader>

            {suggestions.length > 0 && (
                <button
                    type="button"
                    onClick={() => setSuggestionsOpen(true)}
                    className="w-full mb-3 flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 hover:bg-primary-50 px-4 py-3 text-left transition-colors"
                >
                    <span className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shrink-0">
                        <Briefcase size={17} />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-ink">
                            Propozycje współprac: {suggestions.length}
                        </span>
                        <span className="block text-xs text-ink-soft truncate">Z umów i rachunków — sprawdź i potwierdź</span>
                    </span>
                    <ChevronRight size={18} className="text-primary-600 shrink-0" />
                </button>
            )}

            {uploads.length > 0 && (
                <div className="card divide-y divide-line overflow-hidden mb-3">
                    {uploads.map((u) => (
                        <div key={u.key} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${u.error ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}>
                                {u.error ? <AlertCircle size={19} /> : <Loader2 size={19} className="animate-spin" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-ink truncate">{u.name}</div>
                                <div className={`text-xs ${u.error ? 'text-red-700' : 'text-ink-muted'}`}>{u.error || u.stage || 'Wysyłanie…'}</div>
                            </div>
                            {u.error && (
                                <button type="button" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))} className="p-2 text-ink-muted hover:bg-black/5 rounded-lg" aria-label="Ukryj">
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2].map((i) => <CardSkeleton key={i} className="h-20" />)}
                </div>
            ) : error ? (
                <EmptyState icon={FolderLock} title="Nie udało się pobrać dokumentów" text={error} />
            ) : visible.length === 0 ? (
                <div className="card">
                    <EmptyState
                        icon={FolderLock}
                        title={docs.length > 0 ? (filter === 'to_sign' ? 'Wszystko podpisane!' : filter === 'signed' ? 'Brak podpisanych dokumentów' : 'Brak dokumentów dla tych filtrów') : query ? 'Nic nie znaleziono' : 'Archiwum jest puste'}
                        text={docs.length > 0 ? 'Zmień filtr, rok lub kontrahenta, żeby zobaczyć pozostałe dokumenty.' : query ? 'Spróbuj innego słowa — szukam w nazwach, notatkach i treści dokumentów.' : 'Dodaj pierwszą umowę — wystarczy wybrać plik (na komputerze możesz go też przeciągnąć tutaj).'}
                        action={!query && docs.length === 0 && <Button variant="primary" icon={Plus} onClick={() => setUploadOpen(true)}>Dodaj dokument</Button>}
                    />
                </div>
            ) : (
                <div className="card divide-y divide-line overflow-hidden">
                    {visible.map((doc) => {
                        const isImage = (doc.mime_type || '').startsWith('image/');
                        const Icon = isImage ? ImageIcon : FileText;
                        const toSign = doc.status === 'to_sign';
                        const meta = [doc.counterparty, formatDocDate(docDate(doc))].filter(Boolean);
                        return (
                            <div key={doc.id} className="flex items-center gap-3 pl-3 pr-2 sm:px-5 py-2.5 hover:bg-canvas/70 transition-colors">
                                <button type="button" onClick={() => setSelectedId(doc.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${toSign ? 'bg-amber-50 text-amber-600' : 'bg-primary-50 text-primary-600'}`}>
                                        <Icon size={17} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-[15px] font-semibold text-ink truncate">
                                                <Highlight text={doc.title} query={query} />
                                            </span>
                                            {toSign ? (
                                                <span className="badge badge-warning shrink-0 !text-[10px]">Do podpisu</span>
                                            ) : (
                                                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" aria-label="Podpisane" />
                                            )}
                                        </span>
                                        <span className="block text-[13px] text-ink-muted truncate mt-0.5">
                                            {meta.length ? <Highlight text={meta.join(' · ')} query={query} /> : doc.original_name}
                                        </span>
                                        {query && doc.snippet && (
                                            <span className="block text-xs text-ink-soft mt-1 line-clamp-2">
                                                <Highlight text={doc.snippet} query={query} />
                                            </span>
                                        )}
                                    </span>
                                    <ChevronRight size={18} className="text-ink-muted shrink-0 sm:hidden" />
                                </button>
                                <div className="hidden sm:flex items-center shrink-0 -mr-2">
                                    {PREVIEW_TYPES.includes(doc.mime_type) && (
                                        <button type="button" onClick={() => handleOpen(doc)} className="p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" title="Podgląd" aria-label="Podgląd">
                                            <Eye size={17} />
                                        </button>
                                    )}
                                    <button type="button" onClick={() => handleDownload(doc)} className="p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" title="Pobierz" aria-label="Pobierz">
                                        <Download size={17} />
                                    </button>
                                    <button type="button" onClick={() => setEditing(doc)} className="p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" title="Edytuj" aria-label="Edytuj">
                                        <Pencil size={16} />
                                    </button>
                                    <button type="button" onClick={() => handleDelete(doc)} className="p-2 text-ink-muted hover:text-red-600 hover:bg-red-50 rounded-lg" title="Usuń" aria-label="Usuń">
                                        <Trash2 size={17} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && !error && docs.length > 0 && (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-muted mt-4">
                    <Lock size={11} /> Pliki nie mają publicznych linków — pobranie wymaga zalogowania.
                </p>
            )}
        </div>

        <DocumentDetailSheet
            doc={docs.find((d) => String(d.id) === String(selectedId)) || null}
            onClose={() => setSelectedId(null)}
            onPreview={handleOpen}
            onDownload={handleDownload}
            onEdit={(doc) => {
                setSelectedId(null);
                setEditing(doc);
            }}
            onDelete={handleDelete}
            onToggleStatus={toggleStatus}
            onFilterCounterparty={(doc) => {
                setSelectedId(null);
                setCounterparty(doc.counterparty_key || doc.counterparty);
            }}
            onCreateCollab={(doc) =>
                createCollabFrom(
                    {
                        brand: (doc.counterparty || '').replace(/\s*(sp\. z o\.o\.( sp\.k\.)?|S\.A\.|sp\.[kj]\.)\s*$/u, '') || doc.counterparty,
                        amount_gross: doc.amount || '',
                        date: doc.doc_date || undefined,
                        collab_type: doc.billing && doc.billing !== 'umowa_praca' ? doc.billing : undefined,
                        notes: `Z dokumentu: ${doc.title}`,
                    },
                    [doc.id]
                )
            }
            onUnlinkCollab={unlinkDoc}
        />
        <CollabSuggestionsSheet
            open={suggestionsOpen}
            suggestions={suggestions}
            onClose={() => setSuggestionsOpen(false)}
            onCreate={(s) => createCollabFrom(s.prefill, s.document_ids)}
            onLink={linkSuggestion}
            onDismiss={dismissSuggestion}
        />
        <UploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} onPick={uploadFiles} onScan={(status, ai) => setScan({ status, ai })} aiAvailable={aiAvailable} />
        {scan && <DocumentScanner onCancel={() => setScan(null)} onDone={(pages) => uploadScan(pages, scan.status, scan.ai)} />}
        <EditSheet doc={editing} onClose={() => setEditing(null)} onSaved={refreshAll} aiAvailable={aiAvailable} />
        </>
    );
}
