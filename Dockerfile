# Web Quality Crawler — 単一プロセス (Express が静的配信 + API + SPA を兼ねる)。
# TLS / リバースプロキシはホスト側 or PaaS に任せる設計。
FROM node:24.18.0-bookworm

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DB_PATH=/app/data/app.db \
    REPORTS_DIR=/app/public/reports \
    NODE_OPTIONS=--max-old-space-size=1536

WORKDIR /app

# 全画面スクショの文字化け防止に CJK / emoji フォントを入れる
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-noto-cjk fonts-noto-color-emoji fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 依存は package だけ先に COPY してレイヤキャッシュを効かせる
# (better-sqlite3 はプリビルドバイナリを取得。取得できない環境では build-essential python3 を追加)
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile

# Playwright Chromium 本体 + OS 依存ライブラリをビルド時に導入
RUN pnpm exec playwright install --with-deps chromium

# アプリ本体
COPY . .

# フロントエンド (public/js/dashboard.min.js 等) を生成
RUN node scripts/build-frontend.js

# 永続化ディレクトリ (compose / PaaS の volume でマウントする)
RUN mkdir -p /app/data /app/public/reports /app/logs

EXPOSE 3001

# HOST=0.0.0.0 でコンテナ外から到達可能
CMD ["node", "scripts/server.js"]
