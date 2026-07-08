# v3.2 更新手順書 — SQLite 集約 + TOPダッシュボード

`report.json(.gz)` を廃止し、設定(domains/pages)と構造化レポートを **SQLite** に集約した版。
画像実体はファイルのまま (`public/reports/<ts>/assets/`)、DB は `screenshot_path` 参照のみ。

> ⚠️ 最重要: **DB ファイル (`data/app.db`) を永続ストレージに載せること**。
> 外すと `docker compose down && up` で DB が消え、設定・履歴を失う。

---

## 0. 事前確認 — マウント方式と永続データの場所

```bash
sudo docker inspect <container> --format '{{json .Mounts}}' | python3 -m json.tool
```

- **プロジェクトディレクトリがバインドマウントされている場合**
  → `data/app.db` もホスト側に作られ自動的に永続化される (`targets.json` / `public/reports` と同じ)。**追加設定不要**。
- **イメージに `COPY` している(バインドマウントでない)場合**
  → §1 のボリューム追加が必要。

あわせてデプロイ同期 (rsync 等) が `--delete` を使っていないか確認 (使用時は未追跡の `data/` を消す恐れ)。

> ⚠️ **実際の踏み抜き事例**: 同期ジョブの除外リストに `/datas/` と綴りミスがあり、
> 実ディレクトリ `data/`(s なし)が除外から漏れて **`data/app.db` が毎デプロイで `--delete` 削除**されていた。
> 稼働中サーバが削除済み inode を fd で握り続け全履歴を配信する一方、cron は再生成された空DBに書き込む
> **inode 分裂**状態になり、「新しいクロールがダッシュボードに反映されない」症状として現れた。
> 対策は除外リストを `/datas/` → `/data/` に修正するだけ(`public/reports/` や `config/targets.json` と同様に保護される)。
> 診断は `sudo docker exec <c> sh -c 'ls -l /proc/<node-pid>/fd | grep app.db'` で `app.db (deleted)` が出るかで判定できる。
> ※ 救出は削除済みでも fd 経由で可能: `cp /proc/<pid>/fd/<n>` で app.db / -wal / -shm を退避 → `wal_checkpoint(TRUNCATE)`。

## 1. (イメージ同梱方式のみ) compose にボリューム追加

compose の該当サービス:

```yaml
services:
  web-quality-crawler:
    volumes:
      - wqc-data:/app/data        # /app はコンテナ内プロジェクトルートに合わせる
volumes:
  wqc-data:
```

または `.env` で永続マウント済みの場所を指定:
```bash
DB_PATH=/app/data/app.db
```

## 2. .env への追記 (任意・推奨)

サーバ側の `.env`:

```bash
ADMIN_ID=<admin-id>            # 管理者モード資格情報 (コード既定のままでも可)
ADMIN_PASS=<admin-pass>
SCORE_RETENTION_DAYS=120       # スコア保持日数 (既定120)
# DB_PATH=/app/data/app.db     # DB配置を明示したい場合のみ
```

## 3. デプロイ

```bash
# 手元
git push                       # → CI がサーバへ同期 (rsync 等)

# サーバ (同期完了後)
cd <project-dir>
sudo docker compose down
sudo docker compose up -d --build     # ★ --build 必須 (better-sqlite3 のネイティブビルド)
```

`--build` がないと新依存 `better-sqlite3` が入らない/コンパイルされない。
`node-gyp` 系エラーで落ちる場合はベースイメージに `python3 / make / g++` が無い可能性 → ログ確認。

## 4. 初回起動の自動処理

- DB が空なら `lib/config.js` が既存 `targets.json` から設定を自動シード
  (ログに `[config] seeded DB from ...` が出れば成功)。
- 以後 `report.json` は書かれない。画像は従来どおりファイル保存。

## 5. 過去レポートの取り込み (任意・一回限り)

```bash
sudo docker exec <container> node scripts/import-reports.js --days 120
```
冪等 (既存 ts はスキップ)。履歴グラフ/ダッシュボードに過去分を反映したい場合に実行。

## 6. 動作確認

```bash
sudo docker exec <container> ls -la data/app.db
curl -s http://127.0.0.1:3001/api/runs | head -c 300
curl -s 'http://127.0.0.1:3001/api/history?domainId=<id>&pageId=top&days=120' | head -c 200
sudo docker logs --tail 100 <container> | grep -iE 'error|db|seed'
```

ブラウザで TOP一覧・推移グラフ・管理者ログイン→再クロール/ページ編集/担当者設定 を確認。

## 7. 永続性テスト (重要)

```bash
sudo docker compose down && sudo docker compose up -d
sudo docker exec <container> ls -la data/app.db   # 残っていれば永続化OK
curl -s http://127.0.0.1:3001/api/runs | head -c 100           # データが残っていればOK
```
ここで消えるなら §0〜§1 のマウント設定が不十分。

## 8. ロールバック

旧 `report.json.gz` は削除していないため、コードを revert すれば旧読込経路で従来表示に戻せる
(DB導入後に新規クロールした分のみ旧経路では見えない)。

---

## 補足 (将来の改善メモ / 本番動作には影響なし)

- `pruneOldRuns` は DB 行のみ削除。古いスクショ画像 (`assets/*.jpg`) は残るため、別途掃除ジョブ検討余地あり。
- `/api/runs` は全 run×結果をクライアントへ返しクライアント集計。件数増大時はサーバ集約 (`/api/dashboard`) や件数上限を検討。
