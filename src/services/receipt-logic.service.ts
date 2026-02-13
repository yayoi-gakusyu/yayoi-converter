
import { Injectable, signal, effect, inject } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { Rule, Transaction, TaxType, normalizeForMatch } from '../types';
import { SupabaseService } from './supabase.service';
import Encoding from 'encoding-japanese';
import { calculateTaxFromCategory } from '../utils/tax';
import { normalizeDescription, escapeCsvCell } from '../utils/format';
import { generateContentWithRetry } from '../utils/ai';

export interface PageData {
  id: string;
  image: string;
  rotation: number;
  pageNumber: number;
}

const DEFAULT_EXPENSE_RULES: Rule[] = [
  { keyword: 'コンビニ', account: '消耗品費' }, { keyword: 'セブン', account: '消耗品費' },
  { keyword: 'ローソン', account: '消耗品費' }, { keyword: 'ファミリーマート', account: '消耗品費' },
  { keyword: 'Amazon', account: '消耗品費' }, { keyword: 'アマゾン', account: '消耗品費' },
  { keyword: 'ヨドバシ', account: '消耗品費' }, { keyword: 'ビックカメラ', account: '消耗品費' },
  { keyword: 'ダイソー', account: '消耗品費' }, { keyword: '100均', account: '消耗品費' },
  { keyword: 'タクシー', account: '旅費交通費' }, { keyword: 'JR', account: '旅費交通費' },
  { keyword: '駐車場', account: '旅費交通費' }, { keyword: 'パーキング', account: '旅費交通費' },
  { keyword: 'ガソリン', account: '車両費' }, { keyword: 'ENEOS', account: '車両費' }, { keyword: '出光', account: '車両費' },
  { keyword: '郵便', account: '通信費' }, { keyword: '切手', account: '通信費' }, { keyword: 'レターパック', account: '通信費' },
  { keyword: '文具', account: '事務用品費' }, { keyword: 'コピー', account: '事務用品費' }, { keyword: '印刷', account: '事務用品費' },
  { keyword: 'カフェ', account: '会議費' }, { keyword: 'スターバックス', account: '会議費' }, { keyword: 'ドトール', account: '会議費' },
  { keyword: '飲食', account: '接待交際費' }, { keyword: '居酒屋', account: '接待交際費' }, { keyword: 'レストラン', account: '接待交際費' },
];

const DEFAULT_EXPENSE_ACCOUNTS = [
  '通信費', '水道光熱費', '消耗品費', '地代家賃', '保険料',
  '支払手数料', '旅費交通費', '接待交際費', '広告宣伝費',
  '外注費', '租税公課', '修繕費', '新聞図書費',
  '車両費', '会議費', '福利厚生費', '事務用品費', '雑費'
];

export const DEFAULT_PROMPT_TEMPLATE = `
        提出された領収書・レシートの写真またはPDF（複数枚ある場合は連番）から取引データを読み取り、以下のJSON形式で出力してください。

        【基準年度】
        このデータの基準年度（開始年）は西暦「{{year}}年」です。

        【日付の読み取りルール】
        1. 領収書・レシートに記載された日付を読み取ってください。
        2. 年が省略されている場合は基準年度「{{year}}年」を使ってください。
        3. 和暦（令和）表記の場合は西暦に変換してください。（令和〇年 + 2018 = 西暦）
        4. 出力する日付は必ず西暦の "YYYY/MM/DD" 形式にしてください。

        【読み取りルール】
        - 1枚の領収書・レシートから「日付」「店名（発行者名）」「合計金額」「品目・内容」「インボイス登録番号」を読み取ってください。
        - 合計金額（税込）を使用してください。
        - 金額はカンマなしの整数にしてください。
        - 品目や内容が分かる場合はnoteに入れてください
        - 複数の領収書が写っている場合は、それぞれ別のトランザクションとして出力してください。
        - 画像にデータが見えない場合は空の配列を返してください。

        【インボイス登録番号の読み取りルール】
        - 「T」で始まり13桁の数字が続く形式（例: T1234567890123）
        - 見つからない場合は空文字""

        【勘定科目の推測】
        各取引に対して、以下の勘定科目リストから最も適切なものを「account」フィールドに推測して設定してください。
        勘定科目リスト: {{account_list}}
        判断がつかない場合は「雑費」にしてください。

        【出力形式】
        {
          "transactions": [
            { "date": "{{year}}/05/06", "description": "セブンイレブン", "amount": 550, "note": "文房具", "invoiceNumber": "T1234567890123", "account": "消耗品費" }
          ]
        }

        JSONのみを出力し、他の説明は不要です。
`;

