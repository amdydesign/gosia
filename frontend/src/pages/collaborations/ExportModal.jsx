import { useState } from 'react';
import { Download, FileText, Lock, Archive } from 'lucide-react';
import { getStoredToken } from '../../utils/api';
import Sheet from '../../components/ui/Sheet';
import Button from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';

const MODES = [
    { value: 'official', icon: FileText, title: 'Oficjalne (do PIT)', text: 'Umowy o dzieło, Use.me, umowa o pracę', tone: 'text-sky-700 bg-sky-50' },
    { value: 'full', icon: Archive, title: 'Pełny raport', text: 'Oficjalne + prywatne w dwóch sekcjach', tone: 'text-primary-700 bg-primary-50' },
    { value: 'private', icon: Lock, title: 'Tylko prywatne', text: 'Gotówka i nieformalne', tone: 'text-emerald-700 bg-emerald-50' },
];

export default function ExportModal({ isOpen, onClose }) {
    const toast = useToast();
    const [mode, setMode] = useState('official');
    const [loading, setLoading] = useState(false);

    const handleDownload = async () => {
        setLoading(true);
        try {
            const token = getStoredToken();
            const response = await fetch(`/api/collaborations/export.php?mode=${mode}&token=${token}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Błąd pobierania');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wspolprace_${new Date().getFullYear()}_${mode}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            toast.success('Plik CSV pobrany');
            onClose();
        } catch {
            toast.error('Nie udało się pobrać pliku. Spróbuj ponownie.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet
            open={isOpen}
            onClose={onClose}
            title="Eksport współprac"
            description="Plik CSV otworzysz w Excelu lub prześlesz księgowej."
            size="sm"
            footer={
                <Button variant="dark" block icon={Download} loading={loading} onClick={handleDownload}>
                    Pobierz .csv
                </Button>
            }
        >
            <div className="space-y-2 pt-1">
                {MODES.map((m) => {
                    const active = mode === m.value;
                    return (
                        <button
                            key={m.value}
                            type="button"
                            onClick={() => setMode(m.value)}
                            className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 text-left transition-colors ${
                                active ? 'border-ink bg-canvas' : 'border-line hover:border-line-strong'
                            }`}
                        >
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${m.tone}`}>
                                <m.icon size={18} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className="block font-bold text-ink text-sm">{m.title}</span>
                                <span className="block text-xs text-ink-muted">{m.text}</span>
                            </span>
                            <span className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center ${active ? 'border-ink' : 'border-line-strong'}`}>
                                {active && <span className="w-2 h-2 rounded-full bg-ink" />}
                            </span>
                        </button>
                    );
                })}
            </div>
        </Sheet>
    );
}
