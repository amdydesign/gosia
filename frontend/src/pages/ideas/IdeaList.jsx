import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Lightbulb, CheckCircle2, Circle, Clock, Play } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Segmented from '../../components/ui/Segmented';
import SearchInput from '../../components/ui/SearchInput';
import EmptyState from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { estimateSpeechSeconds, formatSeconds, formatDateShort } from '../../utils/format';

const FILTERS = [
    { value: 'draft', label: 'Do nagrania' },
    { value: 'recorded', label: 'Nagrane' },
    { value: 'all', label: 'Wszystkie' },
];

export default function IdeaList() {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('draft');
    const [query, setQuery] = useState('');

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
            all: ideas.length,
        }),
        [ideas]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return ideas.filter((i) => {
            if (filter !== 'all' && i.status !== filter) return false;
            if (q && !`${i.title} ${i.content || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [ideas, filter, query]);

    const toggleStatus = async (idea) => {
        const next = idea.status === 'recorded' ? 'draft' : 'recorded';
        setIdeas((prev) => prev.map((i) => (i.id === idea.id ? { ...i, status: next } : i)));
        try {
            await ideasService.update(null, idea.id, { status: next });
            refresh();
            if (next === 'recorded') toast.success(`„${idea.title}” — nagrane 🎬`);
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
                    <Button to="/ideas/new" variant="primary" icon={Plus} className="hidden lg:inline-flex">
                        Nowy pomysł
                    </Button>
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
                        const seconds = estimateSpeechSeconds(idea.content);
                        return (
                            <div key={idea.id} className={`card flex flex-col transition-all ${recorded ? 'opacity-70 hover:opacity-100' : 'hover:border-secondary/40 hover:shadow-md'}`}>
                                <Link to={`/ideas/${idea.id}`} className="card-pad flex-1 flex flex-col">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${recorded ? 'bg-stone-100 text-ink-muted' : 'bg-secondary-light text-secondary-dark'}`}>
                                            <Lightbulb size={18} />
                                        </span>
                                        {seconds > 0 && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
                                                <Clock size={11} /> ~{formatSeconds(seconds)}
                                            </span>
                                        )}
                                    </div>
                                    <h3 className={`font-bold text-[15px] leading-snug line-clamp-2 ${recorded ? 'text-ink-soft' : 'text-ink'}`}>{idea.title}</h3>
                                    <p className="text-sm text-ink-muted line-clamp-3 mt-1.5 flex-1">
                                        {idea.content || <span className="italic">Brak scenariusza…</span>}
                                    </p>
                                    <div className="text-[11px] text-ink-muted mt-3">{formatDateShort(idea.created_at?.slice(0, 10))}</div>
                                </Link>
                                <div className="flex items-center gap-2 px-3 pb-3">
                                    <button
                                        type="button"
                                        onClick={() => toggleStatus(idea)}
                                        className={`btn btn-sm flex-1 ${recorded ? 'btn-ghost' : 'btn-soft'}`}
                                    >
                                        {recorded ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Circle size={14} />}
                                        {recorded ? 'Nagrane' : 'Oznacz nagrane'}
                                    </button>
                                    {!recorded && idea.content && (
                                        <Link to={`/ideas/${idea.id}?prompter=1`} className="btn btn-sm btn-dark" title="Otwórz w prompterze">
                                            <Play size={13} fill="currentColor" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
