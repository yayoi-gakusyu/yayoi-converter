import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BankLogicService } from './bank-logic.service';

vi.mock('@angular/core', async () => {
    const actual = await vi.importActual('@angular/core');
    return {
        ...actual,
        inject: () => ({}),
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
