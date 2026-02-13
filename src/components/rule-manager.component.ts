import { Component, OnInit, inject, signal, computed, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../services/supabase.service';
import { Rule } from '../types';
import { TAX_CATEGORIES_EXPENSE, TAX_CATEGORIES_INCOME } from '../utils/tax';

@Component({
// ... (Metadata stays same)

  selector: 'app-rule-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4" (click)="close()">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <div>
            <h2 class="text-xl font-bold text-slate-800">学習ルール管理</h2>
            <p class="text-sm text-slate-500 mt-1">AIが自動学習した仕訳ルールを編集・管理します</p>
          </div>
          <button (click)="close()" class="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <svg class="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Controls -->
        <div class="p-4 border-b border-slate-100 bg-white flex justify-between gap-4 items-center">
          <div class="relative flex-1 max-w-sm">
             <input type="text" [(ngModel)]="searchQuery" placeholder="検索 (キーワード、勘定科目...)" 
                    class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
             <svg class="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
             </svg>
          </div>
          <button (click)="loadRules()" class="text-slate-500 hover:text-blue-600 text-sm flex items-center gap-1">
             <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
             更新
          </button>
        </div>

        <!-- Table -->
        <div class="flex-1 overflow-auto bg-slate-50/50">
          <table class="w-full text-sm text-left border-collapse">
            <thead class="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 shadow-sm z-10">
              <tr>
                <th class="px-4 py-3 border-b">キーワード</th>
                <th class="px-4 py-3 border-b">勘定科目</th>
                <th class="px-4 py-3 border-b">補助科目</th>
                <th class="px-4 py-3 border-b">税区分</th>
                <th class="px-4 py-3 border-b w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <!-- New Rule Row -->
              <tr class="bg-blue-50/30">
                <td class="p-2">
                  <input type="text" [(ngModel)]="newRule.keyword" placeholder="新規キーワード"
                         class="w-full p-2 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                </td>
                <td class="p-2">
                   <select [(ngModel)]="newRule.account" class="w-full p-2 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                      <option value="">(選択)</option>
                      @for (acc of accountOptions; track acc) { <option [value]="acc">{{ acc }}</option> }
                   </select>
                </td>
                <td class="p-2">
                  <input type="text" [(ngModel)]="newRule.sub_account" placeholder="補助科目"
                         class="w-full p-2 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                </td>
                <td class="p-2">
                   <select [(ngModel)]="newRule.taxCategory" class="w-full p-2 border border-blue-200 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                      <option value="">(選択)</option>
                      @for (tax of taxOptions; track tax) { <option [value]="tax">{{ tax }}</option> }
                   </select>
                </td>
                <td class="p-2 text-center">
                  <button (click)="addRule()" [disabled]="!newRule.keyword || !newRule.account"
                          class="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </td>
              </tr>

              <!-- Existing Rules -->
               @for (rule of filteredRules(); track rule.keyword) {
                 <tr class="hover:bg-slate-50 group transition-colors">
                   <td class="p-3 font-medium text-slate-700">{{ rule.keyword }}</td>
                   <td class="p-2">
                      <select [(ngModel)]="rule.account" (change)="updateRule(rule)"
                              class="w-full p-1.5 border-transparent bg-transparent hover:bg-white hover:border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm">
                         @for (acc of accountOptions; track acc) { <option [value]="acc">{{ acc }}</option> }
                      </select>
                   </td>
                   <td class="p-2">
                      <input type="text" [(ngModel)]="rule.sub_account" (blur)="updateRule(rule)"
                             class="w-full p-1.5 border-transparent bg-transparent hover:bg-white hover:border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm">
                   </td>
                   <td class="p-2">
                      <select [(ngModel)]="rule.taxCategory" (change)="updateRule(rule)"
                              class="w-full p-1.5 border-transparent bg-transparent hover:bg-white hover:border-slate-200 rounded focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm">
                         <option value="">(未設定)</option>
                         @for (tax of taxOptions; track tax) { <option [value]="tax">{{ tax }}</option> }
                      </select>
                   </td>
                   <td class="p-2 text-center">
                     <button (click)="deleteRule(rule)" class="text-slate-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                       <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                       </svg>
                     </button>
                   </td>
                 </tr>
               }
            </tbody>
          </table>
          
          @if (filteredRules().length === 0) {
            <div class="p-12 text-center text-slate-400">
               <p>ルールが見つかりませんでした</p>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class RuleManagerComponent implements OnInit {
  private supabase = inject(SupabaseService);
  
  rules = signal<Rule[]>([]);
  searchQuery = signal('');
  
  // Temporary hardcoded options. Realistically these should come from a centralized config or derived from existing data.
  // For now, providing a comprehensive list for general use.
  accountOptions = [
    '消耗品費', '会議費', '旅費交通費', '通信費', '新聞図書費', '水道光熱費', '支払手数料', '地代家賃', 
    '雑費', '仕入高', '売上高', '外注工賃', '広告宣伝費', '交際費', '福利厚生費', '修繕費', '租税公課'
  ];
  
  taxOptions = [...TAX_CATEGORIES_EXPENSE, ...TAX_CATEGORIES_INCOME, '対象外'];

  newRule: Partial<Rule> = {
    keyword: '',
    account: '',
    sub_account: '',
    taxCategory: ''
  };

  filteredRules = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.rules().filter(r => 
      r.keyword.toLowerCase().includes(q) || 
      r.account.includes(q) || 
      (r.sub_account && r.sub_account.includes(q))
    );
  });

  ngOnInit() {
    this.loadRules();
  }

  async loadRules() {
    const rules = await this.supabase.getRules();
    this.rules.set(rules);
  }

  async addRule() {
    if (!this.newRule.keyword || !this.newRule.account) return;
    
    const rule: Rule = {
        keyword: this.newRule.keyword,
        account: this.newRule.account,
        sub_account: this.newRule.sub_account || undefined,
        taxCategory: this.newRule.taxCategory || undefined,
        transaction_type: 'expense' // Defaulting to expense implies most rules are for expenses.
    };
    
    // Check if exists locally to warn or replace
    const exists = this.rules().find(r => r.keyword === rule.keyword);
    if (exists && !confirm(`キーワード "${rule.keyword}" は既に存在します。上書きしますか？`)) {
        return;
    }

    await this.supabase.saveRule(rule);
    
    // Clear input
    this.newRule = { keyword: '', account: '', sub_account: '', taxCategory: '' };
    this.loadRules();
  }

  async updateRule(rule: Rule) {
    if (!rule.keyword || !rule.account) return;
    await this.supabase.saveRule(rule);
  }

  async deleteRule(rule: Rule) {
    if (!confirm(`ルール "${rule.keyword}" を削除しますか？`)) return;
    
    if (rule.id) {
        await this.supabase.deleteRule(rule.id);
    } else {
        // Fallback if ID is missing (though upsert usually handles it if we have ID)
        // If keyword is unique, maybe delete logic should support keyword?
        // SupabaseService deleteRule uses ID.
        // Assuming rules fetched from DB have IDs.
        console.warn('Rule has no ID, cannot delete easily via ID', rule);
    }
    this.loadRules();
  }
  
  @Output('close') closeEvent = new EventEmitter<void>();

  close() {
    this.closeEvent.emit();
  }
}