@Injectable({ providedIn: 'root' })
export class ReceiptLogicService {
  private supabase = inject(SupabaseService);
  
  apiKey = signal<string>('');
  targetYear = signal<number>(new Date().getFullYear());
  taxType = signal<TaxType>('standard');
  simplifiedMethod = signal<'inclusive' | 'exclusive'>('inclusive');
  simplifiedCalcType = signal<'internal' | 'external'>('internal');
  simplifiedBizClass = signal<number>(5);
  simplifiedTaxRate = signal<'10%' | '8%'>('10%');
  showSystemColumns = signal<boolean>(true);
  autoRedirectToEdit = signal<boolean>(true);
  expenseRules = signal<Rule[]>([]);
  expenseAccountOptions = signal<string[]>([]);
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

  private prefix = 'rc_';

  constructor() {
    this.loadState();
    this.loadDataFromSupabase();

    effect(() => localStorage.setItem(this.prefix + 'apiKey', this.apiKey()));
    effect(() => localStorage.setItem(this.prefix + 'selectedModel', this.selectedModel()));
    effect(() => localStorage.setItem(this.prefix + 'taxType', this.taxType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedMethod', this.simplifiedMethod()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedCalcType', this.simplifiedCalcType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedBizClass', String(this.simplifiedBizClass())));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedTaxRate', this.simplifiedTaxRate()));
    effect(() => localStorage.setItem(this.prefix + 'showSystemColumns', String(this.showSystemColumns())));
    effect(() => localStorage.setItem(this.prefix + 'autoRedirectToEdit', String(this.autoRedirectToEdit())));
    // LocalStorage for rules is partially obsolete as we use Supabase, but keeping it for offline/fallback or cache might be confusing.
    // Let's rely on Supabase for rules, but populate default if empty.
    // effect(() => localStorage.setItem(this.prefix + 'expenseRules', JSON.stringify(this.expenseRules())));
    effect(() => localStorage.setItem(this.prefix + 'expenseAccountOptions', JSON.stringify(this.expenseAccountOptions())));

    effect(() => localStorage.setItem(this.prefix + 'customPromptTemplate', this.customPromptTemplate()));
    effect(() => {
      const show = this.showSystemColumns();
      const tType = this.taxType();
      const sMethod = this.simplifiedMethod();
      const sCalc = this.simplifiedCalcType();
      const sClass = this.simplifiedBizClass();
      const sRate = this.simplifiedTaxRate();
      const rules = this.expenseRules(); // track rule changes
      const txs = this.processedTransactions();
      if (txs.length > 0) this.generateCsv(txs);
    });
  }

