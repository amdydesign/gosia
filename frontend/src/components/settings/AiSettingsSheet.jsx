import { useEffect, useState } from 'react';
import { Check, ClipboardPaste, ExternalLink, Eye, EyeOff, Loader2, Sparkles, Trash2 } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import ChoiceChips from '../ui/ChoiceChips';
import { apiRequest } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';

const PROVIDERS = {
    claude: {
        label: 'Claude',
        company: 'Anthropic',
        url: 'https://console.anthropic.com/settings/keys',
        steps: 'Zaloguj się na console.anthropic.com → API Keys → Create Key, skopiuj klucz (zaczyna się od „sk-ant-”).',
    },
    gemini: {
        label: 'Gemini',
        company: 'Google',
        url: 'https://aistudio.google.com/apikey',
        steps: 'Zaloguj się kontem Google na aistudio.google.com → Get API key → Create API key, skopiuj klucz.',
    },
};

/**
 * Enter / change the AI key used to read screenshots. The key is checked with
 * the provider before saving and never shown again (only a masked hint).
 */
export default function AiSettingsSheet({ onClose }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [info, setInfo] = useState(null);
    const [provider, setProvider] = useState('claude');
    const [key, setKey] = useState('');
    const [show, setShow] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        apiRequest('/settings/ai.php')
            .then((data) => {
                if (cancelled) return;
                setInfo(data);
                setProvider(data.provider || (data.gemini?.set && !data.claude?.set ? 'gemini' : 'claude'));
            })
            .catch((err) => !cancelled && setError(err.message || 'Nie udało się wczytać ustawień'));
        return () => {
            cancelled = true;
        };
    }, []);

    const current = info?.[provider];
    const meta = PROVIDERS[provider];
    const canSave = key.trim().length > 0 || (current?.set && info?.provider !== provider);

    const paste = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text?.trim()) setKey(text.trim());
        } catch {
            toast.info('Przytrzymaj pole i wybierz „Wklej”.');
        }
    };

    const save = async () => {
        setSaving(true);
        setError('');
        try {
            const data = await apiRequest('/settings/ai.php', 'POST', key.trim() ? { provider, key: key.trim() } : { provider });
            setInfo(data);
            setKey('');
            refresh();
            if (key.trim()) {
                toast.success(data.verified === null ? 'Klucz zapisany (nie udało się go teraz sprawdzić)' : `Klucz ${meta.label} działa — możesz wrzucać screeny`);
            } else {
                toast.success(`Używam ${meta.label}`);
            }
            onClose();
        } catch (err) {
            setError(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setSaving(true);
        try {
            const data = await apiRequest('/settings/ai.php', 'POST', { remove: provider });
            setInfo(data);
            refresh();
            toast.info(`Klucz ${meta.label} usunięty`);
        } catch (err) {
            setError(err.message || 'Nie udało się usunąć');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open
            onClose={onClose}
            title="Czytanie screenów (AI)"
            description="Z kluczem wystarczy wrzucić screena zamówienia, a aplikacja sama uzupełni sklep, rzeczy i ceny."
            size="md"
            footer={
                <Button variant="primary" size="lg" block icon={Check} loading={saving} disabled={!info || !canSave} onClick={save}>
                    {key.trim() ? 'Sprawdź i zapisz' : 'Zapisz'}
                </Button>
            }
        >
            {!info ? (
                <div className="py-12 flex justify-center text-ink-muted">{error ? <p className="text-sm">{error}</p> : <Loader2 className="animate-spin" />}</div>
            ) : (
                <div className="space-y-5 pt-1">
                    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${info.enabled ? 'bg-emerald-50 border-emerald-100' : 'bg-canvas border-line'}`}>
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${info.enabled ? 'bg-surface text-emerald-600' : 'bg-surface text-ink-muted'}`}>
                            <Sparkles size={18} />
                        </span>
                        <span className="text-sm">
                            <span className="block font-bold text-ink">{info.enabled ? 'Włączone' : 'Wyłączone'}</span>
                            <span className="block text-xs text-ink-muted">
                                {info.enabled ? `Screeny czyta ${PROVIDERS[info.provider]?.label}` : 'Wklej klucz poniżej, żeby włączyć'}
                            </span>
                        </span>
                    </div>

                    <div>
                        <div className="section-label mb-2">Dostawca</div>
                        <ChoiceChips
                            options={Object.entries(PROVIDERS).map(([value, p]) => ({ value, label: `${p.label} (${p.company})` }))}
                            value={provider}
                            onChange={(v) => {
                                setProvider(v);
                                setKey('');
                                setError('');
                            }}
                        />
                    </div>

                    {current?.set && (
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas border border-line px-3.5 py-2.5">
                            <span className="text-sm min-w-0">
                                <span className="block text-ink-muted text-xs">Zapisany klucz</span>
                                <span className="block font-mono font-semibold text-ink truncate">{current.hint}</span>
                            </span>
                            {current.source === 'app' ? (
                                <button type="button" onClick={remove} disabled={saving} className="shrink-0 p-2 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50" aria-label="Usuń klucz">
                                    <Trash2 size={17} />
                                </button>
                            ) : (
                                <span className="shrink-0 text-[11px] font-semibold text-ink-muted">z pliku .env</span>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="label" htmlFor="ai-key">{current?.set ? 'Nowy klucz (opcjonalnie)' : `Klucz API ${meta.label}`}</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1 min-w-0">
                                <input
                                    id="ai-key"
                                    type={show ? 'text' : 'password'}
                                    className="input !pr-10 font-mono"
                                    value={key}
                                    onChange={(e) => setKey(e.target.value)}
                                    placeholder={provider === 'claude' ? 'sk-ant-…' : 'AIza…'}
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-ink" aria-label={show ? 'Ukryj klucz' : 'Pokaż klucz'}>
                                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <Button variant="secondary" icon={ClipboardPaste} onClick={paste} aria-label="Wklej klucz">
                                <span className="hidden sm:inline">Wklej</span>
                            </Button>
                        </div>
                        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                    </div>

                    <div className="rounded-xl border border-line px-3.5 py-3 text-xs text-ink-soft leading-relaxed">
                        <span className="font-semibold text-ink">Skąd wziąć klucz?</span> {meta.steps}{' '}
                        <a href={meta.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary-700">
                            Otwórz stronę <ExternalLink size={12} />
                        </a>
                        <span className="block mt-1.5 text-ink-muted">Klucz zapisuje się na serwerze w formie zaszyfrowanej i nie jest już potem pokazywany.</span>
                    </div>
                </div>
            )}
        </Sheet>
    );
}
