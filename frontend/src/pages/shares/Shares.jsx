import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UploadCloud, Upload, Send, Loader2, AlertCircle, X, RotateCw, Link2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useQuickActions } from '../../context/QuickActionsContext';
import { deletedToast } from '../../services/trash';
import {
    listShares,
    deleteShare,
    sendLink,
    copyLink,
    posterUrl,
    queueShareUploads,
    cancelShareUpload,
    retryShareUpload,
    useShareUploads,
    onShareUploaded,
} from '../../services/shares';
import { formatBytes, formatShareDate } from '../../utils/shares';
import ShareDetailSheet, { ShareIcon } from '../../components/shares/ShareDetailSheet';
import PageHeader from '../../components/ui/PageHeader';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';

const SORT_KEY = 'gosia-share-sort';
const SORT_OPTIONS = [
    { value: 'new', label: 'Najnowsze' },
    { value: 'old', label: 'Najstarsze' },
    { value: 'name', label: 'Nazwa A–Z' },
    { value: 'size', label: 'Największe' },
    { value: 'views', label: 'Najczęściej oglądane' },
    { value: 'unseen', label: 'Nieotwarte najpierw' },
];

function readSort() {
    try {
        const saved = localStorage.getItem(SORT_KEY);
        return SORT_OPTIONS.some((o) => o.value === saved) ? saved : 'new';
    } catch {
        return 'new';
    }
}

