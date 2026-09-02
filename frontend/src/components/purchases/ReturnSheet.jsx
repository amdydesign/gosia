import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Sheet from '../ui/Sheet';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { apiRequest } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { useToast } from '../../context/ToastContext';
import { useDashboard } from '../../context/DashboardContext';

/**
 * Quick "I returned this" flow: amount refunded -> status returned / partial.
 */
export default function ReturnSheet({ purchase, open, onClose, onDone }) {
    const toast = useToast();
    const { refresh } = useDashboard();
    const [amount, setAmount] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open && purchase) {
            setAmount(String(Number(purchase.amount) || ''));
        }
    }, [open, purchase]);

    if (!purchase) return null;

    const total = Number(purchase.amount) || 0;
    const refunded = parseFloat(amount) || 0;
    const isPartial = total > 0 && refunded > 0 && refunded < total;
    const status = isPartial ? 'partial' : 'returned';

    const submit = async (e) => {
        e?.preventDefault();
        setSaving(true);
        try {
            await apiRequest(`/purchases/update.php?id=${purchase.id}`, 'PUT', {
                status,
                returned_amount: refunded,
            });
            refresh();
            toast.success(isPartial ? `Częściowy zwrot zapisany (${formatCurrency(refunded)})` : `Zwrot do ${purchase.store} zapisany`);
            onDone?.({ ...purchase, status, returned_amount: refunded });
            onClose();
        } catch (err) {
            toast.error(err.message || 'Nie udało się zapisać zwrotu');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Zwrot zakupu"
            description={`${purchase.store} · ${purchase.items}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" className="flex-1" onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button variant="success" className="flex-1" icon={RotateCcw} loading={saving} onClick={submit}>
                        {isPartial ? 'Zapisz częściowy zwrot' : 'Zwrócone'}
                    </Button>
                </>
            }
        >
            <form onSubmit={submit} className="space-y-4 pt-1">
                <Field label="Kwota zwrócona" suffix="zł" hint={total > 0 ? `Zakup: ${formatCurrency(total)}. Wpisz mniej, jeśli zwracasz tylko część.` : null}>
                    <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        className="input !text-lg !font-semibold"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        autoFocus
                    />
                </Field>
                {total > 0 && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setAmount(String(total))} className={`chip ${!isPartial && refunded === total ? 'chip-active' : ''}`}>
                            Całość
                        </button>
                        <button type="button" onClick={() => setAmount(String(Math.round(total / 2)))} className={`chip ${isPartial ? 'chip-active' : ''}`}>
                            Połowa
                        </button>
                        <button type="button" onClick={() => setAmount('0')} className={`chip ${refunded === 0 && amount !== '' ? 'chip-active' : ''}`}>
                            Bez zwrotu pieniędzy
                        </button>
                    </div>
                )}
            </form>
        </Sheet>
    );
}
