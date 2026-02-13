import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BankLogicService } from './bank-logic.service';
import { SupabaseService } from './supabase.service';

// Mock SupabaseService
const mockSupabase = {
  getRules: vi.fn(),
  getTransactions: vi.fn(),
  subscribeToChanges: vi.fn(),
} as unknown as SupabaseService;

// Mock Angular injections if needed
// Since we are testing logic, we might need to bypass Angular's DI or mock it.
// However, BankLogicService uses `inject()` from @angular/core.
// In a pure unit test environment without Angular TestBed, `inject()` might fail.
// For now, let's create a partial mock or see if we can instantiate it.
// 
// Actually, since `inject` is used in field initialization:
// private supabase = inject(SupabaseService);
// We cannot easily instantiate this class with `new BankLogicService()` in a non-Angular environment without a transformation or TestBed.
//
// BUT, since we want to show "Vitest" working quickly, let's create a specific test that MOCKS the `inject` function globally or uses a test helper.

// Let's try to mock @angular/core's inject
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
            // Simple signal mock for testing
            let value = initial;
            const s = (newVal?: any) => {
                if (newVal !== undefined) value = newVal;
                return value;
            };
            s.set = (v: any) => value = v;
            s.update = (fn: any) => value = fn(value);
            return s;
        },
        effect: () => {} // No-op effect
    };
});

describe('BankLogicService', () => {
  let service: BankLogicService;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    service = new BankLogicService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should find account based on default rules', () => {
      // Setup some default rules manually since effect() is mocked
      service.expenseRules.set([
          { keyword: 'Amazon', account: '消耗品費' }
      ]);

      const account = service.findAccount('Amazon利用', true);
      expect(account).toBe('消耗品費');
  });

  it('should return 雑費 if no rule matches for expense', () => {
      service.expenseRules.set([]);
      const account = service.findAccount('Unknown Expense', true);
      expect(account).toBe('雑費');
  });
});
