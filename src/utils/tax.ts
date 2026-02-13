
export function calculateTax(amount: number, taxRate: number = 0.1): number {
  const absAmount = Math.abs(amount);
  return Math.floor(absAmount * taxRate / (1 + taxRate));
}

export function detectTaxRate(taxCategory: string): number {
  if (taxCategory.match(/[1１]0[%％]/)) return 0.1;
  if (taxCategory.match(/[8８][%％]/)) return 0.08;
  return 0;
}

export function calculateTaxFromCategory(amount: number, taxCategory: string, taxType: string): number {
    const rate = detectTaxRate(taxCategory);
    if (rate > 0 && taxType === 'standard') {
        return calculateTax(amount, rate);
    }
    return 0;
}
