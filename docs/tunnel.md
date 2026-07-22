# Cloudflare Tunnel production setup

Web Quality Crawler は、ローカルの Express dashboard を本番実行環境として起動し、Cloudflare Tunnel 経由で公開する。

## 公開URL

- 紹介LP: https://<your-domain>/web-quality-crawler/
- 本体: https://<app-hostname>/

## 構成

```text
<app-hostname>
  -> Cloudflare Tunnel
  -> http://127.0.0.1:3001
  -> local Express dashboard
```

Cloudflare Workers / Pages には本体を載せない。Playwright、Lighthouse、SQLite、Chromium を使うため、静的ホスティングや Workers には向かない。

`<app-hostname>` は Cloudflare Access で保護する。Access application を設定しない状態で Tunnel を公開すると、URL を知っている人は誰でも到達できる。

## 初回セットアップ

```bash
cd <repo-path>
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env
```

この repo は `package.json` で `pnpm@11.12.0` を指定しており、lockfile も `pnpm-lock.yaml` なので、`npm ci` ではなく `pnpm install --frozen-lockfile` を使う。

Node のバージョンを変えたあとに DB 系 API で `better-sqlite3` の `NODE_MODULE_VERSION` mismatch が出た場合は、ネイティブモジュールを現在の Node 向けに rebuild する。

```bash
pnpm rebuild better-sqlite3
```

AI なしで動かす場合は `.env` を以下のままにする。

```env
AI_EVALUATION_ENABLED=false
ANTHROPIC_API_KEY=
```

AI 評価も使う場合だけ、ローカルの `.env` に API キーを入れる。

```env
AI_EVALUATION_ENABLED=true
ANTHROPIC_API_KEY=...
```

`.env` は Git 管理しない。Anthropic API キーは GitHub や Cloudflare に入れない。

管理者モードの資格情報もローカルの `.env` で変更する。

```env
ADMIN_ID=<admin-id>
ADMIN_PASS=<admin-password>
```

## ローカル起動

```bash
cd <repo-path>
pnpm run start:local
```

または補助スクリプトを使う。

```bash
cd <repo-path>
scripts/start-local.sh
```

確認URL:

```text
http://127.0.0.1:3001/
```

## Cloudflare Tunnel 初回作成

`cloudflared` が未導入なら入れる。

```bash
brew install cloudflared
```

Cloudflare にログインする。

```bash
cloudflared tunnel login
```

ブラウザで `<your-domain>` を管理している Cloudflare アカウントを選び、認証を完了する。

Tunnel を作成する。

```bash
cloudflared tunnel create web-quality-crawler
```

表示された Tunnel ID を控え、`~/.cloudflared/config.yml` を作成または更新する。

```yaml
tunnel: <TUNNEL_ID>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <app-hostname>
    service: http://127.0.0.1:3001
  - service: http_status:404
```

DNS ルートを設定する。

```bash
cloudflared tunnel route dns web-quality-crawler <app-hostname>
```

## 公開手順

ターミナル1:

```bash
cd <repo-path>
pnpm run start:local
```

ターミナル2:

```bash
cloudflared tunnel run web-quality-crawler
```

確認URL:

```text
https://<app-hostname>/
```

ローカル本体を止めると、本体の公開も止まる。

## Cloudflare Access

Cloudflare Zero Trust の管理画面で Access application を作成し、公開 hostname 全体を保護する。

```text
Application type: Self-hosted
Application name: Web Quality Crawler
Domain: <app-hostname>
Path: /*
Session duration: 任意
```

Policy はまず最小構成にする。

```text
Action: Allow
Selector: Emails
Value: 許可するメールアドレス
```

認証方式は One-time PIN または Google login を使う。未ログイン状態で `https://<app-hostname>/`、`/api/runs`、`/reports/...` が Cloudflare Access のログイン画面へリダイレクトされることを確認する。

## クローラー確認

```bash
cd <repo-path>
pnpm run crawl:local
```

確認項目:

- ダッシュボードに run が表示される
- スクリーンショットが表示される
- `/reports/<timestamp>/report.json` が読める

## 機密チェック

```bash
git ls-files -z | xargs -0 grep -niE '<forbidden-keyword-regex>' 2>/dev/null
```

公開前に見せてはいけない固有名詞・社内語・秘密値を forbidden keyword として定義し、期待値が 0 件になることを確認する。

## Git 管理しないもの

- `.env`
- `data/`
- `public/reports/`
- `public/ai-cache/`
- `config/targets.json`
