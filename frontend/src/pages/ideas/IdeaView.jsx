import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Edit2, Play, CheckCircle2, Trash2, Lightbulb, Clock, Type, Undo2, Copy } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useDashboard } from '../../context/DashboardContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import Prompter from './Prompter';
import { countWords, estimateSpeechSeconds, formatSeconds, formatDateLong } from '../../utils/format';

export default function IdeaView() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const confirm = useConfirm();
    const { refresh } = useDashboard();

    const [idea, setIdea] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const prompterOpen = searchParams.get('prompter') === '1';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await ideasService.getOne(null, id);
                if (!cancelled) setIdea(data);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Nie udało się pobrać pomysłu');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const setPrompter = (open) => {
        const next = new URLSearchParams(searchParams);
        if (open) next.set('prompter', '1');
        else next.delete('prompter');
        setSearchParams(next, { replace: !open });
    };

    const toggleRecorded = async () => {
        const next = idea.status === 'recorded' ? 'draft' : 'recorded';
        setBusy(true);
        try {
            await ideasService.update(null, id, { status: next });
            setIdea({ ...idea, status: next });
            refresh();
            if (next === 'recorded') toast.success('Oznaczono jako nagrane 🎬');
        } catch (err) {
            toast.error(err.message || 'Błąd zapisu');
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!(await confirm({ title: 'Usunąć pomysł?', message: idea.title, confirmLabel: 'Usuń', danger: true }))) return;
        try {
            await ideasService.delete(null, id);
            toast.success('Pomysł usunięty');
            refresh();
            navigate('/ideas', { replace: true });
        } catch (err) {
            toast.error(err.message || 'Błąd usuwania');
        }
    };

    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(`${idea.title}\n\n${idea.content || ''}`);
            toast.success('Skopiowano do schowka');
        } catch {
            toast.error('Nie udało się skopiować');
        }
    };

    if (loading) return <PageSkeleton />;
    if (error || !idea) return <EmptyState icon={Lightbulb} title="Nie znaleziono pomysłu" text={error} action={<Button to="/ideas">Wróć do listy</Button>} />;

    const recorded = idea.status === 'recorded';
    const seconds = estimateSpeechSeconds(idea.content);

    if (prompterOpen) {
        return <Prompter title={idea.title} content={idea.content} onClose={() => setPrompter(false)} />;
    }

    return (
        <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={recorded ? 'success' : 'plum'} icon={recorded ? CheckCircle2 : Lightbulb}>{recorded ? 'Nagrane' : 'Do nagrania'}</Badge>
                {seconds > 0 && <Badge tone="neutral" icon={Clock}>~{formatSeconds(seconds)}</Badge>}
                <Badge tone="neutral" icon={Type}>{countWords(idea.content)} słów</Badge>
                <span className="text-xs text-ink-muted ml-auto">{formatDateLong(idea.created_at?.slice(0, 10))}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{idea.title}</h1>

            <Card className="!p-6 sm:!p-8">
                {idea.content ? (
                    <p className="text-[17px] leading-[1.7] text-ink-soft whitespace-pre-wrap">{idea.content}</p>
                ) : (
                    <p className="text-ink-muted italic">Brak treści scenariusza. Kliknij „Edytuj”, aby dodać tekst.</p>
                )}
            </Card>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:static -mx-4 sm:mx-0 px-4 sm:px-0 py-3 lg:py-0 bg-canvas/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-line lg:border-0">
                <div className="flex gap-2">
                    <Button variant="dark" size="lg" icon={Play} onClick={() => setPrompter(true)} className="flex-[2]" disabled={!idea.content}>
                        Prompter
                    </Button>
                    <Button variant={recorded ? 'secondary' : 'success'} size="lg" icon={recorded ? Undo2 : CheckCircle2} onClick={toggleRecorded} loading={busy} className="flex-1">
                        {recorded ? 'Cofnij' : 'Nagrane'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <Button to={`/ideas/${id}/edit`} variant="secondary" icon={Edit2}>Edytuj</Button>
                <Button variant="secondary" icon={Copy} onClick={copyText}>Kopiuj</Button>
                <Button variant="danger" icon={Trash2} onClick={handleDelete}>Usuń</Button>
            </div>
        </div>
    );
}
