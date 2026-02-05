
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModeService } from '../services/mode.service';

@Component({
  selector: 'app-matching-settings',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-8">

      <!-- Instructions -->
      <div [class]="'rounded-xl p-5 text-sm text-slate-700 leading-relaxed shadow-sm border ' + instructionBg()">
        <h3 [class]="'font-bold mb-2 flex items-center gap-2 ' + instructionTitle()">
           ℹ️ ルール設定の使い方
        </h3>
        <p>
          ここでは「{{ keywordLabel() }}」に含まれるキーワードと、自動適用したい勘定科目のルールを管理します。<br>
          よく使う{{ targetLabel() }}を登録しておくと、AI変換時に自動で科目がセットされ、修正の手間が省けます。<br>
          <span class="text-xs text-slate-500 mt-1 block">※変換結果画面で科目を修正した際にも、自動的にここへルールが追加（学習）されます。</span>
        </p>
      </div>

      <!-- Expense Rules Section -->
      <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span [class]="'p-1 rounded text-lg ' + ruleIconBg()">{{ expenseIcon() }}</span>
          <span>{{ expenseTitle() }}</span>
        </h3>

        <div class="overflow-x-auto bg-white rounded-lg border border-slate-200 mb-4 shadow-sm">
          <table class="w-full border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="p-3 text-left text-xs font-semibold text-slate-500 w-[40%]">{{ keywordLabel() }}に含まれる文字</th>
                <th class="p-3 text-left text-xs font-semibold text-slate-500 w-[40%]">勘定科目</th>
                <th class="p-3 w-[20%]"></th>
              </tr>
            </thead>
            <tbody>
              @for (rule of svc().expenseRules(); track $index) {
                <tr class="border-b border-slate-100 group hover:bg-slate-50 transition-colors" [class.bg-red-50]="!rule.account">
                  <td class="p-2">
                    <input
                      type="text"
                      [ngModel]="rule.keyword"
                      (ngModelChange)="updateExpenseRule($index, 'keyword', $event)"
                      [style.--tw-ring-color]="accentColor()"
                      class="w-full p-2 border border-slate-200 rounded text-sm text-slate-800 bg-white focus:outline-none focus:border-current focus:ring-1"
                      [placeholder]="keywordPlaceholder()">
                  </td>
                  <td class="p-2">
                    <select
                      [ngModel]="rule.account"
                      (ngModelChange)="updateExpenseRule($index, 'account', $event)"
                      [class.border-red-300]="!rule.account"
                      [class.bg-red-50]="!rule.account"
                      class="w-full p-2 border border-slate-200 rounded text-sm text-slate-800 bg-white focus:outline-none focus:ring-1">
                      <option value="">(未選択)</option>
                      @for (acc of svc().expenseAccountOptions(); track acc) {
                        <option [value]="acc">{{ acc }}</option>
                      }
                    </select>
                  </td>
                  <td class="p-2 text-center">
                    <button (click)="deleteExpenseRule($index)" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <button
          (click)="addExpenseRule()"
          class="w-full py-2 bg-white text-slate-600 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
          <span>＋</span> {{ addExpenseLabel() }}
        </button>
      </section>

      <!-- Income Rules Section (Bank mode only) -->
      @if (modeService.modeConfig().hasIncomeRules) {
        <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span class="bg-green-100 text-green-600 p-1 rounded text-lg">💰</span>
            <span>入金ルール</span>
          </h3>

          <div class="overflow-x-auto bg-white rounded-lg border border-slate-200 mb-4 shadow-sm">
            <table class="w-full border-collapse">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="p-3 text-left text-xs font-semibold text-slate-500 w-[40%]">摘要に含まれる文字</th>
                  <th class="p-3 text-left text-xs font-semibold text-slate-500 w-[40%]">勘定科目</th>
                  <th class="p-3 w-[20%]"></th>
                </tr>
              </thead>
              <tbody>
                @for (rule of bankSvc().incomeRules(); track $index) {
                  <tr class="border-b border-slate-100 group hover:bg-slate-50 transition-colors" [class.bg-red-50]="!rule.account">
                    <td class="p-2">
                      <input
                        type="text"
                        [ngModel]="rule.keyword"
                        (ngModelChange)="updateIncomeRule($index, 'keyword', $event)"
                        class="w-full p-2 border border-slate-200 rounded text-sm text-slate-800 bg-white focus:outline-none focus:border-[#667eea] focus:ring-1 focus:ring-[#667eea]"
                        placeholder="例: 振込">
                    </td>
                    <td class="p-2">
                      <select
                        [ngModel]="rule.account"
                        (ngModelChange)="updateIncomeRule($index, 'account', $event)"
                        [class.border-red-300]="!rule.account"
                        [class.bg-red-50]="!rule.account"
                        class="w-full p-2 border border-slate-200 rounded text-sm text-slate-800 bg-white focus:outline-none focus:border-[#667eea] focus:ring-1 focus:ring-[#667eea]">
                        <option value="">(未選択)</option>
                        @for (acc of bankSvc().incomeAccountOptions(); track acc) {
                          <option [value]="acc">{{ acc }}</option>
                        }
                      </select>
                    </td>
                    <td class="p-2 text-center">
                      <button (click)="deleteIncomeRule($index)" class="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <button
            (click)="addIncomeRule()"
            class="w-full py-2 bg-white text-slate-600 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-[#667eea] hover:border-[#667eea] transition-colors flex items-center justify-center gap-2">
            <span>＋</span> 入金ルールを追加
          </button>
        </section>
      }

      <div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs text-center">
        💡 変換時に見つかった新しい{{ targetLabel() }}は自動的に追加されます。赤色の(未選択)項目に科目を設定してください。
      </div>
    </div>
  `
})
export class MatchingSettingsComponent {
  modeService = inject(ModeService);

  svc() { return this.modeService.activeService(); }
  bankSvc() { return this.modeService.activeService() as any; }
  accentColor() { return this.modeService.modeConfig().accentColor; }

  instructionBg() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return 'bg-amber-50 border-amber-100';
    if (mode === 'bank') return 'bg-blue-50 border-blue-100';
    return 'bg-emerald-50 border-emerald-100';
  }
  instructionTitle() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return 'text-amber-800';
    if (mode === 'bank') return 'text-blue-800';
    return 'text-emerald-800';
  }
  keywordLabel() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '利用店名';
    if (mode === 'bank') return '摘要';
    return '店名';
  }
  targetLabel() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '利用先';
    if (mode === 'bank') return '取引';
    return '店名';
  }
  keywordPlaceholder() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '例: Amazon';
    if (mode === 'bank') return '例: 電話';
    return '例: コンビニ';
  }
  ruleIconBg() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return 'bg-amber-100 text-amber-600';
    if (mode === 'bank') return 'bg-blue-100 text-blue-600';
    return 'bg-emerald-100 text-emerald-600';
  }
  expenseIcon() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '💳';
    if (mode === 'bank') return '💸';
    return '🧾';
  }
  expenseTitle() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '経費ルール（利用明細→勘定科目）';
    if (mode === 'bank') return '出金（支払い）ルール';
    return '経費ルール（店名→勘定科目）';
  }
  addExpenseLabel() {
    const mode = this.modeService.activeMode();
    if (mode === 'bank') return '出金ルールを追加';
    return 'ルールを追加';
  }

  // Expense rules - unified interface (all modes have these)
  updateExpenseRule(index: number, field: string, value: any) {
    const mode = this.modeService.activeMode();
    if (mode === 'bank') {
      (this.svc() as any).updateRule('expense', index, field, value);
    } else {
      (this.svc() as any).updateRule(index, field, value);
    }
  }
  deleteExpenseRule(index: number) {
    const mode = this.modeService.activeMode();
    if (mode === 'bank') {
      (this.svc() as any).deleteRule('expense', index);
    } else {
      (this.svc() as any).deleteRule(index);
    }
  }
  addExpenseRule() {
    const mode = this.modeService.activeMode();
    if (mode === 'bank') {
      (this.svc() as any).addRule('expense');
    } else {
      (this.svc() as any).addRule();
    }
  }

  // Income rules - bank only
  updateIncomeRule(index: number, field: string, value: any) {
    (this.svc() as any).updateRule('income', index, field, value);
  }
  deleteIncomeRule(index: number) {
    (this.svc() as any).deleteRule('income', index);
  }
  addIncomeRule() {
    (this.svc() as any).addRule('income');
  }
}