function sortShares(items, sort) {
    const list = [...items];
    const byNew = (a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id;
    switch (sort) {
        case 'old':
            return list.sort((a, b) => -byNew(a, b));
        case 'name':
            return list.sort((a, b) => a.title.localeCompare(b.title, 'pl', { sensitivity: 'base', numeric: true }));
        case 'size':
            return list.sort((a, b) => b.size - a.size);
        case 'views':
            return list.sort((a, b) => b.views - a.views || byNew(a, b));
        case 'unseen':
            return list.sort((a, b) => (a.views > 0) - (b.views > 0) || byNew(a, b));
        default:
            return list.sort(byNew);
    }
}

/** Green: opened, amber: nobody opened yet, red/grey: the link does not work. */
function StatusLine({ share }) {
    if (share.status === 'expired') return <span className="font-semibold text-red-600">Link wygasł</span>;
    if (share.status === 'off') return <span className="font-semibold text-ink-muted">Link wyłączony</span>;
    if (share.views > 0) return <span className="font-semibold text-emerald-600">Obejrzane {share.views}×</span>;
    return <span className="font-semibold text-amber-600">Nieotwarte</span>;
}

/**
 * "Udostępnij": drop a reel (any size), get a link for the brand / manager.
 * One main action per screen (pick a file) and per row (send the link).
 */
export default function Shares() {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { versions } = useQuickActions();
    const uploads = useShareUploads();
    const fileRef = useRef(null);

    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [sort, setSortState] = useState(readSort);
    const [selectedId, setSelectedId] = useState(null);
    const [freshId, setFreshId] = useState(null);
    const [dragging, setDragging] = useState(false);

    const setSort = (value) => {
        setSortState(value);
        try {
            localStorage.setItem(SORT_KEY, value);
        } catch {
            // storage blocked
        }
    };

    const load = useCallback(() => {
        listShares()
            .then((res) => {
                setData(res);
                setError('');
            })
            .catch((err) => setError(err.message || 'Nie udało się pobrać plików'));
    }, []);

    useEffect(() => {
        load();
    }, [load, versions.shares]);

    // A file finished uploading (also while this screen was closed): show it on top
    useEffect(
        () =>
            onShareUploaded((share) => {
                setData((prev) => (prev ? { ...prev, items: [share, ...prev.items], total_size: prev.total_size + share.size } : prev));
                setFreshId(share.id);
                toast.success(`Gotowe: ${share.title}`, {
                    duration: 10000,
                    action: {
                        label: 'Kopiuj link',
                        onClick: async () => {
                            if (await copyLink(share)) toast.success('Link skopiowany');
                        },
                    },
                });
            }),
        [toast]
    );

    // "+" / Dodaj -> straight to picking a file
    useEffect(() => {
        if (searchParams.get('add') !== '1') return;
        navigate('/share', { replace: true });
        fileRef.current?.click();
    }, [searchParams, navigate]);

    const pick = (files) => {
        const list = Array.from(files || []).filter((f) => f.size > 0);
        if (!list.length) return;
        const max = data?.max_size || 0;
        const tooBig = max ? list.filter((f) => f.size > max) : [];
        if (tooBig.length) toast.error(`Za duży plik: ${tooBig[0].name} (max ${formatBytes(max)})`);
        const ok = list.filter((f) => !tooBig.includes(f));
        if (ok.length) queueShareUploads(ok);
    };

    const items = useMemo(() => data?.items || [], [data]);
    const visible = useMemo(() => {
        const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filtered = words.length
            ? items.filter((s) => {
                  const text = `${s.title} ${s.original_name} ${s.note || ''}`.toLowerCase();
                  return words.every((w) => text.includes(w));
              })
            : items;
        return sortShares(filtered, sort);
    }, [items, query, sort]);

    const replaceShare = (updated) =>
        setData((prev) => (prev ? { ...prev, items: prev.items.map((s) => (s.id === updated.id ? updated : s)) } : prev));

    const send = async (share) => {
        const result = await sendLink(share);
        if (result === 'copied') toast.success('Link skopiowany — wklej go w wiadomości');
        else if (result === null && !navigator.share) toast.error('Nie udało się skopiować');
    };

    const remove = async (share) => {
        try {
            const res = await deleteShare(share.id);
            setSelectedId(null);
            setData((prev) => (prev ? { ...prev, items: prev.items.filter((s) => s.id !== share.id), total_size: prev.total_size - share.size } : prev));
            deletedToast(toast, 'Usunięte — link przestał działać', res?.trash_id, load);
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć');
        }
    };

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
            pick(e.dataTransfer?.files);
        },
    };

    const selected = items.find((s) => s.id === selectedId) || null;
    const unseen = items.filter((s) => s.status === 'active' && s.views === 0).length;

    return (
        <>
            <div className="animate-fade-in relative" {...dropHandlers}>
                {dragging && (
                    <div className="absolute inset-0 z-20 rounded-3xl border-2 border-dashed border-primary-400 bg-primary-50/80 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <Upload size={30} className="mx-auto text-primary-600 mb-2" />
                            <div className="font-bold text-primary-800">Upuść, żeby wysłać</div>
                        </div>
                    </div>
                )}

                <PageHeader title="Udostępnij" subtitle="Rolki i pliki dla marek i managerek — wyślij link" />

                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />

                {/* The one main action */}
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-3xl border-2 border-dashed border-primary-300 bg-primary-50/60 hover:border-primary-500 hover:bg-primary-50 px-4 py-7 text-center transition-colors"
                >
                    <UploadCloud size={32} className="mx-auto text-primary-600 mb-2" />
                    <div className="text-base font-bold text-ink">Wrzuć rolkę lub plik</div>
                    <div className="text-xs text-ink-muted mt-0.5">
                        Kilka naraz też · do {data ? formatBytes(data.max_size) : '5 GB'} każdy
                        <span className="hidden lg:inline"> · albo przeciągnij tutaj</span>
                    </div>
                </button>

                {uploads.length > 0 && (
                    <div className="card divide-y divide-line overflow-hidden mt-3">
                        {uploads.map((u) => {
                            const pct = u.size ? Math.floor((u.sent / u.size) * 100) : 0;
                            const failed = u.status === 'error';
                            return (
                                <div key={u.key} className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${failed ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-600'}`}>
                                            {failed ? <AlertCircle size={18} /> : <Loader2 size={18} className={u.status === 'waiting' ? '' : 'animate-spin'} />}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-ink truncate">{u.name}</div>
                                            <div className={`text-xs ${failed || u.error ? 'text-red-700' : 'text-ink-muted'}`}>
                                                {failed
                                                    ? u.error
                                                    : u.status === 'waiting'
                                                      ? 'Czeka w kolejce…'
                                                      : u.status === 'saving'
                                                        ? 'Tworzę link…'
                                                        : u.error || (
                                                              <>
                                                                  <b className="text-ink">{pct}%</b> · {formatBytes(u.sent)} z {formatBytes(u.size)} — nie zamykaj aplikacji
                                                              </>
                                                          )}
                                            </div>
                                        </div>
                                        {failed && (
                                            <button type="button" onClick={() => retryShareUpload(u.key)} className="p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" aria-label="Spróbuj ponownie" title="Spróbuj ponownie">
                                                <RotateCw size={16} />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => cancelShareUpload(u.key)} className="p-2 text-ink-muted hover:bg-ink/5 rounded-lg" aria-label="Anuluj" title="Anuluj">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    {!failed && (
                                        <div className="mt-2 h-1.5 rounded-full bg-ink/5 overflow-hidden">
                                            <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {items.length > 0 && (
                    <div className="mt-5 mb-3 space-y-2.5">
                        <div className="text-sm text-ink-soft">
                            <b className="text-ink">{items.length}</b> {items.length === 1 ? 'plik' : items.length < 5 ? 'pliki' : 'plików'} ·{' '}
                            <b className="text-ink">{formatBytes(data.total_size)}</b> na serwerze
                            {unseen > 0 && (
                                <>
                                    {' '}· <b className="text-amber-600">{unseen} nieotwarte</b>
                                </>
                            )}
                        </div>
                        {items.length > 3 && (
                            <div className="flex gap-2.5">
                                <SearchInput value={query} onChange={setQuery} placeholder="Szukaj…" className="flex-1 min-w-0" />
                                <select value={sort} onChange={(e) => setSort(e.target.value)} className="input !py-2 !rounded-xl !w-auto max-w-[45%]" aria-label="Sortowanie">
                                    {SORT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {!data && !error ? (
                    <div className="space-y-3 mt-5">
                        {[0, 1, 2].map((i) => <CardSkeleton key={i} className="h-20" />)}
                    </div>
                ) : error ? (
                    <EmptyState icon={Link2} title="Nie udało się pobrać plików" text={error} />
                ) : items.length === 0 ? (
                    uploads.length === 0 && (
                        <EmptyState
                            icon={Link2}
                            title="Nic jeszcze nie udostępniono"
                            text="Wrzuć rolkę — dostaniesz link, który wyślesz marce albo managerce. Obejrzą bez logowania."
                        />
                    )
                ) : visible.length === 0 ? (
                    <EmptyState icon={Link2} title="Nic nie znaleziono" text="Spróbuj innego słowa." compact />
                ) : (
                    <div className="card divide-y divide-line overflow-hidden">
                        {visible.map((share) => {
                            const poster = posterUrl(share);
                            const fresh = share.id === freshId;
                            return (
                                <div key={share.id} className={`flex items-center gap-3 pl-3 pr-2 sm:px-4 py-2.5 transition-colors ${fresh ? 'bg-accent/15' : 'hover:bg-canvas/70'}`}>
                                    <button type="button" onClick={() => setSelectedId(share.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                                        <span className="w-11 h-14 rounded-lg overflow-hidden bg-surface-2 border border-line flex items-center justify-center text-ink-muted shrink-0">
                                            {poster ? <img src={poster} alt="" loading="lazy" className="w-full h-full object-cover" /> : <ShareIcon share={share} size={18} />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[15px] font-semibold text-ink truncate">{share.title}</span>
                                            <span className="block text-[13px] text-ink-muted truncate mt-0.5">
                                                <StatusLine share={share} /> · {formatBytes(share.size)} · {formatShareDate(share.created_at)}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => send(share)}
                                        disabled={share.status !== 'active'}
                                        className={`btn btn-sm shrink-0 ${fresh ? 'btn-primary' : 'btn-soft'} disabled:opacity-40`}
                                        title="Wyślij link"
                                    >
                                        <Send size={14} />
                                        Wyślij
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <ShareDetailSheet share={selected} onClose={() => setSelectedId(null)} onChanged={replaceShare} onDelete={remove} />
        </>
    );
}
