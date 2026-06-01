import { Injectable, signal, effect } from '@angular/core';
import { Rule, Transaction, normalizeForMatch } from '../types';
import { normalizeDescription, escapeCsvCell } from '../utils/format';
import { BaseLogicService, PageData } from './base-logic.service';

export type { PageData } from './base-logic.service';

const DEFAULT_CARDS = [
  '楽天カード',
  '三井住友カード',
  'JCBカード',
  'AMEX',
  'VISA',
  'Mastercard',
  'dカード',
  'イオンカード',
  'その他',
];

const DEFAULT_EXPENSE_RULES: Rule[] = [
  { keyword: 'ETC', account: '旅費交通費' },
  { keyword: '高速', account: '旅費交通費' },
  { keyword: 'モバイルSuica', account: '旅費交通費' },
  { keyword: 'タクシー', account: '旅費交通費' },
  { keyword: 'ENEOS', account: '車両費' },
  { keyword: '出光', account: '車両費' },
  { keyword: 'Amazon', account: '消耗品費' },
  { keyword: 'アマゾン', account: '消耗品費' },
  { keyword: 'Google', account: '通信費' },
  { keyword: 'Microsoft', account: '通信費' },
  { keyword: 'Zoom', account: '通信費' },
  { keyword: 'Adobe', account: '通信費' },
  { keyword: 'レストラン', account: '接待交際費' },
  { keyword: '居酒屋', account: '接待交際費' },
  { keyword: 'カフェ', account: '会議費' },
  { keyword: 'スターバックス', account: '会議費' },
];

const DEFAULT_EXPENSE_ACCOUNTS = [
  '通信費',
  '水道光熱費',
  '消耗品費',
  '地代家賃',
  '保険料',
  '支払手数料',
  '旅費交通費',
  '接待交際費',
  '広告宣伝費',
  '外注費',
  '租税公課',
  '修繕費',
  '新聞図書費',
  '車両費',
  '会議費',
  '福利厚生費',
  '事務用品費',
  '雑費',
];

export const DEFAULT_PROMPT_TEMPLATE = `
        提出されたクレジットカード明細の画像（複数枚ある場合は連番）から取引データを読み取り、以下のJSON形式で出力してください。

        【基準年度】
        このデータの基準年度（開始年）は西暦「{{year}}年」です。

        【日付の読み取りと西暦変換ルール】
        1. 明細の日付を読み取ってください。
        2. 「08/01」のように年が省略されている場合は、基準年度「{{year}}年」を使ってください。
        3. 年をまたぐ場合（例: 12月から1月）は、時系列に従って年を調整してください。
        4. 出力する日付は必ず西暦の "YYYY/MM/DD" 形式にしてください。

        【読み取りルール】
        - 利用日、利用店名（摘要）、金額（支払総額）を読み取ってください。
        - 「支払区分」（1回払い、リボ等）は無視して構いませんが、もし「毎月の支払額」と「利用額」書かれている場合は「利用額」を優先してください。
        - ポイント付与やキャンペーン情報は無視してください。
        - 金額はカンマなしの数字のみにしてください。
        - 複数画像のデータは全て結合し、時系列順の1つのリストにしてください。

        【勘定科目の推測】
        各取引に対して、以下の勘定科目リストから最も適切なものを「account」フィールドに推測して設定してください。
        勘定科目リスト: {{account_list}}
        判断がつかない場合は「雑費」にしてください。

        【出力形式】
        {
          "transactions": [
            { "date": "{{year}}/05/06", "description": "ETC利用", "amount": 1500, "note": "高速代", "account": "旅費交通費" }
          ]
        }

        JSONのみを出力し、他の説明は不要です。
`;

@Injectable({ providedIn: 'root' })
export class CreditCardLogicService extends BaseLogicService {
  protected readonly prefix = 'cc_';
  protected readonly defaultExpenseRules = DEFAULT_EXPENSE_RULES;
  protected readonly defaultExpenseAccounts = DEFAULT_EXPENSE_ACCOUNTS;
  protected readonly defaultPromptTemplate = DEFAULT_PROMPT_TEMPLATE;

  selectedCard = signal<string>('');
  cardOptions = signal<string[]>([]);

  constructor() {
    super();
    this.initBase();
    this.loadCcState();
    this.setupCcEffects();
  }

  private loadCcState() {
    const s = (key: string) => localStorage.getItem(this.prefix + key);

    // Legacy migration: move old global key to prefixed storage
    const legacyApiKey = localStorage.getItem('apiKey');
    const unifiedKey = localStorage.getItem('unified_apiKey');
    if (legacyApiKey && !unifiedKey && !s('apiKey')) {
      localStorage.setItem(this.prefix + 'apiKey', legacyApiKey);
    }

    if (s('selectedCard')) this.selectedCard.set(s('selectedCard')!);
    this.cardOptions.set(
      s('cardOptions') ? JSON.parse(s('cardOptions')!) : [...DEFAULT_CARDS]
    );
  }

