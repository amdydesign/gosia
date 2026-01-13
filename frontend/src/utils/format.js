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

// Truncate text
export function truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
