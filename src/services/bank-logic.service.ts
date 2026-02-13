
import { Injectable, signal, effect, inject } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { Rule, Transaction, TaxType, normalizeForMatch } from '../types';
import { SupabaseService } from './supabase.service';
import Encoding from 'encoding-japanese';

export interface PageData {
  id: string;
  image: string;
  rotation: number;
  pageNumber: number;
}

const DEFAULT_EXPENSE_RULES: Rule[] = [
  { keyword: '電話', account: '通信費' },
  { keyword: '通信', account: '通信費' },
  { keyword: '電気', account: '水道光熱費' },
  { keyword: 'ガス', account: '水道光熱費' },
  { keyword: '水道', account: '水道光熱費' },
  { keyword: 'Amazon', account: '消耗品費' },
  { keyword: '家賃', account: '地代家賃' },
  { keyword: '保険', account: '保険料' },
  { keyword: '手数料', account: '支払手数料' },
  { keyword: 'クレジット', account: '未払金' },
  { keyword: '総合振込', account: '給与手当' },
];

const DEFAULT_INCOME_RULES: Rule[] = [
  { keyword: '振込', account: '売上高' },
  { keyword: 'カ）', account: '売上高' },
  { keyword: '利息', account: '受取利息' },
];

const DEFAULT_BANKS = [
  '三菱UFJ銀行', 'みずほ銀行', '三井住友銀行', 'りそな銀行',
  'ゆうちょ銀行', '楽天銀行', '住信SBIネット銀行', 'PayPay銀行', 'その他'
];

const DEFAULT_EXPENSE_ACCOUNTS = [
  '通信費', '水道光熱費', '消耗品費', '地代家賃', '保険料',
  '支払手数料', '旅費交通費', '接待交際費', '広告宣伝費',
  '給与手当', '外注費', '未払金', '租税公課', '修繕費', '新聞図書費', '雑費'
];

const DEFAULT_INCOME_ACCOUNTS = [
  '売上高', '受取利息', '雑収入', '受取配当金'
];

export const DEFAULT_PROMPT_TEMPLATE = `
        提出された通帳の画像（複数枚ある場合は連番）から取引データを読み取り、以下のJSON形式で出力してください。

        【基準年度】
        このデータの基準年度（開始年）は西暦「{{year}}年」です。

        【日付の読み取りと西暦変換ルール（重要）】
        1. 通帳の日付欄に「08-01-23」や「08.01.23」のように数字が記載されている場合、先頭の「08」等は「和暦（令和）」を表しています。これを西暦に変換してください。
           - 変換式: 西暦 = 令和〇年 + 2018
           - 例: 「08」は令和8年なので、西暦2026年になります。(2026/01/23)
        2. 年が省略されている場合は、基準年度「{{year}}年」から開始し、時系列を考慮して年を補完してください。
        3. 出力する日付は必ず西暦の "YYYY/MM/DD" 形式にしてください。

        【その他のルール】
        - 「繰越」の行はスキップしてください
        - 金額はカンマなしの数字のみにしてください
        - 出金（お支払い金額）がある行は type: "expense"
        - 入金（お預かり金額）がある行は type: "income"
        - 複数画像のデータは全て結合し、時系列順の1つのリストにしてください。

        【勘定科目の推測】
        各取引に対して、最も適切な勘定科目を「account」フィールドに推測して設定してください。
        出金の場合の勘定科目: {{expense_account_list}}（判断がつかない場合は「雑費」）
        入金の場合の勘定科目: {{income_account_list}}（判断がつかない場合は「雑収入」）

        【出力形式】
        {
          "transactions": [
            { "date": "{{year}}/05/06", "description": "電話", "amount": 9975, "type": "expense", "note": "携帯電話", "account": "通信費" }
          ]
        }

        JSONのみを出力し、他の説明は不要です。
`;

@Injectable({ providedIn: 'root' })
export class BankLogicService {
  private supabase = inject(SupabaseService);
  
