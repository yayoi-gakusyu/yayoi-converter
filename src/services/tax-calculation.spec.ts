import { describe, it, expect } from 'vitest';

// Helper function to replicate the logic used in services (robust version)
function calculateTax(amount: number, taxType: string, taxCategory: string): string {
    const absAmount = Math.abs(amount);
    let rate = 0;
    // Robust tax rate detection
    if (taxCategory.match(/[1１]0[%％]/)) rate = 0.1;
    else if (taxCategory.match(/[8８][%％]/)) rate = 0.08;

    if (rate > 0 && taxType === 'standard') {
        const tax = Math.floor(absAmount * rate / (1 + rate));
        return tax > 0 ? tax.toString() : '';
    }
    return '';
}

describe('Tax Calculation Logic', () => {
    it('should calculate 10% tax correctly (inclusive)', () => {
        expect(calculateTax(1100, 'standard', '課対仕入10%')).toBe('100');
        expect(calculateTax(2200, 'standard', '課対仕入10%')).toBe('200');
    });

    it('should handle wide characters (１０％)', () => {
        expect(calculateTax(1100, 'standard', '課対仕入１０％')).toBe('100');
    });

    it('should calculate 8% tax correctly (inclusive)', () => {
        expect(calculateTax(1080, 'standard', '課対仕入8%')).toBe('80');
    });

    it('should handle wide characters (８％)', () => {
        expect(calculateTax(1080, 'standard', '課対仕入８％')).toBe('80');
    });

    it('should return empty for exempt or non-standard tax types', () => {
        expect(calculateTax(1000, 'exempt', '課対仕入10%')).toBe('');
        expect(calculateTax(1000, 'standard', '対象外')).toBe('');
    });
});
