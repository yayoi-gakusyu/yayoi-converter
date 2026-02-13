import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Rule, JournalPattern } from '../types';
import * as Encoding from 'encoding-japanese';

interface ParsedJournalEntry {
  debitAccount: string;
  debitTaxCategory: string;
  creditAccount: string;
  creditTaxCategory: string;
  description: string;
}

interface LearningResult {
  newRules: JournalPattern[];
  updatedRules: JournalPattern[];
  totalEntries: number;
}

@Injectable({
  providedIn: 'root'
})
export class JournalLearningService {
  private supabase = inject(SupabaseService);
  
  // Signals
  learningRules = signal<Map<string, JournalPattern>>(new Map()); // Key: Description (normalized)
  isProcessing = signal<boolean>(false);
  lastResult = signal<LearningResult | null>(null);
  error = signal<string>('');

  // Pre-defined rules for cold start
  private defaultRules: JournalPattern[] = [
    { targetDescription: 'AMAZON', account: '消耗品費' },
    { targetDescription: 'ETC', account: '旅費交通費' },
    { targetDescription: 'APPLE', account: '通信費' },
  ];

  constructor() {
    this.loadRules();
    
    // Subscribe to Realtime Updates
    this.supabase.subscribeToRules((payload: any) => {
        // payload.new contains the new record
        if (payload.new) {
            const rule = payload.new as Rule;
            this.updateLocalRule(rule);
        }
    });
  }

  // Load rules from Supabase (fallback to defaults if empty initially)
  async loadRules() {
    const rules = await this.supabase.getRules();
    const map = new Map<string, JournalPattern>();
    
    // Always load defaults first
    this.defaultRules.forEach(r => map.set(this.normalize(r.targetDescription), r));

    // Overwrite with Cloud rules
    rules.forEach((r: any) => {
        map.set(this.normalize(r.keyword), {
            targetDescription: r.keyword,
            account: r.account,
            subAccount: r.sub_account,
            taxType: r.tax_type
        });
    });

    this.learningRules.set(map);
  }

  // Helper to update local map from a Rule object
  private updateLocalRule(rule: Rule) {
      const map = new Map(this.learningRules()); // Clone
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

  // Match a transaction description to a rule
  predict(description: string): JournalPattern | null {
    if (!description) return null;
    
    const normalized = this.normalize(description);
    const rules = this.learningRules();

    // 1. Exact Match
    if (rules.has(normalized)) {
      return rules.get(normalized)!;
    }

    // 2. Partial Match (Simple inclusion)
    for (const [key, pattern] of rules.entries()) {
        if (normalized.includes(key)) {
            return pattern;
        }
    }

    return null;
  }

  // Learn a new rule (Upsert to Cloud)
  async learnRule(description: string, account: string, subAccount?: string, taxType?: string) {
    if (!description || !account) return;
    const normalized = this.normalize(description);

    // 1. Optimistic UI Update
    const rule: Rule = {
        keyword: normalized,
        account: account,
        sub_account: subAccount,
        taxCategory: taxType
    };
    this.updateLocalRule(rule);

    // 2. Send to Cloud
    await this.supabase.saveRule(rule);
  }

  deleteRule(description: string) {
      // In cloud mode, maybe we don't delete? Or hard delete?
      // For now, let's just ignore locally or implement delete in SupabaseService later.
  }

  async processFile(file: File) {
    // Keep existing file processing logic if needed, or stub it out as "Cloud Mode Active"
    // For now, let's keep the CSV parsing logic just in case they want to bulk import.
    this.isProcessing.set(true);
    this.error.set('');
    this.lastResult.set(null);

    try {
      const text = await this.readFileAsShiftJIS(file);
      const entries = this.parseCsv(text);
      // For now, just logging entries or maybe auto-learning?
      // Leaving this logic existing just for compilation, but logic might need update.
      // this.lastResult.set(result);
      alert('現在クラウドモードのため、CSV一括登録は調整中です。1件ずつ自動学習されます。');
    } catch (err: any) {
      this.error.set(err.message || '不明なエラー');
    } finally {
      this.isProcessing.set(false);
    }
  }

  private async readFileAsShiftJIS(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    const detected = Encoding.detect(uint8);
    if (detected === 'UNICODE' || detected === 'UTF8') {
      return new TextDecoder('utf-8').decode(uint8);
    }
    const unicodeArray = Encoding.convert(uint8, { to: 'UNICODE', from: 'SJIS' });
    return Encoding.codeToString(unicodeArray);
  }

  private parseCsv(text: string): ParsedJournalEntry[] {
    const lines = text.split(/\r?\n/);
    const entries: ParsedJournalEntry[] = [];
    // ... (simplified or reused existing parser)
    return entries;
  }
}
