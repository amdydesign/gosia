import { CalendarClock, Check, Minus, Plus, X } from 'lucide-react';
import { formatDateShort, openPicker } from '../../utils/format';
import { DELIVERABLE_PRESETS } from '../../utils/collabs';

/**
 * "Do zrobienia": what the brand wants (2× Reels IG, 3× Stories IG…).
 * Usually filled from the brief by AI - here only quick fixes: one tap adds / counts,
 * the date is optional. list: [{ label, count, done, due }]
 * kinds: extra one-tap chips for jobs that are not a post (Sesja, Event…): [{ label, active, onClick }]
 */
export default function DeliverablesEditor({ list, onChange, kinds = [] }) {
    const update = (i, patch) => onChange(list.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    const setCount = (i, count) => {
        if (count < 1) return onChange(list.filter((_, idx) => idx !== i));
        update(i, { count, done: Math.min(Number(list[i].done) || 0, count) });
    };
    const addPreset = (label) => {
        const i = list.findIndex((d) => d.label.toLowerCase() === label.toLowerCase());
        if (i >= 0) setCount(i, (Number(list[i].count) || 1) + 1);
        else onChange([...list, { label, count: 1, done: 0, due: '' }]);
    };

    return (
        <div>
            <div className="section-label mb-2">Do zrobienia</div>
            {list.length > 0 && (
                <div className="rounded-2xl border border-line divide-y divide-line mb-2.5">
                    {list.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5">
                            <input
                                className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-ink outline-none py-1.5"
                                value={d.label}
                                onChange={(e) => update(i, { label: e.target.value })}
                                placeholder="np. Reels IG"
                                aria-label="Co"
                            />
                            <label
                                className={`relative shrink-0 h-8 px-2 rounded-lg inline-flex items-center gap-1 text-xs font-semibold cursor-pointer ${
                                    d.due ? 'bg-violet-50 text-violet-700' : 'text-ink-muted hover:bg-ink/5'
                                }`}
                                title="Termin tej pozycji"
                            >
                                <CalendarClock size={14} />
                                {d.due ? formatDateShort(d.due) : ''}
                                <input
                                    type="date"
                                    onClick={openPicker}
                                    value={d.due || ''}
                                    onChange={(e) => update(i, { due: e.target.value })}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label={`Termin: ${d.label}`}
                                />
                            </label>
                            <div className="shrink-0 flex items-center rounded-lg bg-canvas border border-line">
                                <button type="button" onClick={() => setCount(i, (Number(d.count) || 1) - 1)} className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-ink" aria-label="Mniej">
                                    {Number(d.count) <= 1 ? <X size={14} /> : <Minus size={14} />}
                                </button>
                                <span className="w-6 text-center text-sm font-bold tabular-nums">{d.count}</span>
                                <button type="button" onClick={() => setCount(i, (Number(d.count) || 1) + 1)} className="w-8 h-8 flex items-center justify-center text-ink-muted hover:text-ink" aria-label="Więcej">
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-0.5">
                {DELIVERABLE_PRESETS.map((label) => (
                    <button key={label} type="button" onClick={() => addPreset(label)} className="chip !py-1.5 !text-xs shrink-0">
                        <Plus size={12} /> {label}
                    </button>
                ))}
                {kinds.map((k) => (
                    <button key={k.label} type="button" onClick={k.onClick} aria-pressed={k.active} className={`chip !py-1.5 !text-xs shrink-0 ${k.active ? 'chip-active' : ''}`}>
                        {k.active ? <Check size={12} /> : <Plus size={12} />} {k.label}
                    </button>
                ))}
                <button type="button" onClick={() => onChange([...list, { label: '', count: 1, done: 0, due: '' }])} className="chip !py-1.5 !text-xs shrink-0">
                    <Plus size={12} /> Inne
                </button>
            </div>
        </div>
    );
}
