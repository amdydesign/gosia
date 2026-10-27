import { useNavigate } from 'react-router-dom';
import { Briefcase, Camera, Lightbulb, FolderLock, ChevronRight, Send } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { useQuickActions } from '../../context/QuickActionsContext';

export default function QuickAddSheet({ open, onClose }) {
    const navigate = useNavigate();
    const { openCollab, openPurchase } = useQuickActions();

    const options = [
        { key: 'collab', icon: Briefcase, title: 'Współpraca', text: 'Marka i kwota — reszta jak ostatnio', tone: 'bg-primary-50 text-primary-600', run: () => openCollab() },
        { key: 'purchase', icon: Camera, title: 'Zakup ze screena', text: 'Wrzuć screena, przypomnę o zwrocie', tone: 'bg-secondary-light text-secondary-dark', run: () => openPurchase() },
        { key: 'document', icon: FolderLock, title: 'Dokument', text: 'Umowa — skan aparatem albo plik', tone: 'bg-sky-50 text-sky-600', run: () => { onClose(); navigate('/documents?add=1'); } },
        { key: 'share', icon: Send, title: 'Rolka dla marki', text: 'Wrzuć plik, wyślij link', tone: 'bg-primary-50 text-primary-600', run: () => { onClose(); navigate('/share?add=1'); } },
        { key: 'idea', icon: Lightbulb, title: 'Pomysł na rolkę', text: 'Scenariusz do promptera', tone: 'bg-amber-50 text-amber-600', run: () => { onClose(); navigate('/ideas/new'); } },
    ];

    return (
        <Sheet open={open} onClose={onClose} title="Co dodajesz?" size="sm">
            <div className="space-y-2 pb-2">
                {options.map((opt) => (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={opt.run}
                        className="w-full flex items-center gap-4 p-3.5 rounded-2xl border border-line hover:border-primary-200 hover:bg-primary-50/40 transition-colors text-left"
                    >
                        <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${opt.tone}`}>
                            <opt.icon size={22} />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block font-bold text-ink">{opt.title}</span>
                            <span className="block text-xs text-ink-muted">{opt.text}</span>
                        </span>
                        <ChevronRight size={18} className="text-ink-muted" />
                    </button>
                ))}
            </div>
        </Sheet>
    );
}
