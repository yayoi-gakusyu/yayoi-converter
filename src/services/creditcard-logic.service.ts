import { Injectable, signal, effect } from "@angular/core";
import { GoogleGenAI } from "@google/genai";
import { Rule, Transaction, TaxType, normalizeForMatch } from "../types";
import Encoding from "encoding-japanese";

export interface PageData {
  id: string;
  image: string;
  rotation: number;
  pageNumber: number;
}

const DEFAULT_EXPENSE_RULES: Rule[] = [
  { keyword: "ETC", account: "旅費交通費" },
  { keyword: "SUICA", account: "旅費交通費" },
  { keyword: "PASMO", account: "旅費交通費" },
  { keyword: "JR ", account: "旅費交通費" },
  { keyword: "タクシー", account: "旅費交通費" },
  { keyword: "ANA", account: "旅費交通費" },
  { keyword: "JAL", account: "旅費交通費" },
  { keyword: "Amazon", account: "消耗品費" },
  { keyword: "アマゾン", account: "消耗品費" },
  { keyword: "ヨドバシ", account: "消耗品費" },
  { keyword: "ビックカメラ", account: "消耗品費" },
  { keyword: "Google", account: "通信費" },
  { keyword: "Apple", account: "通信費" },
  { keyword: "AWS", account: "通信費" },
  { keyword: "NTT", account: "通信費" },
  { keyword: "ソフトバンク", account: "通信費" },
  { keyword: "KDDI", account: "通信費" },
  { keyword: "さくらインターネット", account: "通信費" },
  { keyword: "ENEOS", account: "車両費" },
  { keyword: "出光", account: "車両費" },
  { keyword: "ガソリン", account: "車両費" },
  { keyword: "年会費", account: "支払手数料" },
  { keyword: "保険", account: "保険料" },
];

const DEFAULT_CARDS = [
  "楽天カード",
  "三井住友カード",
  "JCBカード",
  "アメリカン・エキスプレス",
  "ダイナースクラブ",
  "セゾンカード",
  "イオンカード",
  "dカード",
  "PayPayカード",
  "その他",
];

const DEFAULT_EXPENSE_ACCOUNTS = [
  "通信費",
  "水道光熱費",
  "消耗品費",
  "地代家賃",
  "保険料",
  "支払手数料",
  "旅費交通費",
  "接待交際費",
  "広告宣伝費",
  "外注費",
  "租税公課",
  "修繕費",
  "新聞図書費",
  "車両費",
  "会議費",
  "福利厚生費",
  "事務用品費",
  "雑費",
];

export const DEFAULT_PROMPT_TEMPLATE = `
        提出されたクレジットカード明細のPDFまたは写真（複数枚ある場合は連番）から取引データを読み取り、以下のJSON形式で出力してください。

        【基準年度】
        このデータの基準年度（開始年）は西暦「{{year}}年」です。

        【日付の読み取りルール】
        1. 明細の「利用日」「ご利用日」欄から日付を読み取ってください。
        2. 年が省略されている場合（月/日のみの場合）は、基準年度「{{year}}年」から開始し、時系列（12月から1月への切り替わり等）を考慮して年を補完してください。
        3. 和暦（令和）表記の場合は西暦に変換してください。（令和〇年 + 2018 = 西暦）
        4. 出力する日付は必ず西暦の "YYYY/MM/DD" 形式にしてください。

        【読み取りルール】
        - 「利用日」「利用店名・内容」「利用金額（支払金額）」を読み取ってください。
        - 以下の行はスキップしてください：
          ・「お支払い金額合計」「ご利用合計」「今回ご請求金額」などの合計行
          ・「口座引落し」「お引落し」「お支払い」などの支払い（引落し）行
          ・「前回ご請求額」「繰越残高」などの繰越行
          ・ヘッダー行・フッター行
        - キャンセル・返品の行は、金額をマイナス（負の値）にして含めてください
        - 金額はカンマなしの整数にしてください（キャンセル・返品はマイナス）
        - 分割払いの場合は、今回支払い分の金額を使用してください
        - 複数画像のデータは全て結合し、利用日順の1つのリストにしてください
        - もし画像にデータが見えない場合や空の場合でも、空の配列を返してください

        【勘定科目の推測】
        各取引に対して、以下の勘定科目リストから最も適切なものを「account」フィールドに推測して設定してください。
        勘定科目リスト: {{account_list}}
        判断がつかない場合は「雑費」にしてください。

        【出力形式】
        {
          "transactions": [
            { "date": "{{year}}/05/06", "description": "アマゾン ジャパン", "amount": 3980, "note": "日用品", "account": "消耗品費" }
          ]
        }

        JSONのみを出力し、他の説明は不要です。
`;

