
export function calculateTax(amount: number, taxRate: number = 0.1): number {
  const absAmount = Math.abs(amount);
  return Math.floor(absAmount * taxRate / (1 + taxRate));
}

export function detectTaxRate(taxCategory: string): number {
  if (!taxCategory) return 0;
  if (taxCategory.match(/[1１]0[%％]/)) return 0.1;
  if (taxCategory.match(/[8８][%％]/)) return 0.08;
  return 0;
}

export function calculateTaxFromCategory(amount: number, taxCategory: string, taxType: string): number {
    const rate = detectTaxRate(taxCategory);
    // If taxType is exempt or simplified, tax amount is usually 0 for display, 
    // OR we might want to display it for internal tracking, but user request implies 0 for "対象外".
    // "対象外" naturally returns rate 0.
    
    // For exempt/simplified, the logic in services sets category to "対象外" often.
    // But if the user manually selects "課税10%", we probably should show tax even if setting is exempt?
    // Usage: "結果画面で税区分...設定できるように".
    // If user sets global setting to Exempt, services usually force "対象外".
    // If user overrides in grid to "課税", we should probably calc tax.
    
    if (rate > 0) {
       // if global setting is standard, OR if we want to allow override. 
       // For now, let's respect the passed taxType if it suppresses checking, 
       // but strictly speaking, if taxCategory IS "課税...", it implies tax.
       if (taxType === 'standard') return calculateTax(amount, rate);
       
       // If taxType is 'exempt', we usually shouldn't have "課税" category selected.
       // But if we do, maybe we calc it? Let's stick to safe logic:
       // If the Category implies tax, we calculate it. The Service logic decides the default Category based on taxType.
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
