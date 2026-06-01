import { Injectable, signal } from '@angular/core';
import { Rule, JournalPattern } from '../types';

@Injectable({
  providedIn: 'root'
})
export class JournalLearningService {
  private storageKey = 'journal_learning_rules';

  learningRules = signal<Map<string, JournalPattern>>(new Map());
  isProcessing = signal(false);
  lastResult = signal<any>(null);
  error = signal('');

  private defaultRules: JournalPattern[] = [
    { targetDescription: 'AMAZON', account: '消耗品費' },
    { targetDescription: 'ETC', account: '旅費交通費' },
    { targetDescription: 'APPLE', account: '通信費' },
  ];

  constructor() {
    this.loadRules();
  }

  loadRules() {
    const map = new Map<string, JournalPattern>();
    this.defaultRules.forEach(r => map.set(this.normalize(r.targetDescription), r));

    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const rules: Rule[] = JSON.parse(saved);
        rules.forEach(r => {
          map.set(this.normalize(r.keyword), {
            targetDescription: r.keyword,
            account: r.account,
            subAccount: r.sub_account,
            taxType: r.taxCategory
          });
        });
      } catch {}
    }
    this.learningRules.set(map);
  }

  private saveRulesToStorage() {
    const rules: Rule[] = [];
    for (const [, pattern] of this.learningRules()) {
      rules.push({ keyword: pattern.targetDescription, account: pattern.account, sub_account: pattern.subAccount, taxCategory: pattern.taxType });
    }
    localStorage.setItem(this.storageKey, JSON.stringify(rules));
  }

  private updateLocalRule(rule: Rule) {
      const map = new Map(this.learningRules());
      map.set(this.normalize(rule.keyword), {
          targetDescription: rule.keyword,
          account: rule.account,
          subAccount: rule.sub_account,
          taxType: rule.taxCategory
      });
      this.learningRules.set(map);
  }

  private normalize(text: string): string {
    return text.trim();
  }

  predict(description: string): JournalPattern | null {
    if (!description) return null;

    const normalized = this.normalize(description);
    const rules = this.learningRules();

    if (rules.has(normalized)) {
      return rules.get(normalized)!;
    }

    for (const [key, pattern] of rules.entries()) {
        if (normalized.includes(key)) {
            return pattern;
        }
    }

    return null;
  }

  learnRule(description: string, account: string, subAccount?: string, taxType?: string) {
    if (!description || !account) return;
    const rule: Rule = {
        keyword: this.normalize(description),
        account: account,
        sub_account: subAccount,
        taxCategory: taxType
    };
    this.updateLocalRule(rule);
    this.saveRulesToStorage();
  }

  deleteRule(description: string) {
    const map = new Map(this.learningRules());
    map.delete(this.normalize(description));
    this.learningRules.set(map);
    this.saveRulesToStorage();
  }

  async processFile(_file: File) {
    alert('CSV一括登録は現在調整中です。1件ずつ自動学習されます。');
  }
}
