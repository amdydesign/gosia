import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Share } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { useToast } from '../../context/ToastContext';
import { getShareToken } from '../../services/inbox';

/**
 * "Udostępnij -> Gonia" on the iPhone. Safari web apps cannot be a share target,
 * so a Shortcut (Skróty) sends the screen to Gonia with a personal key.
 */
export default function ShareSheet({ open, onClose }) {
    const toast = useToast();
    const [info, setInfo] = useState(null);
    const [copied, setCopied] = useState('');
    const [renewing, setRenewing] = useState(false);

    useEffect(() => {
        if (!open) return;
        getShareToken()
            .then(setInfo)
            .catch((err) => toast.error(err.message || 'Nie udało się pobrać klucza'));
    }, [open, toast]);

    const copy = async (what, text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(what);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            toast.error('Nie udało się skopiować');
        }
    };

    const renew = async () => {
        setRenewing(true);
        try {
            setInfo(await getShareToken(true));
            toast.success('Nowy klucz — wklej go w skrócie (stary przestał działać)');
        } catch (err) {
            toast.error(err.message || 'Nie udało się');
        } finally {
            setRenewing(false);
        }
    };

    const CopyRow = ({ what, label, value }) => (
        <div className="rounded-2xl border border-line p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 min-w-0 text-xs text-ink break-all">{value}</code>
                <button
                    type="button"
                    onClick={() => copy(what, value)}
                    className="h-9 px-3 rounded-full border border-line-strong text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                >
                    {copied === what ? <Check size={14} /> : <Copy size={14} />} {copied === what ? 'Jest' : 'Kopiuj'}
                </button>
            </div>
        </div>
    );

    return (
        <Sheet open={open} onClose={onClose} title="Udostępnianie z iPhone’a" description="Screen z Instagrama, maila czy sklepu → Udostępnij → Gonia. AI samo rozpozna, co to." size="sm">
            {!info ? (
                <p className="text-sm text-ink-muted py-6 text-center">Ładowanie…</p>
            ) : (
                <div className="space-y-4">
                    <CopyRow what="url" label="Adres" value={info.url} />
                    <CopyRow what="token" label="Twój klucz" value={info.token} />

                    <div className="rounded-2xl bg-canvas border border-line p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-ink mb-2">
                            <Share size={16} /> Jednorazowo, ok. 3 minuty — w aplikacji Skróty
                        </div>
                        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-ink-soft">
                            <li>Nowy skrót (+), nazwij go <strong>Gonia</strong>.</li>
                            <li>
                                Ikona (i) na dole → włącz <strong>Pokaż w arkuszu udostępniania</strong>, przyjmuje: <strong>Obrazy</strong>.
                            </li>
                            <li>
                                Dodaj czynność <strong>Konwertuj obraz</strong> → na <strong>JPEG</strong> (zdjęcia z aparatu są w HEIC).
                            </li>
                            <li>
                                Dodaj <strong>Pobierz zawartość URL</strong>: adres z góry, metoda <strong>POST</strong>.
                            </li>
                            <li>
                                Nagłówki → dodaj <code className="text-xs">X-Gonia-Token</code> = Twój klucz.
                            </li>
                            <li>
                                Treść żądania: <strong>Formularz</strong> → pole <code className="text-xs">file</code>, typ <strong>Plik</strong> = przekonwertowany obraz.
                            </li>
                            <li>
                                Dodaj <strong>Pokaż powiadomienie</strong> z <strong>zawartością URL</strong> — zobaczysz, co Gonia zapisała.
                            </li>
                        </ol>
                        <p className="hint mt-2">
                            Potem: screen → Udostępnij → Gonia. Zadanie i pomysł zapiszą się same; zakup, współpraca i umowa czekają na Starcie jako „Ze screena”.
                        </p>
                    </div>

                    <Button variant="ghost" block icon={RefreshCw} loading={renewing} onClick={renew}>
                        Nowy klucz (np. po zgubieniu telefonu)
                    </Button>
                </div>
            )}
        </Sheet>
    );
}
