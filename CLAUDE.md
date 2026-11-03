# CLAUDE.md

mailcraft は、ドラッグ&ドロップでHTMLメールを組み立てるブラウザ用エディタ(TypeScript + Vite)。
ライセンスは PolyForm Noncommercial(`LICENSE` / `LICENSE-HISTORY.md` 参照)。構成は `docs/ARCHITECTURE.md`。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー (vite) |
| `npm test` | 単体テスト (vitest run) |
| `npm run typecheck` | 型チェック (`tsc --noEmit`) |
| `npm run build` | 型チェック + デモのビルド (`dist-demo`) |
| `npm run build:lib` | ライブラリのビルド + 型定義出力 |

- `tests/e2e/*.mjs` は実ブラウザ検証用スクリプトで、`playwright-core` が必要。`npm test` には含まれない。
- CI(`.github/workflows/ci.yml`)は `npm ci` → typecheck → test → build → build:lib を実行する。

## 作業ルール(必須)

詳細は **[docs/WORKFLOW.md](docs/WORKFLOW.md)**。必ず読んでから作業すること。要点:

1. main へ直接 push しない。`feat/…` `fix/…` `docs/…`(必要なら `chore/…` `refactor/…` `test/…`)のブランチを切り、PR 経由でのみ main に入れる。1 PR = 1 目的。
2. 並列作業は別 worktree・ファイル所有範囲を分けて行う。同じファイルを大きく触る作業は先行 PR のマージ後に着手。
3. PR 前に `npm run typecheck && npm test && npm run build && npm run build:lib` を通し、CI を緑にする。
4. UI 変更は実ブラウザで確認し、スクリーンショットを PR に載せる。関連ドキュメント(README / ARCHITECTURE)も更新する。
5. PR は作者以外のエージェントが **現在の head SHA** に対して 1 回以上レビューする(冒頭に `Reviewed SHA:` と `Verdict:`)。push 後は再レビュー。blocker / major が未解決ならマージしない。オーケストレーターもレビュアーの blocker / major を単独で覆さない。
6. マージは squash merge。実行はオーケストレーターが行う。先行 PR のマージ後は `origin/main` を PR ブランチへ merge して更新する(rebase / force push はしない)。
7. 次はオーナー確認なしに行わない: 公開範囲・Pages 設定・npm 公開・ライセンス変更・履歴書き換え/force push・ブランチ/リポジトリ/Issue の削除(マージ済み PR 自身のブランチを `--delete-branch` で消すのは可)・課金/権限付与・Actions の権限/シークレット/設定の変更・未解決の深刻なセキュリティ指摘のあるもの。完全な一覧は WORKFLOW.md §6。
8. コミット末尾に `Co-Authored-By`、PR 本文末尾に生成表記を付ける。`@メンション` は書かない。