  apiKey = signal<string>('');
  selectedBank = signal<string>('');
  targetYear = signal<number>(new Date().getFullYear());
  taxType = signal<TaxType>('standard');
  simplifiedMethod = signal<'inclusive' | 'exclusive'>('inclusive');
  simplifiedCalcType = signal<'internal' | 'external'>('internal');
  simplifiedBizClass = signal<number>(5);
  simplifiedTaxRate = signal<'10%' | '8%'>('10%');
  showSystemColumns = signal<boolean>(true);
  autoRedirectToEdit = signal<boolean>(true);
  expenseRules = signal<Rule[]>([]);
  incomeRules = signal<Rule[]>([]);
  bankOptions = signal<string[]>([]);
  expenseAccountOptions = signal<string[]>([]);
  incomeAccountOptions = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  pages = signal<PageData[]>([]);
  currentFileName = signal<string>('');
  isPdf = signal<boolean>(false);
  processedTransactions = signal<Transaction[]>([]);
  csvData = signal<string | null>(null);
  modelList = signal<string[]>([]);
  selectedModel = signal<string>('gemini-2.0-flash');
  tokenUsage = signal<{input: number, output: number} | null>(null);
  customPromptTemplate = signal<string>('');

  private prefix = 'bank_';

  constructor() {
    this.loadState();
    this.loadDataFromSupabase();

    effect(() => localStorage.setItem(this.prefix + 'apiKey', this.apiKey()));
    effect(() => localStorage.setItem(this.prefix + 'selectedModel', this.selectedModel()));
    effect(() => localStorage.setItem(this.prefix + 'selectedBank', this.selectedBank()));
    effect(() => localStorage.setItem(this.prefix + 'taxType', this.taxType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedMethod', this.simplifiedMethod()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedCalcType', this.simplifiedCalcType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedBizClass', String(this.simplifiedBizClass())));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedTaxRate', this.simplifiedTaxRate()));
    effect(() => localStorage.setItem(this.prefix + 'showSystemColumns', String(this.showSystemColumns())));
    effect(() => localStorage.setItem(this.prefix + 'autoRedirectToEdit', String(this.autoRedirectToEdit())));
    effect(() => localStorage.setItem(this.prefix + 'autoRedirectToEdit', String(this.autoRedirectToEdit())));
    // effect(() => localStorage.setItem(this.prefix + 'expenseRules', JSON.stringify(this.expenseRules())));
    // effect(() => localStorage.setItem(this.prefix + 'incomeRules', JSON.stringify(this.incomeRules())));

    effect(() => localStorage.setItem(this.prefix + 'bankOptions', JSON.stringify(this.bankOptions())));
    effect(() => localStorage.setItem(this.prefix + 'expenseAccountOptions', JSON.stringify(this.expenseAccountOptions())));
    effect(() => localStorage.setItem(this.prefix + 'incomeAccountOptions', JSON.stringify(this.incomeAccountOptions())));
    effect(() => localStorage.setItem(this.prefix + 'customPromptTemplate', this.customPromptTemplate()));
    effect(() => {
      const show = this.showSystemColumns();
      const tType = this.taxType();
      const sMethod = this.simplifiedMethod();
      const sCalc = this.simplifiedCalcType();
      const sClass = this.simplifiedBizClass();
      const sRate = this.simplifiedTaxRate();
      const expRules = this.expenseRules(); // track rule changes
      const incRules = this.incomeRules(); // track rule changes
      const txs = this.processedTransactions();
      const bank = this.selectedBank();
      if (txs.length > 0 && bank) this.generateCsv(txs, bank);
    });
  }

