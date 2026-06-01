# 弥生CSV変換ツール（統合版）

領収書・クレジットカード明細・通帳の画像やPDFをGoogle Gemini AIで読み取り、**弥生会計用のCSV**を自動生成するWebアプリケーションです。

## デモサイト

https://yayoi-gakusyu.github.io/yayoi-converter/

## 機能

### 3つの変換モード

| モード | 入力 | 出力 |
|--------|------|------|
| 💳 クレカ明細 | クレジットカード明細のPDF/画像 | 未払金仕訳CSV |
| 📄 通帳 | 通帳の写真/PDF | 普通預金仕訳CSV（出金・入金対応） |
| 🧾 領収書 | 領収書・レシートのPDF/画像 | 現金仕訳CSV |

### 主な特徴

- **AI-OCR**: Google Gemini APIによる高精度な文字認識・データ抽出
- **自動仕訳**: 勘定科目を自動推測（学習ルールによるカスタマイズ可）
- **税区分対応**: 標準課税・簡易課税・免税に対応
- **和暦変換**: 令和表記を自動的に西暦に変換
- **インボイス対応**: 登録番号の読み取り（領収書モード）
- **弥生フォーマット**: Shift_JISエンコードで弥生会計にそのままインポート可能
- **PDF対応**: 複数ページのPDFも一括処理
- **編集機能**: AI読み取り結果をグリッド上で修正可能（Undo対応）

## セットアップ

### 必要なもの

- [Google AI Studio](https://aistudio.google.com/) で取得したGemini APIキー

### ブラウザで使う（推奨）

デモサイトにアクセスし、APIキーを設定するだけで利用できます。データはすべてブラウザのlocalStorageに保存され、外部サーバーには送信されません。

### ローカルで開発する場合

```bash
# 依存パッケージのインストール
npm install --legacy-peer-deps

# 開発サーバー起動（http://localhost:3003）
npm run dev

# テスト実行
npm test

# プロダクションビルド
npm run build
```

## 使い方

1. 画面上部でモード（クレカ/通帳/領収書）を選択
2. 「設定」タブでGemini APIキーを入力
3. 「変換」タブで画像またはPDFをアップロード
4. 「AI読み取り開始」をクリック
5. 結果を確認・編集し、「CSVダウンロード」

## 技術スタック

- Angular 21（Standalone Components / Signals）
- Google Gemini API
- Tailwind CSS
- TypeScript
- Vitest

## デプロイ

`main` ブランチへのプッシュ時にGitHub Actionsで自動ビルド・GitHub Pagesへデプロイされます。

## ライセンス

Private
