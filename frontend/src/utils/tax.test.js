import { describe, it, expect } from 'vitest';
import { getTaxBreakdown, calculateNetAmount, RATES } from './tax';

describe('getTaxBreakdown', () => {
    it('zwraca zera dla braku kwoty', () => {
        expect(getTaxBreakdown(0, 'umowa_50')).toEqual({ gross: 0, net: 0, details: {} });
        expect(getTaxBreakdown('', 'gotowka')).toEqual({ gross: 0, net: 0, details: {} });
    });

    it('gotówka prywatna — brak potrąceń, netto = brutto', () => {
        const r = getTaxBreakdown(1000, 'gotowka');
        expect(r.net).toBe(1000);
        expect(r.details.tax).toBe(0);
    });

    it('umowa o dzieło 50% KUP: podatek liczony od połowy kwoty', () => {
        const r = getTaxBreakdown(1000, 'umowa_50');
        // KUP = 500, podstawa = 500, PIT 12% = 60, netto = 940
        expect(r.details.kup).toBeCloseTo(500, 2);
        expect(r.details.taxBase).toBeCloseTo(500, 2);
        expect(r.details.tax).toBeCloseTo(60, 2);
        expect(r.net).toBeCloseTo(940, 2);
    });

    it('umowa o dzieło 20% KUP', () => {
        const r = getTaxBreakdown(1000, 'umowa_20');
        // KUP = 200, podstawa = 800, PIT 12% = 96, netto = 904
        expect(r.details.tax).toBeCloseTo(96, 2);
        expect(r.net).toBeCloseTo(904, 2);
    });

    it('Use.me: najpierw prowizja, potem KUP od kwoty po prowizji', () => {
        const r = getTaxBreakdown(1500, 'useme_50');
        // prowizja = 1500 * 0.078 = 117; po prowizji = 1383
        expect(r.details.commission).toBeCloseTo(117, 2);
        expect(r.details.afterCommission).toBeCloseTo(1383, 2);
        // KUP 50% z 1383 = 691.5; podstawa = 691.5; PIT 12% = 82.98
        expect(r.details.kup).toBeCloseTo(691.5, 2);
        expect(r.details.tax).toBeCloseTo(82.98, 2);
        expect(r.net).toBeCloseTo(1383 - 82.98, 2);
    });

    it('Use.me: prowizja nie schodzi poniżej minimum', () => {
        const r = getTaxBreakdown(100, 'useme_50');
        // 100 * 0.078 = 7.8 < 29 -> prowizja = 29
        expect(r.details.commission).toBe(RATES.USEME_MIN_COMMISSION);
    });

    it('umowa o pracę: ZUS, zdrowotna, KUP 250, kwota wolna', () => {
        const r = getTaxBreakdown(5000, 'umowa_praca');
        const zus = 5000 * RATES.ZUS;
        const health = (5000 - zus) * RATES.HEALTH;
        const taxBase = 5000 - zus - RATES.UMOWA_PRACA_KUP;
        const tax = taxBase * RATES.PIT - RATES.TAX_FREE_MONTHLY;
        expect(r.details.zus).toBeCloseTo(zus, 2);
        expect(r.details.health).toBeCloseTo(health, 2);
        expect(r.net).toBeCloseTo(5000 - zus - health - tax, 2);
    });

    it('nieznany typ rozliczenia: netto = brutto', () => {
        const r = getTaxBreakdown(1000, 'other');
        expect(r.net).toBe(1000);
    });
});

describe('calculateNetAmount', () => {
    it('jest zgodne z getTaxBreakdown().net', () => {
        expect(calculateNetAmount(1000, 'umowa_50')).toBeCloseTo(940, 2);
        expect(calculateNetAmount(0, 'umowa_50')).toBe(0);
    });
});
