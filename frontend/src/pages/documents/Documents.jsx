import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, FolderLock, FileText, Image as ImageIcon, Download, Eye, Pencil, Trash2, Lock, Upload, CheckCircle2, PenLine } from 'lucide-react';
import documentsService from '../../services/documents';
import { extractPdfText } from '../../utils/pdfText';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
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

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
}

function baseName(fileName) {
    return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

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

function UploadSheet({ open, onClose, onUploaded }) {
    const toast = useToast();
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [signStatus, setSignStatus] = useState('signed');
    const [date, setDate] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setFile(null);
            setTitle('');
            setNotes('');
            setSignStatus('signed');
            setDate('');
            setStatus('');
            setError('');
        }
    }, [open]);

    const pickFile = (event) => {
        const picked = event.target.files?.[0];
        event.target.value = '';
        if (!picked) return;
        if (picked.size > MAX_SIZE) {
            setError('Maksymalny rozmiar pliku to 20 MB');
            return;
        }
        setError('');
        setFile(picked);
        if (!title.trim()) setTitle(baseName(picked.name));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!file) {
            setError('Wybierz plik');
            return;
        }
        if (!title.trim()) {
            setError('Podaj nazwę dokumentu');
            return;
        }
        setError('');
        try {
            let contentText = '';
            if (/\.pdf$/i.test(file.name)) {
                setStatus('Odczytuję tekst z PDF…');
                try {
                    contentText = await extractPdfText(file);
                } catch {
                    contentText = '';
                }
            }
            setStatus('Wysyłanie…');
            const result = await documentsService.upload({ file, title: title.trim(), notes, status: signStatus, docDate: date, contentText });
            toast.success(result?.has_text ? 'Dokument dodany — treść przeszukiwalna' : 'Dokument dodany');
            onUploaded();
            onClose();
        } catch (err) {
            setError(err.message || 'Nie udało się dodać dokumentu');
        } finally {
            setStatus('');
        }
    };

    const busy = Boolean(status);

    return (
        <Sheet
            open={open}
            onClose={busy ? undefined : onClose}
            title="Nowy dokument"
            description="Plik jest dostępny tylko po zalogowaniu."
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={busy} className="flex-1">
                        Anuluj
                    </Button>
                    <Button variant="primary" type="submit" form="document-upload" loading={busy} icon={Upload} className="flex-1">
                        {status || 'Dodaj'}
                    </Button>
                </>
            }
        >
            <form id="document-upload" onSubmit={handleSubmit} className="space-y-4">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="w-full rounded-2xl border-2 border-dashed border-line hover:border-primary-300 bg-canvas px-4 py-5 text-center transition-colors"
                >
                    {file ? (
                        <>
                            <div className="text-sm font-semibold text-ink truncate">{file.name}</div>
                            <div className="text-xs text-ink-muted mt-0.5">{formatSize(file.size)} · kliknij, aby zmienić</div>
                        </>
                    ) : (
                        <>
                            <Upload size={22} className="mx-auto text-primary-500 mb-1.5" />
                            <div className="text-sm font-semibold text-ink">Wybierz plik</div>
                            <div className="text-xs text-ink-muted mt-0.5">PDF, Word, Excel, zdjęcie · do 20 MB</div>
                        </>
                    )}
                </button>
                <input ref={inputRef} type="file" accept={ACCEPT} onChange={pickFile} className="hidden" />

                <Field label="Nazwa dokumentu" required>
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Umowa NDA — Marka X 2026" maxLength={255} />
                </Field>

                <Field label="Status">
                    <ChoiceChips options={STATUS_OPTIONS} value={signStatus} onChange={setSignStatus} />
                </Field>

                <Field label="Data dokumentu" hint="Np. data podpisania. Puste = data dodania.">
                    <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>

                <Field label="Notatka" hint="Opcjonalnie: słowa kluczowe, strony, daty. Też są przeszukiwane.">
                    <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </Field>

                {error && <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
            </form>
        </Sheet>
    );
}

