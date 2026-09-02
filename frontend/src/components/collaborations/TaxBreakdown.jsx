import { Wallet } from 'lucide-react';
import { BILLING_TYPES, formatCurrency } from '../../utils/format';

/**
 * Read-only "na rękę" breakdown for a gross amount + billing type.
 */
export default function TaxBreakdown({ breakdown, collabType, compact = false }) {
    const config = BILLING_TYPES[collabType] || {};
    const isCash = !!config.private;
    const isUseme = !!config.useme;
    const isUoP = collabType === 'umowa_praca';
    const d = breakdown.details || {};

    if (!breakdown.gross) {
        return (
            <div className="rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-muted">
                Wpisz kwotę, aby zobaczyć ile dostaniesz na rękę.
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-line bg-canvas overflow-hidden">
            {!compact && !isCash && (
                <div className="p-4 space-y-1.5 text-xs">
                    <Line label="Kwota brutto" value={formatCurrency(breakdown.gross)} strong />
                    {isUseme && (
                        <>
                            <Line label="Prowizja Use.me (7,8%, min. 29 zł)" value={`−${formatCurrency(d.commission)}`} />
                            <Line label="Po prowizji" value={formatCurrency(d.afterCommission)} strong />
                        </>
                    )}
                    {isUoP ? (
                        <>
                            <Line label="Składki ZUS (13,71%)" value={`−${formatCurrency(d.zus)}`} />
                            <Line label="Składka zdrowotna (9%)" value={`−${formatCurrency(d.health)}`} />
                            <Line label="Zaliczka na PIT (12%, po kwocie wolnej)" value={`−${formatCurrency(d.tax)}`} />
                        </>
                    ) : (
                        <>
                            <Line label={`Koszty uzyskania (${Math.round((config.kup || 0) * 100)}%)`} value={`−${formatCurrency(d.kup)}`} muted />
                            <Line label="Podstawa opodatkowania" value={formatCurrency(d.taxBase)} muted />
                            <Line label="Zaliczka na podatek (12%)" value={`−${formatCurrency(d.tax)}`} />
                        </>
                    )}
                </div>
            )}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 ${isCash ? '' : 'border-t border-line'} bg-emerald-50/70`}>
                <span className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <Wallet size={16} />
                    {isCash ? 'Otrzymujesz' : isUoP ? 'Na rękę (szacunkowo)' : 'Na rękę'}
                </span>
                <span className="text-xl font-extrabold text-emerald-800 tracking-tight">{formatCurrency(breakdown.net)}</span>
            </div>
            {isCash && <p className="px-4 py-2 text-[11px] text-ink-muted">Bez potrąceń. Transakcja prywatna, nie wchodzi do rozliczeń PIT.</p>}
        </div>
    );
}

function Line({ label, value, strong = false, muted = false }) {
    return (
        <div className={`flex justify-between gap-3 ${strong ? 'text-ink font-semibold' : muted ? 'text-ink-muted' : 'text-ink-soft'}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
