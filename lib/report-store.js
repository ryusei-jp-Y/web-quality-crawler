// 構造化レポートの DB ストア。report.json(.gz) を置き換える正本。
// ------------------------------------------------------------------
//   - saveRun(): クロール結果 (results[]) を runs/page_results/findings に INSERT。
//   - getRun() / getRunByTs(): 元の { startedAt, results } 形状を再構築 (詳細表示用)。
//   - listRunsSummary(): ダッシュボード/一覧用の軽量サマリ (抽出列のみ)。
//   - findPreviousSuccess(): pageHash 流用のため直近成功 result を再構築。
//   - dashboardRows() / scoreHistory() / crossView(): 新ダッシュボード機能用クエリ。
//   - pruneOldRuns(): スコア 120 日保持。
// スクリーンショット等の重い実体はファイルのまま (screenshot_path 参照のみ)。
import { getDb } from './db.js';
import { effectiveScore, annotateViolations } from './score-effective.js';

/** makeTimestamp(crawl.js) と同一ロジック。循環 import を避けるためローカル定義。 */
function tsFromStartedAt(startedAt) {
  const d = startedAt instanceof Date ? startedAt : new Date(startedAt);
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

const j = (v) => (v == null ? null : JSON.stringify(v));
const p = (s, fb = null) => { if (s == null) return fb; try { return JSON.parse(s); } catch { return fb; } };

/** 指定ページ/デバイスの手動 override マップ (ruleId -> status) を返す。 */
function overridesForPage(db, domainId, pageId, device) {
  const rows = db.prepare('SELECT rule_id, status FROM manual_overrides WHERE domain_id = ? AND page_id = ? AND device = ?').all(domainId, pageId, device);
  const map = {};
  for (const r of rows) map[r.rule_id] = r.status;
  return map;
}

/** result に override を適用した実効スコアオブジェクト。エラー/ゲート時は null。 */
function computeEffScore(r, overrides) {
  if (r.error || r.gateFailed || !r.score) return null;
  try {
    return effectiveScore(r.violations || [], overrides, r.site?.weights, r.lighthouse?.scores ?? null);
  } catch {
    return null;
  }
}

/** lighthouse.scores の 4 カテゴリ平均 (0-100)。取得不能なら null。 */
function lhAverage(lighthouse) {
  const scores = lighthouse?.scores;
  if (!scores || typeof scores !== 'object') return null;
  const vals = Object.values(scores).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * 1 クロール分の結果を DB に保存する。
 * @param {object} arg
 * @param {string|Date} arg.startedAt
 * @param {Array} arg.results  crawlTarget が返す result の配列 (device 毎)
 * @param {boolean} [arg.spot]
 * @param {string|Date} [arg.finishedAt]
 * @returns {{ runId:number, ts:string }}
 */
export function saveRun({ startedAt, results = [], spot = false, finishedAt = null }) {
  const db = getDb();
  const ts = tsFromStartedAt(startedAt);
  const startedIso = startedAt instanceof Date ? startedAt.toISOString() : String(startedAt);

  const insRun = db.prepare('INSERT INTO runs (ts, started_at, finished_at, spot) VALUES (?, ?, ?, ?)');
  const insPr = db.prepare(`
    INSERT INTO page_results
      (run_id, domain_id, page_id, device, total, lh_avg, gate_failed, gate_id, gate_message,
       error, url, title, status_code, page_hash, html_unchanged, screenshot_path,
       site_json, page_data_json, score_json, lighthouse_json, eff_score_json)
    VALUES
      (@run_id, @domain_id, @page_id, @device, @total, @lh_avg, @gate_failed, @gate_id, @gate_message,
       @error, @url, @title, @status_code, @page_hash, @html_unchanged, @screenshot_path,
       @site_json, @page_data_json, @score_json, @lighthouse_json, @eff_score_json)
  `);
  const insFind = db.prepare(`
    INSERT INTO findings (page_result_id, rule_id, category, severity, passed, message, offenders_total, ai_rule, data_json)
    VALUES (@page_result_id, @rule_id, @category, @severity, @passed, @message, @offenders_total, @ai_rule, @data_json)
  `);

  const tx = db.transaction(() => {
    const runId = insRun.run(ts, startedIso, finishedAt ? new Date(finishedAt).toISOString() : null, spot ? 1 : 0).lastInsertRowid;
    for (const r of results) {
      const site = r.site || {};
      const pd = r.pageData || {};
      const domainId = site.domainId ?? site.id ?? null;
      const pageId = site.pageId ?? null;
      const device = site.device ?? pd.device ?? 'pc';
      // 既存の手動 override を適用した実効スコアを焼き込む (ダッシュボード/サイドバー用)
      const effObj = (domainId && pageId) ? computeEffScore(r, overridesForPage(db, domainId, pageId, device)) : null;
      const prId = insPr.run({
        run_id: runId,
        domain_id: domainId,
        page_id: pageId,
        device,
        total: r.score?.total ?? null,
        lh_avg: lhAverage(r.lighthouse),
        gate_failed: r.gateFailed ? 1 : 0,
        gate_id: r.gateResult?.gateId ?? null,
        gate_message: r.gateResult?.message ?? null,
        error: r.error ?? null,
        url: pd.url ?? site.url ?? null,
        title: pd.title ?? null,
        status_code: pd.statusCode ?? null,
        page_hash: r.pageHash ? JSON.stringify(r.pageHash) : null,
        html_unchanged: r.htmlUnchanged ? 1 : 0,
        screenshot_path: pd.screenshot ?? null,
        site_json: j(site),
        page_data_json: j(pd),
        score_json: j(r.score ?? null),
        lighthouse_json: j(r.lighthouse ?? null),
        eff_score_json: j(effObj),
      }).lastInsertRowid;
      for (const v of r.violations || []) {
        insFind.run({
          page_result_id: prId,
          rule_id: v.id ?? v.ruleId ?? '(unknown)',
          category: v.category ?? null,
          severity: v.severity ?? null,
          passed: v.passed ? 1 : 0,
          message: v.message ?? null,
          offenders_total: v.offendersTotal ?? (Array.isArray(v.offenders) ? v.offenders.length : 0),
          ai_rule: v.aiRule ? 1 : 0,
          data_json: j(v),
        });
      }
    }
    return runId;
  });
  const runId = tx();
  return { runId, ts };
}

/** page_results 行 + findings から元の result オブジェクトを再構築。 */
function reconstructResult(prRow, db) {
  const findings = db.prepare('SELECT data_json FROM findings WHERE page_result_id = ? ORDER BY id').all(prRow.id);
  const result = {
    site: p(prRow.site_json) ?? {},
    pageData: p(prRow.page_data_json) ?? {},
    gateFailed: !!prRow.gate_failed,
    violations: findings.map((f) => p(f.data_json)).filter(Boolean),
    score: p(prRow.score_json),
  };
  if (prRow.gate_failed) result.gateResult = { gateId: prRow.gate_id, message: prRow.gate_message };
  if (prRow.error) result.error = prRow.error;
  if (prRow.lighthouse_json) result.lighthouse = p(prRow.lighthouse_json);
  if (prRow.page_hash) result.pageHash = p(prRow.page_hash);
  result.htmlUnchanged = !!prRow.html_unchanged;
  return result;
}

// reconstruct した result に手動 override を適用 (violations 注釈 + score 再計算)。
function applyOverridesToResult(result, db) {
  if (result.error || result.gateFailed) return result;
  const site = result.site || {};
  const domainId = site.domainId ?? site.id;
  const pageId = site.pageId;
  const device = site.device ?? result.pageData?.device ?? 'pc';
  if (!domainId || !pageId) return result;
  const overrides = overridesForPage(db, domainId, pageId, device);
  result.violations = annotateViolations(result.violations || [], overrides);
  result.score = computeEffScore(result, overrides) ?? result.score;
  result.hasManualOverrides = Object.keys(overrides).length > 0;
  return result;
}

function buildRunPayload(runRow, db, { effective = false } = {}) {
  const prRows = db.prepare('SELECT * FROM page_results WHERE run_id = ? ORDER BY id').all(runRow.id);
  return {
    startedAt: runRow.started_at,
    timestamp: runRow.ts,
    spot: !!runRow.spot,
    results: prRows.map((pr) => {
      const r = reconstructResult(pr, db);
      return effective ? applyOverridesToResult(r, db) : r;
    }),
  };
}

/** ts (makeTimestamp 文字列) で 1 run を再構築。詳細表示用に override 適用。 */
export function getRunByTs(ts) {
  const db = getDb();
  const runRow = db.prepare('SELECT * FROM runs WHERE ts = ? ORDER BY id DESC LIMIT 1').get(ts);
  if (!runRow) return null;
  return buildRunPayload(runRow, db, { effective: true });
}

/** run id で 1 run を再構築。 */
export function getRunById(runId) {
  const db = getDb();
  const runRow = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!runRow) return null;
  return buildRunPayload(runRow, db, { effective: true });
}

/**
 * ダッシュボード/一覧用サマリ。server.js の listRuns と同形のオブジェクトを返す。
 * @param {object} opt
 * @param {boolean} [opt.includeSpot] spot も含める
 * @param {boolean} [opt.onlySpot]    spot のみ
 */
export function listRunsSummary({ includeSpot = false, onlySpot = false } = {}) {
  const db = getDb();
  let where = '';
  if (onlySpot) where = 'WHERE spot = 1';
  else if (!includeSpot) where = 'WHERE spot = 0';
  const runRows = db.prepare(`SELECT * FROM runs ${where} ORDER BY started_at DESC`).all();
  const prStmt = db.prepare('SELECT * FROM page_results WHERE run_id = ?');
  return runRows.map((run) => ({
    timestamp: run.ts,
    runId: run.id,
    startedAt: run.started_at,
    spot: !!run.spot,
    results: prStmt.all(run.id).map((pr) => {
      const site = p(pr.site_json) ?? {};
      // 実効スコア (手動 override 反映後) を優先。無ければ raw。
      const score = p(pr.eff_score_json) ?? p(pr.score_json) ?? {};
      return {
        domainId: pr.domain_id,
        domainName: site.domainName ?? site.name ?? '(unknown)',
        pageId: pr.page_id ?? 'top',
        pageName: site.pageName ?? 'TOP',
        device: pr.device ?? 'pc',
        url: pr.url ?? '',
        total: score.total ?? pr.total,
        categories: score.categories ?? null,
        counts: score.counts ?? null,
        gateFailed: !!pr.gate_failed,
        error: pr.error ?? null,
        threshold: site.thresholds?.total ?? 80,
      };
    }),
  }));
}

/**
 * pageHash 流用のための直近成功 result。
 * spot を除き、gate 失敗/エラーでなく page_hash を持つ最新の page_results を再構築。
 */
export function findPreviousSuccess(domainId, pageId, device) {
  const db = getDb();
  const row = db.prepare(`
    SELECT pr.* FROM page_results pr
    JOIN runs r ON r.id = pr.run_id
    WHERE r.spot = 0 AND pr.domain_id = ? AND pr.page_id = ? AND pr.device = ?
      AND pr.gate_failed = 0 AND pr.error IS NULL AND pr.page_hash IS NOT NULL
    ORDER BY r.started_at DESC LIMIT 1
  `).get(domainId, pageId, device);
  if (!row) return null;
  return reconstructResult(row, db);
}

/**
 * 推移グラフ用スコア履歴。指定ページ/デバイスの run を期間内・古い順に返す。
 * 各点: { ts, startedAt, total, lhAvg, mainCategories:{...} }
 */
export function scoreHistory({ domainId, pageId, device = 'pc', days = 120 } = {}) {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT r.ts AS ts, r.started_at AS startedAt, pr.total AS total, pr.lh_avg AS lhAvg, pr.score_json AS score_json
    FROM page_results pr JOIN runs r ON r.id = pr.run_id
    WHERE r.spot = 0 AND pr.domain_id = ? AND pr.page_id = ? AND pr.device = ?
      AND pr.gate_failed = 0 AND pr.error IS NULL AND r.started_at >= ?
    ORDER BY r.started_at ASC
  `).all(domainId, pageId, device, cutoff);
  return rows.map((row) => ({
    ts: row.ts,
    startedAt: row.startedAt,
    total: row.total,
    lhAvg: row.lhAvg,
    mainCategories: (p(row.score_json) ?? {}).mainCategories ?? {},
  }));
}

/**
 * 手動ステータスを設定する。status: 'exclude'|'ng'|'ok'|'detected'(解除)。
 * 設定後、最新 run の該当 page_result の eff_score_json を再計算して保存。
 */
export function setOverride({ domainId, pageId, device, ruleId, status }) {
  const db = getDb();
  if (!domainId || !pageId || !device || !ruleId) throw new Error('domainId, pageId, device, ruleId required');
  if (status === 'detected' || status == null || status === '') {
    db.prepare('DELETE FROM manual_overrides WHERE domain_id=? AND page_id=? AND device=? AND rule_id=?')
      .run(domainId, pageId, device, ruleId);
  } else {
    if (!['exclude', 'ng', 'ok'].includes(status)) throw new Error(`invalid status: ${status}`);
    db.prepare(`
      INSERT INTO manual_overrides (domain_id, page_id, device, rule_id, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain_id, page_id, device, rule_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at
    `).run(domainId, pageId, device, ruleId, status, new Date().toISOString());
  }
  // 最新 run の該当 page_result の実効スコアを更新 (ダッシュボード/サイドバー反映)
  const row = db.prepare(`
    SELECT pr.* FROM page_results pr JOIN runs r ON r.id = pr.run_id
    WHERE r.spot = 0 AND pr.domain_id = ? AND pr.page_id = ? AND pr.device = ?
    ORDER BY r.started_at DESC LIMIT 1
  `).get(domainId, pageId, device);
  if (row) {
    const result = reconstructResult(row, db);
    const eff = computeEffScore(result, overridesForPage(db, domainId, pageId, device));
    db.prepare('UPDATE page_results SET eff_score_json = ? WHERE id = ?').run(j(eff), row.id);
  }
  return { ok: true };
}

/** スコア 120 日保持: それより古い (spot 含む) run を削除 (CASCADE で結果も消える)。 */
export function pruneOldRuns(days = 120) {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const info = db.prepare('DELETE FROM runs WHERE started_at < ?').run(cutoff);
  return info.changes;
}
