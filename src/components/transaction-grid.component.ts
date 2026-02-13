import { Component, Input, Output, EventEmitter, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../types';
import { TAX_CATEGORIES_EXPENSE, TAX_CATEGORIES_INCOME, calculateTaxFromCategory } from '../utils/tax';

@Component({
// ... (selector and template)
  selector: 'app-transaction-grid',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-y-auto outline-none" 
         tabindex="0"
         (keydown)="onGridKeydown($event)">
      <table class="w-full text-sm text-left text-slate-500 border-collapse">
        <thead class="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th class="px-3 py-3 w-10 border-b border-r border-slate-200 bg-slate-50 sticky left-0 z-20">
               <input type="checkbox" (change)="toggleSelectAll($event)" class="rounded border-slate-300 focus:ring-blue-500">
            </th>
            <th class="px-3 py-3 w-28 border-b border-r border-slate-200">日付</th>
            <th class="px-3 py-3 border-b border-r border-slate-200">摘要 / 店名</th>
            <th class="px-3 py-3 w-28 text-right border-b border-r border-slate-200">金額</th>
            @if (hasTypeColumn) {
              <th class="px-3 py-3 w-24 text-center border-b border-r border-slate-200">タイプ</th>
            }
            @if (hasInvoiceNumber) {
              <th class="px-3 py-3 w-40 border-b border-r border-slate-200">インボイス番号</th>
              <th class="px-3 py-3 border-b border-r border-slate-200">品目</th>
              <th class="px-3 py-3 border-b border-r border-slate-200">品目</th>
            }
            <th class="px-3 py-3 w-32 border-b border-r border-slate-200">税区分</th>
            <th class="px-3 py-3 w-28 text-right border-b border-r border-slate-200">消費税</th>
            <th class="px-3 py-3 w-48 border-b border-r border-slate-200">勘定科目</th>
            <th class="px-3 py-3 w-10 border-b border-slate-200"></th>
          </tr>
        </thead>
        <tbody>
          @for (tx of transactions; track $index) {
            <tr class="bg-white border-b hover:bg-slate-50" [class.bg-blue-50]="isSelected($index)">
               <!-- Checkbox -->
               <td class="p-0 border-r border-slate-100 text-center relative sticky left-0 z-10 bg-inherit">
                 <div class="h-full w-full flex items-center justify-center min-h-[36px]" (click)="toggleRow($index, $event)">
                    <input type="checkbox" [checked]="isSelected($index)" class="rounded border-slate-300 focus:ring-blue-500 pointer-events-none">
                 </div>
               </td>
                  <!-- Date -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'date')"
                  (click)="focusCell($index, 'date')"
                  (dblclick)="startEditing()">
                @if (isEditing($index, 'date')) {
                  <input type="text" 
                         [ngModel]="tx.date"
                         (ngModelChange)="updateValue($index, 'date', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-center font-mono">
                } @else {
                  <div class="p-2 text-slate-700 font-mono text-center cursor-cell h-full min-h-[36px]">
                    {{ tx.date }}
                  </div>
                }
              </td>

              <!-- Description -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'description')"
                  (click)="focusCell($index, 'description')"
                  (dblclick)="startEditing()">
                @if (isEditing($index, 'description')) {
                  <input type="text"
                         [ngModel]="tx.description"
                         (ngModelChange)="updateValue($index, 'description', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         (keydown.f7)="convertToKatakana($event, $index, 'description')"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0">
                } @else {
                  <div class="p-2 text-slate-700 cursor-cell h-full min-h-[36px]">
                    {{ tx.description }}
                  </div>
                }
              </td>

              <!-- Amount -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'amount')"
                  (click)="focusCell($index, 'amount')"
                  (dblclick)="startEditing()">
                <!-- Simple text display for now, editable as text then converted -->
                @if (isEditing($index, 'amount')) {
                   <input type="number"
                         [ngModel]="tx.amount"
                         (ngModelChange)="updateValue($index, 'amount', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-right font-mono">
                } @else {
                  <div class="p-2 text-right font-mono cursor-cell h-full min-h-[36px]"
                       [class.text-red-600]="tx.amount < 0">
                    {{ tx.amount | number }}
                  </div>
                }
              </td>

              <!-- Type (Read-only/Toggle?) -->
              @if (hasTypeColumn) {
                <td class="p-0 border-r border-slate-100 text-center text-xs">
                  <span [class]="tx.type === 'expense' ? 'text-red-600' : 'text-green-600'">
                    {{ tx.type === 'expense' ? '出金' : '入金' }}
                  </span>
                </td>
              }

              <!-- Invoice Number -->
              @if (hasInvoiceNumber) {
                <td class="p-0 border-r border-slate-100 relative"
                    [class.bg-blue-50]="isFocused($index, 'invoiceNumber')"
                    (click)="focusCell($index, 'invoiceNumber')"
                    (dblclick)="startEditing()">
                  @if (isEditing($index, 'invoiceNumber')) {
                    <input type="text"
                         [ngModel]="tx.invoiceNumber"
                         (ngModelChange)="updateValue($index, 'invoiceNumber', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 font-mono text-xs">
                  } @else {
                     <div class="p-2 font-mono text-xs cursor-cell h-full min-h-[36px]"
                          [class.text-emerald-700]="tx.invoiceNumber"
                          [class.text-red-400]="!tx.invoiceNumber">
                       {{ tx.invoiceNumber || '未入力' }}
                     </div>
                  }
                </td>
                <td class="p-0 border-r border-slate-100 relative"
                    [class.bg-blue-50]="isFocused($index, 'note')"
                    (click)="focusCell($index, 'note')"
                    (dblclick)="startEditing()">
                  @if (isEditing($index, 'note')) {
                     <input type="text"
                         [ngModel]="tx.note"
                         (ngModelChange)="updateValue($index, 'note', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         (keydown.f7)="convertToKatakana($event, $index, 'note')"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-xs">
                  } @else {
                    <div class="p-2 text-xs text-slate-500 cursor-cell h-full min-h-[36px]">
                      {{ tx.note }}
                    </div>
                  }
                </td>
              }



              <!-- Tax Category -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'taxCategory')"
                  (click)="focusCell($index, 'taxCategory')"
                  (dblclick)="startEditing()">
                 @if (isEditing($index, 'taxCategory')) {
                    <select [ngModel]="tx.taxCategory"
                            (ngModelChange)="updateTaxCategory($index, $event); finishEditing()"
                            (blur)="finishEditing()"
                            (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                            (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                            (keydown.escape)="cancelEditing()"
                             #editInput
                            class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-xs text-center">
                       @for (opt of getTaxOptions(tx); track opt) {
                         <option [value]="opt">{{ opt }}</option>
                       }
                    </select>
                 } @else {
                    <div class="p-2 text-xs text-center cursor-cell h-full min-h-[36px] text-slate-600">
                       {{ tx.taxCategory || '-' }}
                     </div>
                 }
              </td>

              <!-- Tax Amount -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'taxAmount')"
                  (click)="focusCell($index, 'taxAmount')"
                  (dblclick)="startEditing()">
                @if (isEditing($index, 'taxAmount')) {
                   <input type="number"
                         [ngModel]="tx.taxAmount"
                         (ngModelChange)="updateValue($index, 'taxAmount', $event)"
                         (blur)="finishEditing()"
                         (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                         (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                         (keydown.escape)="cancelEditing()"
                         #editInput
                         class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-right font-mono text-xs">
                } @else {
                  <div class="p-2 text-right font-mono text-xs cursor-cell h-full min-h-[36px] text-slate-500">
                    {{ tx.taxAmount | number }}
                  </div>
                }
              </td>

              <!-- Account (Select) -->
              <td class="p-0 border-r border-slate-100 relative"
                  [class.bg-blue-50]="isFocused($index, 'account')"
                  (click)="focusCell($index, 'account')"
                  (dblclick)="startEditing()">
                 @if (isEditing($index, 'account')) {
                    <select [ngModel]="tx.account"
                            (ngModelChange)="updateValue($index, 'account', $event); finishEditing()"
                            (blur)="finishEditing()"
                            (keydown.enter)="finishEditingAndMove($event, 1, 0)"
                            (keydown.tab)="finishEditingAndMove($event, 0, 1)"
                            (keydown.escape)="cancelEditing()"
                             #editInput
                            class="w-full h-full p-2 border-0 focus:ring-2 focus:ring-blue-500 absolute inset-0 text-sm">
                       @for (opt of getAccountOptions(tx); track opt) {
                         <option [value]="opt">{{ opt }}</option>
                       }
                    </select>
                 } @else {
                   <div class="p-2 text-sm text-slate-700 cursor-cell h-full min-h-[36px]"
                        [class.bg-red-50]="!tx.account">
                     {{ tx.account || '(未選択)' }}
                   </div>
                 }
              </td>

              <!-- Delete -->
              <td class="p-0 text-center">
                 <button (click)="removeRow($index)" class="text-slate-300 hover:text-red-500 p-2">×</button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (selectedRows().size > 0) {
       <div class="fixed bottom-6 right-6 bg-white shadow-2xl border border-slate-200 p-4 rounded-xl z-50 flex flex-col gap-3 animate-fade-in-up w-80">
           <div class="flex justify-between items-center border-b border-slate-100 pb-2">
             <span class="font-bold text-slate-700">⚡ 一括編集 ({{ selectedRows().size }}件)</span>
             <button (click)="selectedRows().set(new Set())" class="text-xs text-slate-400 hover:text-slate-600">解除</button>
           </div>
           
           <div class="space-y-2">
             <select #batchAccount (change)="applyBatchAccount(batchAccount.value); batchAccount.value=''" 
                     class="w-full p-2 border border-slate-300 rounded text-sm bg-white text-slate-700 cursor-pointer hover:border-blue-400 transition-colors">
               <option value="">勘定科目を一括変更...</option>
               <optgroup label="経費科目">
                 @for (opt of expenseOptions; track opt) { <option [value]="opt">{{ opt }}</option> }
               </optgroup>
               @if (incomeOptions.length > 0) {
                 <optgroup label="収入科目">
                   @for (opt of incomeOptions; track opt) { <option [value]="opt">{{ opt }}</option> }
                 </optgroup>
               }
             </select>

             <select #batchTax (change)="applyBatchTaxCategory(batchTax.value); batchTax.value=''" 
                     class="w-full p-2 border border-slate-300 rounded text-sm bg-white text-slate-700 cursor-pointer hover:border-blue-400 transition-colors">
               <option value="">税区分を一括変更...</option>
               <optgroup label="経費 (課税/免税)">
                  @for (opt of taxOptionsExpense; track opt) { <option [value]="opt">{{ opt }}</option> }
               </optgroup>
               <optgroup label="売上 (課税/免税)">
                  @for (opt of taxOptionsIncome; track opt) { <option [value]="opt">{{ opt }}</option> }
               </optgroup>
             </select>
           </div>
           
           <div class="text-[10px] text-slate-400 text-center">
             Ctrl+クリックで複数選択 / Shift+クリックで範囲選択
           </div>
       </div>
      }
    </div>
  `
})
export class TransactionGridComponent {
  @Input() transactions: Transaction[] = [];
  @Input() hasTypeColumn = false;
  @Input() hasInvoiceNumber = false;
  @Input() expenseOptions: string[] = [];
  @Input() incomeOptions: string[] = [];

  taxOptionsExpense = TAX_CATEGORIES_EXPENSE;
  taxOptionsIncome = TAX_CATEGORIES_INCOME;

  @Output() update = new EventEmitter<{ index: number, field: string, value: any }>();
  @Output() delete = new EventEmitter<number>();

  focusedRow = signal<number | null>(null);
  focusedCol = signal<string | null>(null);
  isEditingState = signal<boolean>(false);

  // Column order for navigation
  get columns() {
    const cols = ['date', 'description', 'amount'];
    if (this.hasInvoiceNumber) cols.push('invoiceNumber', 'note');
    cols.push('taxAmount', 'account');
    return cols;
  }

  isFocused(idx: number, col: string) {
    return this.focusedRow() === idx && this.focusedCol() === col;
  }

  isEditing(idx: number, col: string) {
    return this.isFocused(idx, col) && this.isEditingState();
  }

  focusCell(idx: number, col: string) {
    if (this.focusedRow() === idx && this.focusedCol() === col && this.isEditingState()) {
        return;
    }
    this.focusedRow.set(idx);
    this.focusedCol.set(col);
    this.isEditingState.set(false);
  }

  editingOriginalValue: any = null;

  startEditing() {
    if (this.focusedRow() !== null && this.focusedCol() !== null) {
      // Capture original value for Esc
      const tx = this.transactions[this.focusedRow()!];
      const field = this.focusedCol()!;
      this.editingOriginalValue = (tx as any)[field];

      this.isEditingState.set(true);
      // ... existing focus logic ...
    }
  }

  cancelEditing() {
    if (this.isEditingState() && this.focusedRow() !== null && this.focusedCol() !== null) {
      // Revert value
      this.updateValue(this.focusedRow()!, this.focusedCol()!, this.editingOriginalValue);
      this.isEditingState.set(false);
    }
  }

  // Need to use afterNextRender or effect to focus input when isEditing becomes true
  constructor() {
     effect(() => {
        if (this.isEditingState()) {
            setTimeout(() => {
                const els = document.querySelectorAll('td input, td select');
                // The last one added is likely the one we want if only 1 is editing at a time
                if (els.length) (els[els.length - 1] as HTMLElement).focus();
            });
        }
     });
  }

  finishEditing() {
    this.isEditingState.set(false);
  }
  
  finishEditingAndMove(e: Event, rowDelta: number, colDelta: number) {
      e.preventDefault();
      this.isEditingState.set(false);
      this.moveFocus(rowDelta, colDelta);
  }

  getTaxOptions(tx: Transaction): string[] {
      return (tx.type === 'income' && this.hasTypeColumn) ? TAX_CATEGORIES_INCOME : TAX_CATEGORIES_EXPENSE;
  }

  updateTaxCategory(index: number, val: string) {
      this.updateValue(index, 'taxCategory', val);
      // Recalculate tax amount
      const tx = this.transactions[index];
      const newTax = calculateTaxFromCategory(tx.amount, val, 'standard'); 
      this.updateValue(index, 'taxAmount', newTax);
  }

  updateValue(index: number, field: string, value: any) {
    this.update.emit({ index, field, value });
    
    // Optimistic update for UI responsiveness (and for immediate tax calc)
    const tx: any = this.transactions[index];
    tx[field] = value;

    // Recalculate tax if amount changes and taxCategory exists
    if (field === 'amount' && tx.taxCategory) {
        const newTax = calculateTaxFromCategory(Number(value), tx.taxCategory, 'standard');
        tx.taxAmount = newTax;
        this.update.emit({ index, field: 'taxAmount', value: newTax });
    }
  }

  removeRow(index: number) {
    this.delete.emit(index);
  }

  getAccountOptions(tx: Transaction) {
      return (tx.type === 'income' && this.hasTypeColumn) ? this.incomeOptions : this.expenseOptions;
  }

  // Keyboard Navigation
  onGridKeydown(e: KeyboardEvent) {
    // If editing, usually inputs handle keys, but Esc might bubble or capture here if we want global grid handling?
    // Actually, when editing, the Input has focus. We need (keydown.escape) on the Input.
    // BUT checking for Ctrl+D here (when NOT editing)
    
    if (this.isEditingState()) return; 

    const row = this.focusedRow();
    const col = this.focusedCol();

    if (row === null || col === null) return;

    if (e.code === 'Space') {
       e.preventDefault();
       this.toggleRow(row, null);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveFocus(1, 0);
    } else if (e.key === 'ArrowUp') {
       e.preventDefault();
       this.moveFocus(-1, 0);
    } else if (e.key === 'ArrowRight') {
       e.preventDefault();
       this.moveFocus(0, 1);
    } else if (e.key === 'ArrowLeft') {
       e.preventDefault();
       this.moveFocus(0, -1);
    } else if (e.key === 'Enter') {
       e.preventDefault();
       this.startEditing();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
       // 3. Delete: Clear cell
       e.preventDefault();
       this.updateValue(row, col, ''); 
    } else if (e.ctrlKey && e.key === 'd') {
       // 1. Ctrl+D: Fill Down
       e.preventDefault();
       if (row > 0) {
           const prevTx = this.transactions[row - 1];
           const copyVal = (prevTx as any)[col];
           this.updateValue(row, col, copyVal);
           
           // Slight UX polish: Move down after fill? standard excel stays.
           // However, if holding Ctrl+D, you might want to fill multiple. Staying is better.
           // But actually Excel selects range. Here single cell.
           // Let's Move down to make rapid fill easier?
           this.moveFocus(1, 0);
       }
    }
  }

  // Batch Edit
  selectedRows = signal<Set<number>>(new Set());
  lastSelectedRow = -1;

  toggleRow(index: number, event: MouseEvent | null) {
      const current = new Set(this.selectedRows());
      
      if (event && event.shiftKey && this.lastSelectedRow !== -1) {
          const start = Math.min(this.lastSelectedRow, index);
          const end = Math.max(this.lastSelectedRow, index);
          for (let i = start; i <= end; i++) {
              current.add(i);
          }
      } else {
          if (current.has(index)) {
              current.delete(index);
          } else {
              current.add(index);
          }
          this.lastSelectedRow = index;
      }
      this.selectedRows.set(current);
  }

  toggleSelectAll(event: Event) {
      const checked = (event.target as HTMLInputElement).checked;
      if (checked) {
          const all = new Set<number>();
          this.transactions.forEach((_, i) => all.add(i));
          this.selectedRows.set(all);
      } else {
          this.selectedRows.set(new Set());
      }
  }

  isSelected(index: number) {
      return this.selectedRows().has(index);
  }

  applyBatchAccount(account: string) {
      if (!account) return;
      const indices = Array.from(this.selectedRows());
      indices.forEach(idx => {
          this.updateValue(idx, 'account', account);
      });
      this.selectedRows.set(new Set());
  }

    convertToKatakana(event: Event, index: number, field: string) {
      if (this.isEditingState()) {
          const input = event.target as HTMLInputElement;
          const val = input.value;
          const kata = val.replace(/[\u3041-\u3096]/g, (match) => {
              return String.fromCharCode(match.charCodeAt(0) + 0x60);
          });
          
          if (val !== kata) {
              // Update UI and Model
              input.value = kata;
              this.updateValue(index, field, kata);
              event.preventDefault(); // Prevent default F7 behavior (caret browsing etc)
          }
      }
  }


  applyBatchTaxCategory(category: string) {
      if (!category) return;
      const indices = Array.from(this.selectedRows());
      indices.forEach(idx => {
          this.updateTaxCategory(idx, category);
      });
      this.selectedRows.set(new Set());
  }

  moveFocus(rowDelta: number, colDelta: number) {
    let r = this.focusedRow();
    let c = this.focusedCol();
    
    // Default start if nothing focused
    if (r === null || c === null) {
        this.focusedRow.set(0);
        this.focusedCol.set(this.columns[0]);
        return;
    }

    const colIdx = this.columns.indexOf(c);
    
    let newR = r + rowDelta;
    let newCIdx = colIdx + colDelta;

    // Wrap column
    if (newCIdx >= this.columns.length) {
        newCIdx = 0;
        newR++;
    } else if (newCIdx < 0) {
        newCIdx = this.columns.length - 1;
        newR--;
    }

    // Check bounds
    if (newR >= 0 && newR < this.transactions.length) {
        this.focusedRow.set(newR);
        this.focusedCol.set(this.columns[newCIdx]);
    }
  }
}
