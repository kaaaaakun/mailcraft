# 🏗️ Mailcraft アーキテクチャ解説(新人エンジニア向け)

> UI の構成・操作感は Unlayer 等のメールエディタに着想を得ていますが、Unlayer とは無関係で、コード・アイコン・ロゴ・文言は一切流用していません(アイコンは `src/editor/icons.ts` の自作 SVG)。

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
| `src/editor/editor.ts` | キャンバス描画、D&D、キーボード操作、左サイドバー(コンテンツ / 行のタブ)と右コンテキストパネル(全体設定 / プロパティ) |
| `src/editor/panel.ts` | プロパティパネル(アコーディオン式セクション) |
| `src/editor/color.ts` | 色のパース・WCAG コントラスト・OKLCH 計算(ブランドカラー導出用の純関数) |
| `src/editor/theme.ts` | テーマ型 `MailcraftTheme`、`defaultTheme` / `darkTheme`、CSS 変数への反映 |
| `src/editor/icons.ts` | 自作のインライン SVG アイコン |
| `src/editor/styles.css` | 全スタイル。色はすべて `--mc-*` 変数経由 |
| `src/i18n/` | `en.ts`(キー定義)/ `ja.ts` / `index.ts`(`createI18n`、`locales`) |

## 設計の判断メモ

1. **キャンバスもメール HTML と同じ `renderBlockContent` を使う** → 編集画面と出力結果のズレを最小化。
2. **undo はスナップショット方式**(JSON 文字列を積む)。実装が単純で壊れにくい。連続入力は `coalesceKey` で 1 ステップにまとめる(800ms)。
3. **再描画スコープ** (`all` / `canvas` / `none`): パネルの input 操作中にパネルを作り直すとフォーカスが飛ぶため、プロパティ編集は canvas のみ再描画、テキスト入力は再描画なし。
4. **D&D は HTML5 Drag and Drop**。`dragover` 中は `dataTransfer` が読めないため、ドラッグ中の中身はクロージャ変数 `drag` に保持。ドロップ位置は「ポインタ Y 座標とブロック中央の比較」でインデックスを決める。
5. **メール HTML は table + inline style**。Outlook 等は `<div>` レイアウトや外部 CSS に弱いため。モバイルは `@media` で `.mc-col` を `display:block` にして縦積み。

## UI の構成

```
┌ 上部バー: [元に戻す/やり直す]        [デスクトップ|モバイル]            [プレビュー] ┐
├──────────────────┬────────────────────────────┬───────────────────────┤
│ 左: 追加ツール    │ キャンバス(ページ背景>本体) │ 右: コンテキストパネル  │
│ タブ: コンテンツ|行│ 行・ブロックにホバー/選択で │ ・未選択: 全体設定(Body)│
│ ・コンテンツ:     │ 枠と浮動ツールバー          │ ・選択中: プロパティ    │
│   ツールのタイル  │                            │   (折りたたみ式セクション)│
│ ・行: 列レイアウト │                            │                       │
└──────────────────┴────────────────────────────┴───────────────────────┘
```

- **左サイドバー** (`renderSidebarEl`): 「追加」系のみ。選択状態に依存しないため、選択変更では再描画しません(ドロップ完了時にドラッグ元タイルが差し替わるのを避けるため)。タブ状態は `tab`(`content` | `rows`)。
- **右パネル** (`renderPanelEl`): 選択状態から表示を決めます。何も選択していなければ全体設定、行/ブロックを選択すればそのプロパティ(テキストブロックは文字装飾セクション付き)。キャンバスの空白クリックで選択解除すると全体設定に戻ります。`data-view="body|props"` で状態を確認できます。
- アコーディオンの開閉状態は `collapsed` セットに保持し、再描画しても維持します。
- プレビュー中は両サイドバーを非表示。レイアウトの切替は次節。配色は `--mc-*` テーマ変数のみを使うためダークモードにも追従します。

## レイアウトの切替 (`layout.ts`)

ライブラリは他サイトの一部として埋め込まれるため、**ブラウザ幅(`@media`)ではなくエディタ自身のコンテナ幅**で形を決めます。

```
 ResizeObserver(root) ──幅(px)──▶ resolveLayout(layout, width) ──▶ root.dataset.layout = wide | compact | stacked
                                      ▲                                     │
 createEditor({layout}) / setLayout() ┘ (mergeLayout で検証・累積)           ▼
                                                        CSS: .mc-root[data-layout=compact] .mc-sidebar { ... }
```

