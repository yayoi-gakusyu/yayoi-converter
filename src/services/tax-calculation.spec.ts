import { describe, it, expect } from 'vitest';

// Helper function to replicate the logic used in services
function calculateTax(amount: number, taxType: string, taxCategory: string): string {
    if (taxType === 'standard' && taxCategory.includes('10%')) {
        return Math.floor(amount * 0.1 / 1.1).toString();
    } else if (taxType === 'standard' && taxCategory.includes('8%')) {
        return Math.floor(amount * 0.08 / 1.08).toString();
    }
    return '';
}

describe('Tax Calculation Logic', () => {
    it('should calculate 10% tax correctly (inclusive)', () => {
        expect(calculateTax(1100, 'standard', '課対仕入10%')).toBe('100');
        expect(calculateTax(2200, 'standard', '課対仕入10%')).toBe('200');
    });

    it('should calculate 8% tax correctly (inclusive)', () => {
        expect(calculateTax(1080, 'standard', '課対仕入8%')).toBe('80');
    });

    it('should return empty for exempt or non-standard tax types', () => {
        expect(calculateTax(1000, 'exempt', '課対仕入10%')).toBe('');
        expect(calculateTax(1000, 'standard', '対象外')).toBe('');
    });
});