  private setupCcEffects() {
    effect(() => localStorage.setItem(this.prefix + 'selectedCard', this.selectedCard()));
    effect(() => localStorage.setItem(this.prefix + 'cardOptions', JSON.stringify(this.cardOptions())));
    effect(() => localStorage.setItem(this.prefix + 'expenseAccountOptions', JSON.stringify(this.expenseAccountOptions())));

    // Regenerate CSV when relevant settings change
    effect(() => {
      const _show = this.showSystemColumns();
      const _tType = this.taxType();
      const _sMethod = this.simplifiedMethod();
      const _sCalc = this.simplifiedCalcType();
      const _sClass = this.simplifiedBizClass();
      const _sRate = this.simplifiedTaxRate();
      const _rules = this.expenseRules();
      const txs = this.processedTransactions();
      const card = this.selectedCard();
      if (txs.length > 0 && card) {
        this.generateCsv(txs, card);
      }
    });
  }

  // --- Card-specific settings ---

  updateCard(card: string) {
    this.selectedCard.set(card);
  }

  // --- Card/Account list management ---

  addItem(type: 'card' | 'expenseAccount', item: string) {
    if (!item.trim()) return;
    const target = type === 'card' ? this.cardOptions : this.expenseAccountOptions;
    target.update(list => (list.includes(item) ? list : [...list, item]));
  }

  removeItem(type: 'card' | 'expenseAccount', item: string) {
    const target = type === 'card' ? this.cardOptions : this.expenseAccountOptions;
    target.update(list => list.filter(i => i !== item));
  }

  // --- Rule management ---

  addRule() {
    this.upsertRule('新しいルール', '雑費');
  }

  updateRule(index: number, field: keyof Rule, value: string) {
    const rule = this.expenseRules()[index];
    const newRule = { ...rule, [field]: value };
    this.upsertRule(newRule.keyword, newRule.account);
  }

  deleteRule(index: number) {
    this.expenseRules.update(rules => rules.filter((_, i) => i !== index));
  }

  upsertRule(keyword: string, account: string) {
    this.upsertExpenseRule(keyword, account);
  }

  extractMissingRules(transactions: Transaction[]) {
    this.extractMissingExpenseRules(transactions);
  }

  // --- Transaction editing ---

  updateTransaction(index: number, field: keyof Transaction, value: any) {
    const txs = this.processedTransactions();
    const updated = { ...txs[index], [field]: value };

    this.processedTransactions.update(curr => {
      const n = [...curr];
      n[index] = updated;
      return n;
    });

    // When account changes, propagate to matching descriptions via rule
    if (field === 'account' && updated.description) {
      this.upsertRule(updated.description, value);
      this.processedTransactions.update(n => {
        const next = [...n];
        for (let i = 0; i < next.length; i++) {
          if (i !== index && next[i].description === updated.description) {
            next[i] = { ...next[i], account: value };
          }
        }
        return next;
      });
    }
  }

  // --- AI processing ---

