import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Lightbulb, Clock, Type } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Segmented from '../../components/ui/Segmented';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { countWords, estimateSpeechSeconds, formatSeconds } from '../../utils/format';

export default function IdeaForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();
    const textareaRef = useRef(null);

    const [form, setForm] = useState({ title: '', content: '', status: 'draft' });
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isEdit) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await ideasService.getOne(null, id);
                if (!cancelled) setForm({ title: data.title || '', content: data.content || '', status: data.status || 'draft' });
            } catch {
                if (!cancelled) setError('Błąd ładowania danych');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id, isEdit]);

    // Auto-grow textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.max(240, el.scrollHeight)}px`;
    }, [form.content, loading]);

    const words = useMemo(() => countWords(form.content), [form.content]);
    const seconds = useMemo(() => estimateSpeechSeconds(form.content), [form.content]);
    const lengthHint = seconds === 0 ? '' : seconds < 20 ? 'Krótko — idealne na hook' : seconds <= 60 ? 'Dobra długość na rolkę' : seconds <= 90 ? 'Długa rolka — rozważ skrócenie' : 'Bardzo długo — może podzielić na dwie?';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            if (isEdit) {
                await ideasService.update(null, id, form);
                toast.success('Pomysł zapisany');
                navigate(`/ideas/${id}`, { replace: true });
            } else {
                const result = await ideasService.create(null, form);
                toast.success('Pomysł dodany');
                navigate(result?.id ? `/ideas/${result.id}` : '/ideas', { replace: true });
            }
            refresh();
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            setSaving(false);
        }
    };

    if (loading) return <PageSkeleton />;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <div className="hidden lg:block mb-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-ink">{isEdit ? 'Edycja pomysłu' : 'Nowy pomysł'}</h1>
                <p className="text-sm text-ink-muted">Tytuł to temat rolki, treść to tekst, który przeczytasz z promptera.</p>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}

            <Card className="space-y-5">
                <Field label="Tytuł / temat" required>
                    <input
                        type="text"
                        className="input !text-lg !font-semibold"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="np. 3 błędy w stylizacji na jesień"
                        required
                        autoFocus={!isEdit}
                    />
                </Field>

                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="label !mb-0 flex items-center gap-1.5"><Type size={13} /> Scenariusz</label>
                        <span className="text-[11px] font-semibold text-ink-muted inline-flex items-center gap-1">
                            {words} słów{seconds > 0 && <> · <Clock size={11} /> ~{formatSeconds(seconds)}</>}
                        </span>
                    </div>
                    <textarea
                        ref={textareaRef}
                        className="input min-h-[240px] !text-base !leading-relaxed"
                        value={form.content}
                        onChange={(e) => setForm({ ...form, content: e.target.value })}
                        placeholder={'Hook: …\n\nRozwinięcie: …\n\nCTA: …'}
                    />
                    {lengthHint && <p className="hint">{lengthHint} (czas mówienia ~2,3 słowa/s).</p>}
                </div>

                <Field label="Status">
                    <Segmented
                        className="w-full"
                        value={form.status}
                        onChange={(v) => setForm({ ...form, status: v })}
                        options={[
                            { value: 'draft', label: 'Do nagrania', icon: Lightbulb },
                            { value: 'recorded', label: 'Nagrane', tone: 'success' },
                        ]}
                    />
                </Field>
            </Card>

            <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:static -mx-4 sm:mx-0 px-4 sm:px-0 py-3 lg:py-0 bg-canvas/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-line lg:border-0">
                <div className="flex gap-3">
                    <Button type="button" variant="secondary" onClick={() => navigate(-1)} className="flex-1 lg:flex-none">Anuluj</Button>
                    <Button type="submit" variant="primary" icon={Save} loading={saving} className="flex-[2] lg:flex-none lg:px-8">Zapisz</Button>
                </div>
            </div>
        </form>
    );
}
