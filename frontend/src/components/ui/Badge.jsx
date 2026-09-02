export default function Badge({ tone = 'neutral', icon: Icon, children, className = '' }) {
    return (
        <span className={`badge badge-${tone} ${className}`}>
            {Icon && <Icon size={11} strokeWidth={2.5} />}
            {children}
        </span>
    );
}
