/**
 * Label + control wrapper. Pass `suffix` (e.g. "zł") to render an inline unit.
 */
export default function Field({ label, hint, error, suffix, required, children, className = '' }) {
    return (
        <div className={className}>
            {label && (
                <label className="label">
                    {label}
                    {required && <span className="text-primary-500 ml-0.5">*</span>}
                </label>
            )}
            {suffix ? (
                <div className="relative">
                    {children}
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted pointer-events-none">
                        {suffix}
                    </span>
                </div>
            ) : (
                children
            )}
            {error ? <p className="hint !text-red-600">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
        </div>
    );
}