  private loadState() {
    const s = (key: string) => localStorage.getItem(this.prefix + key);
    
    // Unified key checking - Prioritize unified key!
    const unifiedKey = localStorage.getItem('unified_apiKey');

    // Load API Key: Unified > Specific
    if (unifiedKey) {
        this.apiKey.set(unifiedKey);
    } else if (s('apiKey')) {
        this.apiKey.set(s('apiKey')!);
    }
    
    if (s('selectedModel')) this.selectedModel.set(s('selectedModel')!);
    this.taxType.set((s('taxType') as TaxType) || 'standard');
    if (s('simplifiedMethod')) this.simplifiedMethod.set(s('simplifiedMethod') as any);
    if (s('simplifiedCalcType')) this.simplifiedCalcType.set(s('simplifiedCalcType') as any);
    if (s('simplifiedBizClass')) this.simplifiedBizClass.set(Number(s('simplifiedBizClass')));
    if (s('simplifiedTaxRate')) this.simplifiedTaxRate.set(s('simplifiedTaxRate') as any);
    const showSys = s('showSystemColumns');
    const autoRed = s('autoRedirectToEdit');
    if (autoRed !== null) this.autoRedirectToEdit.set(autoRed === 'true');
    // Rules are loaded from Supabase asynchronously, but we set default first
    this.expenseRules.set([...DEFAULT_EXPENSE_RULES]);
    this.expenseAccountOptions.set(s('expenseAccountOptions') ? JSON.parse(s('expenseAccountOptions')!) : [...DEFAULT_EXPENSE_ACCOUNTS]);


    
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
    // Filter for receipt/expense rules if we want strict typing? 
    // Currently learning_rules mixes them, but keyword is unique.
    // We can just use all rules or filter by transaction_type if we added it.
    if (rules && rules.length > 0) {
      this.expenseRules.set(rules);
    }

    // Load transactions
    const txs = await this.supabase.getTransactions('receipt');
    this.processedTransactions.set(txs);

    // Subscribe to changes
    this.supabase.subscribeToChanges(async () => {
       const newTxs = await this.supabase.getTransactions('receipt');
       this.processedTransactions.set(newTxs);
       const newRules = await this.supabase.getRules();
       if (newRules && newRules.length > 0) this.expenseRules.set(newRules);
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

  async fetchModels() {
    const key = this.apiKey();
    if (!key) return;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      const data = await response.json();
      if (data.models) {
        const models = data.models
          .filter((m: any) => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))
          .sort()
          .reverse();
        this.modelList.set(models);
        if (models.length > 0 && !models.includes(this.selectedModel())) {
            if (models.includes('gemini-2.0-flash')) this.selectedModel.set('gemini-2.0-flash');
            else if (models.includes('gemini-1.5-flash')) this.selectedModel.set('gemini-1.5-flash');
            else this.selectedModel.set(models[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
  }

  private async convertPdfToImages(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF処理ライブラリがロードされていません。');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: '/cmaps/', cMapPacked: true }).promise;
    const totalPages = pdf.numPages;
    const newPages: PageData[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      if (!context) throw new Error('Canvas context作成エラー');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      newPages.push({ id: crypto.randomUUID(), image: canvas.toDataURL('image/jpeg', 0.6), rotation: 0, pageNumber: i });
    }
    this.pages.set(newPages);
    this.isLoading.set(false);
  }

  rotatePageLeft(index: number) { this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation - 90 + 360) % 360 }; return n; }); }
  rotatePageRight(index: number) { this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation + 90) % 360 }; return n; }); }
  removePage(index: number) { this.pages.update(pages => pages.filter((_, i) => i !== index)); if (this.pages().length === 0) this.clearAllFiles(); }
  clearAllFiles() { this.pages.set([]); this.currentFileName.set(''); this.csvData.set(null); this.processedTransactions.set([]); }

  addItem(type: 'expenseAccount', item: string) {
    if (!item.trim()) return;
    this.expenseAccountOptions.update(list => list.includes(item) ? list : [...list, item]);
  }
  removeItem(type: 'expenseAccount', item: string) { this.expenseAccountOptions.update(list => list.filter(i => i !== item)); }
  addRule() { this.upsertRule('新しいルール', '雑費'); }
  updateRule(index: number, field: keyof Rule, value: string) {
     const rule = this.expenseRules()[index];
     const newRule = { ...rule, [field]: value };
     this.upsertRule(newRule.keyword, newRule.account);
  }
  async deleteRule(index: number) { 
    const rule = this.expenseRules()[index];
    if (rule.id) {
        await this.supabase.deleteRule(rule.id);
    }
    this.expenseRules.update(rules => rules.filter((_, i) => i !== index)); 
  }



  findAccount(description: string): string {
    const norm = normalizeForMatch(description);
    for (const rule of this.expenseRules()) {
      if (rule.keyword && rule.account && norm.includes(normalizeForMatch(rule.keyword))) return rule.account;
    }
    return '雑費';
  }

  findMatchingRule(description: string): Rule | undefined {
    const norm = normalizeForMatch(description);
    return this.expenseRules().find(r => r.keyword && r.account && norm.includes(normalizeForMatch(r.keyword)));
  }

  private extractMissingRules(transactions: Transaction[]) {
    const rules = this.expenseRules();
    const normKeys = rules.map(r => normalizeForMatch(r.keyword));
    const newRules: Rule[] = [];
    const addedNorms = new Set<string>();
    transactions.forEach(tx => {
      const desc = tx.description.trim();
      if (!desc) return;
      const normDesc = normalizeForMatch(desc);
      if (addedNorms.has(normDesc)) return;
      const isCovered = normKeys.some(nk => nk && normDesc.includes(nk));
      const existsAsKeyword = normKeys.some(nk => nk === normDesc);
      if (!isCovered && !existsAsKeyword) {
        newRules.push({ keyword: desc, account: tx.account || '' });
      }
      addedNorms.add(normDesc);
    });
    if (newRules.length > 0) {
        this.expenseRules.update(r => [...r, ...newRules]);
        newRules.forEach(r => this.supabase.saveRule({ ...r, transaction_type: 'expense' }));
    }
  }

  async updateTransaction(index: number, field: keyof Transaction, value: any) {
    const txs = this.processedTransactions();
    const updated = { ...txs[index], [field]: value };
    
    // Optimistic update
    this.processedTransactions.update(curr => {
        const n = [...curr];
        n[index] = updated;
        return n;
    });

    // Save to Supabase
    await this.supabase.saveTransaction({
        ...updated,
         // Ensure core fields are present for Supabase
        source_type: 'receipt',
        date: updated.date,
        description: updated.description,
        amount: updated.amount
    });

    if (field === 'account' && updated.description) {
        this.upsertRule(updated.description, value);
        // Bulk update local for responsiveness
        this.processedTransactions.update(n => {
            const next = [...n];
            for (let i = 0; i < next.length; i++) {
                if (i !== index && next[i].description === updated.description) {
                     next[i] = { ...next[i], account: value };
                     // We should ideally save these "side-effect" updates to Supabase too
                     // but to avoid storm, maybe we skip or do it silently.
                     // For strictness, let's save:
                     this.supabase.saveTransaction({ ...next[i], source_type: 'receipt' });
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


  private upsertRule(keyword: string, account: string) {
      // Optimistic
      this.expenseRules.update(rules => {
        const idx = rules.findIndex(r => r.keyword === keyword);
        if (idx !== -1) { const n = [...rules]; n[idx] = { ...n[idx], account }; return n; }
        return [...rules, { keyword, account }];
      });
      // Persist
      this.supabase.saveRule({ keyword, account, transaction_type: 'expense' });
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
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = page.image;
    });
  }

  async processImage() {
    const key = this.apiKey();
    const year = this.targetYear();
    const pages = this.pages();
    if (!key) { this.error.set('APIキーを入力してください'); return; }
    if (pages.length === 0) { this.error.set('ファイルを選択してください'); return; }
    this.isLoading.set(true);
    this.isLoading.set(true);
    this.error.set(null);
    this.tokenUsage.set(null);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const accountList = this.expenseAccountOptions().join('、');
      
      let promptText = this.customPromptTemplate();
      if (!promptText.trim()) promptText = DEFAULT_PROMPT_TEMPLATE;

      promptText = promptText
        .replace(/{{year}}/g, String(year))
        .replace(/{{account_list}}/g, accountList);
        
      const parts: any[] = [{ text: promptText }];
      for (const page of pages) {
        const rotatedImage = await this.getRotatedImageData(page);
        const match = rotatedImage.match(/^data:(.*?);base64,(.*)$/);
        if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      const response = await generateContentWithRetry(ai, {
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
      let jsonStr = (typeof text === 'string' ? text : String(text)).trim();
      jsonStr = jsonStr.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '');
      const data = JSON.parse(jsonStr);
      if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('期待されたJSON形式ではありませんでした');
      const txs = data.transactions.map((tx: any) => {
        const desc = tx.description || '';
        // Priority: rule setting > AI prediction > default
        const ruleAccount = this.findAccount(desc);
        const aiAccount = tx.account || '';
        const account = (ruleAccount !== '雑費') ? ruleAccount : (aiAccount || '雑費');
        const taxType = this.taxType();
        const matchedRule = this.findMatchingRule(desc);
        
      let expenseTaxCategory = '課対仕入10%';
      
      if (taxType === 'exempt' || taxType === 'simplified') expenseTaxCategory = '対象外';
      
      // Override with stored category or rule
      if (tx.taxCategory) {
          expenseTaxCategory = tx.taxCategory;
      } else if (matchedRule?.taxCategory) {
          expenseTaxCategory = matchedRule.taxCategory;
      }
      
      let calculatedTax = 0;
      if (tx.taxAmount !== undefined) {
         calculatedTax = tx.taxAmount;
      } else {
         // Fallback calculation
         if (expenseTaxCategory === '課対仕入10%') calculatedTax = Math.floor(tx.amount * 0.1 / 1.1);
         else if (expenseTaxCategory.includes('8%')) calculatedTax = Math.floor(tx.amount * 0.08 / 1.08);
      }

        return {
          ...tx,
          description: desc, // AI normalized
          account,
          source_type: 'receipt' as const,
          taxAmount: calculatedTax,
          taxCategory: expenseTaxCategory
        };
      });
      
      this.processedTransactions.set(txs);
      
      // Save all new transactions to Supabase
      txs.forEach(tx => this.supabase.saveTransaction(tx));

      this.extractMissingRules(txs);

    } catch (err: any) {
      this.error.set('エラーが発生しました: ' + (err.message || '不明なエラー'));
    } finally {
      this.isLoading.set(false);
    }
  }

  generateCsv(transactions: Transaction[]) {
    const showSystem = this.showSystemColumns();
    let headers: string[];
    if (showSystem) {
      headers = ['フラグ', '', '', '日付', '借方勘定', '借方補助', '借方部門', '借方税区分', '借方金額', '借方税額', '貸方勘定', '貸方補助', '貸方部門', '貸方税区分', '貸方金額', '貸方税額', '摘要', '', '', 'タイプ', '', '仕訳メモ', '付箋1', '付箋2', ''];
    } else {
      headers = ['日付', '借方勘定', '借方補助', '借方部門', '借方税区分', '借方金額', '借方税額', '貸方勘定', '貸方補助', '貸方部門', '貸方税区分', '貸方金額', '貸方税額', '摘要'];
    }
    const rows = [headers.map(h => `"${h}"`).join(',')];
    const taxType = this.taxType();
    transactions.forEach(tx => {
      // Priority: tx.account (user edit / AI prediction) > rule match > default
      const matchedRule = this.findMatchingRule(tx.description);
      let account = tx.account || matchedRule?.account || this.findAccount(tx.description);
      const invoicePart = tx.invoiceNumber ? tx.invoiceNumber : 'インボイスなし';
      const shopPart = tx.description || '';
      const contentPart = tx.note || '';
      const rawNote = contentPart ? `${invoicePart}_${shopPart}_${contentPart}` : `${invoicePart}_${shopPart}`;
      const note = normalizeDescription(rawNote);
      const amount = Math.abs(tx.amount).toString();
      let expenseTaxCategory = '課対仕入10%';
      if (taxType === 'exempt' || taxType === 'simplified') expenseTaxCategory = '対象外';
      // Per-rule tax category override
      if (matchedRule?.taxCategory) expenseTaxCategory = matchedRule.taxCategory;
      const absAmount = Math.abs(Number(amount));
      let calculatedTax = 0;
      
      // Use stored taxAmount if available
      if (tx.taxAmount !== undefined) {
          calculatedTax = tx.taxAmount;
      } else {
          let rate = 0;
          // Robust tax rate detection
          if (expenseTaxCategory.match(/[1１]0[%％]/)) rate = 0.1;
          else if (expenseTaxCategory.match(/[8８][%％]/)) rate = 0.08;

          if (rate > 0 && taxType === 'standard') {
            calculatedTax = Math.floor(absAmount * rate / (1 + rate));
          }
      }

      const taxStr = calculatedTax > 0 ? calculatedTax.toString() : '';
      // Receipt is always expense side tax
      const debTaxAmt = taxStr;
      const credTaxAmt = '';

      let rowData: string[];
      if (showSystem) {
        rowData = ['2000', '', '', tx.date, account, '', '', expenseTaxCategory, amount, debTaxAmt, '現金', '', '', '対象外', amount, credTaxAmt, note, '', '', '0', '', '', '', '', 'no'];
      } else {
        rowData = [tx.date, account, '', '', expenseTaxCategory, amount, debTaxAmt, '現金', '', '', '対象外', amount, credTaxAmt, note];
      }
      rows.push(rowData.map(cell => `"${escapeCsvCell(cell)}"`).join(','));
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
    a.download = `弥生会計インポート_現金_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadManual() {
    const manualText = `
【弥生会計 インポート手順書（領収書・現金出納帳用）】

このCSVファイルを弥生会計に取り込むための手順です。

--------------------------------------------------
■ 手順
--------------------------------------------------

1. 弥生会計を起動し、メニューバーの「帳簿・伝票」から「仕訳日記帳」を開きます。
2. 左上の [ファイル] メニューをクリックし、[インポート] を選択します。
3. 【重要】右下のファイルの種類を「すべてのファイル(*.*)」に変更してください。
4. ダウンロードしたCSVファイルを選択して「開く」をクリックします。
5. 「インポート」ボタンをクリックします。
6. 「勘定科目や補助科目のマッチング」画面が出た場合は、指示に従い変換を行ってください。
7. 完了 - 仕訳日記帳にデータが追加されます。

--------------------------------------------------
■ 領収書の仕訳について
--------------------------------------------------
このCSVは「現金パターン」で仕訳を作成しています。

  借方（経費科目）/ 貸方（現金）

現金で支払った経費を記帳する形式です。

--------------------------------------------------
作成日: ${new Date().toLocaleDateString()}
`.trim();
    const blob = new Blob([manualText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '弥生会計インポート手順書_領収書.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
