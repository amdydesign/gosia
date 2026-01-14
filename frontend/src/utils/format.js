/**
 * Utility functions for formatting
 */

// Format currency (PLN)
export function formatCurrency(amount) {
    if (!amount || amount === 0) return '0 zł';
    return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency: 'PLN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}

// Format date (Polish format)
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

// Get today's date in YYYY-MM-DD format
export function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Get collaboration type label
export function getCollabTypeLabel(type) {
    const types = {
        'post-instagram': 'Post Instagram',
        'story': 'Instagram Stories',
        'reel': 'Reel',
        'sesja': 'Sesja stylizacji',
        'konsultacja': 'Konsultacja',
        'event': 'Event',
        'inne': 'Inne'
    };
    return types[type] || type;
}

// Get payment status info
export function getPaymentStatusInfo(status) {
    const statuses = {
        'pending': { label: 'Oczekująca', className: 'badge-warning' },
        'paid': { label: 'Opłacona', className: 'badge-success' },
        'overdue': { label: 'Zaległa', className: 'badge-danger' }
    };
    return statuses[status] || { label: status, className: 'badge-info' };
}

// Get return urgency info
export function getReturnUrgency(daysRemaining) {
    if (daysRemaining < 0) {
        return { level: 'overdue', className: 'badge-danger', message: 'Przekroczony termin!' };
    } else if (daysRemaining === 0) {
        return { level: 'today', className: 'badge-danger', message: 'Dziś ostatni dzień!' };
    } else if (daysRemaining <= 3) {
        return { level: 'urgent', className: 'badge-danger', message: `Zostały ${daysRemaining} dni` };
    } else if (daysRemaining <= 7) {
        return { level: 'soon', className: 'badge-warning', message: `Zostało ${daysRemaining} dni` };
    } else {
        return { level: 'ok', className: 'badge-success', message: `Zostało ${daysRemaining} dni` };
    }
}

// Get return status info
export function getReturnStatusInfo(status) {
    const statuses = {
        'pending': { label: 'Do zwrotu', className: 'badge-warning' },
        'returned': { label: 'Zwrócone', className: 'badge-success' }
    };
    return statuses[status] || { label: status, className: 'badge-info' };
}

// Billing types
export const BILLING_TYPES = {
    umowa_50: { label: 'Umowa o Dzieło (50% KUP)', kup: 0.50, tax: 0.12 },
    umowa_20: { label: 'Umowa o Dzieło (20% KUP)', kup: 0.20, tax: 0.12 },
    useme_50: { label: 'Use.me (50% KUP)', kup: 0.50, useme: true },
    useme_20: { label: 'Use.me (20% KUP)', kup: 0.20, useme: true },
    gotowka: { label: 'Gotówka prywatna (nieformalna)', private: true }
};

// Calculate net amount (Do ręki)
export function calculateNetAmount(gross, type) {
    if (!gross) return 0;
    const breakdown = getTaxBreakdown(gross, type);
    return breakdown.net;
}

// Get full tax breakdown
export function getTaxBreakdown(grossInput, type) {
    const gross = parseFloat(grossInput || 0);
    if (!gross) return { gross: 0, net: 0, details: {} };

    // Default result structure
    let result = {
        gross: gross,
        net: gross,
        type: type,
        details: {
            commission: 0,
            afterCommission: gross,
            kup: 0,
            taxBase: 0,
            tax: 0
        }
    };

    if (!type || !BILLING_TYPES[type]) return result;
    const config = BILLING_TYPES[type];

    // Gotowka (Private) - No deductions
    if (config.private) {
        return result;
    }

    let currentAmount = gross;

    // 1. Use.me Commission (if applicable)
    if (config.useme) {
        // Commission is 7.8% usually, but let's check exact logic.
        // User mentioned "min 29 zl" in prompt "Use.me minimalna prowizja: Jeśli 7,8% < 29 zł..."
        // Assumption: 7.8% of Gross
        let commission = currentAmount * 0.078;
        if (commission < 29) commission = 29; // Enforce minimum if needed, though user said "show info", usually strict min applies.

        // Cap commission at gross if gross is tiny (edge case)
        if (commission > currentAmount) commission = currentAmount;

        result.details.commission = commission;
        currentAmount -= commission;
        result.details.afterCommission = currentAmount;
    }

    // 2. KUP (Koszt Uzyskania Przychodu)
    // KUP is calculated on the amount *after* commission?
    // Standard Umowa o Dzieło: KUP is % of Gross.
    // Use.me: The prompt says "KROK 2 - Podatek: KUP (50%) -> szary tekst (np. -691,50 zł)".
    // If Step 1 result was 1383 (from 1500), 50% of 1383 is 691.50. So yes, KUP is on the amount AFTER commission.
    const kupRate = config.kup || 0;
    const kupAmount = currentAmount * kupRate;
    result.details.kup = kupAmount;

    // 3. Tax Base (Podstawa opodatkowania)
    const taxBase = Math.round(currentAmount - kupAmount); // Tax base is usually rounded to integer in PL? Or strict math?
    // Let's keep strict float for UI display accuracy, or rounded? User example: 691.50 -> Base 691.50. 
    // In PL tax base is rounded to whole Złotys usually, but for "estimate" we can keep decimals or standard round.
    // Let's use exact for now to match User examples (691.50).
    result.details.taxBase = currentAmount - kupAmount;

    // 4. Tax (Zaliczka na PIT 12%)
    const taxRate = config.tax || 0.12;
    // Tax is calculated on Tax Base
    const taxAmount = result.details.taxBase * taxRate;
    result.details.tax = taxAmount;

    // 5. Net
    result.net = currentAmount - taxAmount;

    return result;
}

// Truncate text
export function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
