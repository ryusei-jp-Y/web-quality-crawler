// SQLite データアクセス層。
// ------------------------------------------------------------------
// 設計方針 (memory: dashboard-db-rework-plan):
//   - 設定(domains/pages) と 構造化レポート(runs/page_results/findings) の正本。
//     report.json(.gz) は廃止し、ここに集約する。
//   - スクリーンショット等の重い実体はファイルのまま。DB は screenshot_path 参照のみ。
//   - 書込みは親プロセス(server.js / run.js)が所有。crawl-worker 子は IPC で結果を渡し、
//     親が INSERT する (writer 一本化で SQLite の書込み競合を避ける)。
//   - WAL + busy_timeout で cron 経路と UI 経路の同時アクセスに耐える。
//
// ⚠️ DB ファイルは docker の永続ボリューム上に置くこと (.env / targets.json と同様)。
//    コンテナレイヤに置くと `docker compose down && up` で消える。
//    配置先は DB_PATH で上書き可能。
import Database from 'better-sqlite3';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'data', 'app.db');

let _db = null;

/** スキーマ定義 (マイグレーション)。user_version をバージョン番号として使う。 */
const MIGRATIONS = [
  // --- v1: 初期スキーマ ------------------------------------------------
  (db) => {
    db.exec(`
      CREATE TABLE domains (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        enabled             INTEGER NOT NULL DEFAULT 1,
        brand               TEXT,
        timeout             INTEGER,
        weights_json        TEXT,
        thresholds_json     TEXT,
        rule_options_json   TEXT,
        sort_order          INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE pages (
        id              TEXT NOT NULL,
        domain_id       TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        url             TEXT NOT NULL,
        enabled         INTEGER NOT NULL DEFAULT 1,
        devices_json    TEXT NOT NULL DEFAULT '["pc","sp"]',
        assignees_json  TEXT NOT NULL DEFAULT '[]',
        overrides_json  TEXT,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (domain_id, id)
      );

      CREATE TABLE runs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT NOT NULL,          -- makeTimestamp(started_at): URL/アセットパス相関キー
        started_at   TEXT NOT NULL,
        finished_at  TEXT,
        spot         INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_runs_started ON runs(started_at);
      CREATE INDEX idx_runs_ts      ON runs(ts);

      -- 抽出列(クエリ用) + *_json 列(完全な round-trip 用) のハイブリッド。
      -- ダッシュボード/履歴/横断ビューは抽出列を WHERE/集計し、
      -- レポート詳細表示は *_json から元の result オブジェクトを再構築する。
      CREATE TABLE page_results (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id               INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        domain_id            TEXT NOT NULL,
        page_id              TEXT NOT NULL,
        device               TEXT NOT NULL,
        total                INTEGER,
        lh_avg               INTEGER,
        gate_failed          INTEGER NOT NULL DEFAULT 0,
        gate_id              TEXT,
        gate_message         TEXT,
        error                TEXT,
        url                  TEXT,
        title                TEXT,
        status_code          INTEGER,
        page_hash            TEXT,
        html_unchanged       INTEGER NOT NULL DEFAULT 0,
        screenshot_path      TEXT,
        site_json            TEXT,
        page_data_json       TEXT,
        score_json           TEXT,
        lighthouse_json      TEXT
      );
      CREATE INDEX idx_pr_run     ON page_results(run_id);
      CREATE INDEX idx_pr_page    ON page_results(domain_id, page_id, device);

      CREATE TABLE findings (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        page_result_id   INTEGER NOT NULL REFERENCES page_results(id) ON DELETE CASCADE,
        rule_id          TEXT NOT NULL,
        category         TEXT,
        severity         TEXT,
        passed           INTEGER NOT NULL DEFAULT 0,
        message          TEXT,
        offenders_total  INTEGER NOT NULL DEFAULT 0,
        ai_rule          INTEGER NOT NULL DEFAULT 0,
        data_json        TEXT      -- 元の violation オブジェクト全体 (offenders/fix/weight 等)
      );
      CREATE INDEX idx_find_pr   ON findings(page_result_id);
      CREATE INDEX idx_find_rule ON findings(rule_id);
    `);
  },
  // --- v2: 手動ステータス (除外/NG/OK) + 実効スコア ---------------------
  (db) => {
    db.exec(`
      -- 検知後に管理者が手動で付けたステータス。行が無い = 検知状態(自動)。
      -- status: 'exclude'(計算から除外) | 'ng'(不合格扱い) | 'ok'(合格扱い)
      -- 粒度はデバイス単位。再クロールしても run とは独立に引き継がれる。
      CREATE TABLE manual_overrides (
        domain_id  TEXT NOT NULL,
        page_id    TEXT NOT NULL,
        device     TEXT NOT NULL,
        rule_id    TEXT NOT NULL,
        status     TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (domain_id, page_id, device, rule_id)
      );

      -- 手動ステータスを適用後の実効スコア (ダッシュボード/サイドバー用)。
      -- raw の total/score_json は推移グラフ用に温存し、こちらは override 反映後。
      ALTER TABLE page_results ADD COLUMN eff_score_json TEXT;
    `);
  },
  // --- v3: 管理者セッショントークン (再起動を跨いで保持) ----------------
  (db) => {
    db.exec(`
      CREATE TABLE admin_sessions (
        token      TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
    `);
  },
  // --- v4: クロール休止 (domain/page の enabled を UI/API から操作可能にする) ---
  (db) => {
    db.exec(`
      ALTER TABLE domains ADD COLUMN paused_reason TEXT;
      ALTER TABLE pages   ADD COLUMN paused_reason TEXT;
    `);
  },
];

/** マイグレーションを適用する (user_version を見て未適用分のみ実行)。 */
function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    const tx = db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    });
    tx();
    logger.info(`[db] migrated to v${v + 1}`);
  }
}

/** DB シングルトンを返す (初回呼び出しで open + migrate)。 */
export function getDb() {
  if (_db) return _db;
  const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  migrate(db);
  _db = db;
  logger.info(`[db] opened ${dbPath}`);
  return _db;
}

/** テスト用: 接続を閉じてシングルトンをリセット。 */
export function closeDb() {
  if (_db) { _db.close(); _db = null; }
}
