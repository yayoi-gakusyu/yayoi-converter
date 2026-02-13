import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReceiptLogicService } from './receipt-logic.service';
import { SupabaseService } from './supabase.service';

// Mock SupabaseService
const mockSupabase = {
  getRules: vi.fn(),
  getTransactions: vi.fn(),
  subscribeToChanges: vi.fn(),
} as unknown as SupabaseService;

// Mock @angular/core inject and signals
vi.mock('@angular/core', async () => {
    const actual = await vi.importActual('@angular/core');
    return {
        ...actual,
        inject: (token: any) => {
             if (token === SupabaseService) return mockSupabase;
             return {};
        },
        Injectable: () => (target: any) => target,
        signal: (initial: any) => {
            let value = initial;
            const s = (newVal?: any) => {
                if (newVal !== undefined) value = newVal;
                return value;
            };
            s.set = (v: any) => value = v;
            s.update = (fn: any) => value = fn(value);
            return s;
        },
        effect: () => {}
    };
});

describe('ReceiptLogicService', () => {
  let service: ReceiptLogicService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReceiptLogicService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should find account based on rules', () => {
    service.expenseRules.set([
        { keyword: 'Seven Eleven', account: '消耗品費' }
    ]);

    const account = service.findAccount('Seven Eleven Purchase');
    expect(account).toBe('消耗品費');
  });

  it('should return 雑費 if no rule matches', () => {
    service.expenseRules.set([]);
    const account = service.findAccount('Unknown Store');
    expect(account).toBe('雑費');
  });

  // Test CSV generation (basic)
  it('should generate CSV content correctly', () => {
      const transactions = [
          {
              date: '2023/10/01',
              description: 'Test Receipt',
              amount: 1000,
              account: '消耗品費', // Correct property
              creditAccount: '現金', // This is ignored by interface but logic uses '現金' hardcoded or default
              type: 'expense' as const,
              taxType: '課税売上 10%',
              id: '1'
          }
      ];

      service.generateCsv(transactions);
      const csv = service.csvData();
      expect(csv).toContain('"2000"'); // Check header or identifier
      expect(csv).toContain('"インボイスなし_Test Receipt"');
      expect(csv).toContain('"1000"');
      expect(csv).toContain('"消耗品費"');
  });
});
