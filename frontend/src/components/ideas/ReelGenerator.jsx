import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Clock, Loader2, PenLine, RefreshCw, X } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import { estimateSpeechSeconds, formatSeconds } from '../../utils/format';

const STORE_KEY = 'gonia.reelGenerator';
const EMPTY = { topics: [], seen: [], script: null };

function load() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
        return saved && Array.isArray(saved.topics) ? { ...EMPTY, ...saved } : EMPTY;
    } catch {
        return EMPTY;
    }
}

function save(state) {
    try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
        // private mode - the generator just starts fresh after a reload
    }
}

/**
 * "Generator rolek" in two steps: AI suggests 3 topics (or you type your own),
 * the picked topic gets a script, then "Dodaj do pomysłów" or "Odrzuć".
 * Topics and an unanswered script stay until the tab is closed, so closing the sheet loses nothing.
 */
export default function ReelGenerator({ open, onClose, onAdded, onRemoved }) {
    const toast = useToast();
    const [{ topics, seen, script }, setState] = useState(load);
    const [loadingTopics, setLoadingTopics] = useState(false);
    const [writing, setWriting] = useState(null); // topic being written
    const [error, setError] = useState('');
    const [own, setOwn] = useState('');

    const update = useCallback((patch) => {
        setState((prev) => {
            const value = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
            save(value);
            return value;
        });
    }, []);

    const loadTopics = useCallback(async () => {
        setLoadingTopics(true);
        setError('');
        try {
            const data = await ideasService.generateTopics(seen);
            const list = data?.topics || [];
            update((prev) => ({ topics: list, seen: [...prev.seen, ...list.map((t) => t.title)].slice(-50) }));
        } catch (err) {
            setError(err.message || 'Nie udało się wymyślić tematów');
        } finally {
            setLoadingTopics(false);
        }
    }, [seen, update]);

    // Opening with nothing waiting starts right away - the tap on "Generuj" was the decision
    useEffect(() => {
        if (open && topics.length === 0 && !script && !loadingTopics && !error) loadTopics();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const write = async (topic) => {
        setWriting(topic);
        setError('');
        try {
            const data = await ideasService.writeScript(topic.title, topic.pitch || '');
            update({ script: { ...data, topic } });
            setOwn('');
        } catch (err) {
            setError(err.message || 'Nie udało się napisać scenariusza');
        } finally {
            setWriting(null);
        }
    };

    const add = async () => {
        const current = script;
        // the used topic leaves the list; the rest stay to pick from
        update((prev) => ({ script: null, topics: prev.topics.filter((t) => t.title !== current.topic.title) }));
        try {
            const res = await ideasService.create(null, { title: current.title, content: current.content });
            onAdded?.({ id: res.id, title: current.title, content: current.content, status: 'draft', planned_for: null, created_at: new Date().toISOString() });
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
            update({ script: current });
            toast.error(err.message || 'Nie udało się zapisać');
        }
    };

    const reject = () => {
        const current = script;
        update({ script: null });
        toast.info('Odrzucone', { action: { label: 'Cofnij', onClick: () => update({ script: current }) } });
    };

    const submitOwn = (e) => {
        e.preventDefault();
        const title = own.trim();
        if (title && !writing) write({ title, pitch: '' });
    };

    // ---------- Step 2: the script ----------
    if (writing || script) {
        const seconds = script ? estimateSpeechSeconds(script.content) : 0;
        return (
            <Sheet
                open={open}
                onClose={onClose}
                title="Generator rolek"
                description={writing ? 'Piszę scenariusz…' : 'Scenariusz do promptera'}
                size="lg"
                footer={
                    script && (
                        <>
                            <Button variant="ghost" icon={X} onClick={reject} className="flex-1">
                                Odrzuć
                            </Button>
                            <Button variant="primary" icon={Check} onClick={add} className="flex-[2]">
                                Dodaj do pomysłów
                            </Button>
                        </>
                    )
                }
            >
                {writing ? (
                    <div className="py-10 flex flex-col items-center text-center gap-3">
                        <Loader2 size={28} className="animate-spin text-secondary" />
                        <p className="font-semibold text-ink">{writing.title}</p>
                        <p className="text-sm text-ink-muted">Piszę scenariusz w Twoim stylu. Zwykle do 20 sekund.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <button type="button" onClick={() => update({ script: null })} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink">
                                <ArrowLeft size={13} /> Tematy
                            </button>
                            {seconds > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
                                    <Clock size={12} /> ~{formatSeconds(seconds)}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-bold leading-snug text-ink">{script.title}</h3>
                        <div className="rounded-2xl bg-surface-2 border border-line p-4 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line max-h-[50dvh] overflow-y-auto">
                            {script.content}
                        </div>
                        <button
                            type="button"
                            onClick={() => write(script.topic)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
                        >
                            <RefreshCw size={12} /> Napisz inaczej
                        </button>
                    </div>
                )}
            </Sheet>
        );
    }

    // ---------- Step 1: pick a topic or type your own ----------
    return (
        <Sheet open={open} onClose={onClose} title="Generator rolek" description="Wybierz temat - napiszę scenariusz" size="lg">
            <div className="space-y-4">
                {error && <p className="text-sm text-red-700">{error}</p>}

                {loadingTopics ? (
                    <div className="py-8 flex flex-col items-center text-center gap-3">
                        <Loader2 size={26} className="animate-spin text-secondary" />
                        <p className="text-sm text-ink-muted">Wymyślam tematy na bazie Twoich rolek…</p>
                    </div>
                ) : (
                    topics.length > 0 && (
                        <div className="space-y-2">
                            {topics.map((t) => (
                                <button
                                    key={t.title}
                                    type="button"
                                    onClick={() => write(t)}
                                    className="w-full text-left rounded-2xl border border-line bg-surface-2 hover:border-secondary/50 p-3.5 flex items-center gap-3 transition-colors"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-bold text-[15px] leading-snug text-ink">{t.title}</span>
                                        {t.pitch && <span className="block text-sm text-ink-soft mt-0.5">{t.pitch}</span>}
                                    </span>
                                    <ChevronRight size={18} className="shrink-0 text-ink-muted" />
                                </button>
                            ))}
                        </div>
                    )
                )}

                {!loadingTopics && (
                    <button type="button" onClick={loadTopics} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
                        <RefreshCw size={14} /> {topics.length ? 'Inne tematy' : 'Wymyśl tematy'}
                    </button>
                )}

                <form onSubmit={submitOwn} className="pt-4 border-t border-line space-y-2">
                    <label htmlFor="reel-own-topic" className="block text-sm font-semibold text-ink">
                        Albo wpisz swój temat
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="reel-own-topic"
                            value={own}
                            onChange={(e) => setOwn(e.target.value)}
                            placeholder="np. jak nosić szary płaszcz"
                            className="input flex-1 min-w-0"
                            maxLength={300}
                        />
                        <Button type="submit" variant="primary" icon={PenLine} disabled={!own.trim()}>
                            Napisz
                        </Button>
                    </div>
                </form>
            </div>
        </Sheet>
    );
}
