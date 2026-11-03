# 作業フロー(オーナー合意事項)

オーナーの方針: **PR が揃ったら、サブエージェント同士が互いの PR をレビューし、問題がなければマージする。今後はこの体制で進める。**
本書はその運用ルールの正本。

## 全体フロー

```
依頼
 └─> 分解 (並列にできるか? ファイル所有範囲は分かれているか?)
       └─> 各サブエージェントが別 worktree で branch 作成 + PR
             └─> CI (typecheck / test / build / build:lib)
                   └─> 相互レビュー (作者以外が PR にコメント)
                         ├─ blocker/major あり ─> 作者が修正 ─> 再レビュー ─┐
                         └─ 問題なし <──────────────────────────────────────┘
                               └─> squash merge (オーケストレーター)
                                     └─> main の CI / Pages デプロイ確認
                                           └─> オーナーへ報告
```

## 1. 作業単位

- 作業はオーナーの指示のもと、サブエージェントが行う。
- **1 PR = 1 目的。**
- ブランチ名: `feat/…`(機能)、`fix/…`(不具合)、`docs/…`(ドキュメント)。
- 必ず PR 経由で main に入れる。**main へ直接 push しない。**

## 2. 並列化

- 並列にできる作業は並列で行う。
- 衝突を避けるため、エージェントごとに触るファイルの範囲を分ける。
- 同じファイルを大きく触る作業(例: UI 全面改修)は、先行 PR のマージ後に着手する。
- 各エージェントは別の worktree で作業する。

## 3. PR の要件

- 本文に **目的 / 変更点 / 検証結果 / 互換性 / 既知の制限** を書く。
- 次がローカルで通ること: `npm run typecheck` / `npm test` / `npm run build` / `npm run build:lib`。
- CI が緑(`.github/workflows/ci.yml` は上記 4 つを `npm ci` の後に実行する)。
- UI 変更は実ブラウザで確認し、スクリーンショットを載せる。
- README / `docs/ARCHITECTURE.md` など関連ドキュメントを更新する。
- コミットメッセージ末尾に `Co-Authored-By: …` を付ける。
- PR 本文末尾に生成表記(`🤖 Generated with [Claude Code](https://claude.com/claude-code)`)を付ける。
- `@メンション` を書かない(通知が飛ぶため)。

## 4. 相互レビュー

PR が揃ったら、各 PR を **その PR の作者ではない** サブエージェントが 1 回以上レビューする(作者同士のローテーション可)。
レビューは PR にコメントとして残す(`gh pr review --comment` / `gh pr comment`)。

### チェックリスト

- [ ] 正しさ / 回帰
- [ ] セキュリティ(XSS・入力検証・URL の扱い)
- [ ] テストの十分さ
- [ ] 後方互換(公開 API・JSON スキーマ)
- [ ] 他の PR との衝突
- [ ] i18n(en / ja のパリティ)・a11y
- [ ] ドキュメントの正確さ(実装と食い違う主張がないか)
- [ ] ライセンス / 公開設定に触れていないか

### 指摘の分類

| 区分 | 意味 | マージ |
| --- | --- | --- |
| blocker | 動かない・回帰・セキュリティ・方針違反 | 不可 |
| major | 重要な不備(テスト欠如、互換性破壊の疑いなど) | 不可 |
| minor | 直した方がよいが致命的でない | 可(対応推奨) |
| nit | 好みレベル | 可 |

blocker / major が未解決ならマージしない。作者が修正し、再レビューを受ける。

## 5. マージ条件(すべて満たす)

1. CI 緑。
2. レビューで未解決の blocker / major がない。
3. コンフリクトなし(必要ならマージ順に rebase)。
4. 下記「オーナー確認が必要なもの」を含まない。

- 方法: squash merge(`gh pr merge --squash --delete-branch`)。
- 順序: 依存の少ない順。コア → エディタ → 見た目。
- **マージの実行はオーケストレーター(メインの Claude)が行う。** マージ後に main の CI と Pages デプロイ(`pages.yml`)が緑か確認し、結果をオーナーへ報告する。

## 6. オーナーの事前確認が必要なもの(自動マージしない)

- リポジトリの公開範囲の変更
- Pages 設定の変更
- npm 公開
- ライセンスの変更
- 履歴の書き換え / force push
- ブランチ・リポジトリ・Issue の削除
- 外部サービスへの課金や権限付与
- セキュリティ上重大な指摘が未解決のもの

## 7. 設計判断・デザイン方針

GitHub Issue(label: `design` / `discussion`)で議論し、オーナーの決定を待つ。決定済み事項は各 Issue のコメントに従う。

## 8. 環境メモ

- この環境では SSH の git が固まる。HTTPS で push する:
  `git -c "credential.helper=!gh auth git-credential" push https://github.com/kaaaaakun/mailcraft.git HEAD:refs/heads/<branch>`
- `pkill -f` はシェルごと巻き込むことがある。ポート指定で `fuser -k <port>/tcp` を使う。
- プレビュー(`vite preview`)のポートはエージェントごとに分ける。
- 実ブラウザ検証は `playwright-core`(Chromium)。`tests/e2e/*.mjs` が例。
