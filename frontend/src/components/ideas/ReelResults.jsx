import { useRef, useState } from 'react';
import { BarChart3, Check, ImagePlus, Loader2, Send } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ideasService from '../../services/ideas';
import { readScreens } from '../../services/ai';
import { useToast } from '../../context/ToastContext';
import { formatDateShort, getTodayDate } from '../../utils/format';

const STATS = [
    { key: 'likes', label: 'polubienia' },
    { key: 'comments', label: 'komentarze' },
    { key: 'shares', label: 'udostępnienia' },
    { key: 'saves', label: 'zapisania' },
    { key: 'reach', label: 'zasięg' },
];

function number(n) {
    return Number(n || 0).toLocaleString('pl-PL');
}

function parseStats(json) {
    if (!json) return {};
    if (typeof json === 'object') return json;
    try {
        return JSON.parse(json) || {};
    } catch {
        return {};
    }
}

/**
 * Published reel + its numbers: a screen of the insights is read by AI (or views typed in).
 * The reel generator leans on the scripts with the most views.
 */
export default function ReelResults({ idea, aiEnabled, onChange }) {
    const toast = useToast();
    const fileRef = useRef(null);
    const [reading, setReading] = useState(false);
    const [draft, setDraft] = useState(null); // numbers read, waiting for "Zapisz"
    const [saving, setSaving] = useState(false);
    const stats = parseStats(idea.stats);
    const published = !!idea.published_at;

    const readScreen = async (files) => {
        if (!files.length) return;
        setReading(true);
        try {
            const r = await readScreens('insights', files);
            setDraft({ views: r.views || '', published_at: r.published_date || idea.published_at || getTodayDate(), stats: r });
        } catch (err) {
            toast.error(err.message || 'Nie udało się odczytać statystyk');
        } finally {
            setReading(false);
        }
    };

    const save = async (patch) => {
        setSaving(true);
        try {
            await ideasService.update(null, idea.id, patch);
            onChange({ ...idea, ...patch, stats: patch.stats ? JSON.stringify(patch.stats) : idea.stats });
            setDraft(null);
            toast.success(patch.views ? `Zapisane: ${number(patch.views)} wyświetleń — generator weźmie to pod uwagę` : 'Zapisane');
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        } finally {
            setSaving(false);
        }
    };

    const picker = (
        <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                readScreen(files);
            }}
        />
    );

    if (draft) {
        return (
            <Card className="!p-5 space-y-3">
                <div className="text-sm font-semibold text-ink">Wyniki rolki — sprawdź i zapisz</div>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-muted">
                        Wyświetlenia
                        <input className="input !py-2 mt-1 font-semibold" inputMode="numeric" value={draft.views} onChange={(e) => setDraft({ ...draft, views: e.target.value.replace(/\D/g, '') })} />
                    </label>
                    <label className="text-xs text-ink-muted">
                        Opublikowana
                        <input type="date" className="input !py-2 mt-1" value={draft.published_at} max={getTodayDate()} onChange={(e) => setDraft({ ...draft, published_at: e.target.value })} />
                    </label>
                </div>
                <p className="text-xs text-ink-muted">
                    {STATS.filter((s) => draft.stats?.[s.key]).map((s) => `${number(draft.stats[s.key])} ${s.label}`).join(' · ') || 'Bez dodatkowych liczb'}
                </p>
                <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setDraft(null)}>Anuluj</Button>
                    <Button
                        variant="primary"
                        className="flex-1"
                        icon={Check}
                        loading={saving}
                        onClick={() => {
                            const clean = Object.fromEntries(STATS.filter((s) => draft.stats?.[s.key] > 0).map((s) => [s.key, Number(draft.stats[s.key])]));
                            save({ views: draft.views === '' ? null : Number(draft.views), published_at: draft.published_at || getTodayDate(), stats: clean });
                        }}
                    >
                        Zapisz
                    </Button>
                </div>
            </Card>
        );
    }

    if (!published) {
        return (
            <Card className="!p-5">
                {picker}
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Send size={16} className="text-primary-600" /> Opublikowana?
                </div>
                <p className="text-xs text-ink-muted mt-1">
                    Dodaj wyniki po kilku dniach — generator rolek będzie opierał się na tym, co naprawdę działa.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                    {aiEnabled && (
                        <Button variant="secondary" icon={reading ? Loader2 : ImagePlus} disabled={reading} onClick={() => fileRef.current?.click()}>
                            {reading ? 'Czytam…' : 'Screen statystyk'}
                        </Button>
                    )}
                    <Button variant="secondary" loading={saving} onClick={() => setDraft({ views: '', published_at: getTodayDate(), stats: {} })}>
                        Wpiszę ręcznie
                    </Button>
                </div>
            </Card>
        );
    }

    return (
        <Card className="!p-5">
            {picker}
            <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-primary-600 shrink-0" />
                <span className="flex-1 text-sm font-semibold text-ink">Opublikowana {formatDateShort(idea.published_at)}</span>
                {aiEnabled && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={reading} className="text-xs font-semibold text-primary-700 inline-flex items-center gap-1">
                        {reading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Aktualizuj
                    </button>
                )}
            </div>
            {idea.views !== null && idea.views !== undefined ? (
                <div className="mt-2">
                    <span className="amount font-display text-2xl font-semibold text-ink">{number(idea.views)}</span>
                    <span className="text-sm text-ink-muted"> wyświetleń</span>
                </div>
            ) : (
                <p className="text-xs text-ink-muted mt-1">Bez wyników — dodaj screena statystyk.</p>
            )}
            {STATS.some((s) => stats[s.key]) && (
                <p className="text-xs text-ink-muted mt-1">{STATS.filter((s) => stats[s.key]).map((s) => `${number(stats[s.key])} ${s.label}`).join(' · ')}</p>
            )}
        </Card>
    );
}
