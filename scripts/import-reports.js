// 既存の on-disk レポート (public/reports/<ts>/report.json[.gz]) を DB に取り込む。
// DB 移行時に過去のスコア履歴を失わないための一回限りの backfill。冪等 (既存 ts はスキップ)。
//
// 使い方:
//   node --env-file=.env scripts/import-reports.js            # REPORTS_DIR を全件取込
//   node --env-file=.env scripts/import-reports.js --days 120 # 直近120日のみ (保持方針に合わせる)
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { getDb } from '../lib/db.js';
import { saveRun } from '../lib/report-store.js';
import { logger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const REPORTS_DIR = process.env.REPORTS_DIR ?? join(PROJECT_ROOT, 'public', 'reports');
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

const daysArgIdx = process.argv.indexOf('--days');
const days = daysArgIdx >= 0 ? Number(process.argv[daysArgIdx + 1]) : null;
const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

async function readReportFile(dir) {
  try {
    return JSON.parse(gunzipSync(await readFile(join(dir, 'report.json.gz'))).toString('utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return JSON.parse(await readFile(join(dir, 'report.json'), 'utf-8'));
}

async function main() {
  const db = getDb();
  const existsStmt = db.prepare('SELECT 1 FROM runs WHERE ts = ? LIMIT 1');
  let entries;
  try {
    entries = await readdir(REPORTS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') { logger.info('[import] no reports dir, nothing to do'); return; }
    throw err;
  }
  const dirs = entries.filter((e) => e.isDirectory() && TS_RE.test(e.name)).map((e) => e.name).sort();
  let imported = 0, skipped = 0, failed = 0;
  for (const ts of dirs) {
    if (existsStmt.get(ts)) { skipped++; continue; }
    try {
      const json = await readReportFile(join(REPORTS_DIR, ts));
      if (cutoff && new Date(json.startedAt).getTime() < cutoff) { skipped++; continue; }
      saveRun({ startedAt: json.startedAt, results: json.results || [], spot: !!json.spot });
      imported++;
    } catch (err) {
      failed++;
      logger.warn(`[import] skip ${ts}: ${err.message}`);
    }
  }
  logger.info(`[import] done: imported=${imported} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => { logger.error('[import] failed:', err); process.exit(1); });
