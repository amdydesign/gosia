export default function EmptyState({ icon: Icon, title, text, action, compact = false }) {
    return (
        <div className={`text-center ${compact ? 'py-8 px-4' : 'py-14 px-6'}`}>
            {Icon && (
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary-50 text-primary-500 flex items-center justify-center">
                    <Icon size={26} strokeWidth={1.75} />
                </div>
            )}
            <h3 className="text-base font-bold text-ink">{title}</h3>
            {text && <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">{text}</p>}
            {action && <div className="mt-5 flex justify-center">{action}</div>}
        </div>
    );
}