- 幅の判定は `auto` のとき `幅 >= breakpoints.compact` → wide、`>= breakpoints.stacked` → compact、それ未満 → stacked(既定 1100 / 820)。`split` / `compact` / `stacked` は幅に関係なく固定。
- **CSS は `data-layout` 属性だけ**を見ます(旧 `@media (max-width:820px)` は廃止)。そのため広い画面の狭いカラムに置いても縦積みになります。
- レイアウト変更では **再レンダリングしません**。属性と CSS 変数(`--mc-left-w` / `--mc-right-w`)を書き換えるだけなので、選択・スクロール・フォーカス・パレットの DOM はそのままです。
- `compact` は左パレットを 92px のアイコンレール(1 列のタイル)にします。タイルはそのままなので D&D もクリック追加も動きます。
- `sidebars.left/right = false` は `hidden` 属性で非表示にします(DOM は残す)。左を隠すとパレットからの追加はできなくなるため、ホスト側で別の追加手段を用意してください。
- **jsdom / 古いブラウザ**: `ResizeObserver` が無ければ `window` の `resize` で再計測するフォールバックを使い、幅が不明(0)なときは wide とします。SSR では DOM が無いのでそもそも `createEditor` は動きません(HTML 書き出しの `renderHtml` は DOM 不要)。
- 入力は `mergeLayout` で防御的に検証します(不正値は無視・幅は clamp・`compact < stacked` の組は無視)。`setLayout` は `setTheme` と同様に部分指定を累積します。
- テスト: `tests/layout.test.ts`(ResizeObserver をモック)。実ブラウザ: `tests/e2e/layout-real.mjs`(ビューポートのリサイズ、広いページ内の狭いコンテナ、固定モード、サイドバー、各モードでの D&D)。

## テーマ (`theme.ts`)

- エディタのルート要素 `.mc-root` に `--mc-accent` などの **CSS カスタムプロパティ**を書き込むだけの設計です。`createEditor` の `theme` と `setTheme()` はどちらも同じ `applyTheme()` を通ります。
- `mode: 'dark'` は `darkTheme` プリセットを土台にし、ユーザー指定値で上書きします。`setTheme` は指定値を累積して保持します(アクセント色を変えたあとにダークへ切り替えてもアクセントは保たれます)。
- 選択枠・ホバー枠・フォーカスリング・淡い塗りは `color-mix()` で `--mc-accent` から導出しているので、色を 1 つ変えれば全体が追従します。`accentSoft` を指定したときだけ上書きします。
- **テーマが影響するのはエディタの外枠だけ**です。メール本文の色は Design JSON の値であり、ダークモードでも書き出す HTML は変わりません(キャンバスは常に実際のメールの見た目)。

### ブランドカラーからの導出 (実験的・issue #4 で議論中)

`theme.brand = { primary, secondary, normal }`(重要度順の 3 色)から残りのトークンを自動導出します。実装は `src/editor/color.ts`(色計算)と `theme.ts` の `deriveTheme()`(純関数)です。

```
 brand.normal ──► 無彩色寄りの階調 (OKLCH: 色相は保持 / 彩度は低く固定 / 明度だけ再配置)
                    └─► --mc-bg / --mc-panel / --mc-border / --mc-text / --mc-muted
 brand.primary ─► --mc-accent (+ contrast / soft / line / hover / active / ink / focus-ring)
 brand.secondary► --mc-secondary-* (行 chrome・タイルの hover 面・アイコン色 --mc-icon)
        mode 'light' | 'dark' ─ 同じ 3 色から明度だけ変えて再導出
```

