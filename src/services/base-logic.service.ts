import { signal, effect } from '@angular/core';
import { GoogleGenAI } from '@google/genai';
import { Rule, Transaction, TaxType, normalizeForMatch } from '../types';
import { generateContentWithRetry } from '../utils/ai';
import Encoding from 'encoding-japanese';

export interface PageData {
  id: string;
  image: string;
  rotation: number;
  pageNumber: number;
}

export abstract class BaseLogicService {
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
  selectedModel = signal<string>('gemini-2.5-flash');
  tokenUsage = signal<{ input: number; output: number } | null>(null);
  customPromptTemplate = signal<string>('');

  protected abstract readonly prefix: string;
  protected abstract readonly defaultExpenseRules: Rule[];
  protected abstract readonly defaultExpenseAccounts: string[];
  protected abstract readonly defaultPromptTemplate: string;

  protected initBase() {
    this.loadBaseState();
    this.setupBaseEffects();
  }

  protected loadBaseState() {
    const s = (key: string) => localStorage.getItem(this.prefix + key);
    const unifiedKey = localStorage.getItem('unified_apiKey');
    if (unifiedKey) this.apiKey.set(unifiedKey);
    else if (s('apiKey')) this.apiKey.set(s('apiKey')!);

    if (s('selectedModel')) this.selectedModel.set(s('selectedModel')!);
    this.taxType.set((s('taxType') as TaxType) || 'standard');
    if (s('simplifiedMethod')) this.simplifiedMethod.set(s('simplifiedMethod') as any);
    if (s('simplifiedCalcType')) this.simplifiedCalcType.set(s('simplifiedCalcType') as any);
    if (s('simplifiedBizClass')) this.simplifiedBizClass.set(Number(s('simplifiedBizClass')));
    if (s('simplifiedTaxRate')) this.simplifiedTaxRate.set(s('simplifiedTaxRate') as any);
    const showSys = s('showSystemColumns');
    const autoRed = s('autoRedirectToEdit');
    if (showSys !== null) this.showSystemColumns.set(showSys === 'true');
    if (autoRed !== null) this.autoRedirectToEdit.set(autoRed === 'true');

    const savedRules = s('expenseRules');
    this.expenseRules.set(savedRules ? JSON.parse(savedRules) : [...this.defaultExpenseRules]);
    this.expenseAccountOptions.set(
      s('expenseAccountOptions') ? JSON.parse(s('expenseAccountOptions')!) : [...this.defaultExpenseAccounts]
    );

    const savedPrompt = s('customPromptTemplate');
    this.customPromptTemplate.set(savedPrompt?.trim() ? savedPrompt : this.defaultPromptTemplate);
  }

  protected setupBaseEffects() {
    effect(() => localStorage.setItem(this.prefix + 'apiKey', this.apiKey()));
    effect(() => localStorage.setItem(this.prefix + 'selectedModel', this.selectedModel()));
    effect(() => localStorage.setItem(this.prefix + 'taxType', this.taxType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedMethod', this.simplifiedMethod()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedCalcType', this.simplifiedCalcType()));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedBizClass', String(this.simplifiedBizClass())));
    effect(() => localStorage.setItem(this.prefix + 'simplifiedTaxRate', this.simplifiedTaxRate()));
    effect(() => localStorage.setItem(this.prefix + 'showSystemColumns', String(this.showSystemColumns())));
    effect(() => localStorage.setItem(this.prefix + 'autoRedirectToEdit', String(this.autoRedirectToEdit())));
    effect(() => localStorage.setItem(this.prefix + 'expenseRules', JSON.stringify(this.expenseRules())));
    effect(() => localStorage.setItem(this.prefix + 'customPromptTemplate', this.customPromptTemplate()));
  }

  // --- Settings ---

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
  resetPromptTemplate() { this.customPromptTemplate.set(this.defaultPromptTemplate); }

  // --- File handling ---

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