function EditSheet({ doc, onClose, onSaved }) {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [signStatus, setSignStatus] = useState('signed');
    const [date, setDate] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (doc) {
            setTitle(doc.title || '');
            setNotes(doc.notes || '');
            setSignStatus(doc.status || 'signed');
            setDate(doc.doc_date || '');
        }
    }, [doc]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!title.trim()) return;
        setSaving(true);
        try {
            await documentsService.update(doc.id, { title: title.trim(), notes, status: signStatus, doc_date: date });
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
                <Field label="Status">
                    <ChoiceChips options={STATUS_OPTIONS} value={signStatus} onChange={setSignStatus} />
                </Field>
                <Field label="Data dokumentu" hint="Np. data podpisania. Puste = data dodania.">
                    <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Notatka">
                    <textarea className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                </Field>
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
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('date_desc');
    const [year, setYear] = useState('all');
    const requestId = useRef(0);

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

    // Server-side search (also inside document text), debounced while typing
    useEffect(() => {
        const timer = setTimeout(() => load(query), query ? 300 : 0);
        return () => clearTimeout(timer);
    }, [query, load]);

    // "+" button on mobile opens the upload sheet via ?add=1
    useEffect(() => {
        if (searchParams.get('add') === '1') {
            setUploadOpen(true);
            navigate('/documents', { replace: true });
        }
    }, [searchParams, navigate]);

    const years = useMemo(() => [...new Set(docs.map((d) => docDate(d).slice(0, 4)).filter(Boolean))].sort().reverse(), [docs]);

    // Year filter first, so the status counts match what the list can show
    const inYear = useMemo(() => (year === 'all' ? docs : docs.filter((d) => docDate(d).startsWith(year))), [docs, year]);

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
            toast.success('Dokument usunięty');
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć dokumentu');
        }
    };

    // Sheets render outside the animated wrapper - its transform would trap their z-index under the nav
    return (
        <>
        <div className="animate-fade-in">
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
                    <SearchInput value={query} onChange={setQuery} placeholder="Szukaj po nazwie lub treści umowy…" className="flex-1" />
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
                <div className="flex gap-2.5">
                    <select value={sort} onChange={(e) => setSort(e.target.value)} className="input !py-2 !rounded-xl flex-1 sm:flex-none sm:w-44" aria-label="Sortowanie">
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <select value={year} onChange={(e) => setYear(e.target.value)} className="input !py-2 !rounded-xl flex-1 sm:flex-none sm:w-44" aria-label="Rok">
                        <option value="all">Wszystkie lata</option>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </PageHeader>

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
                        title={docs.length > 0 ? (filter === 'to_sign' ? 'Wszystko podpisane!' : filter === 'signed' ? 'Brak podpisanych dokumentów' : 'Brak dokumentów z tego roku') : query ? 'Nic nie znaleziono' : 'Archiwum jest puste'}
                        text={docs.length > 0 ? 'Zmień filtr lub rok, żeby zobaczyć pozostałe dokumenty.' : query ? 'Spróbuj innego słowa — szukam w nazwach, notatkach i treści dokumentów.' : 'Dodaj pierwszą umowę. Tekst z PDF i Worda będzie można przeszukiwać.'}
                        action={!query && docs.length === 0 && <Button variant="primary" icon={Plus} onClick={() => setUploadOpen(true)}>Dodaj dokument</Button>}
                    />
                </div>
            ) : (
                <div className="card divide-y divide-line overflow-hidden">
                    {visible.map((doc) => {
                        const isImage = (doc.mime_type || '').startsWith('image/');
                        const Icon = isImage ? ImageIcon : FileText;
                        return (
                            <div key={doc.id} className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <Icon size={19} />
                                </div>
                                <button type="button" onClick={() => handleOpen(doc)} className="flex-1 min-w-0 text-left">
                                    <div className="text-[15px] font-semibold text-ink leading-snug break-words hover:text-primary-700">
                                        <Highlight text={doc.title} query={query} />
                                    </div>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleStatus(doc);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleStatus(doc);
                                            }
                                        }}
                                        title={doc.status === 'to_sign' ? 'Kliknij, gdy podpisane' : 'Kliknij, aby oznaczyć jako do podpisu'}
                                        className={`badge mt-1 cursor-pointer ${doc.status === 'to_sign' ? 'badge-warning' : 'badge-success'}`}
                                    >
                                        {doc.status === 'to_sign' ? <PenLine size={11} strokeWidth={2.5} /> : <CheckCircle2 size={11} strokeWidth={2.5} />}
                                        {doc.status === 'to_sign' ? 'Do podpisu' : 'Podpisane'}
                                    </span>
                                    <div className="text-xs text-ink-muted mt-1 truncate">
                                        {formatDocDate(docDate(doc))} · {doc.original_name} · {formatSize(doc.size)}
                                        {!doc.has_text && ' · tylko nazwa'}
                                    </div>
                                    {doc.snippet ? (
                                        <p className="text-sm text-ink-soft mt-1.5 line-clamp-3">
                                            <Highlight text={doc.snippet} query={query} />
                                        </p>
                                    ) : doc.notes ? (
                                        <p className="text-sm text-ink-soft mt-1.5 line-clamp-2">
                                            <Highlight text={doc.notes} query={query} />
                                        </p>
                                    ) : null}
                                </button>
                                <div className="flex items-center shrink-0 -mr-2">
                                    {PREVIEW_TYPES.includes(doc.mime_type) && (
                                        <button type="button" onClick={() => handleOpen(doc)} className="hidden sm:inline-flex p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" title="Podgląd" aria-label="Podgląd">
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

        <UploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => load(query)} />
        <EditSheet doc={editing} onClose={() => setEditing(null)} onSaved={() => load(query)} />
        </>
    );
}
