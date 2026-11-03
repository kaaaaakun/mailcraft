# 🏗️ Mailcraft アーキテクチャ解説(新人エンジニア向け)

## 全体像

```
 ┌─────────────┐  編集   ┌──────────────┐  変更通知   ┌─────────────────┐
 │  ユーザー    │ ──────▶ │ EditorStore  │ ──────────▶ │ UI (editor/*)   │
 │ (D&D/入力)   │         │ Design JSON  │ ◀────────── │ canvas + panel  │
 └─────────────┘         │ + 履歴(undo) │   読み取り    └─────────────────┘
                         └──────┬───────┘
                                │ renderHtml(design)
                                ▼
                        ┌──────────────────┐
                        │ メール用 HTML     │  ← table + inline style
                        └──────────────────┘
```

**ポイント: 「JSON が唯一の真実 (Single Source of Truth)」**。画面は JSON を描画しているだけで、編集 = JSON の書き換え、書き出し = JSON から HTML への変換です。

## データモデル (`src/core/types.ts`)

```
Design
 ├─ body : 背景色 / 幅 / フォント / プリヘッダー
 └─ rows[]  (Row)         ← 横の帯
      └─ columns[] (Column) ← ratios=[1,2] なら 33% / 67%
           └─ blocks[] (Block)  ← text / heading / image / button / divider / spacer / html
```

## ディレクトリ

| パス | 役割 |
|---|---|
| `src/core/types.ts` | JSON スキーマ(型) |
| `src/core/defaults.ts` | ブロック/行の初期値、サンプル |
| `src/core/ops.ts` | 移動・複製・削除などの純粋関数(テスト容易) |
| `src/core/render.ts` | JSON → メール HTML(DOM 不要、Node でも動く) |
| `src/core/store.ts` | 状態 + undo/redo(JSON スナップショット方式) |
| `src/core/sanitize.ts` | リッチテキストのサニタイズ(ブラウザ用) |
| `src/editor/editor.ts` | キャンバス描画、D&D、キーボード操作 |
| `src/editor/panel.ts` | 右側のプロパティパネル |

## 設計の判断メモ

1. **キャンバスもメール HTML と同じ `renderBlockContent` を使う** → 編集画面と出力結果のズレを最小化。
2. **undo はスナップショット方式**(JSON 文字列を積む)。実装が単純で壊れにくい。連続入力は `coalesceKey` で 1 ステップにまとめる(800ms)。
3. **再描画スコープ** (`all` / `canvas` / `none`): パネルの input 操作中にパネルを作り直すとフォーカスが飛ぶため、プロパティ編集は canvas のみ再描画、テキスト入力は再描画なし。
4. **D&D は HTML5 Drag and Drop**。`dragover` 中は `dataTransfer` が読めないため、ドラッグ中の中身はクロージャ変数 `drag` に保持。ドロップ位置は「ポインタ Y 座標とブロック中央の比較」でインデックスを決める。
5. **メール HTML は table + inline style**。Outlook 等は `<div>` レイアウトや外部 CSS に弱いため。モバイルは `@media` で `.mc-col` を `display:block` にして縦積み。

## 検証方法 🧪

```bash
npm run typecheck   # 型
npm test            # core (render/ops/store) + jsdom でのエディタ smoke test
npm run build       # デモのビルド
```
ブラウザでの D&D は Playwright(headless Chromium)で確認済み。
