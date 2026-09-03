import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil, Settings2, AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Minus, Link2 } from 'lucide-react';
import statsService from '../../services/stats';
import { useToast } from '../../context/ToastContext';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { CardSkeleton } from '../ui/Skeleton';

export const SocialIcons = {
    instagram: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
    ),
    tiktok: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
        </svg>
    ),
    facebook: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    ),
    youtube: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    ),
};

export const PLATFORMS = [
    { id: 'instagram', label: 'Instagram', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500', placeholder: 'np. malgorzata.mordarska lub link do profilu', hint: 'Nazwa użytkownika (bez @) albo pełny link.' },
    { id: 'facebook', label: 'Facebook', color: 'bg-blue-600', placeholder: 'np. https://www.facebook.com/TwojaStrona', hint: 'Link do strony (fanpage) lub jej nazwa z adresu.' },
    { id: 'youtube', label: 'YouTube', color: 'bg-red-600', placeholder: 'np. @TwojKanal lub UCxxxxxxxxxxxxxxxxxxxxxx', hint: 'Handle kanału (@nazwa) albo ID kanału (UC…).' },
    { id: 'tiktok', label: 'TikTok', color: 'bg-black', placeholder: 'np. twojanazwa lub link do profilu', hint: 'Nazwa użytkownika (bez @) albo pełny link.' },
];

function formatDatePl(date) {
    if (!date) return null;
    const [y, m, d] = date.split('-');
    return `${d}.${m}.${y.slice(2)}`;
}

function formatAttempt(ts) {
    if (!ts) return '';
    const d = new Date(ts.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Social media block: counts, 7-day change, auto-refresh status, profile settings.
 * `compact` renders a slim strip (dashboard).
 */
export default function SocialSection({ compact = false }) {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [history, setHistory] = useState(null);
    const [meta, setMeta] = useState(null); // { profiles, connected, last, stale }
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [editing, setEditing] = useState(null); // { platform, value }
    const [profilesOpen, setProfilesOpen] = useState(false);

    const load = useCallback(async () => {
        const [s, h, m] = await Promise.allSettled([statsService.getSocialCurrent(), statsService.getSocialHistory(), statsService.getSocialProfiles()]);
        if (s.status === 'fulfilled' && s.value?.success) setStats(s.value.data);
        if (h.status === 'fulfilled' && h.value?.success) setHistory(h.value.data);
        if (m.status === 'fulfilled' && m.value?.success) setMeta(m.value.data);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const runRefresh = async (force = true) => {
        setRefreshing(true);
        try {
            const res = await statsService.autoRefreshSocial({ force });
            const results = res?.data?.results || {};
            const ok = Object.entries(results).filter(([, r]) => r.ok);
            const failed = Object.entries(results).filter(([, r]) => !r.ok && !r.skipped);
            if (ok.length) toast.success(`Zaktualizowano: ${ok.map(([p, r]) => `${PLATFORMS.find((x) => x.id === p)?.label || p} ${Number(r.count).toLocaleString('pl-PL')}`).join(' · ')}`, { duration: 6000 });
            if (failed.length) toast.error(`Nie udało się: ${failed.map(([p]) => PLATFORMS.find((x) => x.id === p)?.label || p).join(', ')}. Szczegóły w „Profile”.`, { duration: 6000 });
            if (!ok.length && !failed.length) toast.info('Brak skonfigurowanych profili. Ustaw je w „Profile”.');
            await load();
        } catch (err) {
            toast.error(err?.message || 'Nie udało się odświeżyć');
        } finally {
            setRefreshing(false);
        }
    };

    const saveManual = async () => {
        const count = parseInt(editing.value, 10);
        const platform = editing.platform;
        setEditing(null);
        if (Number.isNaN(count) || count < 0) return;
        try {
            const res = await statsService.updateSocialStats(platform, count);
            if (res.success) {
                setStats((prev) => ({ ...(prev || {}), [platform]: { count, date: new Date().toISOString().slice(0, 10) } }));
                toast.success('Zapisano ręcznie');
            }
        } catch {
            toast.error('Nie udało się zapisać');
        }
    };

    const changes = useMemo(() => {
        const out = {};
        if (!history) return out;
        for (const p of PLATFORMS) {
            const rows = history[p.id] || [];
            if (rows.length < 2) continue;
            const latest = rows[rows.length - 1];
            const weekAgoTarget = new Date(latest.date);
            weekAgoTarget.setDate(weekAgoTarget.getDate() - 7);
            const targetKey = weekAgoTarget.toISOString().slice(0, 10);
            let base = rows[0];
            for (const r of rows) {
                if (r.date <= targetKey) base = r;
            }
            if (base && base.date !== latest.date) {
                out[p.id] = { diff: latest.count - base.count, since: base.date };
            }
        }
        return out;
    }, [history]);

    if (loading) {
        return (
            <div className={`grid grid-cols-2 ${compact ? 'lg:grid-cols-4' : 'lg:grid-cols-4'} gap-3`}>
                {PLATFORMS.map((p) => <CardSkeleton key={p.id} className={compact ? 'h-16' : 'h-28'} />)}
            </div>
        );
    }

    const configured = (id) => !!(meta?.profiles?.[id] || meta?.connected?.[id]);

    return (
        <section>
            {!compact && (
                <div className="flex items-center justify-between mb-3 px-1 gap-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Social media · pobierane automatycznie</h2>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => runRefresh(true)} disabled={refreshing} className="btn btn-ghost btn-sm">
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Odśwież
                        </button>
                        <button type="button" onClick={() => setProfilesOpen(true)} className="btn btn-secondary btn-sm">
                            <Settings2 size={14} /> Profile
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {PLATFORMS.map((p) => {
                    const data = stats?.[p.id] || { count: 0, date: null };
                    const last = meta?.last?.[p.id];
                    const isConfigured = configured(p.id);
                    const change = changes[p.id];
                    const isEditing = editing?.platform === p.id;

                    if (compact) {
                        return (
                            <div key={p.id} className="card px-3 py-2.5 flex items-center gap-2.5">
                                <span className={`w-8 h-8 rounded-lg ${p.color} text-white flex items-center justify-center shrink-0`}>{SocialIcons[p.id]}</span>
                                <div className="min-w-0">
                                    <div className="text-base font-extrabold text-ink leading-none tabular-nums">{Number(data.count || 0).toLocaleString('pl-PL')}</div>
                                    <div className="text-[10px] text-ink-muted mt-0.5 flex items-center gap-1">
                                        {change ? <Change diff={change.diff} /> : <span>{p.label}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={p.id} className="card card-pad relative">
                            <div className="flex items-center gap-3">
                                <span className={`w-10 h-10 rounded-xl ${p.color} text-white flex items-center justify-center shrink-0 shadow-sm`}>{SocialIcons[p.id]}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                                        {p.label}
                                        {isConfigured && last && (last.success ? <CheckCircle2 size={11} className="text-emerald-500" /> : <AlertCircle size={11} className="text-red-500" />)}
                                    </div>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            className="input !py-1 !px-2 !text-base !font-bold mt-0.5"
                                            value={editing.value}
                                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                            onBlur={saveManual}
                                            onKeyDown={(e) => e.key === 'Enter' && saveManual()}
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="text-xl font-extrabold text-ink tracking-tight truncate tabular-nums">{Number(data.count || 0).toLocaleString('pl-PL')}</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 text-[11px] text-ink-muted gap-2">
                                <span className="truncate">
                                    {change ? <Change diff={change.diff} label="/ 7 dni" /> : data.date ? `stan z ${formatDatePl(data.date)}` : 'brak danych'}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                    {!isConfigured && (
                                        <button type="button" onClick={() => setProfilesOpen(true)} className="font-semibold text-primary-700 hover:text-primary-800">
                                            Ustaw profil
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setEditing({ platform: p.id, value: String(data.count || 0) })} className="p-1 rounded-md hover:bg-black/5" title="Wpisz ręcznie" aria-label="Wpisz ręcznie">
                                        <Pencil size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <SocialProfilesSheet
                open={profilesOpen}
                onClose={() => setProfilesOpen(false)}
                meta={meta}
                stats={stats}
                onSaved={async () => {
                    await load();
                }}
            />
        </section>
    );
}

function Change({ diff, label = '' }) {
    if (diff === 0) return <span className="inline-flex items-center gap-1 text-ink-muted"><Minus size={11} /> bez zmian {label}</span>;
    const up = diff > 0;
    return (
        <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {up ? '+' : ''}{diff.toLocaleString('pl-PL')} {label}
        </span>
    );
}

function SocialProfilesSheet({ open, onClose, meta, stats, onSaved }) {
    const toast = useToast();
    const [form, setForm] = useState({ instagram: '', facebook: '', youtube: '', tiktok: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm({
                instagram: meta?.profiles?.instagram || '',
                facebook: meta?.profiles?.facebook || '',
                youtube: meta?.profiles?.youtube || '',
                tiktok: meta?.profiles?.tiktok || '',
            });
        }
    }, [open, meta]);

    const connect = async (platform) => {
        try {
            const res = await statsService.getSocialAuthUrl(platform);
            if (res.success && res.data?.url) window.location.href = res.data.url;
            else toast.error('Logowanie OAuth nie jest skonfigurowane na serwerze. Wystarczy sama nazwa profilu.');
        } catch {
            toast.error('Logowanie OAuth nie jest skonfigurowane na serwerze. Wystarczy sama nazwa profilu.');
        }
    };

    const submit = async (e) => {
        e?.preventDefault();
        setSaving(true);
        try {
            const res = await statsService.saveSocialProfiles(form);
            const refreshed = res?.data?.refreshed || {};
            const ok = Object.entries(refreshed).filter(([, r]) => r.ok);
            const failed = Object.entries(refreshed).filter(([, r]) => !r.ok);
            if (ok.length) toast.success(`Pobrano: ${ok.map(([p, r]) => `${PLATFORMS.find((x) => x.id === p)?.label} ${Number(r.count).toLocaleString('pl-PL')}`).join(' · ')}`, { duration: 6000 });
            if (failed.length) toast.error(`Nie udało się pobrać: ${failed.map(([p]) => PLATFORMS.find((x) => x.id === p)?.label).join(', ')}. Sprawdź nazwę profilu.`, { duration: 6000 });
            if (!ok.length && !failed.length) toast.success('Profile zapisane');
            await onSaved?.();
            if (!failed.length) onClose();
        } catch (err) {
            toast.error(err?.message || 'Nie udało się zapisać profili');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Profile social media"
            description="Podaj nazwy profili. Liczby obserwujących będą pobierane automatycznie raz dziennie."
            size="lg"
            footer={
                <>
                    <Button variant="secondary" className="flex-1" onClick={onClose}>Anuluj</Button>
                    <Button variant="primary" className="flex-1" loading={saving} onClick={submit}>Zapisz i pobierz</Button>
                </>
            }
        >
            <form onSubmit={submit} className="space-y-4 pt-1">
                {PLATFORMS.map((p) => {
                    const last = meta?.last?.[p.id];
                    const isConnected = !!meta?.connected?.[p.id];
                    return (
                        <div key={p.id} className="rounded-2xl border border-line p-3.5">
                            <div className="flex items-center gap-2.5 mb-2">
                                <span className={`w-8 h-8 rounded-lg ${p.color} text-white flex items-center justify-center shrink-0`}>{SocialIcons[p.id]}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-ink">{p.label}</div>
                                    <div className="text-[11px] text-ink-muted truncate">
                                        {last
                                            ? last.success
                                                ? `Ostatnio pobrano ${formatAttempt(last.attempted_at)} (${last.source})`
                                                : `Błąd ${formatAttempt(last.attempted_at)}: ${last.error || 'nieznany'}`
                                            : stats?.[p.id]?.date
                                                ? `Stan z ${formatDatePl(stats[p.id].date)}`
                                                : 'Jeszcze nie pobierano'}
                                    </div>
                                </div>
                                {(p.id === 'tiktok' || p.id === 'facebook') && (
                                    <button type="button" onClick={() => connect(p.id)} className={`text-[11px] font-semibold inline-flex items-center gap-1 ${isConnected ? 'text-emerald-600' : 'text-ink-muted hover:text-primary-700'}`}>
                                        <Link2 size={11} /> {isConnected ? 'Połączono' : 'OAuth'}
                                    </button>
                                )}
                            </div>
                            <Field hint={p.hint}>
                                <input
                                    type="text"
                                    className="input"
                                    value={form[p.id]}
                                    onChange={(e) => setForm({ ...form, [p.id]: e.target.value })}
                                    placeholder={p.placeholder}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                            </Field>
                        </div>
                    );
                })}
                <p className="text-[11px] text-ink-muted leading-relaxed">
                    Dane pobierane są z publicznych stron profili. Gdy platforma zablokuje pobieranie, panel spróbuje ponownie po 3 godzinach, a Ty zawsze możesz wpisać liczbę ręcznie (ołówek na kafelku).
                </p>
            </form>
        </Sheet>
    );
}