  private loadState() {
    const s = (key: string) => localStorage.getItem(this.prefix + key);
    // Unified key checking - Prioritize unified key!
    const unifiedKey = localStorage.getItem('unified_apiKey');
    
    // Legacy support
    const legacyApiKey = localStorage.getItem('apiKey');
    if (legacyApiKey && !unifiedKey && !s('apiKey')) {
       localStorage.setItem(this.prefix + 'apiKey', legacyApiKey);
    }

    // Load API Key: Unified > Specific > Legacy
    if (unifiedKey) {
        this.apiKey.set(unifiedKey);
    } else if (s('apiKey')) {
        this.apiKey.set(s('apiKey')!);
    }
    
    // ... rest of legacy migration for other fields ...
    const legacyBank = localStorage.getItem('selectedBank');
    if (legacyBank && !s('selectedBank')) localStorage.setItem(this.prefix + 'selectedBank', legacyBank);
    const legacyKeys = ['taxType', 'simplifiedMethod', 'simplifiedCalcType', 'simplifiedBizClass', 'simplifiedTaxRate',
      'showSystemColumns', 'autoRedirectToEdit', 'expenseRules', 'incomeRules', 'bankOptions', 'expenseAccountOptions', 'incomeAccountOptions'];
    legacyKeys.forEach(k => { const v = localStorage.getItem(k); if (v && !s(k)) localStorage.setItem(this.prefix + k, v); });

    // Load other state
    if (s('selectedModel')) this.selectedModel.set(s('selectedModel')!);
    if (s('selectedBank')) this.selectedBank.set(s('selectedBank')!);
    this.taxType.set((s('taxType') as TaxType) || 'standard');
    if (s('simplifiedMethod')) this.simplifiedMethod.set(s('simplifiedMethod') as any);
    if (s('simplifiedCalcType')) this.simplifiedCalcType.set(s('simplifiedCalcType') as any);
    if (s('simplifiedBizClass')) this.simplifiedBizClass.set(Number(s('simplifiedBizClass')));
    if (s('simplifiedTaxRate')) this.simplifiedTaxRate.set(s('simplifiedTaxRate') as any);
    const showSys = s('showSystemColumns');
    const autoRed = s('autoRedirectToEdit');
    if (showSys !== null) this.showSystemColumns.set(showSys === 'true');
    if (autoRed !== null) this.autoRedirectToEdit.set(autoRed === 'true');
    this.expenseRules.set([...DEFAULT_EXPENSE_RULES]);
    this.incomeRules.set([...DEFAULT_INCOME_RULES]);

    this.bankOptions.set(s('bankOptions') ? JSON.parse(s('bankOptions')!) : [...DEFAULT_BANKS]);
    this.expenseAccountOptions.set(s('expenseAccountOptions') ? JSON.parse(s('expenseAccountOptions')!) : [...DEFAULT_EXPENSE_ACCOUNTS]);
    this.incomeAccountOptions.set(s('incomeAccountOptions') ? JSON.parse(s('incomeAccountOptions')!) : [...DEFAULT_INCOME_ACCOUNTS]);
    
    // Load custom prompt or default
    const savedPrompt = s('customPromptTemplate');
    if (savedPrompt && savedPrompt.trim()) {
      this.customPromptTemplate.set(savedPrompt);
    } else {
      this.customPromptTemplate.set(DEFAULT_PROMPT_TEMPLATE);
    }
  }

  updateApiKey(key: string) { this.apiKey.set(key); localStorage.setItem('unified_apiKey', key); }
  updateSelectedModel(model: string) { this.selectedModel.set(model); }
  
