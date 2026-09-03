import { useNavigate } from 'react-router-dom';
import { Briefcase, ShoppingBag, Lightbulb, ChevronRight } from 'lucide-react';
import Sheet from '../ui/Sheet';

const OPTIONS = [
    { to: '/collaborations/new', icon: Briefcase, title: 'Nowa współpraca', text: 'Zlecenie, kwota, rozliczenie i zespół', tone: 'bg-primary-50 text-primary-600' },
    { to: '/purchases/new', icon: ShoppingBag, title: 'Nowy zakup', text: 'Zapisz zakup i termin zwrotu', tone: 'bg-emerald-50 text-emerald-600' },
    { to: '/ideas/new', icon: Lightbulb, title: 'Nowy pomysł na rolkę', text: 'Scenariusz do promptera', tone: 'bg-secondary-light text-secondary-dark' },
];

export default function QuickAddSheet({ open, onClose }) {
    const navigate = useNavigate();

    return (
        <Sheet open={open} onClose={onClose} title="Co chcesz dodać?" size="sm">
            <div className="space-y-2 pb-2">
                {OPTIONS.map((opt) => (
                    <button
                        key={opt.to}
                        type="button"
                        onClick={() => {
                            onClose();
                            navigate(opt.to);
                        }}
                        className="w-full flex items-center gap-4 p-3.5 rounded-2xl border border-line hover:border-primary-200 hover:bg-primary-50/40 transition-colors text-left"
                    >
                        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${opt.tone}`}>
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
