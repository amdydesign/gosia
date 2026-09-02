import { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Download, Trash2, Loader2, FileText, Image as ImageIcon, Plus, Camera } from 'lucide-react';
import { apiRequest, getStoredToken } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import Card from '../ui/Card';

const ALLOWED_EXTENSIONS = '.jpg,.jpeg,.png,.gif,.webp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip';
const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
}

/**
 * Attachment list + upload for a collaboration or purchase.
 * Usage: <Attachments entityType="collaboration" entityId={id} />
 */
export default function Attachments({ entityType, entityId }) {
    const toast = useToast();
    const confirm = useConfirm();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
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
                const response = await fetch('/api/attachments/upload.php', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getStoredToken()}` },
                    body: formData,
                });
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
            const response = await fetch(`/api/attachments/download.php?id=${item.id}`, {
                headers: { Authorization: `Bearer ${getStoredToken()}` },
            });
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
        if (!(await confirm({ title: 'Usunąć załącznik?', message: item.original_name, confirmLabel: 'Usuń', danger: true }))) return;
        try {
            await apiRequest(`/attachments/delete.php?id=${item.id}`, 'DELETE');
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            toast.success('Załącznik usunięty');
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć załącznika');
        }
    };

    return (
        <Card padded={false}>
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-line">
                <h2 className="card-title flex items-center gap-2">
                    <Paperclip size={16} className="text-primary-500" />
                    Załączniki
                    {items.length > 0 && <span className="text-xs font-semibold text-ink-muted">({items.length})</span>}
                </h2>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading} className="btn btn-ghost btn-sm sm:hidden" aria-label="Zrób zdjęcie">
                        <Camera size={15} />
                    </button>
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn btn-soft btn-sm">
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {uploading ? 'Wysyłanie…' : 'Dodaj plik'}
                    </button>
                </div>
                <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS} onChange={handleUpload} className="hidden" multiple />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
            </div>

            {error && <div className="mx-4 mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

            {loading ? (
                <div className="px-5 py-4 text-sm text-ink-muted">Ładowanie…</div>
            ) : items.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-muted">Brak załączników. Dodaj umowę, fakturę albo zdjęcie paragonu.</p>
            ) : (
                <ul className="divide-y divide-line">
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
