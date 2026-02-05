
import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModeService } from '../services/mode.service';

@Component({
  selector: 'app-master-settings',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-8">

      <!-- Instructions -->
      <div [class]="'rounded-xl p-5 text-sm text-slate-700 leading-relaxed shadow-sm border ' + instructionBg()">
        <h3 [class]="'font-bold mb-2 flex items-center gap-2 ' + instructionTitle()">
           ℹ️ マスター設定の使い方
        </h3>
        <p>
          ここでは、選択肢として表示される{{ masterTarget() }}のリストを編集できます。<br>
          お使いの会計ソフトに合わせて、必要な科目を追加したり、不要な科目を削除したりしてカスタマイズしてください。<br>
          <span class="text-xs text-slate-500 mt-1 block">※ここに追加した項目は、変換結果の編集時やルール設定時に選択肢として表示されます。</span>
        </p>
      </div>

      <!-- Cards (CC mode only) -->
      @if (modeService.modeConfig().hasCardSelection) {
        <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span class="bg-amber-100 text-amber-600 p-1 rounded text-lg">💳</span>
            <span>カード名（補助科目）設定</span>
          </h3>
          <div class="flex gap-2 mb-4">
            <input
              type="text"
              [(ngModel)]="newCard"
              (keyup.enter)="addCard()"
              class="flex-1 p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="新しいカード名を入力">
            <button (click)="addCard()" class="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-500">追加</button>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (item of ccSvc().cardOptions(); track item) {
              <div class="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2 text-sm text-slate-700 shadow-sm">
                {{ item }}
                <button type="button" (click)="removeCard(item)" class="text-slate-400 hover:text-red-500 font-bold px-1 rounded hover:bg-slate-100 transition-colors">×</button>
              </div>
            }
          </div>
        </section>
      }

      <!-- Banks (Bank mode only) -->
      @if (modeService.modeConfig().hasBankSelection) {
        <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span class="bg-slate-200 text-slate-600 p-1 rounded text-lg">🏦</span>
            <span>銀行口座（補助科目）設定</span>
          </h3>
          <div class="flex gap-2 mb-4">
            <input
              type="text"
              [(ngModel)]="newBank"
              (keyup.enter)="addBank()"
              class="flex-1 p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="新しい銀行名を入力">
            <button (click)="addBank()" class="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-600">追加</button>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (item of bankSvc().bankOptions(); track item) {
              <div class="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2 text-sm text-slate-700 shadow-sm">
                {{ item }}
                <button type="button" (click)="removeBank(item)" class="text-slate-400 hover:text-red-500 font-bold px-1 rounded hover:bg-slate-100 transition-colors">×</button>
              </div>
            }
          </div>
        </section>
      }

      <!-- Expense Accounts (all modes) -->
      <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span class="bg-blue-100 text-blue-600 p-1 rounded text-lg">💸</span>
          <span>{{ expenseAccountLabel() }}</span>
        </h3>
        <div class="flex gap-2 mb-4">
          <input
            type="text"
            [(ngModel)]="newExpense"
            (keyup.enter)="addExpenseAccount()"
            class="flex-1 p-2 border border-slate-300 rounded-lg text-sm"
            placeholder="新しい勘定科目を入力">
          <button (click)="addExpenseAccount()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500">追加</button>
        </div>
        <div class="flex flex-wrap gap-2">
          @for (item of svc().expenseAccountOptions(); track item) {
            <div class="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2 text-sm text-slate-700 shadow-sm">
              {{ item }}
              <button type="button" (click)="removeExpenseAccount(item)" class="text-slate-400 hover:text-red-500 font-bold px-1 rounded hover:bg-slate-100 transition-colors">×</button>
            </div>
          }
        </div>
      </section>

      <!-- Income Accounts (Bank mode only) -->
      @if (modeService.modeConfig().hasIncomeRules) {
        <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span class="bg-green-100 text-green-600 p-1 rounded text-lg">💰</span>
            <span>入金用 勘定科目設定</span>
          </h3>
          <div class="flex gap-2 mb-4">
            <input
              type="text"
              [(ngModel)]="newIncome"
              (keyup.enter)="addIncomeAccount()"
              class="flex-1 p-2 border border-slate-300 rounded-lg text-sm"
              placeholder="新しい勘定科目を入力">
            <button (click)="addIncomeAccount()" class="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-500">追加</button>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (item of bankSvc().incomeAccountOptions(); track item) {
              <div class="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center gap-2 text-sm text-slate-700 shadow-sm">
                {{ item }}
                <button type="button" (click)="removeIncomeAccount(item)" class="text-slate-400 hover:text-red-500 font-bold px-1 rounded hover:bg-slate-100 transition-colors">×</button>
              </div>
            }
          </div>
        </section>
      }

      <!-- AI Prompt Editor (Advanced) -->
      <section class="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 class="text-md font-bold text-slate-700 mb-4 flex items-center gap-2">
          <span class="bg-purple-100 text-purple-600 p-1 rounded text-lg">🤖</span>
          <span>AIプロンプト設定（上級者向け）</span>
        </h3>
        <div class="mb-3 text-xs text-slate-500 bg-white p-3 rounded border border-slate-200">
          <p class="font-bold mb-1">利用可能なプレースホルダー（自動置換）:</p>
          <code class="bg-slate-100 px-1 py-0.5 rounded text-slate-700">{{ placeholders() }}</code>
          <p class="mt-2 text-slate-400">※プレースホルダー以外の部分は自由に変更できますが、JSON形式の出力指示を削除すると動作しなくなる可能性があります。</p>
        </div>
        <textarea
          [(ngModel)]="editingPrompt"
          class="w-full h-96 p-3 border border-slate-300 rounded-lg text-sm font-mono leading-relaxed focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          placeholder="AIへの指示を入力..."
        ></textarea>
        <div class="flex justify-end gap-2 mt-4">
          <button (click)="resetPrompt()" class="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-50">初期値に戻す</button>
          <button (click)="savePrompt()" class="bg-purple-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-purple-500 shadow-sm">保存する</button>
        </div>
      </section>

      <div class="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs text-center">
        💡 リストから削除しても、すでに設定済みのマッチング設定や履歴は変更されません。
      </div>
    </div>
  `
})
export class MasterSettingsComponent {
  modeService = inject(ModeService);

  newCard = '';
  newBank = '';
  newExpense = '';
  newIncome = '';

  svc() { return this.modeService.activeService(); }
  ccSvc() { return this.modeService.activeService() as any; }
  bankSvc() { return this.modeService.activeService() as any; }

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
  masterTarget() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '「カード名」や「勘定科目」';
    if (mode === 'bank') return '「銀行名」や「勘定科目」';
    return '「勘定科目」';
  }
  expenseAccountLabel() {
    const mode = this.modeService.activeMode();
    if (mode === 'bank') return '出金用 勘定科目設定';
    return '経費用 勘定科目設定';
  }

  addCard() {
    this.ccSvc().addItem('card', this.newCard);
    this.newCard = '';
  }
  removeCard(item: string) {
    this.ccSvc().removeItem('card', item);
  }

  addBank() {
    this.bankSvc().addItem('bank', this.newBank);
    this.newBank = '';
  }
  removeBank(item: string) {
    this.bankSvc().removeItem('bank', item);
  }

  addExpenseAccount() {
    this.svc().addItem('expenseAccount', this.newExpense);
    this.newExpense = '';
  }
  removeExpenseAccount(item: string) {
    this.svc().removeItem('expenseAccount', item);
  }

  addIncomeAccount() {
    this.bankSvc().addItem('incomeAccount', this.newIncome);
    this.newIncome = '';
  }
  removeIncomeAccount(item: string) {
    this.bankSvc().removeItem('incomeAccount', item);
  }

  editingPrompt = '';

  constructor() {
    effect(() => {
      // Sync local state when service state changes (e.g. initial load or switching modes)
      const svc = this.svc() as any;
      if (svc && svc.customPromptTemplate) {
        this.editingPrompt = svc.customPromptTemplate();
      }
    });
  }

  placeholders() {
    const mode = this.modeService.activeMode();
    if (mode === 'creditcard') return '{{year}}, {{account_list}}';
    if (mode === 'bank') return '{{year}}, {{expense_account_list}}, {{income_account_list}}';
    return '{{year}}, {{account_list}}';
  }

  savePrompt() {
    const svc = this.svc() as any;
    if (svc && svc.updatePromptTemplate) {
      svc.updatePromptTemplate(this.editingPrompt);
      alert('プロンプト設定を保存しました。');
    }
  }

  resetPrompt() {
    if (confirm('初期値（デフォルト）に戻してもよろしいですか？')) {
      const svc = this.svc() as any;
      if (svc && svc.resetPromptTemplate) {
        svc.resetPromptTemplate();
        this.editingPrompt = svc.customPromptTemplate();
      }
    }
  }
}
