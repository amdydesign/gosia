/**
 * Logika podatkowa (PL) dla rozliczeń współprac.
 *
 * ⚠️ STAWKI WYMAGAJĄ WERYFIKACJI Z KSIĘGOWĄ.
 * Wartości poniżej pochodzą z pierwotnej implementacji i były w kodzie
 * opisane jako założenia. Do czasu potwierdzenia wyniki należy traktować
 * jako szacunkowe (patrz TAX_DISCLAIMER). Obowiązują dla roku 2025.
 */

export const TAX_YEAR = 2025;

export const TAX_DISCLAIMER =
    'Wyliczenia mają charakter szacunkowy i wymagają potwierdzenia z księgową.';

// Stawki i kwoty (do weryfikacji)
export const RATES = {
    ZUS: 0.1371,          // składki społeczne (umowa o pracę)
    HEALTH: 0.09,         // składka zdrowotna
    PIT: 0.12,            // zaliczka na PIT (pierwszy próg)
    UMOWA_PRACA_KUP: 250, // miesięczny koszt uzyskania przychodu (UoP)
    TAX_FREE_MONTHLY: 300, // miesięczna kwota zmniejszająca podatek (1/12 z 3600)
    USEME_COMMISSION: 0.078, // prowizja Use.me
    USEME_MIN_COMMISSION: 29, // minimalna prowizja Use.me (zł)
};

// Sposoby rozliczenia (współdzielone z UI i backendowym Validatorem)
export const BILLING_TYPES = {
    umowa_50: { label: 'Umowa o Dzieło (50% KUP)', kup: 0.50, tax: RATES.PIT },
    umowa_20: { label: 'Umowa o Dzieło (20% KUP)', kup: 0.20, tax: RATES.PIT },
    useme_50: { label: 'Use.me (50% KUP)', kup: 0.50, useme: true },
    useme_20: { label: 'Use.me (20% KUP)', kup: 0.20, useme: true },
    umowa_praca: { label: 'Umowa o pracę', tax: RATES.PIT, private: false },
    gotowka: { label: 'Gotówka prywatna (nieformalna)', private: true },
};

function emptyBreakdown(gross, type) {
    return {
        gross,
        net: gross,
        type,
        details: { commission: 0, afterCommission: gross, kup: 0, taxBase: 0, tax: 0, zus: 0, health: 0 },
    };
}

/**
 * Pełny rozkład potrąceń dla kwoty brutto i sposobu rozliczenia.
 */
export function getTaxBreakdown(grossInput, type) {
    const gross = parseFloat(grossInput || 0);
    if (!gross) return { gross: 0, net: 0, details: {} };

    const result = emptyBreakdown(gross, type);

    const config = BILLING_TYPES[type];
    if (!config) return result;

    // Gotówka prywatna — brak potrąceń
    if (config.private) return result;

    // Umowa o pracę
    if (type === 'umowa_praca') {
        const zus = gross * RATES.ZUS;
        const health = (gross - zus) * RATES.HEALTH;
        const kup = RATES.UMOWA_PRACA_KUP;
        const taxBase = Math.max(0, gross - zus - kup);
        const tax = Math.max(0, taxBase * RATES.PIT - RATES.TAX_FREE_MONTHLY);

        result.details.zus = zus;
        result.details.health = health;
        result.details.kup = kup;
        result.details.taxBase = taxBase;
        result.details.tax = tax;
        result.net = gross - zus - health - tax;
        return result;
    }

    // Umowa o dzieło / Use.me
    let currentAmount = gross;

    if (config.useme) {
        let commission = currentAmount * RATES.USEME_COMMISSION;
        if (commission < RATES.USEME_MIN_COMMISSION) commission = RATES.USEME_MIN_COMMISSION;
        if (commission > currentAmount) commission = currentAmount; // edge case: bardzo mała kwota
        result.details.commission = commission;
        currentAmount -= commission;
        result.details.afterCommission = currentAmount;
    }

    const kupAmount = currentAmount * (config.kup || 0);
    result.details.kup = kupAmount;

    const taxBase = currentAmount - kupAmount;
    result.details.taxBase = taxBase;

    const tax = taxBase * (config.tax || RATES.PIT);
    result.details.tax = tax;

    result.net = currentAmount - tax;
    return result;
}

/**
 * Kwota netto ("do ręki").
 */
export function calculateNetAmount(gross, type) {
    if (!gross) return 0;
    return getTaxBreakdown(gross, type).net;
}
