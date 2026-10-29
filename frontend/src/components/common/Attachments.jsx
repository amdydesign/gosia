import { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Download, Trash2, Loader2, FileText, Image as ImageIcon, Plus, Camera, ChevronDown } from 'lucide-react';
import { apiFetch, apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { deletedToast } from '../../services/trash';
import Card from '../ui/Card';

const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.gif,.webp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';
const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
}

const OPEN_KEY = 'gonia.filesOpen';

function readOpen() {
    try {
        return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
        return false;
    }
}

/**
 * Files of a collaboration or purchase as one row ("Pliki · 3"); tap to see the list.
 * `extra` (e.g. linked contracts) is listed first and counted with the files.
 * Usage: <Attachments entityType="collaboration" entityId={id} />
 */
export default function Attachments({ entityType, entityId, extra = null, extraCount = 0 }) {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(readOpen);

    const toggleOpen = () => {
        setOpen((o) => {
            try {
                localStorage.setItem(OPEN_KEY, o ? '0' : '1');
            } catch {
                // ignore
            }
            return !o;
        });
    };
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const loadAttachments = useCallback(async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/attachments/index.php?entity_type=${entityType}&entity_id=${entityId}`);
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Błąd ładowania załączników');
        } finally {
            setLoading(false);
        }
    }, [entityType, entityId]);

    useEffect(() => {
        loadAttachments();
    }, [loadAttachments]);

    const handleUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;

        setError('');
        setUploading(true);
        let uploaded = 0;
        for (const file of files) {
            if (file.size > MAX_SIZE) {
                setError(`${file.name}: maksymalny rozmiar pliku to 10 MB`);
                continue;
            }
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('entity_type', entityType);
                formData.append('entity_id', entityId);
                const response = await apiFetch('/attachments/upload.php', { method: 'POST', body: formData });
                const data = await response.json();
                if (!response.ok || !data.success) {
                    const firstError = data.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
                    throw new Error(firstError || data.message || 'Błąd przesyłania pliku');
                }
                uploaded += 1;
            } catch (err) {
                setError(err.message || 'Błąd przesyłania pliku');
            }
        }
        setUploading(false);
        if (uploaded > 0) {
            toast.success(uploaded === 1 ? 'Załącznik dodany' : `Dodano ${uploaded} załączniki`);
            await loadAttachments();
        }
    };

    const handleDownload = async (item) => {
        try {
            const response = await apiFetch(`/attachments/download.php?id=${item.id}`);
            if (!response.ok) throw new Error('Nie udało się pobrać pliku');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = item.original_name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.message || 'Nie udało się pobrać pliku');
        }
    };

    const handleDelete = async (item) => {
        try {
            const res = await apiRequest(`/attachments/delete.php?id=${item.id}`, 'DELETE');
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            deletedToast(toast, 'Załącznik usunięty', res?.trash_id, () => loadAttachments());
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć załącznika');
        }
    };

    const total = items.length + extraCount;
    const expanded = open && total > 0;

    return (
        <Card padded={false}>
            <div className={`flex items-center justify-between gap-3 pl-4 sm:pl-5 pr-3 py-2.5 ${expanded ? 'border-b border-line' : ''}`}>
                <button type="button" onClick={toggleOpen} disabled={!total} aria-expanded={expanded} className="flex-1 min-w-0 flex items-center gap-2 text-left py-1">
                    <Paperclip size={16} className="text-primary-500 shrink-0" />
                    <span className="text-sm font-semibold text-ink">Pliki</span>
                    <span className="text-sm text-ink-muted">{loading ? '' : total ? `· ${total}` : '· brak'}</span>
                    {total > 0 && <ChevronDown size={15} className={`text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />}
                </button>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading} className="btn btn-ghost btn-sm sm:hidden" aria-label="Zrób zdjęcie">
                        <Camera size={15} />
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn btn-ghost btn-sm">
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {uploading ? 'Wysyłanie…' : 'Plik'}
                    </button>
                </div>
                <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS} onChange={handleUpload} className="hidden" multiple />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
            </div>

            {error && <div className="mx-4 mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

            {expanded && extra}
            {expanded && items.length > 0 && (
                <ul className={`divide-y divide-line ${extra ? 'border-t border-line' : ''}`}>
                    {items.map((item) => {
                        const isImage = (item.mime_type || '').startsWith('image/');
                        return (
                            <li key={item.id} className="row !py-2.5">
                                <div className="w-9 h-9 rounded-lg bg-canvas border border-line text-ink-muted flex items-center justify-center shrink-0">
                                    {isImage ? <ImageIcon size={17} /> : <FileText size={17} />}
                                </div>
                                <button type="button" onClick={() => handleDownload(item)} className="flex-1 min-w-0 text-left">
                                    <div className="text-sm font-semibold text-ink truncate hover:text-primary-700">{item.original_name}</div>
                                    <div className="text-xs text-ink-muted">{formatSize(Number(item.size))}</div>
                                </button>
                                <button type="button" onClick={() => handleDownload(item)} className="p-2 text-ink-muted hover:text-primary-700 hover:bg-primary-50 rounded-lg" title="Pobierz" aria-label="Pobierz">
                                    <Download size={17} />
                                </button>
                                <button type="button" onClick={() => handleDelete(item)} className="p-2 text-ink-muted hover:text-red-600 hover:bg-red-50 rounded-lg" title="Usuń" aria-label="Usuń">
                                    <Trash2 size={17} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}
