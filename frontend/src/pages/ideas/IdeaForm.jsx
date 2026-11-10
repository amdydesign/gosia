import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Clock, Type } from 'lucide-react';
import ideasService from '../../services/ideas';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';
import Field from '../../components/ui/Field';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { PageSkeleton } from '../../components/ui/Skeleton';
import DraftNotice from '../../components/ui/DraftNotice';
import { useDraft } from '../../hooks/useDraft';
import { countWords, estimateSpeechSeconds, formatSeconds } from '../../utils/format';

const EMPTY = { title: '', content: '', status: 'draft' };

export default function IdeaForm() {
    const { id } = useParams();
    const isEdit = !!id;
    const navigate = useNavigate();
    const toast = useToast();
    const { refresh } = useDashboard();
    const textareaRef = useRef(null);

    // A half-written script survives leaving the screen, a lost session or a closed app
    const draft = useDraft(isEdit ? `idea.edit.${id}` : 'idea.new');
    const [form, setForm] = useState(() => (!isEdit && draft.initial ? { ...EMPTY, ...draft.initial } : EMPTY));
    const [loaded, setLoaded] = useState(isEdit ? null : EMPTY); // what the server has - the draft is whatever differs
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isEdit) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const data = await ideasService.getOne(null, id);
                if (cancelled) return;
                const server = { title: data.title || '', content: data.content || '', status: data.status || 'draft' };
                setLoaded(server);
                setForm(draft.initial ? { ...server, ...draft.initial } : server);
            } catch {
                if (!cancelled) setError('Błąd ładowania danych');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isEdit]);

    const dirty = !!loaded && (form.title !== loaded.title || form.content !== loaded.content);
    const saveDraft = draft.save;
    useEffect(() => {
        if (dirty && !savingRef.current) saveDraft({ title: form.title, content: form.content });
    }, [dirty, form.title, form.content, saveDraft]);

    const discardDraft = () => {
        const old = form;
        draft.clear();
        setForm(loaded || EMPTY);
        toast.info('Szkic wyczyszczony', { action: { label: 'Cofnij', onClick: () => setForm(old) } });
    };

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
        if (savingRef.current) return; // a second tap while saving must not add the idea twice
        savingRef.current = true;
        setSaving(true);
        setError('');
        try {
            if (isEdit) {
                await ideasService.update(null, id, form);
                draft.clear();
                toast.success('Pomysł zapisany');
                navigate(`/ideas/${id}`, { replace: true });
            } else {
                const result = await ideasService.create(null, form);
                draft.clear();
                toast.success('Pomysł dodany');
                navigate(result?.id ? `/ideas/${result.id}` : '/ideas', { replace: true });
            }
            refresh();
        } catch (err) {
            setError(err.message || 'Błąd zapisu');
            savingRef.current = false;
            setSaving(false);
        }
    };

    if (loading) return <PageSkeleton />;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4 animate-fade-in">
            <div className="hidden lg:block mb-2">
                <h1 className="text-2xl font-display font-semibold tracking-tight text-ink">{isEdit ? 'Edycja pomysłu' : 'Nowy pomysł'}</h1>
                <p className="text-sm text-ink-muted">Tytuł to temat rolki, treść to tekst, który przeczytasz z promptera.</p>
            </div>

            {error && <div className="bg-red-50 text-red-700 border border-red-100 p-3.5 rounded-xl text-sm">{error}</div>}
            {draft.restored && <DraftNotice onDiscard={discardDraft} className="px-1" />}

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
            </Card>

            <div className="sticky bottom-[calc(90px+env(safe-area-inset-bottom))] lg:static -mx-4 sm:mx-0 px-4 sm:px-0 py-3 lg:py-0 bg-canvas/90 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-t border-line lg:border-0">
                <Button type="submit" variant="primary" icon={Save} loading={saving} className="w-full lg:w-auto lg:px-8">Zapisz</Button>
            </div>
        </form>
    );
}