- **色空間**: 明度のずらし・混色は OKLab / OKLCH(知覚的に均等)。sRGB に収まらない場合は彩度を下げて収めます(色相・明度は保持)。
- **コントラスト**: `onPrimary` / `onSecondary` は白か黒のうち AA(4.5:1)を満たす方(どちらも満たせない場合は高い方)。hover/active は文字色から遠ざける向きにずらすので、文字とのコントラストは下がりません。ダークでは primary/secondary をパネル上で 4.5:1 になるまで明るくします。ライトでは指定色をそのまま使い、パネル上で見えにくい(< 3:1)場合は `warnings` に出します。
- **優先順位**: 明示キー(`background` / `panel` / `text` ...)> brand からの導出 > light/dark プリセット。`brand` も `accent` も無いときは従来どおりプリセットそのままで、`--mc-*` の追加変数は書きません(CSS 側のフォールバックが `--mc-secondary: var(--mc-accent)` なので見た目は従来と同じ)。
- **`accent` エイリアス**: `accent` は `brand.primary` の別名で、`mergeThemeInput` が「最後に指定した方が勝つ」よう累積します。`brand` 未使用時の `accent` は従来どおりそのまま(ダークでも明るくしない)使います。
- **入力の検証**: `accent` と `brand.*` は `parseColor` で検証し、不正値は無視して前の値を保持します(例外は投げません)。`setTheme` / `createEditor` は `mergeThemeInput` を通ります。
- 既知の未対応: hover/active/disabled のトークンは用意しましたが、コンポーネントの CSS はまだ多くが参照していません(CSS は別作業の担当範囲のため)。

## 多言語 (i18n)

- メッセージ辞書は `src/i18n/en.ts` が **キーの定義元**で、`Messages` 型(全キー必須)を `ja.ts` が実装します。キーが足りないと型エラーになり、さらにテストでも `en` と `ja` のキー一致を検証します。
- 翻訳は `createI18n(locale, custom)` が返す `t(key, params)` で行います。探索順は `messages[完全一致] → messages[言語のみ] → 内蔵[完全一致] → 内蔵[言語のみ] → messages.en → en → キー文字列` で、**欠けたキーでも落ちません**。`{n}` 形式のプレースホルダを置換できます。
- ロケール未指定時は `navigator.language` から推定し、見つからなければ `en`。
- `setLocale()` は `i18n` を差し替えて全体を再描画します(キャンバスの内容=メール本文は翻訳対象外)。
- 新規ブロックの初期文言(`defaultText` など)も辞書から取り、`createBlock(type, labels)` に渡します。コア(`src/core`)は DOM にも i18n にも依存しません。

## ドラッグ&ドロップの仕組み

ドロップ先の判定は `canvasWrap` 上の単一の `dragover` ハンドラ(`updateDropTarget`)で行います。

| ドラッグ中のもの | 列の上 | 列の外(行の余白・行間・ページ余白・空のキャンバス) |
|---|---|---|
| ブロック(新規/移動) | その列の挿入位置 | **1 列の新しい行**として行の位置に挿入 |
| 行(新規/移動) | 行の位置(列には入らない) | 行の位置 |

キャンバス外(パネルなど)ではドロップ不可にし、`dragleave` で挿入インジケーターを消します。`dragend` / `drop` はドキュメントレベルでも捕捉して、ドラッグ状態とインジケーターを必ず後始末します(以前はポインタが列からパネルへ出てもインジケーターが残る不具合がありました)。`tests/dnd.test.ts` が各組み合わせを検証します。

### 実ブラウザでの落とし穴(対策済み)

- **ドロップ先は `drop` イベント自体から再計算する**。直前の `dragover` の結果に頼ると、WebKit では `dragleave` の `relatedTarget` が常に `null` のため、子要素を跨ぐたびにターゲットが消え、素早く離すと「何も起きない」状態になった。`dragleave` も座標で判定し、パネル等の上では document レベルの `dragover`(capture)でインジケーターを消す。
- **OS からの画像ファイルのドロップ**(`dataTransfer.types` に `Files`)は画像ブロックとして挿入し、アップロード後に `src` を設定する。エディタのクローム部分(ツールバー等)に落としてもブラウザがファイルへ遷移しないよう `preventDefault` する。
- **タッチ端末**: HTML5 D&D はタッチで不安定なため、タイルの **クリックで追加** を併用する(ポインタイベント版は未実装)。
- **実ポインタ E2E**: `tests/e2e/dnd-real.mjs`(`npm test` には含まれない)。`npm i --no-save playwright-core` の上で `BROWSER=chromium|firefox node tests/e2e/dnd-real.mjs`(`BASE_URL` でデモ URL を指定、`SAFARI_SIM=1` で WebKit 風の `relatedTarget=null` を再現)。

## 検証方法 🧪

```bash
npm run typecheck   # 型
npm test            # core / editor smoke / D&D / theme / i18n / layout(jsdom)
npm run build       # デモのビルド
```
ブラウザでの D&D は Playwright(headless Chromium)で確認済み。
