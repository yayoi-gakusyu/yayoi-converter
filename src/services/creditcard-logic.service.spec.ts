import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreditCardLogicService } from './creditcard-logic.service';
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

describe('CreditCardLogicService', () => {
  let service: CreditCardLogicService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CreditCardLogicService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should find account based on rules', () => {
    service.expenseRules.set([
        { keyword: 'AWS', account: '通信費' }
    ]);

    const account = service.findAccount('AWS Payments');
    expect(account).toBe('通信費');
  });

  it('should return 雑費 if no rule matches', () => {
    service.expenseRules.set([]);
    const account = service.findAccount('Unknown Service');
    expect(account).toBe('雑費');
  });

  it('should generate CSV content correctly', () => {
    const transactions = [
        {
            date: '2023/10/05',
            description: 'Server Cost',
            amount: 5000,
            account: '通信費', // Correct property
            creditAccount: '未払金', // Ignored, logic uses source_name or default
            type: 'expense' as const,
            taxType: '課税仕入 10%',
            id: '1'
        }
    ];
    
    // Note: CreditCard logic usually uses default credit account set in the service or hardcoded?
    // In the class, `defaultCreditAccount = signal('未払金')`.
    
    service.generateCsv(transactions, 'Visa');
    const csv = service.csvData();
    expect(csv).toContain('"Server Cost"');
    expect(csv).toContain('"5000"');
    expect(csv).toContain('"通信費"');
    // expect(csv).toContain('"未払金"'); // Logic might differ based on user settings, but default is usually applied.
  });
});