@Injectable({ providedIn: "root" })
export class CreditCardLogicService {
  apiKey = signal<string>("");
  selectedCard = signal<string>("");
  targetYear = signal<number>(new Date().getFullYear());
  taxType = signal<TaxType>("standard");
  simplifiedMethod = signal<"inclusive" | "exclusive">("inclusive");
  simplifiedCalcType = signal<"internal" | "external">("internal");
  simplifiedBizClass = signal<number>(5);
  simplifiedTaxRate = signal<"10%" | "8%">("10%");
  showSystemColumns = signal<boolean>(true);
  autoRedirectToEdit = signal<boolean>(true);
  expenseRules = signal<Rule[]>([]);
  cardOptions = signal<string[]>([]);
  expenseAccountOptions = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  pages = signal<PageData[]>([]);
  currentFileName = signal<string>("");
  isPdf = signal<boolean>(false);
  processedTransactions = signal<Transaction[]>([]);
  csvData = signal<string | null>(null);
  modelList = signal<string[]>([]);
  selectedModel = signal<string>("gemini-2.0-flash");
  tokenUsage = signal<{ input: number; output: number } | null>(null);
  customPromptTemplate = signal<string>("");

  private prefix = "cc_";

  constructor() {
    this.loadState();
    effect(() => localStorage.setItem(this.prefix + "apiKey", this.apiKey()));
    effect(() =>
      localStorage.setItem(this.prefix + "selectedModel", this.selectedModel()),
    );
    effect(() =>
      localStorage.setItem(this.prefix + "selectedCard", this.selectedCard()),
    );
    effect(() => localStorage.setItem(this.prefix + "taxType", this.taxType()));
    effect(() =>
      localStorage.setItem(
        this.prefix + "simplifiedMethod",
        this.simplifiedMethod(),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "simplifiedCalcType",
        this.simplifiedCalcType(),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "simplifiedBizClass",
        String(this.simplifiedBizClass()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "simplifiedTaxRate",
        this.simplifiedTaxRate(),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "showSystemColumns",
        String(this.showSystemColumns()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "autoRedirectToEdit",
        String(this.autoRedirectToEdit()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "expenseRules",
        JSON.stringify(this.expenseRules()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "cardOptions",
        JSON.stringify(this.cardOptions()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "expenseAccountOptions",
        JSON.stringify(this.expenseAccountOptions()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "customPromptTemplate",
        this.customPromptTemplate(),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "cardOptions",
        JSON.stringify(this.cardOptions()),
      ),
    );
    effect(() =>
      localStorage.setItem(
        this.prefix + "expenseAccountOptions",
        JSON.stringify(this.expenseAccountOptions()),
      ),
    );
    effect(() => {
      const show = this.showSystemColumns();
      const tType = this.taxType();
      const sMethod = this.simplifiedMethod();
      const sCalc = this.simplifiedCalcType();
      const sClass = this.simplifiedBizClass();
      const sRate = this.simplifiedTaxRate();
      const rules = this.expenseRules(); // track rule changes
      const txs = this.processedTransactions();
      const card = this.selectedCard();
      if (txs.length > 0 && card) {
        this.generateCsv(txs, card);
      }
    });
  }

  private loadState() {
    const s = (key: string) => localStorage.getItem(this.prefix + key);
    // Also check unified API key
    const unifiedKey = localStorage.getItem("unified_apiKey");
    if (unifiedKey) this.apiKey.set(unifiedKey);
    if (s("apiKey")) this.apiKey.set(s("apiKey")!);
    if (s("selectedModel")) this.selectedModel.set(s("selectedModel")!);
    if (s("selectedCard")) this.selectedCard.set(s("selectedCard")!);
    this.taxType.set((s("taxType") as TaxType) || "standard");
    if (s("simplifiedMethod"))
      this.simplifiedMethod.set(s("simplifiedMethod") as any);
    if (s("simplifiedCalcType"))
      this.simplifiedCalcType.set(s("simplifiedCalcType") as any);
    if (s("simplifiedBizClass"))
      this.simplifiedBizClass.set(Number(s("simplifiedBizClass")));
    if (s("simplifiedTaxRate"))
      this.simplifiedTaxRate.set(s("simplifiedTaxRate") as any);
    const showSys = s("showSystemColumns");
    const autoRed = s("autoRedirectToEdit");
    if (showSys !== null) this.showSystemColumns.set(showSys === "true");
    if (autoRed !== null) this.autoRedirectToEdit.set(autoRed === "true");
    this.expenseRules.set(
      s("expenseRules")
        ? JSON.parse(s("expenseRules")!)
        : [...DEFAULT_EXPENSE_RULES],
    );
    this.cardOptions.set(
      s("cardOptions") ? JSON.parse(s("cardOptions")!) : [...DEFAULT_CARDS],
    );
    this.expenseAccountOptions.set(
      s("expenseAccountOptions")
        ? JSON.parse(s("expenseAccountOptions")!)
        : [...DEFAULT_EXPENSE_ACCOUNTS],
    );
    // Load custom prompt or set default if empty
    const savedPrompt = s("customPromptTemplate");
    if (savedPrompt && savedPrompt.trim()) {
      this.customPromptTemplate.set(savedPrompt);
    } else {
      this.customPromptTemplate.set(DEFAULT_PROMPT_TEMPLATE);
    }
  }

  updateApiKey(key: string) {
    this.apiKey.set(key);
    localStorage.setItem("unified_apiKey", key);
  }
  updateSelectedModel(model: string) {
    this.selectedModel.set(model);
  }
  updateCard(card: string) {
    this.selectedCard.set(card);
  }
  updateTargetYear(year: number) {
    this.targetYear.set(year);
  }
  updateTaxType(type: TaxType) {
    this.taxType.set(type);
  }
  updateSimplifiedMethod(val: "inclusive" | "exclusive") {
    this.simplifiedMethod.set(val);
  }
  updateSimplifiedCalcType(val: "internal" | "external") {
    this.simplifiedCalcType.set(val);
  }
  updateSimplifiedBizClass(val: number) {
    this.simplifiedBizClass.set(val);
  }
  updateSimplifiedTaxRate(val: "10%" | "8%") {
    this.simplifiedTaxRate.set(val);
  }
  updateShowSystemColumns(show: boolean) {
    this.showSystemColumns.set(show);
  }
  updateAutoRedirectToEdit(val: boolean) {
    this.autoRedirectToEdit.set(val);
  }
  updatePromptTemplate(template: string) {
    this.customPromptTemplate.set(template);
  }
  resetPromptTemplate() {
    this.customPromptTemplate.set(DEFAULT_PROMPT_TEMPLATE);
  }

  async setFile(file: File) {
    this.isLoading.set(true);
    this.error.set(null);
    this.currentFileName.set(file.name);
    this.csvData.set(null);
    this.processedTransactions.set([]);
    this.pages.set([]);
    try {
      if (file.type === "application/pdf") {
        this.isPdf.set(true);
        await this.convertPdfToImages(file);
      } else {
        this.isPdf.set(false);
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          this.pages.set([
            {
              id: crypto.randomUUID(),
              image: base64,
              rotation: 0,
              pageNumber: 1,
            },
          ]);
          this.isLoading.set(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      this.error.set("ファイルの読み込みに失敗しました: " + err.message);
      this.isLoading.set(false);
    }
  }

  async fetchModels() {
    const key = this.apiKey();
    if (!key) return;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      );
      const data = await response.json();
      if (data.models) {
        const models = data.models
          .filter(
            (m: any) =>
              m.name.includes("gemini") &&
              m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m: any) => m.name.replace("models/", ""))
          .sort()
          .reverse(); // Newest first usually
        this.modelList.set(models);
        // If current selection is not in list (and list is not empty), default to first available or keep if valid
        if (models.length > 0 && !models.includes(this.selectedModel())) {
          // Prefer 2.0-flash if available, else first
          if (models.includes("gemini-2.0-flash"))
            this.selectedModel.set("gemini-2.0-flash");
          else if (models.includes("gemini-1.5-flash"))
            this.selectedModel.set("gemini-1.5-flash");
          else this.selectedModel.set(models[0]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch models", e);
    }
  }

  private async convertPdfToImages(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib)
      throw new Error(
        "PDF処理ライブラリがロードされていません。ページを再読み込みしてください。",
      );
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: "/cmaps/",
      cMapPacked: true,
    }).promise;
    const totalPages = pdf.numPages;
    const newPages: PageData[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const scale = 2.0;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      if (!context) throw new Error("Canvas context作成エラー");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      newPages.push({
        id: crypto.randomUUID(),
        image: canvas.toDataURL("image/jpeg", 0.85),
        rotation: 0,
        pageNumber: i,
      });
    }
    this.pages.set(newPages);
    this.isLoading.set(false);
  }

  rotatePageLeft(index: number) {
    this.pages.update((pages) => {
      const n = [...pages];
      n[index] = {
        ...n[index],
        rotation: (n[index].rotation - 90 + 360) % 360,
      };
      return n;
    });
  }
  rotatePageRight(index: number) {
    this.pages.update((pages) => {
      const n = [...pages];
      n[index] = { ...n[index], rotation: (n[index].rotation + 90) % 360 };
      return n;
    });
  }
  removePage(index: number) {
    this.pages.update((pages) => pages.filter((_, i) => i !== index));
    if (this.pages().length === 0) this.clearAllFiles();
  }
  clearAllFiles() {
    this.pages.set([]);
    this.currentFileName.set("");
    this.csvData.set(null);
    this.processedTransactions.set([]);
  }

  addItem(type: "card" | "expenseAccount", item: string) {
    if (!item.trim()) return;
    const target =
      type === "card" ? this.cardOptions : this.expenseAccountOptions;
    target.update((list) => (list.includes(item) ? list : [...list, item]));
  }
  removeItem(type: "card" | "expenseAccount", item: string) {
    const target =
      type === "card" ? this.cardOptions : this.expenseAccountOptions;
    target.update((list) => list.filter((i) => i !== item));
  }
  addRule() {
    this.expenseRules.update((rules) => [
      ...rules,
      { keyword: "", account: "" },
    ]);
  }
  updateRule(index: number, field: keyof Rule, value: string) {
    this.expenseRules.update((rules) => {
      const n = [...rules];
      n[index] = { ...n[index], [field]: value };
      return n;
    });
  }
  deleteRule(index: number) {
    this.expenseRules.update((rules) => rules.filter((_, i) => i !== index));
  }

  findAccount(description: string): string {
    const norm = normalizeForMatch(description);
    for (const rule of this.expenseRules()) {
      if (
        rule.keyword &&
        rule.account &&
        norm.includes(normalizeForMatch(rule.keyword))
      )
        return rule.account;
    }
    return "雑費";
  }

  findMatchingRule(description: string): Rule | undefined {
    const norm = normalizeForMatch(description);
    return this.expenseRules().find(
      (r) =>
        r.keyword && r.account && norm.includes(normalizeForMatch(r.keyword)),
    );
  }

  private extractMissingRules(transactions: Transaction[]) {
    const rules = this.expenseRules();
    const normalizedKeywords = rules.map((r) => normalizeForMatch(r.keyword));
    const newRules: Rule[] = [];
    const addedNorms = new Set<string>();
    transactions.forEach((tx) => {
      const desc = tx.description.trim();
      if (!desc) return;
      const normDesc = normalizeForMatch(desc);
      if (addedNorms.has(normDesc)) return;
      // Skip if any existing rule keyword matches (normalized)
      const isCovered = normalizedKeywords.some(
        (nk) => nk && normDesc.includes(nk),
      );
      // Also skip if already exists as keyword (normalized)
      const existsAsKeyword = normalizedKeywords.some((nk) => nk === normDesc);
      if (!isCovered && !existsAsKeyword) {
        // Use AI-predicted account if available, otherwise empty
        newRules.push({ keyword: desc, account: tx.account || "" });
      }
      addedNorms.add(normDesc);
    });
    if (newRules.length > 0)
      this.expenseRules.update((r) => [...r, ...newRules]);
  }

  updateTransaction(index: number, field: keyof Transaction, value: any) {
    this.processedTransactions.update((txs) => {
      const n = [...txs];
      const updated = { ...n[index], [field]: value };
      n[index] = updated;
      if (field === "account" && updated.description) {
        this.upsertRule(updated.description, value);
        for (let i = 0; i < n.length; i++) {
          if (i !== index && n[i].description === updated.description)
            n[i] = { ...n[i], account: value };
        }
      }
      return n;
    });
  }
  deleteTransaction(index: number) {
    this.processedTransactions.update((txs) =>
      txs.filter((_, i) => i !== index),
    );
  }

  private upsertRule(keyword: string, account: string) {
    this.expenseRules.update((rules) => {
      const idx = rules.findIndex((r) => r.keyword === keyword);
      if (idx !== -1) {
        const n = [...rules];
        n[idx] = { ...n[idx], account };
        return n;
      }
      return [...rules, { keyword, account }];
    });
  }

  private async getRotatedImageData(page: PageData): Promise<string> {
    if (page.rotation === 0) return page.image;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject("Canvas context failed");
          return;
        }
        if (page.rotation % 180 !== 0) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((page.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = reject;
      img.src = page.image;
    });
  }

  async processImage() {
    const key = this.apiKey();
    const card = this.selectedCard();
    const year = this.targetYear();
    const pages = this.pages();
    if (!key) {
      this.error.set("APIキーを入力してください");
      return;
    }
    if (!card) {
      this.error.set("カードを選択してください");
      return;
    }
    if (pages.length === 0) {
      this.error.set("ファイルを選択してください");
      return;
    }
    this.isLoading.set(true);
    this.isLoading.set(true);
    this.error.set(null);
    this.tokenUsage.set(null);
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const accountList = this.expenseAccountOptions().join("、");
      
      let promptText = this.customPromptTemplate();
      if (!promptText.trim()) promptText = DEFAULT_PROMPT_TEMPLATE;

      // Replace placeholders
      promptText = promptText
        .replace(/{{year}}/g, String(year))
        .replace(/{{account_list}}/g, accountList);

      const parts: any[] = [{ text: promptText }];
      for (const page of pages) {
        const rotatedImage = await this.getRotatedImageData(page);
        const match = rotatedImage.match(/^data:(.*?);base64,(.*)$/);
        if (match)
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
      const response = await ai.models.generateContent({
        model: this.selectedModel(),
        contents: { parts },
        config: { responseMimeType: "application/json" },
      });
      console.log("Gemini Response:", response);
      if (response.usageMetadata) {
        this.tokenUsage.set({
          input: response.usageMetadata.promptTokenCount || 0,
          output: response.usageMetadata.candidatesTokenCount || 0,
        });
      }
      const text = response.text;
      if (!text) throw new Error("AIからの応答が空でした");
      let jsonStr = (typeof text === "string" ? text : String(text)).trim();
      jsonStr = jsonStr
        .replace(/^```json/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "");
      const data = JSON.parse(jsonStr);
      if (!data.transactions || !Array.isArray(data.transactions))
        throw new Error("期待されたJSON形式ではありませんでした");
      const txs = data.transactions.map((tx: any) => {
        const desc = tx.description || "";
        // Priority: rule setting > AI prediction > default
        const ruleAccount = this.findAccount(desc);
        const aiAccount = tx.account || "";
        const account =
          ruleAccount !== "雑費" ? ruleAccount : aiAccount || "雑費";
        return {
          date: tx.date || "",
          description: desc,
          amount: Number(tx.amount) || 0,
          note: tx.note || "",
          account,
        };
      });
      this.processedTransactions.set(txs);
      this.extractMissingRules(txs);
    } catch (err: any) {
      this.error.set(
        "エラーが発生しました: " + (err.message || "不明なエラー"),
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  generateCsv(transactions: Transaction[], card: string) {
    const showSystem = this.showSystemColumns();
    let headers: string[];
    if (showSystem) {
      headers = [
        "フラグ",
        "",
        "",
        "日付",
        "借方勘定",
        "借方補助",
        "借方部門",
        "借方税区分",
        "借方金額",
        "借方税額",
        "貸方勘定",
        "貸方補助",
        "貸方部門",
        "貸方税区分",
        "貸方金額",
        "貸方税額",
        "摘要",
        "",
        "",
        "タイプ",
        "",
        "仕訳メモ",
        "付箋1",
        "付箋2",
        "",
      ];
    } else {
      headers = [
        "日付",
        "借方勘定",
        "借方補助",
        "借方部門",
        "借方税区分",
        "借方金額",
        "借方税額",
        "貸方勘定",
        "貸方補助",
        "貸方部門",
        "貸方税区分",
        "貸方金額",
        "貸方税額",
        "摘要",
      ];
    }
    const rows = [headers.map((h) => `"${h}"`).join(",")];
    const taxType = this.taxType();
    transactions.forEach((tx) => {
      // Priority: tx.account (user edit / AI prediction) > rule match > default
      const matchedRule = this.findMatchingRule(tx.description);
      let account =
        tx.account || matchedRule?.account || this.findAccount(tx.description);
      const note = tx.note ? `${tx.description} ${tx.note}` : tx.description;
      const amount = Math.abs(tx.amount).toString();
      let expenseTaxCategory = "課対仕入10%";
      if (taxType === "exempt" || taxType === "simplified")
        expenseTaxCategory = "対象外";
      // Per-rule tax category override
      if (matchedRule?.taxCategory)
        expenseTaxCategory = matchedRule.taxCategory;
      let rowData: string[];
      if (showSystem) {
        rowData = [
          "2000",
          "",
          "",
          tx.date,
          account,
          "",
          "",
          expenseTaxCategory,
          amount,
          "",
          "未払金",
          card,
          "",
          "対象外",
          amount,
          "",
          note,
          "",
          "",
          "0",
          "",
          "",
          "",
          "",
          "no",
        ];
      } else {
        rowData = [
          tx.date,
          account,
          "",
          "",
          expenseTaxCategory,
          amount,
          "",
          "未払金",
          card,
          "",
          "対象外",
          amount,
          "",
          note,
        ];
      }
      rows.push(rowData.map((cell) => `"${cell}"`).join(","));
    });
    this.csvData.set(rows.join("\r\n"));
  }

  downloadCsv() {
    const data = this.csvData();
    if (!data) return;
    const unicodeList = [];
    for (let i = 0; i < data.length; i++) unicodeList.push(data.charCodeAt(i));
    const sjisCodeList = Encoding.convert(unicodeList, {
      to: "SJIS",
      from: "UNICODE",
    });
    const uint8Array = new Uint8Array(sjisCodeList);
    const blob = new Blob([uint8Array], { type: "text/csv;charset=Shift_JIS" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.download = `弥生会計インポート_クレカ_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    const blob = new Blob([manualText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "弥生会計インポート手順書_クレカ.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
