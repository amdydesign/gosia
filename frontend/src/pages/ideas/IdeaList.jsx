import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Lightbulb, Check, Sparkles } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Segmented from '../../components/ui/Segmented';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { estimateSpeechSeconds, formatSeconds } from '../../utils/format';
import { isPlanned } from '../../services/agenda';
import ReelGenerator from '../../components/ideas/ReelGenerator';

const FILTERS = [
    { value: 'draft', label: 'Do nagrania' },
    { value: 'recorded', label: 'Nagrane' },
    { value: 'published', label: 'Wyniki' },
];
const TAB_KEY = 'gonia.ideasTab';

function readTab() {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return FILTERS.some((f) => f.value === v) ? v : 'draft';
    } catch {
        return 'draft';
    }
}

export default function IdeaList() {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilterState] = useState(readTab);
    const setFilter = (v) => {
        setFilterState(v);
        try {
            localStorage.setItem(TAB_KEY, v);
        } catch {
            // ignore
        }
    };
    const [query, setQuery] = useState('');
    const [aiEnabled, setAiEnabled] = useState(false);
    const [generatorOpen, setGeneratorOpen] = useState(false);

    useEffect(() => {
        ideasService.aiEnabled().then(setAiEnabled).catch(() => setAiEnabled(false));
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await ideasService.getAll(null, 'all');
                if (!cancelled) setIdeas(Array.isArray(data) ? data : []);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Błąd ładowania pomysłów');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const counts = useMemo(
        () => ({
            draft: ideas.filter((i) => i.status === 'draft').length,
            recorded: ideas.filter((i) => i.status === 'recorded').length,
            published: ideas.filter((i) => i.published_at).length,
        }),
        [ideas]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = ideas.filter((i) => {
            if (filter === 'published' ? !i.published_at : i.status !== filter) return false;
            if (q && !`${i.title} ${i.content || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
        // "Wyniki": what worked best first
        return filter === 'published' ? [...list].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)) : list;
    }, [ideas, filter, query]);

    const toggleStatus = async (idea) => {
        const next = idea.status === 'recorded' ? 'draft' : 'recorded';
        setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: next } : i)));
        try {
            await ideasService.update(null, idea.id, { status: next });
            refresh();
            if (next === 'recorded') {
                toast.success(`„${idea.title}” — nagrane 🎬`, {
                    duration: 5000,
                    action: { label: 'Cofnij', onClick: () => toggleStatus({ ...idea, status: 'recorded' }) },
                });
            }
        } catch (err) {
            setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: idea.status } : i)));
            toast.error(err.message || 'Nie udało się zmienić statusu');
        }
    };

    return (
        <div className="animate-fade-in">
            <PageHeader
                title="Pomysły na rolki"
                subtitle="Scenariusze, inspiracje i prompter"
                actions={
                    <>
                        {aiEnabled && (
                            <Button variant="secondary" icon={Sparkles} onClick={() => setGeneratorOpen(true)}>
                                Generuj rolki
                            </Button>
                        )}
                        <Button to="/ideas/new" variant="primary" icon={Plus} className="hidden lg:inline-flex">
                            Nowy pomysł
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col sm:flex-row gap-2.5">
                    <SearchInput value={query} onChange={setQuery} placeholder="Szukaj w tytułach i scenariuszach…" className="flex-1" />
                    <Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
                </div>
            </PageHeader>

            {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => <CardSkeleton key={i} className="h-44" />)}
                </div>
            ) : error ? (
                <EmptyState icon={Lightbulb} title="Nie udało się pobrać pomysłów" text={error} />
            ) : filtered.length === 0 ? (
                <div className="card">
                    <EmptyState
                        icon={Lightbulb}
                        title={ideas.length === 0 ? 'Brak pomysłów' : filter === 'draft' ? 'Wszystko nagrane!' : 'Nic nie pasuje'}
                        text={ideas.length === 0 ? 'Zapisz pierwszy scenariusz. Potem odpalisz go w prompterze.' : 'Zmień filtr lub dodaj nowy pomysł.'}
                        action={<Button to="/ideas/new" variant="primary" icon={Plus}>Dodaj pomysł</Button>}
                    />
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((idea) => {
                        const recorded = idea.status === 'recorded';
                        const planned = isPlanned(idea);
                        const seconds = estimateSpeechSeconds(idea.content);
                        const hasViews = idea.views !== null && idea.views !== undefined;
                        return (
                            <div key={idea.id} className="card flex items-center gap-3 pl-4 pr-3 py-3.5">
                                <Link to={`/ideas/${idea.id}`} className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-[15px] leading-snug line-clamp-2 text-ink">{idea.title}</h3>
                                    <p className="text-xs text-ink-muted mt-1 truncate">
                                        {planned && !recorded && <span className="font-semibold text-primary-700">na dziś · </span>}
                                        {seconds > 0 ? `~${formatSeconds(seconds)}` : 'bez scenariusza'}
                                        {recorded && !idea.published_at && ' · czeka na publikację'}
                                    </p>
                                </Link>
                                {/* one action per card: draft -> "Nagrane", recorded -> results */}
                                {!recorded ? (
                                    <button type="button" onClick={() => toggleStatus(idea)} className="btn btn-sm btn-dark shrink-0">
                                        <Check size={14} /> Nagrane
                                    </button>
                                ) : hasViews ? (
                                    <span className="shrink-0 text-sm font-bold text-emerald-700 tabular-nums">{Number(idea.views).toLocaleString('pl-PL')}</span>
                                ) : (
                                    <Link to={`/ideas/${idea.id}`} className="btn btn-sm btn-soft shrink-0">
                                        Wyniki
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <ReelGenerator
                open={generatorOpen}
                onClose={() => setGeneratorOpen(false)}
                onAdded={(idea) => {
                    setIdeas((prev) => [idea, ...prev]);
                    if (filter === 'recorded') setFilter('draft');
                }}
                onRemoved={(id) => setIdeas((prev) => prev.filter((i) => i.id !== id))}
            />
        </div>
    );
}
