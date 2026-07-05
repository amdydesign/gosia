import { useState, useEffect, useRef } from 'react';
import { Paperclip, Download, Trash2, Loader2, FileText, Image as ImageIcon, Plus } from 'lucide-react';
import { apiRequest } from '../../utils/api';

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
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        loadAttachments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityType, entityId]);

    const loadAttachments = async () => {
        try {
            setLoading(true);
            const data = await apiRequest(`/attachments/index.php?entity_type=${entityType}&entity_id=${entityId}`);
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message || 'Błąd ładowania załączników');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = ''; // allow re-selecting the same file
        if (!file) return;

        if (file.size > MAX_SIZE) {
            setError('Maksymalny rozmiar pliku to 10 MB');
            return;
        }

        setError('');
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('entity_type', entityType);
            formData.append('entity_id', entityId);

            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const response = await fetch('/api/attachments/upload.php', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                const firstError = data.errors ? Object.values(data.errors).filter(Boolean)[0] : null;
                throw new Error(firstError || data.message || 'Błąd przesyłania pliku');
            }
            await loadAttachments();
        } catch (err) {
            setError(err.message || 'Błąd przesyłania pliku');
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (item) => {
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const response = await fetch(`/api/attachments/download.php?id=${item.id}`, {
                headers: { Authorization: `Bearer ${token}` },
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
            setError(err.message || 'Nie udało się pobrać pliku');
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm(`Usunąć załącznik "${item.original_name}"?`)) return;
        try {
            await apiRequest(`/attachments/delete.php?id=${item.id}`, 'DELETE');
            setItems((prev) => prev.filter((i) => i.id !== item.id));
        } catch (err) {
            setError(err.message || 'Nie udało się usunąć załącznika');
        }
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Paperclip size={18} className="text-gray-400" />
                    Załączniki
                    {items.length > 0 && <span className="text-sm font-normal text-gray-400">({items.length})</span>}
                </h2>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {uploading ? 'Wysyłanie...' : 'Dodaj plik'}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS}
                    onChange={handleUpload}
                    className="hidden"
                />
            </div>

            {error && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</div>
            )}

            {loading ? (
                <div className="text-sm text-gray-400 py-2">Ładowanie...</div>
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">
                    Brak załączników. Dodaj np. umowę, fakturę albo zdjęcie paragonu.
                </p>
            ) : (
                <ul className="divide-y divide-gray-50">
                    {items.map((item) => {
                        const isImage = (item.mime_type || '').startsWith('image/');
                        return (
                            <li key={item.id} className="flex items-center gap-3 py-2.5">
                                <div className="w-9 h-9 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center flex-shrink-0">
                                    {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">{item.original_name}</div>
                                    <div className="text-xs text-gray-400">{formatSize(Number(item.size))}</div>
                                </div>
                                <button
                                    onClick={() => handleDownload(item)}
                                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                    title="Pobierz"
                                >
                                    <Download size={18} />
                                </button>
                                <button
                                    onClick={() => handleDelete(item)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Usuń"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
