# CLAUDE.md

このリポジトリで作業する際の Claude 向けガイド。
ユーザー向けの説明は [README.md](README.md) に書く。ここは「**コードを読む前に知っておくと事故らない**」情報を集約する。

---

## このアプリは何か

対象 Web サイトを 5 つのメインカテゴリ (コード品質 / 情報設計 / テキスト品質 / ビジュアル / 操作のしやすさ) と Lighthouse 4 カテゴリで自動評価するクローラー + ダッシュボード。

- 入力: `config/targets.json` の `domains → pages`
- 処理: Playwright でレンダリング → 決定的ルール 48 + AI ルール 25 を実行
- 出力: `public/reports/<timestamp>/report.json` + 全画面スクショ + bbox

---

## ローカル開発のクイックスタート

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
cp .env.example .env             # ANTHROPIC_API_KEY を入れる
pnpm run start:local             # http://127.0.0.1:3001/

# クローラー単発実行 (テスト config 使用)
CONFIG_PATH=config/targets.test.json pnpm run crawl:local
```

**テストランナーは存在しない**。動作確認は基本「ローカルサーバを立てて UI を触る」+「`pnpm run lint` (= `scripts/check-syntax.js` で全 JS を構文チェック) 」の 2 段。ビルドまで通したいなら `pnpm run check` (lint + フロントビルド)。新規ルールを追加したら `pnpm run crawl:local` で実際にクロールを通すこと。

---

## アーキテクチャの最重要ポイント (落とし穴含む)

### 1. クロールはシリアル実行が前提

- `CRAWL_CONCURRENCY=1` (.env) で 1 ページずつ。**並列化は v2.4 で試したが Lighthouse の `performance.mark` 衝突 + メモリ圧迫で revert ([6bb13dd](https://github.com))**
- 同時複数クリックも server.js 側のキューで順番待ち
- 「並列化したほうが早そう」と思っても触らない。事故の温床

### 2. Lighthouse は同一プロセス内 mutex

- `lib/lighthouse.js` でグローバル mutex を持っている
- chrome-launcher は Playwright の Chromium executablePath を再利用 ([12b9276](https://github.com))。コンテナでは独自に Chrome を持っていない
- `LIGHTHOUSE_ENABLED=false` で全停止できる (緊急時)

### 3. `/api/prioritize` は子プロセス分離

- `scripts/prioritize-worker.js` を `child_process.fork` で起動
- 失敗 audit が多いと Anthropic SDK のレスポンス buffer + JSON.parse で V8 ヒープを食って Node 本体ごと落ちた ([0fc40c2](https://github.com), [643df31](https://github.com))
- 子のヒープ上限 768MB / タイムアウト 90s
- **`/api/prioritize` 内では `generatePriorities()` を直接呼ばない**こと。worker 経由にする

### 3.5. クロール本体も子プロセス分離 (target 単位、cron + UI 共通)

- `scripts/crawl-worker.js` を `child_process.fork` で **1 ターゲット (= 1 ページ × デバイス群) ごと**に起動。`scripts/run.js` (cron) と `scripts/server.js` (UI) の両経路で使用
- フォーク制御は `lib/crawl-runner.js` の `runCrawlInWorker(target, opts)` に集約 (両経路から import)
- 動機: Node + Playwright Chromium + Lighthouse 経由 chrome-launcher Chromium の 3 プロセス合算で cgroup OOM (旧 2GB) を起こすインシデント (2026-04-29)。子ごとに使い捨てて Chromium / Playwright の累積メモリ leak を断ち切る
- 子のヒープ上限 1536MB (=`.env` の NODE_OPTIONS と同等) / タイムアウト 15 分。`CRAWL_WORKER_HEAP_MB` / `CRAWL_WORKER_TIMEOUT_MS` で上書き可
- 子プロセス異常終了 (OOM 等) 時:
  - cron 経路: その target だけ error 結果として記録し、**次の target に進む** (1 ページの事故で全クロールを失わない)
  - UI 経路: 当該 job が `status: 'error'` になり、ダッシュボード本体 (Express) は無事
- `onProgress` callback は IPC リレー対応。子から `{type:'progress', p}` 形式で送り、ランナーが親側 callback を呼ぶ
- AI コスト永続化 (`tracker.persist()`) は子側で逐次行う (load-add-write 方式なので合算される)。親 (run.js) 側の `tracker` には prefetch 分のみ積まれ、最後に persist。UI 用の `/api/suggest`, `/api/prioritize` も同様に親側で persist
- IPC 大容量メッセージ (results JSON 数 MB) の flush 待ちは `process.send(msg, callback)` 形式必須。`setImmediate(() => process.exit())` だけでは flush 前に exit して親が「exit before message」と誤判定する

### 4. AI ルールには 2 種類ある

- **通常 AI ルール** (`rules/ai/*.js`): 各ルールが個別の system prompt を持ち、`lib/ai/evaluate.js` 共通フレームワークで実行 (Prompt Caching 対象)
- **ブランド参照型 AI ルール** (`rules/ai/logo-regulation.js`, `rules/ai/brand-guideline.js`): `pageData.brand` から `config/brands/<brand>/*.md` のガイドライン本文を受け取り system prompt を動的生成。`brand` 未指定 (= `target.brand` が null) のドメインでは「対象外」としてスキップ (passed=true)
  - **新ブランド追加 = `config/brands/<id>/` ディレクトリを置くだけ**。ルールコードは触らない
  - `domain.brand` → `target.brand` → `loadBrand()` → `pageData.brand` の経路で各ルール `check()` に届く
  - `lib/ai/create-rule.js` の `buildSystemPrompt(pageData)` を使って動的生成 (静的 `systemPrompt` も依然サポート)

### 5. AI 修正提案 (`/api/suggest`) は事前生成 + ファイルキャッシュ

- クロール終了時に `AI_PREFETCH=all|critical|none` で先読み
- ディスクキャッシュ: `public/ai-cache/{rules,suggestions,prioritize}/<sha>.json`
- キャッシュヒット時は API 呼ばず、tracker に `cached: true` で記録される (コスト 0)

### 6. メモリ管理 (V8 ヒープ + コンテナ)

- `NODE_OPTIONS=--max-old-space-size=1536` (.env) — V8 を 1.5GB で殴る
- コンテナ `mem_limit: 3g` (docker-compose.yaml) — 当初 2g 運用だったが、Lighthouse 実行時に **Playwright Chromium + chrome-launcher Chromium の並走で合算 ~1.9GB に達し cgroup OOM**。Node 単独想定の「V8 1.5GB < cgroup 2GB で先に SIGABRT」設計が崩れたため 3g に拡張
- `mem_limit` は **swarm でない場合 service レベルで指定**しないと効かない (`deploy.resources.limits` は swarm のみ)

### 7. `.env` は git ignore + サーバ側で別管理

- ローカルの `.env` を編集しても **デプロイされない**。CI の同期対象は `.env.example` のみ
- 本番反映はサーバ側の `.env` を直接編集 → `docker compose down && up -d`
- `docker compose restart` では env_file は再読み込みされない

### 8. ブランド設定の構造

```
config/brands/
└── <id>/                  (リポジトリ同梱の雛形は config/brands/example/)
    ├── meta.json          { id, name, displayName, parentBrand, preferredTerms[], avoidTerms[] }
    ├── logo-guideline.md  ai/logo-regulation 用 — 最小サイズ / アイソレーション / 禁則 / 表記ルール
    └── visual-guideline.md ai/brand-guideline 用 — カラー / フォント / 見出し px / 余白
```

`lib/brands.js` の `loadBrand(brandId)` でロード (キャッシュあり)。`crawl.js` が pageData 構築時に注入する。

新ブランド追加時の確認:
- `meta.json` のキー名は既存の `example` のものに合わせる
- `.md` は単一ファイルでも改行と見出しで構造化 (AI が読む前提)
- ブランド ID は targets.json の `domain.brand` と一致させる
- 起動後、ログに `[brands] meta.json not found for brand="X"` が出ていなければロード成功

### 9. `config/targets.json` も git ignore

- UI から domain/page を編集できる仕様のため、git 管理から外している ([732a03a](https://github.com))
- リポジトリには `targets.json` が存在しない (テスト用は `targets.test.json`)
- 初回起動時は `lib/config.js` の `ensureConfigExists` が空ファイルを作成

---

## ディレクトリの読み方

```
scripts/
├── server.js              ダッシュボード (Express, :3001) — 28KB の中規模ファイル
├── run.js                 クローラー単発実行 (cron / CLI 用) — 各 target を crawl-worker で起動
├── build-frontend.js      esbuild で public/js/dashboard.js をミニファイ
├── crawl-worker.js        cron クロールの子プロセス本体 (1 target ごとに使い捨て)
└── prioritize-worker.js   /api/prioritize の子プロセス本体

lib/
├── crawl.js               crawl の中心: Playwright 起動 + bbox 解決 + スクショ保存
├── crawl-runner.js        crawl-worker を fork して 1 target を実行する共通ランナー (run.js + server.js から共用)
├── runner.js              ルール実行エンジン (RULE_AI_CONCURRENCY で並列度制御)
├── fetcher.js             Playwright + CWV + リンク検査ヘルパ
├── scorer.js              重み付きスコア計算 (5 main + LH 4 categories)
├── lighthouse.js          Lighthouse mutex + chrome-launcher ラッパ
├── gate.js                ゲート条件 (body 開始 ≤ 28KB)
├── reporter.js            JSON 書き出し + gzip
├── describe-element.js    offender selector / snippet 生成
├── config.js              targets.json ロード/保存 + 旧形式 migration
└── ai/
    ├── evaluate.js        AI ルール共通呼び出し (SHARED_FRAMEWORK)
    ├── suggest.js         個別 audit の修正提案
    ├── prioritize.js      改善優先度レコメンド (worker 経由で呼ばれる)
    ├── cache.js           ディスクキャッシュ (sha256 キー)
    └── cost-tracker.js    トークン/コスト集計 + 日別永続化

rules/                     全 73 ルール
├── llmo / semantic / structured / readable / a11y / perf / links   コード品質サブカテゴリ
├── info / text / visual / usability                                 メインカテゴリ直下
├── ai/                                                              AI ルール
└── lighthouse-mapping.js                                            LH audit → 当アプリのカテゴリ対応表
```

---

## ルールを追加する手順

1. `rules/<category>/<rule-id>.js` を作成 (テンプレートは [README.md ルールインターフェース](README.md))
2. `rules/index.js` の対応する import に追加
3. `deterministicRules` または `aiRules` 配列に登録
4. `pnpm run crawl:local` で実際にクロールして `report.json` に出ることを確認
5. UI のヘルプモーダル (`public/index.html`) は自動で全ルールを列挙する (手動更新不要)

AI ルールの場合:
- `aiRule: true` フラグを付ける
- `evaluate.js` の `SHARED_FRAMEWORK` は触らない (全 AI ルール共通の前置きなので、ここを変えると全キャッシュ無効化)
- ルール固有の system prompt は `cache_control` を付けない

---

## デプロイの全体像

```
[手元] git push
   ↓
[CI] サーバへコードを同期 (rsync 等)
   ↓
[サーバ] docker compose down && docker compose up -d
   ↓
コンテナ再起動 → 新コード反映
```

- 設定変更 (`.env`) はサーバで手動編集 → `docker compose down && up -d`
- cron で全ドメインを定期自動クロール可能 (スケジュールはホスト側 crontab で設定)

---

## よくあるトラブル時の調査順序

1. **ダッシュボード 502** → `sudo docker exec <container> ps -ef | grep node` で Node プロセス生存確認
2. **Node が死んでいる** → `sudo docker logs --tail 200 <container>` で V8 OOM / uncaught exception 探す
3. **AI 機能だけ動かない** → `/api/ai/status` 叩く / `ANTHROPIC_API_KEY` 確認
4. **クロール途中で止まる** → `AI_PREFETCH=critical` か `none` に下げる / `RULE_AI_CONCURRENCY` を下げる
5. **LH が出ない** → コンテナ内 `pnpm exec playwright list` で chromium のパス確認

---

## ユーザーとの作業スタイル

- ユーザーは慎重派。**破壊的操作 (force push / DB drop / コンテナ削除) は必ず確認**
- 段階的なデプロイを好む。「先に dry-run して」「先にローカルで通して」が頻出
- 日本語コミットメッセージ、prefix は `feat:` `fix:` `refactor:` `docs:` `revert:` の Conventional Commits ライク
- コミットメッセージは「**何を**」より「**なぜ**」を優先で書く
- インシデント時は時系列ログを丁寧に追う (kernel OOM / V8 OOM / nginx 502 の切り分け等)
