# 弥生CSV変換ツール - プロジェクト指示書

## アプリの起動方法（標準手順）

このアプリはNode.jsが未インストールの環境のため、ビルド済みの `dist` フォルダを使ってローカルサーバーで配信する。

### 手順

1. `serve.ps1` をバックグラウンドで起動する
   ```
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "serve.ps1"
   ```
2. Chromeで `http://localhost:8080/` を開く
   ```
   powershell.exe -NoProfile -Command "Start-Process 'chrome.exe' 'http://localhost:8080/'"
   ```

### 注意事項

- ブラウザは必ず **Chrome** を使う（Edgeではなく）
- サーバーはポート **8080** で起動する
- `npm run dev` は使用しない（Node.js未インストールのため）
