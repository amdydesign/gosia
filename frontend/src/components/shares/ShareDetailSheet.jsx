import { useEffect, useState } from 'react';
import { Send, Copy, ExternalLink, Trash2, RefreshCw, Eye, Download, Film, FileText, Image as ImageIcon } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Switch from '../ui/Switch';
import ChoiceChips from '../ui/ChoiceChips';
import { useToast } from '../../context/ToastContext';
import { copyLink, posterUrl, sendLink, updateShare } from '../../services/shares';
import { formatBytes, formatShareDate, toDay } from '../../utils/shares';

const EXPIRY = [
    { value: 'none', label: 'Bez limitu' },
    { value: '7', label: '7 dni' },
    { value: '30', label: '30 dni' },
];

export function ShareIcon({ share, size = 20 }) {
    const type = share.mime_type || '';
    const Icon = type.startsWith('video/') ? Film : type.startsWith('image/') ? ImageIcon : FileText;
    return <Icon size={size} />;
}

/**
 * One shared file: send the link (main action), then name, note for the recipient,
 * link on/off, downloads, expiry - everything saves by itself.
 */
export default function ShareDetailSheet({ share, onClose, onChanged, onDelete }) {
    const toast = useToast();
    const [title, setTitle] = useState('');
    const [note, setNote] = useState('');
    const [expiry, setExpiry] = useState('none');

    useEffect(() => {
        if (!share) return;
        setTitle(share.title);
        setNote(share.note || '');
        setExpiry(share.expires_at ? '' : 'none');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [share?.id]);

    if (!share) return <Sheet open={false} />;

    const save = async (data, message) => {
        try {
            const updated = await updateShare(share.id, data);
            onChanged(updated);
            if (message) toast.success(message);
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać');
        }
    };

    const send = async () => {
        const result = await sendLink(share);
        if (result === 'copied') toast.success('Link skopiowany — wklej go w wiadomości');
        else if (result === null && !navigator.share) toast.error('Nie udało się skopiować');
    };

    const copy = async () => {
        if (await copyLink(share)) toast.success('Link skopiowany');
        else toast.error('Nie udało się skopiować');
    };

    const changeExpiry = (value) => {
        setExpiry(value);
        if (value === 'none') save({ expires_at: null }, 'Link bez limitu czasu');
        else {
            const date = new Date();
            date.setDate(date.getDate() + Number(value));
            save({ expires_at: toDay(date) }, `Link działa do ${formatShareDate(toDay(date))}`);
        }
    };

    const poster = posterUrl(share);
    const expiryValue = share.expires_at ? expiry : 'none';
    const off = share.status !== 'active';

    return (
        <Sheet open onClose={onClose} title={share.title} description={`${formatBytes(share.size)} · ${formatShareDate(share.created_at)}`}>
            <div className="flex gap-4 items-start">
                <div className="w-24 aspect-[9/16] rounded-2xl overflow-hidden bg-surface-2 border border-line flex items-center justify-center text-ink-muted shrink-0">
                    {poster ? <img src={poster} alt="" className="w-full h-full object-cover" /> : <ShareIcon share={share} size={26} />}
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                    <div className={`text-sm font-bold ${share.views > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <Eye size={15} className="inline -mt-0.5 mr-1" />
                        {share.views > 0 ? `Obejrzane ${share.views}×` : 'Jeszcze nikt nie otworzył'}
                    </div>
                    {share.last_viewed_at && <div className="text-xs text-ink-muted">ostatnio {formatShareDate(share.last_viewed_at, true)}</div>}
                    {share.downloads > 0 && (
                        <div className="text-sm text-ink">
                            <Download size={15} className="inline -mt-0.5 mr-1" />
                            Pobrane {share.downloads}×
                        </div>
                    )}
                    {off && (
                        <div className="badge badge-danger">{share.status === 'expired' ? 'Link wygasł' : 'Link wyłączony'}</div>
                    )}
                </div>
            </div>

            <Button variant="primary" size="lg" block icon={Send} onClick={send} className="mt-5" disabled={off}>
                Wyślij link
            </Button>
            <button type="button" onClick={copy} className="mt-2 w-full flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-left text-xs text-ink-soft hover:bg-ink/5">
                <span className="flex-1 truncate font-mono">{share.url}</span>
                <Copy size={14} className="shrink-0" />
            </button>

            <div className="mt-6 space-y-4">
                <Field label="Nazwa (widzi ją odbiorca)">
                    <input
                        className="input"
                        value={title}
                        maxLength={255}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => title.trim() && title.trim() !== share.title && save({ title: title.trim() })}
                    />
                </Field>
                <Field label="Wiadomość pod filmem" hint="Np. „Wersja 2 — poprawiony dźwięk”. Opcjonalnie.">
                    <textarea
                        className="input min-h-[72px]"
                        value={note}
                        maxLength={2000}
                        onChange={(e) => setNote(e.target.value)}
                        onBlur={() => note.trim() !== (share.note || '') && save({ note: note.trim() })}
                    />
                </Field>
                <Field label="Ważność linku" hint={share.expires_at ? `Działa do ${formatShareDate(share.expires_at)}` : undefined}>
                    <ChoiceChips options={EXPIRY} value={expiryValue} onChange={changeExpiry} />
                </Field>
            </div>

            <div className="card divide-y divide-line overflow-hidden mt-5">
                <button type="button" role="switch" aria-checked={share.is_active} onClick={() => save({ is_active: !share.is_active }, share.is_active ? 'Link wyłączony' : 'Link znów działa')} className="row w-full text-left hover:bg-surface-2">
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink">Link aktywny</span>
                        <span className="block text-xs text-ink-muted">Wyłącz, żeby nikt już nie otworzył</span>
                    </span>
                    <Switch on={share.is_active} />
                </button>
                <button type="button" role="switch" aria-checked={share.allow_download} onClick={() => save({ allow_download: !share.allow_download })} className="row w-full text-left hover:bg-surface-2">
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink">Pozwól pobrać</span>
                        <span className="block text-xs text-ink-muted">Wyłączone: można tylko obejrzeć</span>
                    </span>
                    <Switch on={share.allow_download} />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-5">
                <Button variant="soft" size="sm" icon={ExternalLink} href={`${share.url}?p=1`} target="_blank" rel="noopener noreferrer">
                    Podgląd
                </Button>
                <Button variant="soft" size="sm" icon={RefreshCw} onClick={() => save({ new_link: true }, 'Nowy link — stary przestał działać')}>
                    Nowy link
                </Button>
                <Button variant="soft" size="sm" icon={Trash2} onClick={() => onDelete(share)} className="!text-red-600">
                    Usuń
                </Button>
            </div>
        </Sheet>
    );
}