  protected async convertPdfToImages(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF処理ライブラリがロードされていません。ページを再読み込みしてください。');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: '/cmaps/', cMapPacked: true }).promise;
    const newPages: PageData[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
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

  protected async getRotatedImageData(page: PageData): Promise<string> {
    if (page.rotation === 0) return page.image;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject('Canvas context failed'); return; }
        if (page.rotation % 180 !== 0) { canvas.width = img.height; canvas.height = img.width; }
        else { canvas.width = img.width; canvas.height = img.height; }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((page.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
      img.src = page.image;
    });
  }

  // --- Page management ---

  rotatePageLeft(index: number) {
    this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation - 90 + 360) % 360 }; return n; });
  }
  rotatePageRight(index: number) {
    this.pages.update(pages => { const n = [...pages]; n[index] = { ...n[index], rotation: (n[index].rotation + 90) % 360 }; return n; });
  }
  removePage(index: number) {
    this.pages.update(pages => pages.filter((_, i) => i !== index));
    if (this.pages().length === 0) this.clearAllFiles();
  }
  clearAllFiles() {
    this.pages.set([]);
    this.currentFileName.set('');
    this.csvData.set(null);
    this.processedTransactions.set([]);
  }

  // --- Model management ---

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
          .sort().reverse();
        this.modelList.set(models);
        if (models.length > 0 && !models.includes(this.selectedModel())) {
          if (models.includes('gemini-2.5-flash')) this.selectedModel.set('gemini-2.5-flash');
          else if (models.includes('gemini-2.0-flash')) this.selectedModel.set('gemini-2.0-flash');
          else this.selectedModel.set(models[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
  }

  // --- Rule helpers ---

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

  protected upsertExpenseRule(keyword: string, account: string) {
    this.expenseRules.update(rules => {
      const idx = rules.findIndex(r => r.keyword === keyword);
      if (idx !== -1) { const n = [...rules]; n[idx] = { ...n[idx], account }; return n; }
      return [...rules, { keyword, account }];
    });
  }

  protected extractMissingExpenseRules(transactions: Transaction[]) {
    const rules = this.expenseRules();
    const normKeys = rules.map(r => normalizeForMatch(r.keyword));
    const newRules: Rule[] = [];
    const seen = new Set<string>();
    for (const tx of transactions) {
      const desc = tx.description.trim();
      if (!desc) continue;
      const norm = normalizeForMatch(desc);
      if (seen.has(norm)) continue;
      seen.add(norm);
      const covered = normKeys.some(nk => nk && norm.includes(nk));
      if (!covered) newRules.push({ keyword: desc, account: tx.account || '' });
    }
    if (newRules.length > 0) this.expenseRules.update(r => [...r, ...newRules]);
  }

  // --- Transaction management ---

  deleteTransaction(index: number) {
    this.processedTransactions.update(txs => txs.filter((_, i) => i !== index));
  }

  // --- Gemini API call helper ---

  protected async callGemini(promptText: string): Promise<any> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey() });
    const parts: any[] = [{ text: promptText }];
    for (const page of this.pages()) {
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
    let jsonStr = (typeof text === 'string' ? text : String(text)).trim()
      .replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '');
    const data = JSON.parse(jsonStr);
    if (!data.transactions || !Array.isArray(data.transactions)) throw new Error('期待されたJSON形式ではありませんでした');
    return data;
  }

  // --- CSV download helper ---

  protected downloadCsvBlob(data: string, filename: string) {
    const unicodeList = [];
    for (let i = 0; i < data.length; i++) unicodeList.push(data.charCodeAt(i));
    const sjisCodeList = Encoding.convert(unicodeList, { to: 'SJIS', from: 'UNICODE' });
    const uint8Array = new Uint8Array(sjisCodeList);
    const blob = new Blob([uint8Array], { type: 'text/csv;charset=Shift_JIS' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Abstract ---

  abstract processImage(): Promise<void>;
  abstract downloadCsv(): void;
  abstract downloadManual(): void;
}
