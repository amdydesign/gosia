import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, Copy, History, ImagePlus, Loader2, Mic, Plus, Sparkles, Square, Trash2, X, ExternalLink } from 'lucide-react';
import Sheet from '../components/ui/Sheet';
import Markdown from '../components/assistant/Markdown';
import { useToast } from '../context/ToastContext';
import { usePreferences } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { userName } from '../utils/format';
import { prepareImagesForAi, imagesFromDataTransfer } from '../utils/images';
import { apiRequest } from '../utils/api';
import { deleteChat, getChat, listChats, restoreChat, sendMessage } from '../services/assistant';

const CHAT_KEY = 'gonia.assistant.chat';
// .v2: only a model she picked herself is remembered (the old key held the former default, Opus)
const MODEL_KEY = 'gonia.assistant.model.v2';
const DRAFT_KEY = 'gonia.assistant.draft';
const MAX_IMAGES = 4;

// Dictation: the browser's own speech recognition (Safari on iPhone, Chrome); no button where it is missing
const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const SUGGESTIONS = [
    'Co mam dziś do zrobienia?',
    'Ile zarobiłam w tym miesiącu?',
    'Które marki jeszcze mi nie zapłaciły?',
    'Zrób research: trendy na tę zimę, ze źródłami',
];

function read(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        if (value === null || value === undefined || value === '') localStorage.removeItem(key);
        else localStorage.setItem(key, String(value));
    } catch {
        // private mode
    }
}

