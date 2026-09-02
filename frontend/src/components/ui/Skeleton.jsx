export function Skeleton({ className = '' }) {
    return <div className={`skeleton ${className}`} />;
}

export function ListSkeleton({ rows = 4 }) {
    return (
        <div className="card divide-y divide-line overflow-hidden">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="row">
                    <Skeleton className="w-11 h-11 !rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-1/2" />
                        <Skeleton className="h-3 w-1/3" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                </div>
            ))}
        </div>
    );
}

export function CardSkeleton({ className = 'h-32' }) {
    return <div className={`card ${className} animate-pulse`} />;
}

export function PageSkeleton() {
    return (
        <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <CardSkeleton className="h-28" />
                <CardSkeleton className="h-28" />
                <CardSkeleton className="h-28 hidden lg:block" />
            </div>
            <ListSkeleton rows={5} />
        </div>
    );
}

export function Spinner({ size = 20, className = '' }) {
    return (
        <span
            className={`inline-block rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin ${className}`}
            style={{ width: size, height: size }}
        />
    );
}
