import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Download, Share2, Pencil, Trash2, FileText, Building2, CalendarDays, CheckCircle2, PenLine, Loader2, File as FileIcon, Briefcase, Banknote, Unlink, Tag } from 'lucide-react';
import Sheet from '../ui/Sheet';
import documentsService from '../../services/documents';
import { documentThumbnail } from '../../utils/thumbnail';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/format';

const PREVIEW_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
}

function formatDay(value) {
    if (!value) return '';
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
}

function Row({ icon, label, children }) {
    const Icon = icon;
    return (
        <div className="flex items-start gap-3 py-2.5">
            <Icon size={16} className="text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
                <div className="text-sm text-ink break-words">{children}</div>
            </div>
        </div>
    );
}

/**
 * Document card: first-page thumbnail, summary and all actions in one place.
 */
export default function DocumentDetailSheet({ doc, onClose, onPreview, onDownload, onEdit, onDelete, onToggleStatus, onFilterCounterparty, onFilterBrand, onCreateCollab, onUnlinkCollab }) {
    const toast = useToast();
    const navigate = useNavigate();
    const [thumb, setThumb] = useState({ loading: true, data: null });
    const [excerpt, setExcerpt] = useState('');
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        if (!doc) return undefined;
        let cancelled = false;
        setThumb({ loading: true, data: null });
        setExcerpt('');
        documentThumbnail(doc).then((data) => !cancelled && setThumb({ loading: false, data }));
        if (doc.has_text) {
            documentsService
                .getText(doc.id)
                .then((data) => !cancelled && setExcerpt((data?.content_text || '').replace(/\s+/g, ' ').trim().slice(0, 420)))
                .catch(() => {});
        }
        return () => {
            cancelled = true;
        };
    }, [doc]);

    if (!doc) return null;

    const canPreview = PREVIEW_TYPES.includes(doc.mime_type);
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    const toSign = doc.status === 'to_sign';

    // iPhone/Android share sheet with the file itself (mail, messenger, AirDrop…)
    const share = async () => {
        setSharing(true);
        try {
            const file = await documentsService.file(doc);
            if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('Ten telefon nie udostępnia plików z przeglądarki.');
            await navigator.share({ files: [file], title: doc.title });
        } catch (err) {
            if (err?.name !== 'AbortError') toast.error(err.message || 'Nie udało się udostępnić pliku');
        } finally {
            setSharing(false);
        }
    };

    const action = 'flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-canvas border border-line text-ink hover:border-primary-300 hover:text-primary-700 transition-colors text-xs font-semibold disabled:opacity-50';

    return (
        <Sheet open={Boolean(doc)} onClose={onClose} title={doc.title} size="lg">
            <div className="space-y-4">
                <div className="flex gap-4">
                    <button
                        type="button"
                        onClick={() => canPreview && onPreview(doc)}
                        className="w-28 sm:w-36 shrink-0 aspect-[3/4] rounded-xl border border-line bg-canvas overflow-hidden flex items-center justify-center"
                        aria-label="Zobacz dokument"
                    >
                        {thumb.loading ? (
                            <Loader2 size={20} className="animate-spin text-ink-muted" />
                        ) : thumb.data ? (
                            <img src={thumb.data.url} alt="Pierwsza strona" className="w-full h-full object-cover object-top bg-white" />
                        ) : (
                            <FileText size={34} className="text-ink-muted" />
                        )}
                    </button>
                    <div className="min-w-0 flex-1 space-y-2">
                        {doc.brand && (
                            <button
                                type="button"
                                onClick={() => onFilterBrand(doc)}
                                className="flex items-center gap-1.5 text-sm font-bold text-primary-700 text-left"
                                title="Pokaż wszystkie dokumenty tej marki"
                            >
                                <Tag size={14} className="shrink-0" />
                                <span className="break-words underline decoration-dotted underline-offset-2">{doc.brand}</span>
                            </button>
                        )}
                        {doc.counterparty && (
                            <button
                                type="button"
                                onClick={() => onFilterCounterparty(doc)}
                                className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-primary-700 text-left"
                                title="Pokaż wszystkie dokumenty tego kontrahenta"
                            >
                                <Building2 size={14} className="shrink-0" />
                                <span className="break-words underline decoration-dotted underline-offset-2">{doc.counterparty}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onToggleStatus(doc)}
                            className={`badge cursor-pointer ${toSign ? 'badge-warning' : 'badge-success'}`}
                            title={toSign ? 'Kliknij, gdy podpisane' : 'Kliknij, aby oznaczyć jako do podpisu'}
                        >
                            {toSign ? <PenLine size={11} strokeWidth={2.5} /> : <CheckCircle2 size={11} strokeWidth={2.5} />}
                            {toSign ? 'Do podpisu' : 'Podpisane'}
                        </button>
                        <div className="text-sm text-ink-soft">{formatDay(doc.doc_date) || 'Bez daty dokumentu'}</div>
                        <div className="text-xs text-ink-muted">
                            {formatSize(doc.size)}
                            {thumb.data?.pages ? ` · ${thumb.data.pages} ${thumb.data.pages === 1 ? 'strona' : thumb.data.pages < 5 ? 'strony' : 'stron'}` : ''}
                        </div>
                    </div>
                </div>

                <div className={`grid ${canShare ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
                    <button type="button" onClick={() => onPreview(doc)} disabled={!canPreview} className={action}>
                        <Eye size={18} /> Zobacz
                    </button>
                    <button type="button" onClick={() => onDownload(doc)} className={action}>
                        <Download size={18} /> Pobierz
                    </button>
                    {canShare && (
                        <button type="button" onClick={share} disabled={sharing} className={action}>
                            {sharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />} Wyślij
                        </button>
                    )}
                    <button type="button" onClick={() => onEdit(doc)} className={action}>
                        <Pencil size={18} /> Edytuj
                    </button>
                    <button type="button" onClick={() => onDelete(doc)} className={`${action} hover:!text-red-600 hover:!border-red-200`}>
                        <Trash2 size={18} /> Usuń
                    </button>
                </div>

                <div className="rounded-2xl border border-line p-3">
                    <div className="flex items-center gap-2">
                        <Briefcase size={16} className="text-primary-500 shrink-0" />
                        <span className="text-sm font-semibold text-ink flex-1">Współpraca</span>
                        {doc.collaboration_id && <span className="badge badge-success">Połączona</span>}
                    </div>
                    {doc.collaboration_id ? (
                        <div className="flex gap-2 mt-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    navigate(`/collaborations/${doc.collaboration_id}`);
                                }}
                                className="btn btn-soft btn-sm flex-1"
                            >
                                Otwórz współpracę
                            </button>
                            <button type="button" onClick={() => onUnlinkCollab(doc)} className="btn btn-ghost btn-sm" title="Odłącz od współpracy">
                                <Unlink size={14} /> Odłącz
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-ink-muted mt-1">Dokument nie jest jeszcze przypisany do żadnej współpracy.</p>
                            <button type="button" onClick={() => onCreateCollab(doc)} className="btn btn-soft btn-sm w-full mt-2.5">
                                <Briefcase size={14} /> Utwórz współpracę z tego dokumentu
                            </button>
                        </>
                    )}
                </div>

                {doc.notes && (
                    <div className="rounded-2xl bg-canvas border border-line p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Podsumowanie / notatka</div>
                        <p className="text-sm text-ink whitespace-pre-line">{doc.notes}</p>
                    </div>
                )}

                <div className="divide-y divide-line">
                    <Row icon={CalendarDays} label="Data dokumentu">{formatDay(doc.doc_date) || '—'}</Row>
                    <Row icon={Building2} label="Kontrahent">{doc.counterparty || '—'}</Row>
                    <Row icon={Tag} label="Marka">{doc.brand || '—'}</Row>
                    <Row icon={Banknote} label="Kwota brutto">{doc.amount ? formatCurrency(doc.amount) : '—'}</Row>
                    <Row icon={FileIcon} label="Plik">
                        {doc.original_name} · {formatSize(doc.size)}
                    </Row>
                    <Row icon={CalendarDays} label="Dodano">{formatDay(doc.created_at)}</Row>
                </div>

                {excerpt && (
                    <div className="rounded-2xl border border-line p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Początek treści</div>
                        <p className="text-xs text-ink-soft leading-relaxed">{excerpt}…</p>
                    </div>
                )}
            </div>
        </Sheet>
    );
}