/** "0,04 zł" from dollars - small amounts keep two decimals, below a grosz says so */
function formatCost(usd, rate) {
    const pln = (Number(usd) || 0) * (rate || 3.7);
    if (pln > 0 && pln < 0.01) return '< 0,01 zł';
    return `${pln.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function nearBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
}

function scrollToBottom(smooth = false) {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function relativeDay(value) {
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((start(today) - start(date)) / 86400000);
    if (days === 0) return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'wczoraj';
    if (days < 7) return date.toLocaleDateString('pl-PL', { weekday: 'long' });
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

export default function Assistant() {
    const toast = useToast();
    const { amountsHidden } = usePreferences();
    const { user } = useAuth();

    const [enabled, setEnabled] = useState(true);
    const [models, setModels] = useState([]);
    const [model, setModelState] = useState(() => read(MODEL_KEY) || 'claude-sonnet-5-5');
    const [chats, setChats] = useState([]);
    const [chatId, setChatIdState] = useState(() => Number(read(CHAT_KEY)) || null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraftState] = useState(() => read(DRAFT_KEY) || '');
    const [images, setImages] = useState([]);
    const [preparing, setPreparing] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [status, setStatus] = useState('');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [modelOpen, setModelOpen] = useState(false);
    const [barHidden, setBarHidden] = useState(false);
    const [longChat, setLongChat] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef(null);
    const [usdPln, setUsdPln] = useState(3.7);
    const [monthCost, setMonthCost] = useState(0);

    const inputRef = useRef(null);
    const fileRef = useRef(null);
    const followRef = useRef(0);

    const setChatId = (id) => {
        setChatIdState(id);
        write(CHAT_KEY, id);
    };
    const setModel = (id) => {
        setModelState(id);
        write(MODEL_KEY, id);
    };
    const setDraft = (value) => {
        setDraftState(value);
        write(DRAFT_KEY, value);
    };

    const refreshChats = useCallback(async () => {
        const data = await listChats();
        setEnabled(!!data.enabled);
        setModels(data.models || []);
        setChats(data.chats || []);
        if (data.usd_pln) setUsdPln(data.usd_pln);
        setMonthCost(data.month_cost_usd || 0);
        return data;
    }, []);

    // A reply still being written on the server (the app was closed or lost the connection mid-answer):
    // wait for it and show what is already stored, instead of asking her to send the message again
    const follow = useCallback(async (id) => {
        const token = ++followRef.current;
        setStreaming(true);
        setStatus('Odpowiedź kończy się w tle…');
        for (let i = 0; i < 230 && followRef.current === token; i++) {
            let busy = true;
            try {
                const chat = await getChat(id);
                if (followRef.current !== token) return;
                busy = !!chat.busy;
                const stored = chat.messages || [];
                setMessages(busy ? [...stored, { id: 'waiting', role: 'assistant', text: '', sources: [], pending: true }] : stored);
                setLongChat(!!chat.long_chat);
            } catch {
                // offline for a moment - try again
            }
            if (!busy) break;
            await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        if (followRef.current !== token) return;
        setStreaming(false);
        setStatus('');
        refreshChats().catch(() => {});
    }, [refreshChats]);

    useEffect(() => () => {
        followRef.current = -1;
    }, []);

    // First load: chats + models, then the chat she left open
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await refreshChats();
                if (cancelled) return;
                const known = (data.models || []).some((m) => m.id === read(MODEL_KEY));
                if (!known && data.default_model) setModelState(data.default_model);
                const open = Number(read(CHAT_KEY)) || null;
                if (open) {
                    try {
                        const chat = await getChat(open);
                        if (!cancelled) {
                            setMessages(chat.messages || []);
                            setLongChat(!!chat.long_chat);
                            if (chat.busy) follow(open);
                        }
                    } catch {
                        if (!cancelled) setChatId(null);
                    }
                }
            } catch (err) {
                if (!cancelled) toast.error(err.message || 'Nie udało się wczytać asystenta');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
        if (!loading && messages.length) scrollToBottom();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // The model / history row slides away while scrolling down and comes back on the first move up
    useEffect(() => {
        let last = window.scrollY;
        const onScroll = () => {
            const y = window.scrollY;
            if (y < 40) setBarHidden(false);
            else if (y > last + 6) setBarHidden(true);
            else if (y < last - 4) setBarHidden(false);
            if (Math.abs(y - last) > 4) last = y;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Grow the text box with what she writes (up to a few lines)
    useLayoutEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, [draft]);

    const openChat = async (id) => {
        setHistoryOpen(false);
        if (streaming || id === chatId) return;
        try {
            const chat = await getChat(id);
            setChatId(id);
            setMessages(chat.messages || []);
            setLongChat(!!chat.long_chat);
            if (chat.busy) follow(id);
            requestAnimationFrame(() => scrollToBottom());
        } catch (err) {
            toast.error(err.message || 'Nie udało się otworzyć rozmowy');
            refreshChats().catch(() => {});
        }
    };

    const newChat = () => {
        if (streaming) return;
        setHistoryOpen(false);
        setChatId(null);
        setMessages([]);
        setLongChat(false);
        inputRef.current?.focus();
    };

    const removeChat = async (id) => {
        try {
            await deleteChat(id);
            setChats((prev) => prev.filter((c) => c.id !== id));
            if (id === chatId) {
                setChatId(null);
                setMessages([]);
                setLongChat(false);
            }
            toast.success('Rozmowa usunięta', {
                duration: 6000,
                action: {
                    label: 'Cofnij',
                    onClick: async () => {
                        await restoreChat(id).catch(() => {});
                        refreshChats().catch(() => {});
                    },
                },
            });
        } catch (err) {
            toast.error(err.message || 'Nie udało się usunąć rozmowy');
        }
    };

    const addFiles = async (files) => {
        const list = Array.from(files || []).filter((f) => f.type?.startsWith('image/'));
        if (!list.length) return;
        setPreparing(true);
        try {
            const prepared = await prepareImagesForAi(list);
            setImages((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
        } catch (err) {
            toast.error(err.message || 'Nie udało się dodać zdjęcia');
        } finally {
            setPreparing(false);
        }
    };

    const stopDictation = () => {
        recognitionRef.current?.stop();
    };

    // Tap to talk, tap again to stop - words appear in the box as they are recognised
    const toggleDictation = () => {
        if (listening) {
            stopDictation();
            return;
        }
        if (!SpeechRecognition) return;
        const recognition = new SpeechRecognition();
        recognition.lang = 'pl-PL';
        recognition.continuous = true;
        recognition.interimResults = true;
        const base = draft.trim() ? `${draft.trim()} ` : '';
        recognition.onresult = (e) => {
            let text = '';
            for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
            setDraft(base + text.replace(/^\s+/, ''));
        };
        recognition.onerror = (e) => {
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                toast.error('Zezwól na mikrofon w ustawieniach przeglądarki albo użyj mikrofonu na klawiaturze.');
            } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
                toast.error('Dyktowanie się przerwało. Spróbuj jeszcze raz.');
            }
        };
        recognition.onend = () => {
            setListening(false);
            recognitionRef.current = null;
            inputRef.current?.focus();
        };
        try {
            recognition.start();
            recognitionRef.current = recognition;
            setListening(true);
        } catch {
            toast.error('Nie udało się włączyć mikrofonu.');
        }
    };

    useEffect(() => () => recognitionRef.current?.abort(), []);

    const send = async (textArg) => {
        const text = (textArg ?? draft).trim();
        if ((!text && !images.length) || streaming || preparing) return;
        if (listening) stopDictation();

        const sentImages = images;
        const userBubble = { id: `u${Date.now()}`, role: 'user', text, images: sentImages.length, previews: sentImages };
        const replyId = `a${Date.now()}`;
        setMessages((prev) => [...prev, userBubble, { id: replyId, role: 'assistant', text: '', sources: [], pending: true }]);
        setDraft('');
        setImages([]);
        setStreaming(true);
        setStatus('Myślę…');
        requestAnimationFrame(() => scrollToBottom(true));

        const update = (fn) => setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)));
        let failed = null;
        let savedPart = false;
        let dropped = false;
        let accepted = null; // chat id once the server has stored her message

        try {
            await sendMessage({
                chatId,
                model,
                message: text,
                images: sentImages,
                onEvent: (name, data) => {
                    const stick = nearBottom();
                    if (name === 'chat') {
                        accepted = data.chat_id;
                        setChatId(data.chat_id);
                    } else if (name === 'dropped') {
                        dropped = true;
                    } else if (name === 'text') {
                        update((m) => ({ ...m, text: m.text + data.text }));
                        setStatus('');
                    } else if (name === 'status' || name === 'tool') {
                        setStatus(data.text || 'Myślę…');
                    } else if (name === 'source') {
                        update((m) => (m.sources.some((s) => s.url === data.url) ? m : { ...m, sources: [...m.sources, data] }));
                    } else if (name === 'task') {
                        toast.success(`Dodano zadanie: ${data.title}`, {
                            duration: 7000,
                            action: { label: 'Cofnij', onClick: () => apiRequest(`/tasks/delete.php?id=${data.id}`, 'DELETE').catch(() => {}) },
                        });
                    } else if (name === 'idea') {
                        toast.success(`Dodano do Pomysłów: ${data.title}`, {
                            duration: 7000,
                            action: { label: 'Cofnij', onClick: () => apiRequest(`/ideas/delete.php?id=${data.id}`, 'DELETE').catch(() => {}) },
                        });
                    } else if (name === 'style_note') {
                        toast.success(`Zapamiętane: ${data.note}`, {
                            duration: 7000,
                            action: { label: 'Cofnij', onClick: () => apiRequest('/assistant/style.php', 'POST', { remove: data.note }).catch(() => {}) },
                        });
                    } else if (name === 'idea_updated') {
                        toast.success(`Zmieniono pomysł: ${data.title}`, {
                            duration: 8000,
                            action: {
                                label: 'Cofnij',
                                onClick: () => apiRequest(`/ideas/update.php?id=${data.id}`, 'PUT', data.previous).catch(() => {}),
                            },
                        });
                    } else if (name === 'done') {
                        update((m) => ({ ...m, pending: false, model: data.model, modelLabel: data.model_label, cost_usd: data.cost_usd }));
                        if (data.usd_pln) setUsdPln(data.usd_pln);
                        setLongChat(!!data.long_chat);
                        if (data.chat_id) setChatId(data.chat_id);
                        refreshChats().catch(() => {});
                    } else if (name === 'error') {
                        failed = data.message || 'Coś poszło nie tak';
                        savedPart = !!data.saved;
                    }
                    if (stick && name === 'text') requestAnimationFrame(() => scrollToBottom());
                },
            });
        } catch (err) {
            failed = err.message || 'Asystent nie odpowiedział';
        }

        if (dropped && accepted) {
            // her message is stored and the reply is still being written - wait for it, never send twice
            follow(accepted);
            return;
        }
        setStreaming(false);
        setStatus('');
        if (failed && savedPart && accepted) {
            // part of the reply (and what it already did) is stored - show the chat as it is
            toast.error(failed, { duration: 7000 });
            getChat(accepted)
                .then((chat) => setMessages(chat.messages || []))
                .catch(() => {});
            refreshChats().catch(() => {});
            return;
        }
        if (dropped) failed = 'Połączenie się urwało. Spróbuj jeszcze raz.';
        if (failed) {
            if (accepted && accepted !== chatId) setChatId(chatId);
            // nothing was saved: take the message back to the box so one tap sends it again
            setMessages((prev) => prev.filter((m) => m.id !== replyId && m.id !== userBubble.id));
            setDraft(text);
            setImages(sentImages);
            toast.error(failed, { duration: 7000 });
        }
    };

    const onKeyDown = (e) => {
        const finePointer = window.matchMedia?.('(pointer: fine)').matches;
        if (e.key === 'Enter' && !e.shiftKey && finePointer && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
        }
    };

    const onPaste = (e) => {
        const files = imagesFromDataTransfer(e.clipboardData);
        if (files.length) {
            e.preventDefault();
            addFiles(files);
        }
    };

    const copy = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Skopiowano');
        } catch {
            toast.error('Nie udało się skopiować');
        }
    };

    const currentModel = models.find((m) => m.id === model);
    const rawName = userName(user);
    const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : '';

    if (!loading && !enabled) {
        return (
            <div className="max-w-xl mx-auto pt-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
                    <Sparkles size={22} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-ink">Asystent jest wyłączony</h2>
                <p className="mt-1 text-sm text-ink-soft">Dodaj klucz Claude w Ustawieniach → Czytanie screenów.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            {/* Model + history + new chat - one quiet row, stays under the top bar while the chat scrolls */}
            <div className={`sticky z-20 top-[calc(env(safe-area-inset-top,0px)+4rem)] lg:top-[calc(env(safe-area-inset-top,0px)+76px)] -mx-4 px-4 sm:-mx-6 sm:px-6 py-2 -mt-2 mb-1 bg-canvas/90 backdrop-blur-md flex items-center gap-2 transition-[transform,opacity] duration-200 ${
                    barHidden ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
                }`}>
                <button
                    type="button"
                    onClick={() => setModelOpen(true)}
                    className="h-9 pl-3 pr-2 rounded-full border border-line bg-surface text-sm font-medium text-ink inline-flex items-center gap-1.5 hover:border-line-strong"
                    aria-label="Zmień model"
                >
                    <Sparkles size={14} className="text-primary-600" />
                    {currentModel?.label || 'Model'}
                    <ChevronDown size={15} className="text-ink-muted" />
                </button>
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="h-9 px-3 rounded-full text-sm font-medium text-ink-soft hover:text-ink hover:bg-ink/5 inline-flex items-center gap-1.5"
                    aria-label="Poprzednie rozmowy"
                    title="Poprzednie rozmowy"
                >
                    <History size={16} /> Historia
                </button>
                <button
                    type="button"
                    onClick={newChat}
                    disabled={streaming}
                    className="h-9 px-3 rounded-full text-sm font-medium text-ink hover:bg-ink/5 inline-flex items-center gap-1 disabled:opacity-40"
                >
                    <Plus size={16} /> Nowa
                </button>
            </div>

            {loading ? (
                <div className="py-16 flex justify-center text-ink-muted">
                    <Loader2 size={22} className="animate-spin" />
                </div>
            ) : messages.length === 0 ? (
                <div className="pt-8 pb-6">
                    <h2 className="text-xl font-semibold tracking-tight text-ink">{name ? `Cześć ${name}!` : 'Cześć!'} W czym pomóc?</h2>
                    <p className="mt-1 text-sm text-ink-soft">Znam Twoje współprace, zakupy, pomysły i umowy. Szukam też w internecie i podaję źródła, piszę maile do marek i zapisuję zadania.</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => send(s)}
                                className="px-3.5 py-2 rounded-full border border-line bg-surface text-sm text-ink hover:border-line-strong active:scale-[0.98] transition"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-5 pb-4">
                    {messages.map((m) =>
                        m.role === 'user' ? (
                            <div key={m.id} className="flex justify-end">
                                <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-ink text-canvas px-4 py-2.5">
                                    {m.previews?.length > 0 && (
                                        <div className="flex gap-1.5 mb-2 flex-wrap justify-end">
                                            {m.previews.map((img, i) => (
                                                <img key={i} src={`data:${img.media_type};base64,${img.data}`} alt="" className="h-16 w-16 rounded-xl object-cover" />
                                            ))}
                                        </div>
                                    )}
                                    {!m.previews?.length && m.images > 0 && (
                                        <p className="text-xs opacity-70 mb-1">📷 {m.images === 1 ? 'zdjęcie' : `${m.images} zdjęcia`}</p>
                                    )}
                                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                                </div>
                            </div>
                        ) : (
                            <div key={m.id} className="text-ink">
                                {m.text ? (
                                    <Markdown text={m.text} hideAmounts={amountsHidden} />
                                ) : null}
                                {m.pending && status && (
                                    <p className={`flex items-center gap-2 text-sm text-ink-muted ${m.text ? 'mt-2' : ''}`}>
                                        <Loader2 size={15} className="animate-spin" /> {status}
                                    </p>
                                )}
                                {m.sources?.length > 0 && (
                                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-medium text-ink-muted mr-0.5">Źródła:</span>
                                        {m.sources.map((s) => (
                                            <a
                                                key={s.url}
                                                href={s.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="max-w-[16rem] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-2 border border-line text-xs text-ink-soft hover:text-ink"
                                            >
                                                <ExternalLink size={11} className="shrink-0" />
                                                <span className="truncate">{s.title}</span>
                                            </a>
                                        ))}
                                    </div>
                                )}
                                {!m.pending && m.text && (
                                    <div className="mt-1.5 flex items-center gap-1 text-ink-muted">
                                        <button
                                            type="button"
                                            onClick={() => copy(m.text)}
                                            className="h-8 w-8 -ml-1.5 rounded-full inline-flex items-center justify-center hover:bg-ink/5 hover:text-ink"
                                            aria-label="Kopiuj"
                                            title="Kopiuj"
                                        >
                                            <Copy size={15} />
                                        </button>
                                        {(m.modelLabel || m.model) && (
                                            <span className="text-[11px]">{m.modelLabel || models.find((x) => x.id === m.model)?.label || m.model}</span>
                                        )}
                                        {m.cost_usd > 0 && (
                                            <span className="text-[11px]">
                                                · <span className="amount">{formatCost(m.cost_usd, usdPln)}</span>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            )}

            {longChat && !streaming && messages.length > 0 && (
                <div className="mt-2 rounded-2xl border border-amber-300/60 bg-amber-50 text-amber-900 px-4 py-3 flex items-center gap-3">
                    <p className="flex-1 text-sm">
                        <strong>Długa rozmowa</strong> — każda odpowiedź jest tu droższa. Nowy temat zacznij w nowej.
                    </p>
                    <button type="button" onClick={newChat} className="shrink-0 h-9 px-3 rounded-full bg-ink text-canvas text-sm font-medium inline-flex items-center gap-1">
                        <Plus size={15} /> Nowa
                    </button>
                </div>
            )}

            {/* room for the composer */}
            <div className="h-28 lg:h-32" />

            {/* Composer: above the phone's tab bar, at the bottom on the desktop */}
            <div
                className="fixed inset-x-0 z-30 px-3 lg:px-10 bottom-[calc(env(safe-area-inset-bottom,0px)+86px)] lg:bottom-6"
            >
                <div className="mx-auto max-w-3xl rounded-[26px] border border-line-strong bg-surface shadow-float p-2">
                    {(images.length > 0 || preparing) && (
                        <div className="flex gap-2 px-1 pt-1 pb-2">
                            {images.map((img, i) => (
                                <div key={i} className="relative">
                                    <img src={`data:${img.media_type};base64,${img.data}`} alt="" className="h-14 w-14 rounded-xl object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-ink text-canvas inline-flex items-center justify-center"
                                        aria-label="Usuń zdjęcie"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {preparing && (
                                <div className="h-14 w-14 rounded-xl bg-surface-2 inline-flex items-center justify-center text-ink-muted">
                                    <Loader2 size={18} className="animate-spin" />
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex items-end gap-1.5">
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={images.length >= MAX_IMAGES || streaming}
                            className="h-10 w-10 shrink-0 rounded-full text-ink-muted hover:text-ink hover:bg-ink/5 inline-flex items-center justify-center disabled:opacity-40"
                            aria-label="Dodaj zdjęcie"
                            title="Dodaj zdjęcie lub screen"
                        >
                            <ImagePlus size={20} />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                addFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <textarea
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={onKeyDown}
                            onPaste={onPaste}
                            rows={1}
                            placeholder={listening ? 'Słucham… mów śmiało' : 'Napisz albo podyktuj…'}
                            className="flex-1 min-w-0 resize-none bg-transparent px-1 py-2.5 text-[16px] leading-snug text-ink placeholder:text-ink-muted focus:outline-none"
                        />
                        {SpeechRecognition && (
                            <button
                                type="button"
                                onClick={toggleDictation}
                                disabled={streaming}
                                className={`h-10 w-10 shrink-0 rounded-full inline-flex items-center justify-center transition disabled:opacity-40 ${
                                    listening ? 'bg-red-600 text-white animate-pulse' : 'text-ink-muted hover:text-ink hover:bg-ink/5'
                                }`}
                                aria-label={listening ? 'Zatrzymaj dyktowanie' : 'Dyktuj'}
                                aria-pressed={listening}
                                title={listening ? 'Zatrzymaj dyktowanie' : 'Dyktuj głosem'}
                            >
                                {listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => send()}
                            disabled={streaming || preparing || (!draft.trim() && !images.length)}
                            className="h-10 w-10 shrink-0 rounded-full bg-accent text-on-accent inline-flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
                            aria-label="Wyślij"
                        >
                            {streaming ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={20} strokeWidth={2.5} />}
                        </button>
                    </div>
                </div>
            </div>

            <Sheet open={modelOpen} onClose={() => setModelOpen(false)} title="Model" description="Zmiana działa od następnej wiadomości.">
                <div className="space-y-2">
                    {models.map((m) => {
                        const active = m.id === model;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                    setModel(m.id);
                                    setModelOpen(false);
                                }}
                                className={`w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
                                    active ? 'border-ink bg-surface-2' : 'border-line hover:border-line-strong'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-ink">{m.label}</p>
                                    <p className="text-sm text-ink-soft">{m.hint}</p>
                                </div>
                                {active && <Check size={18} className="text-primary-600 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            </Sheet>

            <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Historia rozmów" description="Wybierz, żeby pisać dalej w starym wątku.">
                <p className="text-sm text-ink-soft -mt-1 mb-3">
                    Asystent w tym miesiącu: <strong className="amount text-ink">{formatCost(monthCost, usdPln)}</strong>
                </p>
                {chats.length === 0 ? (
                    <p className="text-sm text-ink-soft py-4">Jeszcze nie ma zapisanych rozmów.</p>
                ) : (
                    <ul className="-mx-2">
                        {chats.map((c) => (
                            <li key={c.id} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => openChat(c.id)}
                                    className={`flex-1 min-w-0 text-left rounded-xl px-3 py-2.5 hover:bg-ink/5 ${c.id === chatId ? 'bg-ink/5' : ''}`}
                                >
                                    <p className="text-sm font-medium text-ink truncate">{c.title || 'Rozmowa'}</p>
                                    <p className="text-xs text-ink-muted">
                                        {relativeDay(c.updated_at)}
                                        {c.cost_usd > 0 && (
                                            <>
                                                {' · '}
                                                <span className="amount">{formatCost(c.cost_usd, usdPln)}</span>
                                            </>
                                        )}
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeChat(c.id)}
                                    className="h-9 w-9 shrink-0 rounded-full text-ink-muted hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"
                                    aria-label="Usuń rozmowę"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </Sheet>
        </div>
    );
}
