
export interface Transaction {
  date: string;
  description: string;
  amount: number;
  type?: 'expense' | 'income';     // Bank mode only
  note?: string;
  account?: string;
  invoiceNumber?: string;           // Receipt mode only
  // Supabase fields
  id?: string;
  source_type?: 'receipt' | 'bank' | 'credit_card';
  source_name?: string; // Bank name or Card name

  taxAmount?: number;
  taxCategory?: string;
}

export interface Rule {
  keyword: string;
  account: string;
  taxCategory?: string;
  transaction_type?: 'expense' | 'income';
  id?: string;

}

export interface JournalPattern {
  targetDescription: string;
  account: string;
  subAccount?: string;
  taxType?: string;
}

export type TaxType = 'standard' | 'exempt' | 'simplified';

export type AppMode = 'creditcard' | 'bank' | 'receipt';

/**
 * Normalize string for fuzzy matching:
 * - Full-width alphanumeric/symbols → half-width
 * - Full-width spaces → half-width
 * - Trim and lowercase
 */
export function normalizeForMatch(s: string): string {
  return s
    // Full-width alphanumeric → half-width
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // Full-width space → half-width
    .replace(/\u3000/g, ' ')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
