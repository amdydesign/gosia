import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, Cloud, Download, HardDrive } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { useToast } from '../../context/ToastContext';
import { apiFetch, apiRequest } from '../../utils/api';
import { formatDateShort } from '../../utils/format';

function sizeLabel(bytes) {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "dziś 03:02" / "wczoraj 03:01" / "pt 24.10 03:00" */
function whenLabel(ts) {
    if (!ts) return '';
    const [date, time] = ts.split(' ');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const day = date === today ? 'dziś' : date === yesterday ? 'wczoraj' : formatDateShort(date);
    return `${day} ${(time || '').slice(0, 5)}`;
}

/**
 * Kopie zapasowe (admin): is last night's backup there, is it off the server, download one.
 */
export default function BackupSheet({ open, onClose }) {
    const toast = useToast();
    const [status, setStatus] = useState(null);
    const [running, setRunning] = useState(false);

    const load = useCallback(() => {
        apiRequest('/settings/backup.php')
            .then(setStatus)
            .catch(() => setStatus({ files: [] }));
    }, []);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    const runNow = async () => {
        setRunning(true);
        try {
            setStatus(await apiRequest('/settings/backup.php', 'POST', {}));
            toast.success('Kopia zrobiona');
        } catch (err) {
            toast.error(err.message || 'Kopia nie wyszła');
            load();
        } finally {
            setRunning(false);
        }
    };

    const download = async (file) => {
        try {
            const res = await apiFetch(`/settings/backup.php?download=${encodeURIComponent(file.name)}`);
            if (!res.ok) throw new Error('Nie udało się pobrać');
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = `gonia-${file.name}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.message || 'Nie udało się pobrać');
        }
    };

    const fresh = status?.last_ok && Date.now() - new Date(status.last_ok.replace(' ', 'T')).getTime() < 36 * 3600000;

    return (
        <Sheet open={open} onClose={onClose} title="Kopie zapasowe" description="Baza co noc, pliki (umowy, paragony) w niedziele." size="sm">
            {!status ? (
                <p className="text-sm text-ink-muted py-6 text-center">Ładowanie…</p>
            ) : (
                <div className="space-y-4">
                    <div className={`rounded-2xl border p-4 flex gap-3 ${fresh && !status.last_error ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-200'}`}>
                        {fresh && !status.last_error ? (
                            <CheckCircle2 size={20} className="text-emerald-700 shrink-0 mt-0.5" />
                        ) : (
                            <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 text-sm">
                            <div className="font-semibold text-ink">
                                {status.last_ok ? `Ostatnia kopia: ${whenLabel(status.last_ok)}` : 'Jeszcze nie było kopii'}
                            </div>
                            {status.last_error && <div className="text-amber-800 mt-0.5 break-words">Błąd: {status.last_error}</div>}
                        </div>
                    </div>

                    <div className="flex items-start gap-3 text-sm">
                        {status.remote ? <Cloud size={18} className="text-emerald-700 shrink-0 mt-0.5" /> : <CloudOff size={18} className="text-ink-muted shrink-0 mt-0.5" />}
                        <p className="text-ink-soft">
                            {status.remote
                                ? `Kopie lecą też poza serwer${status.encrypted ? ', zaszyfrowane' : ' (bez hasła — ustaw BACKUP_PASSWORD)'}.`
                                : 'Kopie są tylko na serwerze. Raz na jakiś czas pobierz najnowszą na swój dysk albo ustaw BACKUP_S3_* w api/.env.'}
                        </p>
                    </div>

                    {status.files?.length > 0 && (
                        <div className="card divide-y divide-line overflow-hidden">
                            {status.files.map((f) => (
                                <button key={f.name} type="button" onClick={() => download(f)} className="row w-full text-left hover:bg-surface-2">
                                    <HardDrive size={16} className="text-ink-muted shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-ink">{f.name.startsWith('db-') ? 'Baza danych' : 'Pliki'}</span>
                                        <span className="block text-xs text-ink-muted">
                                            {whenLabel(f.date)} · {sizeLabel(f.size)}
                                        </span>
                                    </span>
                                    <Download size={16} className="text-ink-muted shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}

                    <Button variant="secondary" block loading={running} onClick={runNow}>
                        Zrób kopię teraz
                    </Button>
                </div>
            )}
        </Sheet>
    );
}
