import { useEffect, useState } from 'react';
import { Bell, Loader2, Send, Share, SquarePlus } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Switch from '../ui/Switch';
import { usePush } from '../../hooks/usePush';
import { useToast } from '../../context/ToastContext';
import { getPushPrefs, savePushPrefs, sendTestPush } from '../../services/push';

const CATEGORIES = [
    { key: 'summary', title: 'Rano: „Na dziś”', text: 'Jedno krótkie podsumowanie zamiast kilku powiadomień', time: 'summary_time' },
    { key: 'returns', title: 'Terminy zwrotów', text: 'Dzień przed i w ostatni dzień, w południe' },
    { key: 'payments', title: 'Zaległe płatności', text: 'Raz w tygodniu, w poniedziałek' },
    { key: 'ideas', title: 'Pomysły do nagrania', text: 'W poniedziałki i czwartki', time: 'ideas_time' },
];

/**
 * Notification settings. On iPhone push works only in the app added to the
 * home screen, so Safari users first get the three steps to install it.
 */
export default function NotificationsSheet({ open, onClose }) {
    const push = usePush();
    const toast = useToast();
    const [prefs, setPrefs] = useState(null);
    const [devices, setDevices] = useState(0);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (!open) return;
        getPushPrefs()
            .then((res) => {
                setPrefs(res?.prefs || null);
                setDevices(res?.devices || 0);
            })
            .catch(() => setPrefs(null));
    }, [open, push.status]);

    const update = async (patch) => {
        setPrefs((p) => ({ ...p, ...patch }));
        try {
            const res = await savePushPrefs(patch);
            if (res?.prefs) setPrefs(res.prefs);
        } catch {
            toast.error('Nie udało się zapisać ustawień');
        }
    };

    const handleToggle = async () => {
        const result = await push.toggle();
        if (result.ok) toast.success(result.status === 'subscribed' ? 'Powiadomienia włączone — przyjdzie powitanie' : 'Powiadomienia wyłączone na tym telefonie');
        else if (result.message) toast.error(result.message);
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const res = await sendTestPush();
            if (res?.delivered) toast.success(`Wysłane na ${res.delivered} ${res.delivered === 1 ? 'urządzenie' : 'urządzenia'}`);
            else toast.error('Żadne urządzenie nie odebrało — włącz powiadomienia na tym telefonie');
        } catch (err) {
            toast.error(err?.message || 'Nie udało się wysłać testu');
        } finally {
            setTesting(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Powiadomienia" size="sm">
            {push.needsInstall ? (
                <InstallSteps />
            ) : (
                <>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={push.status === 'subscribed'}
                        onClick={handleToggle}
                        disabled={push.busy || push.status === 'unsupported'}
                        className="card w-full flex items-center gap-3 p-4 text-left mb-2"
                    >
                        <span className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center">
                            {push.busy ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-ink">Na tym urządzeniu</span>
                            <span className="block text-xs text-ink-muted">
                                {push.status === 'subscribed'
                                    ? 'Włączone'
                                    : push.status === 'denied'
                                        ? 'Zablokowane — iPhone: Ustawienia → Powiadomienia → Gonia → Zezwalaj'
                                        : push.status === 'unsupported'
                                            ? 'Ta przeglądarka nie obsługuje powiadomień'
                                            : 'Wyłączone — stuknij, żeby włączyć'}
                            </span>
                        </span>
                        <Switch on={push.status === 'subscribed'} />
                    </button>
                    {devices > 0 && <p className="hint mb-4">Powiadomienia działają na {devices} {devices === 1 ? 'urządzeniu' : 'urządzeniach'}.</p>}
                </>
            )}

            {prefs && (
                <>
                    <div className="card divide-y divide-line overflow-hidden mt-3">
                        {CATEGORIES.map((c) => (
                            <div key={c.key} className="row">
                                <button type="button" role="switch" aria-checked={prefs[c.key]} onClick={() => update({ [c.key]: !prefs[c.key] })} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm font-semibold text-ink">{c.title}</span>
                                        <span className="block text-xs text-ink-muted">{c.text}</span>
                                    </span>
                                    <Switch on={prefs[c.key]} />
                                </button>
                                {c.time && prefs[c.key] && (
                                    <input
                                        type="time"
                                        step={900}
                                        value={prefs[c.time]}
                                        onChange={(e) => e.target.value && update({ [c.time]: e.target.value })}
                                        aria-label={`Godzina: ${c.title}`}
                                        className="input !w-[112px] !px-2 !py-2 text-center"
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4">
                        <div className="text-sm font-semibold text-ink">Cisza nocna</div>
                        <p className="text-xs text-ink-muted mb-2">W tych godzinach nic nie przyjdzie — przypomnienia poczekają do rana.</p>
                        <div className="flex items-center gap-2">
                            <input type="time" step={900} value={prefs.quiet_from} onChange={(e) => e.target.value && update({ quiet_from: e.target.value })} aria-label="Cisza od" className="input !w-[124px] text-center" />
                            <span className="text-ink-muted">do</span>
                            <input type="time" step={900} value={prefs.quiet_to} onChange={(e) => e.target.value && update({ quiet_to: e.target.value })} aria-label="Cisza do" className="input !w-[124px] text-center" />
                        </div>
                    </div>
                </>
            )}

            {!push.needsInstall && (
                <button type="button" onClick={handleTest} disabled={testing} className="btn btn-secondary btn-block mt-5">
                    {testing ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Wyślij powiadomienie testowe
                </button>
            )}
            <p className="hint text-center mt-3">Powiadomienia nie pokazują kwot — ekran blokady mogą zobaczyć inni.</p>
        </Sheet>
    );
}

function InstallSteps() {
    const steps = [
        { icon: Share, text: 'W Safari stuknij „Udostępnij” (kwadrat ze strzałką w górę) na dole ekranu.' },
        { icon: SquarePlus, text: 'Wybierz „Do ekranu początkowego” i potwierdź „Dodaj”.' },
        { icon: Bell, text: 'Otwórz Gonię z nowej ikony, wejdź tu ponownie i włącz powiadomienia.' },
    ];
    return (
        <div className="rounded-3xl bg-accent text-on-accent p-5">
            <div className="font-display text-lg font-semibold mb-1">Najpierw dodaj Gonię do ekranu głównego</div>
            <p className="text-sm opacity-80 mb-4">iPhone wysyła powiadomienia tylko aplikacjom z ekranu głównego.</p>
            <ol className="space-y-3">
                {steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-full bg-on-accent text-accent flex items-center justify-center shrink-0 text-sm font-bold">{i + 1}</span>
                        <span className="text-sm pt-1.5 flex-1">
                            <s.icon size={15} className="inline -mt-0.5 mr-1" />
                            {s.text}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
