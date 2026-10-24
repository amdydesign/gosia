import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { estimateSpeechSeconds, formatSeconds } from '../../utils/format';

const STORE_KEY = 'gonia.reelGenerator';

function load() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
        return { queue: Array.isArray(saved?.queue) ? saved.queue : [], seen: Array.isArray(saved?.seen) ? saved.seen : [] };
    } catch {
        return { queue: [], seen: [] };
    }
}

function save(state) {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
        // private mode - proposals just won't survive a reload
    }
}

/**
 * "Generator rolek": AI writes new ideas with scripts based on the recorded ones.
 * One proposal at a time - "Dodaj do pomysłów" or "Odrzuć". Unanswered proposals
 * stay until the tab is closed, so closing the sheet loses nothing.
 */
export default function ReelGenerator({ open, onClose, onAdded, onRemoved }) {
    const toast = useToast();
    const [{ queue, seen }, setState] = useState(load);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(0);

    const update = useCallback((next) => {
        setState((prev) => {
            const value = typeof next === 'function' ? next(prev) : next;
            save(value);
            return value;
        });
    }, []);

    const generate = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await ideasService.generate(seen);
            const ideas = data?.ideas || [];
            setDone(0);
            update((prev) => ({ queue: ideas, seen: [...prev.seen, ...ideas.map((i) => i.title)].slice(-50) }));
        } catch (err) {
            setError(err.message || 'Nie udało się wygenerować rolek');
        } finally {
            setLoading(false);
        }
    }, [seen, update]);

    // Opening with nothing waiting starts right away - the tap on "Generuj" was the decision
    useEffect(() => {
        if (open && queue.length === 0 && done === 0 && !loading && !error) generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const current = queue[0];
    const next = () => {
        setDone((d) => d + 1);
        update((prev) => ({ ...prev, queue: prev.queue.slice(1) }));
    };

    const add = async () => {
        const idea = current;
        next();
        try {
            const res = await ideasService.create(null, { title: idea.title, content: idea.content });
            const saved = { id: res.id, title: idea.title, content: idea.content, status: 'draft', planned_for: null, created_at: new Date().toISOString() };
            onAdded?.(saved);
            toast.success('Dodano do pomysłów', {
                duration: 5000,
                action: {
                    label: 'Cofnij',
                    onClick: async () => {
                        try {
                            await ideasService.delete(null, res.id);
                            onRemoved?.(res.id);
                        } catch (err) {
                            toast.error(err.message || 'Nie udało się cofnąć');
                        }
                    },
                },
            });
        } catch (err) {
            update((prev) => ({ ...prev, queue: [idea, ...prev.queue] }));
            setDone((d) => Math.max(0, d - 1));
            toast.error(err.message || 'Nie udało się zapisać');
        }
    };

    const reject = () => {
        const idea = current;
        next();
        toast.info('Odrzucone', {
            action: {
                label: 'Cofnij',
                onClick: () => {
                    update((prev) => ({ ...prev, queue: [idea, ...prev.queue] }));
                    setDone((d) => Math.max(0, d - 1));
                },
            },
        });
    };

    const total = queue.length + done;
    const seconds = current ? estimateSpeechSeconds(current.content) : 0;

    let body;
    let footer = null;
    if (loading) {
        body = (
            <div className="py-10 flex flex-col items-center text-center gap-3">
                <Loader2 size={28} className="animate-spin text-secondary" />
                <p className="font-semibold text-ink">Piszę nowe scenariusze…</p>
                <p className="text-sm text-ink-muted">Na bazie Twoich rolek. Zwykle do 30 sekund.</p>
            </div>
        );
    } else if (error) {
        body = (
            <div className="py-8 text-center space-y-4">
                <p className="text-sm text-red-700">{error}</p>
                <Button variant="primary" icon={RefreshCw} onClick={generate}>Spróbuj ponownie</Button>
            </div>
        );
    } else if (current) {
        body = (
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                    <span className="font-semibold">
                        Pomysł {done + 1} z {total}
                    </span>
                    {seconds > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold">
                            <Clock size={12} /> ~{formatSeconds(seconds)}
                        </span>
                    )}
                </div>
                <h3 className="text-lg font-bold leading-snug text-ink">{current.title}</h3>
                {current.based_on && <p className="text-xs text-ink-muted">Na bazie: {current.based_on}</p>}
                <div className="rounded-2xl bg-surface-2 border border-line p-4 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line max-h-[45dvh] overflow-y-auto">
                    {current.content}
                </div>
            </div>
        );
        footer = (
            <>
                <Button variant="ghost" icon={X} onClick={reject} className="flex-1">
                    Odrzuć
                </Button>
                <Button variant="primary" icon={Check} onClick={add} className="flex-[2]">
                    Dodaj do pomysłów
                </Button>
            </>
        );
    } else {
        body = (
            <div className="py-8 text-center space-y-4">
                <p className="font-semibold text-ink">{done > 0 ? 'To wszystkie propozycje.' : 'Brak propozycji.'}</p>
                <Button variant="primary" icon={Sparkles} onClick={generate}>
                    Generuj kolejne
                </Button>
            </div>
        );
    }

    return (
        <Sheet open={open} onClose={onClose} title="Generator rolek" description="Nowe pomysły ze scenariuszem, w Twoim stylu" size="lg" footer={footer}>
            {body}
        </Sheet>
    );
}
