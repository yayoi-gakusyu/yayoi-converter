import { Injectable, effect } from '@angular/core';
import { Rule, Transaction } from '../types';
import { normalizeDescription, escapeCsvCell } from '../utils/format';
import { BaseLogicService, PageData } from './base-logic.service';

export type { PageData } from './base-logic.service';

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
export class ReceiptLogicService extends BaseLogicService {
  protected readonly prefix = 'rc_';
  protected readonly defaultExpenseRules = DEFAULT_EXPENSE_RULES;
  protected readonly defaultExpenseAccounts = DEFAULT_EXPENSE_ACCOUNTS;
  protected readonly defaultPromptTemplate = DEFAULT_PROMPT_TEMPLATE;

  constructor() {
    super();
    this.initBase();

    effect(() => localStorage.setItem(this.prefix + 'expenseAccountOptions', JSON.stringify(this.expenseAccountOptions())));

    effect(() => {
      const show = this.showSystemColumns();
      const tType = this.taxType();
      const sMethod = this.simplifiedMethod();
      const sCalc = this.simplifiedCalcType();
      const sClass = this.simplifiedBizClass();
      const sRate = this.simplifiedTaxRate();
      const rules = this.expenseRules();
      const txs = this.processedTransactions();
      if (txs.length > 0) this.generateCsv(txs);
    });
  }

  addItem(type: 'expenseAccount', item: string) {
    if (!item.trim()) return;
    this.expenseAccountOptions.update(list => list.includes(item) ? list : [...list, item]);
  }

  removeItem(type: 'expenseAccount', item: string) {
    this.expenseAccountOptions.update(list => list.filter(i => i !== item));
  }

  addRule() {
    this.upsertExpenseRule('新しいルール', '雑費');
  }

  updateRule(index: number, field: keyof Rule, value: string) {
    const rule = this.expenseRules()[index];
    const newRule = { ...rule, [field]: value };
    this.upsertExpenseRule(newRule.keyword, newRule.account);
  }

  deleteRule(index: number) {
    this.expenseRules.update(rules => rules.filter((_, i) => i !== index));
  }

  updateTransaction(index: number, field: keyof Transaction, value: any) {
    const txs = this.processedTransactions();
    const updated = { ...txs[index], [field]: value };

    this.processedTransactions.update(curr => {
      const n = [...curr];
      n[index] = updated;
      return n;
    });

    if (field === 'account' && updated.description) {
      this.upsertExpenseRule(updated.description, value);
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

  async processImage() {
    const key = this.apiKey();
    const year = this.targetYear();
    const pages = this.pages();
    if (!key) { this.error.set('APIキーを入力してください'); return; }
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

        let calculatedTax = 0;
        if (tx.taxAmount !== undefined) {
          calculatedTax = tx.taxAmount;
        } else {
          if (expenseTaxCategory === '課対仕入10%') calculatedTax = Math.floor(tx.amount * 0.1 / 1.1);
          else if (expenseTaxCategory.includes('8%')) calculatedTax = Math.floor(tx.amount * 0.08 / 1.08);
        }

        return {
          ...tx,
          description: desc,
          account,
          taxAmount: calculatedTax,
          taxCategory: expenseTaxCategory
        };
      });

      this.processedTransactions.set(txs);
      this.extractMissingExpenseRules(txs);
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
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.downloadCsvBlob(data, `弥生会計インポート_現金_${today}.csv`);
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
