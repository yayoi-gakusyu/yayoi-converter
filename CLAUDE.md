# 弥生CSV変換ツール（統合版）

## 概要

領収書・クレジットカード明細・通帳の画像/PDFをGoogle Gemini AIで読み取り、弥生会計用のCSVを生成するWebアプリケーション。

## 技術スタック

- Angular 21 (Standalone Components, Signals)
- Google Gemini API (OCR・データ抽出)
- Tailwind CSS
- TypeScript
- Vitest (テスト)

## 開発コマンド

```bash
npm install --legacy-peer-deps
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm test             # テスト実行
```

## デプロイ

GitHub Actionsにより、`main` ブランチへのプッシュ時に自動ビルド・GitHub Pagesへデプロイされる。

## プロジェクト構成

```
src/
├── app.component.ts/html     # メインコンポーネント
├── components/               # UIコンポーネント群
├── services/
│   ├── base-logic.service.ts        # 共通ロジック基底クラス
│   ├── creditcard-logic.service.ts  # クレカ明細モード
│   ├── bank-logic.service.ts        # 通帳モード
│   ├── receipt-logic.service.ts     # 領収書モード
│   ├── mode.service.ts              # モード切替管理
│   ├── journal-learning.service.ts  # 仕訳学習
│   └── history.service.ts           # Undo履歴
├── utils/                    # ユーティリティ (税計算, フォーマット, AIリトライ)
└── types.ts                  # 型定義
```
