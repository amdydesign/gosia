/**
 * In-content page header (desktop shows title; mobile relies on TopBar so title is hidden there).
 */
export default function PageHeader({ title, subtitle, actions, children, showTitleOnMobile = false }) {
    return (
        <div className="mb-5 space-y-4">
            <div className={`${showTitleOnMobile ? 'flex' : 'hidden lg:flex'} items-end justify-between gap-4`}>
                <div className="min-w-0">
                    <h1 className="text-2xl lg:text-[28px] font-extrabold tracking-tight text-ink truncate">{title}</h1>
                    {subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
                </div>
                {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
            {!showTitleOnMobile && actions && <div className="flex lg:hidden items-center gap-2">{actions}</div>}
            {children}
        </div>
    );
}
