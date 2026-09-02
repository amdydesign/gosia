import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Card({ children, className = '', padded = true }) {
    return <div className={`card ${padded ? 'card-pad' : ''} ${className}`}>{children}</div>;
}

export function CardHeader({ title, icon: Icon, action, to, actionLabel = 'Wszystkie', className = '' }) {
    return (
        <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3.5 border-b border-line ${className}`}>
            <h2 className="card-title flex items-center gap-2">
                {Icon && <Icon size={16} className="text-primary-500" />}
                {title}
            </h2>
            {action}
            {!action && to && (
                <Link to={to} className="text-xs font-semibold text-primary-700 hover:text-primary-800 inline-flex items-center gap-0.5">
                    {actionLabel}
                    <ChevronRight size={14} />
                </Link>
            )}
        </div>
    );
}