  async fetchModels() {
    const key = this.apiKey();
    if (!key) return;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!response.ok) return;
      const data = await response.json();
      const models = (data.models || [])
        .map((m: any) => m.name.replace('models/', ''))
        .filter((m: string) => m.includes('gemini'));
      this.modelList.set(models);
    } catch (e) {
      console.error('Model fetch failed', e);
    }
  }
  updateBank(bank: string) { this.selectedBank.set(bank); }
  updateTargetYear(year: number) { this.targetYear.set(year); }
  updateTaxType(type: TaxType) { this.taxType.set(type); }
  updateSimplifiedMethod(val: 'inclusive' | 'exclusive') { this.simplifiedMethod.set(val); }
  updateSimplifiedCalcType(val: 'internal' | 'external') { this.simplifiedCalcType.set(val); }
  updateSimplifiedBizClass(val: number) { this.simplifiedBizClass.set(val); }
  updateSimplifiedTaxRate(val: '10%' | '8%') { this.simplifiedTaxRate.set(val); }
  updateShowSystemColumns(show: boolean) { this.showSystemColumns.set(show); }
  updateAutoRedirectToEdit(val: boolean) { this.autoRedirectToEdit.set(val); }
  updatePromptTemplate(template: string) { this.customPromptTemplate.set(template); }
  resetPromptTemplate() { this.customPromptTemplate.set(DEFAULT_PROMPT_TEMPLATE); }

  private async loadDataFromSupabase() {
    // Load rules
    const rules = await this.supabase.getRules();
    if (rules && rules.length > 0) {
      this.expenseRules.set(rules.filter(r => r.transaction_type === 'expense' || !r.transaction_type));
      this.incomeRules.set(rules.filter(r => r.transaction_type === 'income'));
    }

    // Load transactions
    const txs = await this.supabase.getTransactions('bank');
    this.processedTransactions.set(txs);

    // Subscribe
    this.supabase.subscribeToChanges(async () => {
       const newTxs = await this.supabase.getTransactions('bank');
       this.processedTransactions.set(newTxs);
       const newRules = await this.supabase.getRules();
       if (newRules && newRules.length > 0) {
          this.expenseRules.set(newRules.filter(r => r.transaction_type === 'expense' || !r.transaction_type));
          this.incomeRules.set(newRules.filter(r => r.transaction_type === 'income'));
       }
    });
  }

  async setFile(file: File) {
    this.isLoading.set(true);
    this.error.set(null);
    this.currentFileName.set(file.name);
    this.csvData.set(null);
    this.processedTransactions.set([]);
    this.pages.set([]);
    try {
      if (file.type === 'application/pdf') {
        this.isPdf.set(true);
        await this.convertPdfToImages(file);
      } else {
        this.isPdf.set(false);
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          this.pages.set([{ id: crypto.randomUUID(), image: base64, rotation: 0, pageNumber: 1 }]);
          this.isLoading.set(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      this.error.set('ファイルの読み込みに失敗しました: ' + err.message);
      this.isLoading.set(false);
    }
  }

  private async convertPdfToImages(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF処理ライブラリがロードされていません。');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    const newPages: PageData[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      if (!context) throw new Error('Canvas context作成エラー');
      await page.render({ canvasContext: context, viewport }).promise;
      newPages.push({ id: crypto.randomUUID(), image: canvas.toDataURL('image/jpeg', 0.85), rotation: 0, pageNumber: i });
    }
    this.pages.set(newPages);
    this.isLoading.set(false);
  }

  rotatePageLeft(index: number) { this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation - 90 + 360) % 360 }; return n; }); }
  rotatePageRight(index: number) { this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation + 90) % 360 }; return n; }); }
  removePage(index: number) { this.pages.update(pages => pages.filter((_, i) => i !== index)); if (this.pages().length === 0) this.clearAllFiles(); }
  clearAllFiles() { this.pages.set([]); this.currentFileName.set(''); this.csvData.set(null); this.processedTransactions.set([]); }

  addItem(type: 'bank' | 'expenseAccount' | 'incomeAccount', item: string) {
    if (!item.trim()) return;
    const target = type === 'bank' ? this.bankOptions : type === 'expenseAccount' ? this.expenseAccountOptions : this.incomeAccountOptions;
    target.update(list => list.includes(item) ? list : [...list, item]);
  }
  removeItem(type: 'bank' | 'expenseAccount' | 'incomeAccount', item: string) {
    const target = type === 'bank' ? this.bankOptions : type === 'expenseAccount' ? this.expenseAccountOptions : this.incomeAccountOptions;
    target.update(list => list.filter(i => i !== item));
  }
  addRule(type: 'expense' | 'income') {
    this.upsertRule('新しいルール', '雑費', type === 'expense');
  }

  updateRule(type: 'expense' | 'income', index: number, field: keyof Rule, value: string) {
    const rules = type === 'expense' ? this.expenseRules() : this.incomeRules();
    const rule = rules[index];
    const newRule = { ...rule, [field]: value };
    this.upsertRule(newRule.keyword, newRule.account, type === 'expense');
  }

  async deleteRule(type: 'expense' | 'income', index: number) {
    const target = type === 'expense' ? this.expenseRules : this.incomeRules;
    const rules = target();
    const rule = rules[index];
    if (rule.id) {
        await this.supabase.deleteRule(rule.id);
    }
    target.update(rules => rules.filter((_, i) => i !== index));
  }



  findAccount(description: string, isExpense: boolean): string {
    const norm = normalizeForMatch(description);
    const rules = isExpense ? this.expenseRules() : this.incomeRules();
    for (const rule of rules) {
      if (rule.keyword && rule.account && norm.includes(normalizeForMatch(rule.keyword))) return rule.account;
    }
    return isExpense ? '雑費' : '雑収入';
  }

  findMatchingRule(description: string, isExpense: boolean): Rule | undefined {
    const norm = normalizeForMatch(description);
    const rules = isExpense ? this.expenseRules() : this.incomeRules();
    return rules.find(r => r.keyword && r.account && norm.includes(normalizeForMatch(r.keyword)));
  }

  private extractMissingRules(transactions: Transaction[]) {
    const expRules = this.expenseRules();
    const incRules = this.incomeRules();
    const normExpKeys = expRules.map(r => normalizeForMatch(r.keyword));
    const normIncKeys = incRules.map(r => normalizeForMatch(r.keyword));
    const newExp: Rule[] = [];
    const newInc: Rule[] = [];
    const addedExpNorms = new Set<string>();
    const addedIncNorms = new Set<string>();
    transactions.forEach(tx => {
      const desc = tx.description.trim();
      if (!desc) return;
      const normDesc = normalizeForMatch(desc);
      if (tx.type === 'expense') {
        if (addedExpNorms.has(normDesc)) return;
        const isCovered = normExpKeys.some(nk => nk && normDesc.includes(nk));
        const existsAsKeyword = normExpKeys.some(nk => nk === normDesc);
        if (!isCovered && !existsAsKeyword) { newExp.push({ keyword: desc, account: tx.account || '' }); }
        addedExpNorms.add(normDesc);
      } else {
        if (addedIncNorms.has(normDesc)) return;
        const isCovered = normIncKeys.some(nk => nk && normDesc.includes(nk));
        const existsAsKeyword = normIncKeys.some(nk => nk === normDesc);
        if (!isCovered && !existsAsKeyword) { newInc.push({ keyword: desc, account: tx.account || '' }); }
        addedIncNorms.add(normDesc);
      }
    });
    if (newExp.length > 0) {
        this.expenseRules.update(r => [...r, ...newExp]);
        newExp.forEach(r => this.supabase.saveRule({ ...r, transaction_type: 'expense' }));
    }
    if (newInc.length > 0) {
        this.incomeRules.update(r => [...r, ...newInc]);
        newInc.forEach(r => this.supabase.saveRule({ ...r, transaction_type: 'income' }));
    }

  }

  async updateTransaction(index: number, field: keyof Transaction, value: any) {
    const txs = this.processedTransactions();
    const updated = { ...txs[index], [field]: value };

    this.processedTransactions.update(curr => {
        const n = [...curr];
        n[index] = updated;
        return n;
    });

    await this.supabase.saveTransaction({
        ...updated,
        source_type: 'bank',
        source_name: this.selectedBank(),
        date: updated.date,
        description: updated.description,
        amount: updated.amount,
        type: updated.type
    });

    if (field === 'account' && updated.description) {
        this.upsertRule(updated.description, value, updated.type === 'expense');
        this.processedTransactions.update(n => {
            const next = [...n];
            for (let i = 0; i < next.length; i++) {
                 if (i !== index && next[i].description === updated.description && next[i].type === updated.type) {
                     next[i] = { ...next[i], account: value };
                     this.supabase.saveTransaction({ ...next[i], source_type: 'bank', source_name: this.selectedBank() });
                 }
            }
            return next;
        });
    }
  }

  async deleteTransaction(index: number) { 
      const tx = this.processedTransactions()[index];
      if (tx.id) {
          await this.supabase.deleteTransaction(tx.id);
      }
      this.processedTransactions.update(txs => txs.filter((_, i) => i !== index)); 
  }


  private upsertRule(keyword: string, account: string, isExpense: boolean) {
    const sig = isExpense ? this.expenseRules : this.incomeRules;
    sig.update(rules => {
      const idx = rules.findIndex(r => r.keyword === keyword);
      if (idx !== -1) { const n = [...rules]; n[idx] = { ...n[idx], account }; return n; }
      return [...rules, { keyword, account }];
    });
    this.supabase.saveRule({ keyword, account, transaction_type: isExpense ? 'expense' : 'income' });
  }


  private async getRotatedImageData(page: PageData): Promise<string> {
    if (page.rotation === 0) return page.image;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject('Canvas context failed'); return; }
        if (page.rotation % 180 !== 0) { canvas.width = img.height; canvas.height = img.width; } else { canvas.width = img.width; canvas.height = img.height; }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((page.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = page.image;
    });
  }

  async processImage() {
    const key = this.apiKey();
    const bank = this.selectedBank();
    const year = this.targetYear();
    const pages = this.pages();
    if (!key) { this.error.set('APIキーを入力してください'); return; }
    if (!bank) { this.error.set('銀行を選択してください'); return; }
    if (pages.length === 0) { this.error.set('ファイルを選択してください'); return; }
    this.isLoading.set(true);
    this.isLoading.set(true);
    this.error.set(null);
    this.tokenUsage.set(null);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const expAccountList = this.expenseAccountOptions().join('、');
      const incAccountList = this.incomeAccountOptions().join('、');
      
      let promptText = this.customPromptTemplate();
      if (!promptText.trim()) promptText = DEFAULT_PROMPT_TEMPLATE;

      promptText = promptText
          .replace(/{{year}}/g, String(year))
          .replace(/{{expense_account_list}}/g, expAccountList)
          .replace(/{{income_account_list}}/g, incAccountList);
          
      const parts: any[] = [{ text: promptText }];
      for (const page of pages) {
        const rotatedImage = await this.getRotatedImageData(page);
        const match = rotatedImage.match(/^data:(.*?);base64,(.*)$/);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      const response = await ai.models.generateContent({
        model: this.selectedModel(), contents: { parts }, config: { responseMimeType: 'application/json' }
      });
      if (response.usageMetadata) {
        this.tokenUsage.set({
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0
        });
      }
      const text = response.text;
      if (!text) throw new Error('AIからの応答が空でした');
      let jsonStr = text.trim();
      jsonStr = jsonStr.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '');
      const data = JSON.parse(jsonStr);
      if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('期待されたJSON形式ではありませんでした');
      const txs = data.transactions.map((tx: any) => {
        const isExpense = tx.type === 'expense';
        const desc = tx.description || '';
        const defaultAccount = isExpense ? '雑費' : '雑収入';
        // Priority: rule setting > AI prediction > default
        const ruleAccount = this.findAccount(desc, isExpense);
        const aiAccount = tx.account || '';
        const account = (ruleAccount !== defaultAccount) ? ruleAccount : (aiAccount || defaultAccount);
        return { 
            ...tx, 
            description: desc, 
            account,
            source_type: 'bank' as const,
            source_name: bank
        };
      });
      this.processedTransactions.set(txs);
      
      txs.forEach(tx => this.supabase.saveTransaction(tx));

      this.extractMissingRules(txs);

    } catch (err: any) {
      this.error.set('エラーが発生しました: ' + (err.message || '不明なエラー'));
    } finally {
      this.isLoading.set(false);
    }
  }

  private getSimplifiedTaxCategoryString(): string {
    const method = this.simplifiedMethod();
    const calc = this.simplifiedCalcType();
    const cls = this.simplifiedBizClass();
    const rate = this.simplifiedTaxRate();
    const kanjiMap = ['一', '二', '三', '四', '五', '六'];
    const classStr = kanjiMap[cls - 1] || '五';
    let prefix = '';
    if (method === 'inclusive') { prefix = '込'; } else { prefix = calc === 'internal' ? '内' : '外'; }
    const rateStr = rate === '8%' ? '軽減8%' : '10%';
    return `課税売上${prefix}${classStr}${rateStr}`;
  }

  generateCsv(transactions: Transaction[], bank: string) {
    const showSystem = this.showSystemColumns();
    let headers: string[];
    if (showSystem) {
      headers = ['フラグ', '', '', '日付', '借方勘定', '借方補助', '借方部門', '借方税区分', '借方金額', '借方税額', '貸方勘定', '貸方補助', '貸方部門', '貸方税区分', '貸方金額', '貸方税額', '摘要', '', '', 'タイプ', '', '仕訳メモ', '付箋1', '付箋2', ''];
    } else {
      headers = ['日付', '借方勘定', '借方補助', '借方部門', '借方税区分', '借方金額', '借方税額', '貸方勘定', '貸方補助', '貸方部門', '貸方税区分', '貸方金額', '貸方税額', '摘要'];
    }
    const rows = [headers.map(h => `"${h}"`).join(',')];
    const taxType = this.taxType();
    const simplifiedIncomeTax = taxType === 'simplified' ? this.getSimplifiedTaxCategoryString() : '対象外';
    transactions.forEach(tx => {
      const isExpense = tx.type === 'expense';
      // Priority: tx.account (user edit / AI prediction) > rule match > default
      const matchedRule = this.findMatchingRule(tx.description, isExpense);
      let account = tx.account || matchedRule?.account || this.findAccount(tx.description, isExpense);
      const note = tx.note ? `${tx.description} ${tx.note}` : tx.description;
      const amount = tx.amount.toString();
      let expenseTaxCategory = '課対仕入10%';
      let incomeTaxCategory = '課税売上10%';
      if (taxType === 'exempt') { expenseTaxCategory = '対象外'; incomeTaxCategory = '対象外'; }
      else if (taxType === 'simplified') { expenseTaxCategory = '対象外'; incomeTaxCategory = simplifiedIncomeTax; }
      // Per-rule tax category override
      if (matchedRule?.taxCategory) {
        if (isExpense) expenseTaxCategory = matchedRule.taxCategory;
        else incomeTaxCategory = matchedRule.taxCategory;
      }
      const debAcc = isExpense ? account : '普通預金';
      const debSub = isExpense ? '' : bank;
      const debTax = isExpense ? expenseTaxCategory : '対象外';
      const credAcc = isExpense ? '普通預金' : account;
      const credSub = isExpense ? bank : '';
      const credTax = isExpense ? '対象外' : incomeTaxCategory;
      
      const absAmount = Math.abs(tx.amount);
      let calculatedTax = 0;
      let rate = 0;
      const targetTaxCat = isExpense ? expenseTaxCategory : incomeTaxCategory;

      // Robust tax rate detection (handle 10%, １０％, etc.)
      if (targetTaxCat.match(/[1１]0[%％]/)) rate = 0.1;
      else if (targetTaxCat.match(/[8８][%％]/)) rate = 0.08;

      if (rate > 0 && taxType === 'standard') {
        calculatedTax = Math.floor(absAmount * rate / (1 + rate));
      }

      const taxStr = calculatedTax > 0 ? calculatedTax.toString() : '';
      const debTaxAmt = isExpense ? taxStr : '';
      const credTaxAmt = !isExpense ? taxStr : '';

      let rowData: string[];
      if (showSystem) {
        rowData = ['2000', '', '', tx.date, debAcc, debSub, '', debTax, amount, debTaxAmt, credAcc, credSub, '', credTax, amount, credTaxAmt, note, '', '', '0', '', '', '', '', 'no'];
      } else {
        rowData = [tx.date, debAcc, debSub, '', debTax, amount, debTaxAmt, credAcc, credSub, '', credTax, amount, credTaxAmt, note];
      }
      rows.push(rowData.map(cell => `"${cell}"`).join(','));
    });
    this.csvData.set(rows.join('\r\n'));
  }

  downloadCsv() {
    const data = this.csvData();
    if (!data) return;
    const unicodeList = [];
    for (let i = 0; i < data.length; i++) unicodeList.push(data.charCodeAt(i));
    const sjisCodeList = Encoding.convert(unicodeList, { to: 'SJIS', from: 'UNICODE' });
    const uint8Array = new Uint8Array(sjisCodeList);
    const blob = new Blob([uint8Array], { type: 'text/csv;charset=Shift_JIS' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `弥生会計インポート_通帳_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadManual() {
    const manualText = `
【弥生会計 インポート手順書（通帳用）】

このCSVファイルを弥生会計に取り込むための手順です。

--------------------------------------------------
■ 手順
--------------------------------------------------

1. 弥生会計を起動し、メニューバーの「帳簿・伝票」から「仕訳日記帳」を開きます。
2. 左上の [ファイル] メニューをクリックし、[インポート] を選択します。
3. 【重要】ファイル選択画面の右下のファイルの種類を「すべてのファイル(*.*)」に変更してください。
4. ダウンロードしたCSVファイルを選択して「開く」をクリックします。
5. 「インポート」ボタンをクリックします。
6. 「勘定科目や補助科目のマッチング」画面が出た場合は、指示に従い変換を行ってください。
7. 完了 - 仕訳日記帳にデータが追加されます。

--------------------------------------------------
作成日: ${new Date().toLocaleDateString()}
`.trim();
    const blob = new Blob([manualText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '弥生会計インポート手順書_通帳.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
