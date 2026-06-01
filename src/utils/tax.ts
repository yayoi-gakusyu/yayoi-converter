
export function calculateTax(amount: number, taxRate: number = 0.1): number {
  const absAmount = Math.abs(amount);
  return Math.floor((absAmount * taxRate / (1 + taxRate)) + 0.000001);
}

export function detectTaxRate(taxCategory: string): number {
  if (!taxCategory) return 0;
  if (taxCategory.match(/[1１][0０][%％]/)) return 0.1;
  if (taxCategory.match(/[8８][%％]/)) return 0.08;
  return 0;
}

export function calculateTaxFromCategory(amount: number, taxCategory: string, taxType: string): number {
    const rate = detectTaxRate(taxCategory);
    if (rate > 0) {
       return calculateTax(amount, rate);
    }
    return 0;
}

export const TAX_CATEGORIES_EXPENSE = [
    '課対仕入10%',
    '課対仕入8%(軽)',
    '対象外',
    '非課税仕入'
];

export const TAX_CATEGORIES_INCOME = [
    '課税売上10%',
    '課税売上8%(軽)',
    '対象外',
    '非課税売上'
];