  async processImage() {
    const key = this.apiKey();
    const card = this.selectedCard();
    const year = this.targetYear();
    const pages = this.pages();

    if (!key) { this.error.set('APIキーを入力してください'); return; }
    if (!card) { this.error.set('カードを選択してください'); return; }
    if (pages.length === 0) { this.error.set('ファイルを選択してください'); return; }

    this.isLoading.set(true);
    this.error.set(null);
    this.tokenUsage.set(null);

    try {
      const accountList = this.expenseAccountOptions().join('、');
      let promptText = this.customPromptTemplate();
      if (!promptText.trim()) promptText = DEFAULT_PROMPT_TEMPLATE;
      promptText = promptText
        .replace(/{{year}}/g, String(year))
        .replace(/{{account_list}}/g, accountList);

      const data = await this.callGemini(promptText);

      const txs = data.transactions.map((tx: any) => {
        const desc = tx.description || '';
        // Priority: rule > AI prediction > default
        const ruleAccount = this.findAccount(desc);
        const aiAccount = tx.account || '';
        const account = (ruleAccount !== '雑費') ? ruleAccount : (aiAccount || '雑費');

        const taxType = this.taxType();
        const matchedRule = this.findMatchingRule(desc);
        let expenseTaxCategory = '課対仕入10%';
        if (taxType === 'exempt' || taxType === 'simplified') expenseTaxCategory = '対象外';

        if (tx.taxCategory) {
          expenseTaxCategory = tx.taxCategory;
        } else if (matchedRule?.taxCategory) {
          expenseTaxCategory = matchedRule.taxCategory;
        }

        let taxAmount = 0;
        if (tx.taxAmount !== undefined) {
          taxAmount = tx.taxAmount;
        } else {
          if (expenseTaxCategory === '課対仕入10%') taxAmount = Math.floor(tx.amount * 0.1 / 1.1);
          else if (expenseTaxCategory.includes('8%')) taxAmount = Math.floor(tx.amount * 0.08 / 1.08);
        }

        return {
          ...tx,
          date: tx.date || '',
          description: desc,
          amount: Number(tx.amount) || 0,
          note: tx.note || '',
          account,
          taxAmount,
          taxCategory: expenseTaxCategory,
        };
      });

      this.processedTransactions.set(txs);
      this.extractMissingRules(txs);
    } catch (err: any) {
      this.error.set('エラーが発生しました: ' + (err.message || '不明なエラー'));
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- CSV generation ---

  generateCsv(transactions: Transaction[], card: string) {
    const showSystem = this.showSystemColumns();
    const taxType = this.taxType();

    let headers: string[];
    if (showSystem) {
      headers = [
        'フラグ', '', '', '日付', '借方勘定', '借方補助', '借方部門',
        '借方税区分', '借方金額', '借方税額', '貸方勘定', '貸方補助',
        '貸方部門', '貸方税区分', '貸方金額', '貸方税額', '摘要',
        '', '', 'タイプ', '', '仕訳メモ', '付箋1', '付箋2', '',
      ];
    } else {
      headers = [
        '日付', '借方勘定', '借方補助', '借方部門', '借方税区分',
        '借方金額', '借方税額', '貸方勘定', '貸方補助', '貸方部門',
        '貸方税区分', '貸方金額', '貸方税額', '摘要',
      ];
    }

    const rows = [headers.map(h => `"${h}"`).join(',')];

    transactions.forEach(tx => {
      const matchedRule = this.findMatchingRule(tx.description);
      const account = tx.account || matchedRule?.account || this.findAccount(tx.description);
      const rawNote = tx.note ? `${tx.description} ${tx.note}` : tx.description;
      const note = normalizeDescription(rawNote);
      const amount = Math.abs(tx.amount).toString();

      let expenseTaxCategory = '課対仕入10%';
      if (taxType === 'exempt' || taxType === 'simplified') expenseTaxCategory = '対象外';
      if (matchedRule?.taxCategory) expenseTaxCategory = matchedRule.taxCategory;

      const absAmount = Math.abs(Number(amount));
      let calculatedTax = 0;
      if (tx.taxAmount !== undefined) {
        calculatedTax = tx.taxAmount;
      } else {
        let rate = 0;
        if (expenseTaxCategory.match(/[1１]0[%％]/)) rate = 0.1;
        else if (expenseTaxCategory.match(/[8８][%％]/)) rate = 0.08;
        if (rate > 0 && taxType === 'standard') {
          calculatedTax = Math.floor(absAmount * rate / (1 + rate));
        }
      }

      const taxStr = calculatedTax > 0 ? calculatedTax.toString() : '';
      const debTaxAmt = taxStr;
      const credTaxAmt = '';

      let rowData: string[];
      if (showSystem) {
        rowData = [
          '2000', '', '', tx.date, account, '', '', expenseTaxCategory,
          amount, debTaxAmt, '未払金', card, '', '対象外', amount,
          credTaxAmt, note, '', '', '0', '', '', '', '', 'no',
        ];
      } else {
        rowData = [
          tx.date, account, '', '', expenseTaxCategory, amount, '',
          '未払金', card, '', '対象外', amount, '', note,
        ];
      }
      rows.push(rowData.map(cell => `"${escapeCsvCell(cell)}"`).join(','));
    });

    this.csvData.set(rows.join('\r\n'));
  }

  // --- Downloads ---

  downloadCsv() {
    const data = this.csvData();
    if (!data) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.downloadCsvBlob(data, `弥生会計インポート_クレカ_${today}.csv`);
  }

  downloadManual() {
    const manualText = `
【弥生会計 インポート手順書（クレカ明細用）】

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
■ クレカ明細の仕訳について
--------------------------------------------------
このCSVは「未払金パターン」で仕訳を作成しています。

  借方（経費科目）/ 貸方（未払金：カード名）

カード引落し日に、別途以下の仕訳を手動で入力してください。
  借方（未払金：カード名）/ 貸方（普通預金：銀行名）

--------------------------------------------------
作成日: ${new Date().toLocaleDateString()}
`.trim();
    const blob = new Blob([manualText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '弥生会計インポート手順書_クレカ.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
