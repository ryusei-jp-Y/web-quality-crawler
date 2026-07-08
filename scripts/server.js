import express from 'express';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { fork } from 'node:child_process';
import { logger } from '../lib/logger.js';
import { generateSuggestion, isAiAvailable } from '../lib/ai/suggest.js';
import { loadConfig, saveConfig, slugify, flattenTargets } from '../lib/config.js';
import { loadPersistedUsage, tracker } from '../lib/ai/cost-tracker.js';
import { writeReport, readReport, prefetchAiSuggestions, DEFAULT_REPORTS_ROOT, makeTimestamp, screenshotDirFor } from '../lib/crawl.js';
import { listRunsSummary, getRunByTs, pruneOldRuns, scoreHistory, setOverride } from '../lib/report-store.js';
import { getDb } from '../lib/db.js';

// スコア保持日数 (これより古い run は prune)。既定 120 日。
const SCORE_RETENTION_DAYS = Number(process.env.SCORE_RETENTION_DAYS ?? 120);
import { runCrawlInWorker } from '../lib/crawl-runner.js';
import { deterministicRules, aiRules, MAIN_CATEGORIES, SUB_TO_MAIN } from '../rules/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const REPORTS_DIR = process.env.REPORTS_DIR ?? join(PROJECT_ROOT, 'public', 'reports');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const DEFAULT_CONFIG = join(PROJECT_ROOT, 'config', 'targets.json');
const CONFIG_PATH = process.env.CONFIG_PATH ?? DEFAULT_CONFIG;
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

// /api/prioritize の子プロセス。Anthropic SDK のレスポンスバッファ +
// JSON.parse がメモリを膨らませて Express 本体ごと OOM 死亡したインシデントの
// 再発防止のため、prioritize は使い捨ての worker process で実行する。
const PRIORITIZE_WORKER = join(__dirname, 'prioritize-worker.js');
// 子プロセスのハード制限。親 (1536MB) より小さくして親への影響を遮断。
// 万一ヒープが膨らんでも子だけ SIGABRT で死に、親はレスポンス 500 を返して継続。
const PRIORITIZE_WORKER_HEAP_MB = Number(process.env.PRIORITIZE_WORKER_HEAP_MB ?? 768);
// 子プロセス全体のタイムアウト (Anthropic 側 60s + バッファ + キャッシュ I/O)。
const PRIORITIZE_WORKER_TIMEOUT_MS = Number(process.env.PRIORITIZE_WORKER_TIMEOUT_MS ?? 90_000);

function runPrioritizeInWorker(params) {
  return new Promise((resolveResult, reject) => {
    const child = fork(PRIORITIZE_WORKER, [], {
      execArgv: [`--max-old-space-size=${PRIORITIZE_WORKER_HEAP_MB}`],
      env: process.env,
      // stderr / stdout は親に流して docker logs で観察できるようにする
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`prioritize worker timeout (${PRIORITIZE_WORKER_TIMEOUT_MS}ms)`));
    }, PRIORITIZE_WORKER_TIMEOUT_MS);
    child.on('message', (msg) => {
      if (msg && msg.ok) finish(resolveResult, msg.result);
      else finish(reject, new Error(msg?.error ?? 'prioritize worker failed'));
    });
    child.on('error', (err) => finish(reject, err));
    child.on('exit', (code, signal) => {
      // message 受信前に exit したら異常終了 (OOM 等)
      finish(reject, new Error(`prioritize worker exited (code=${code}, signal=${signal})`));
    });
    child.send(params);
  });
}

// 分精度 (旧: 2026-04-23T02-18) / 秒精度 (新: 2026-04-23T02-18-45) 両方を受け付ける
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}(-\d{2})?$/;

// ======================================================================
// Reports aggregation
// ======================================================================

async function listRuns({ includeSpot = false, onlySpot = false } = {}) {
  // 正本は DB (lib/report-store)。旧: REPORTS_DIR を走査して report.json を読んでいた。
  return listRunsSummary({ includeSpot, onlySpot });
}

// ======================================================================
// Config validation (for adding domains/pages)
// ======================================================================

function validateUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return 'unknown-host'; }
}

function sanitizeDevices(input) {
  const allowed = new Set(['pc', 'sp']);
  const fallback = ['pc', 'sp'];
  if (!Array.isArray(input) || input.length === 0) return [...fallback];
  const out = [...new Set(input.map((d) => String(d).toLowerCase()))].filter((d) => allowed.has(d));
  return out.length > 0 ? out : [...fallback];
}

function ensureUniqueId(base, existingIds) {
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

// 総合スコアの重み配分 (合計 1.00)。メインカテゴリ + Lighthouse カテゴリ単位で指定。
// 旧形式 (llmo / semantic / ... のサブ単位) から移行済み。
// scorer.js の LH_WEIGHT_KEY と対応。
const DEFAULT_DOMAIN_WEIGHTS = {
  'lh-performance': 0.05,
  'lh-accessibility': 0.20,
  'lh-best-practices': 0.10,
  'lh-seo': 0.10,
  info: 0.15,
  text: 0.10,
  visual: 0.10,
  usability: 0.10,
  code: 0.10,
};
const DEFAULT_DOMAIN_THRESHOLDS = {
  total: 80,
  info: 75,
  text: 80,
  visual: 75,
  usability: 75,
  code: 75,
};
const DEFAULT_DOMAIN_RULE_OPTIONS = {
  'semantic/div-ratio': { minRatio: 0.10 },
  'readable/dom-text-volume': { minChars: 1500 },
  'readable/image-text-alternative': { minAltLength: 10, maxShortAltRatio: 0.5 },
  'perf/head-inline-size': { maxBytes: 10240 },
  'perf/html-total-size': { maxBytes: 1048576 },
  'gate/body-start-offset': { maxBytes: 28672 },
};

// ======================================================================
// Express setup
// ======================================================================

const app = express();
app.use(express.json({ limit: '200kb' }));

// ======================================================================
// 管理者モード (簡易認証)
//   ログインほど厳格ではないが、規定の ID/Pass を入力すると管理者になれる。
//   現状の管理者限定操作: ターゲット追加 (サイト/ページ) + 再クロール。
//   - 資格情報は env で上書き可能 (ADMIN_ID / ADMIN_PASS)。未設定なら既定値。
//   - 認証成功でランダムトークンを発行し、メモリ上に TTL 付きで保持。
//     クライアントは X-Admin-Token ヘッダで送る。サーバ再起動でトークンは失効。
// ======================================================================
const ADMIN_ID = process.env.ADMIN_ID ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'change-me';
const ADMIN_TOKEN_TTL_MS = Number(process.env.ADMIN_TOKEN_TTL_MS ?? 72 * 60 * 60 * 1000); // 既定 72h
// 管理者トークンは DB (admin_sessions) に保存し、サーバ再起動を跨いで保持する
// (リロードやデプロイで管理者モードが外れないようにするため)。TTL まで有効。

// 長さ非依存の定数時間比較 (タイミング攻撃の軽減)。
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  // ハッシュ化して同一長にしてから比較 (生文字列長の漏洩も防ぐ)
  const ah = createHash('sha256').update(ab).digest();
  const bh = createHash('sha256').update(bb).digest();
  try { return timingSafeEqual(ah, bh); } catch { return false; }
}

function isValidAdminToken(token) {
  if (!token) return false;
  const row = getDb().prepare('SELECT expires_at FROM admin_sessions WHERE token = ?').get(token);
  if (!row) return false;
  if (row.expires_at < Date.now()) {
    getDb().prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return false;
  }
  return true;
}

function readAdminToken(req) {
  return req.get('x-admin-token') || req.body?.adminToken || null;
}

// 管理者限定エンドポイント用ミドルウェア。
function requireAdmin(req, res, next) {
  if (isValidAdminToken(readAdminToken(req))) { next(); return; }
  res.status(401).json({ error: '管理者モードが必要です。再ログインしてください。' });
}

// ログイン: ID/Pass 検証 → トークン発行
app.post('/api/admin/login', (req, res) => {
  const { id, pass } = req.body || {};
  if (!safeEqual(id, ADMIN_ID) || !safeEqual(pass, ADMIN_PASS)) {
    res.status(401).json({ error: 'ID またはパスワードが違います' });
    return;
  }
  const token = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  const db = getDb();
  db.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
  // 期限切れトークンを掃除
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
  res.json({ ok: true, token, expiresAt });
});

// ログアウト: トークン破棄
app.post('/api/admin/logout', (req, res) => {
  const token = readAdminToken(req);
  if (token) getDb().prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// 現在のトークンが有効か (リロード後の状態復元用)
app.get('/api/admin/status', (req, res) => {
  res.json({ admin: isValidAdminToken(readAdminToken(req)) });
});

// ======================================================================
// Crawl job tracker (in-memory)
//   key = `${domainId}/${pageId}`
// ======================================================================
const crawlJobs = new Map();

// クロール同時実行数の制限。
// 既定 1 (シリアル実行) — 同一 VM 上で複数コンテナが並走している環境で
// Playwright/Lighthouse Chromium のメモリ消費がホスト全体のリソースを
// 圧迫し、他コンテナで 502 等を誘発するのを防ぐため安全側に倒す。
// メモリに余裕がある単独 VM 等では env で 2-3 まで上げて高速化可能。
const CRAWL_CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY ?? 1);
let activeCrawls = 0;
const crawlQueue = [];

function enqueueCrawl(target, opts = {}) {
  // 即座に "queued" として crawlJobs に登録 (UI で見える)
  const key = target.id;
  if (!crawlJobs.has(key) || crawlJobs.get(key).status !== 'running') {
    crawlJobs.set(key, {
      status: 'queued',
      targetId: key,
      targetName: target.name,
      url: target.url,
      spot: !!opts.spot,
      progress: { stage: 'waiting', message: `順番待ち (前 ${crawlQueue.length + activeCrawls} 件)`, pct: 0 },
    });
  }
  crawlQueue.push({ target, opts });
  processCrawlQueue();
}

function processCrawlQueue() {
  while (activeCrawls < CRAWL_CONCURRENCY && crawlQueue.length > 0) {
    const { target, opts } = crawlQueue.shift();
    activeCrawls++;
    runCrawlJob(target, opts)
      .catch((err) => logger.error(`crawl job ${target.id} failed: ${err.message}`))
      .finally(() => {
        activeCrawls--;
        // 待機中の job の "順番待ち" 表示を更新
        let waitIdx = 0;
        for (const q of crawlQueue) {
          const cur = crawlJobs.get(q.target.id);
          if (cur && cur.status === 'queued') {
            crawlJobs.set(q.target.id, {
              ...cur,
              progress: { stage: 'waiting', message: `順番待ち (前 ${waitIdx + activeCrawls} 件)`, pct: 0 },
            });
          }
          waitIdx++;
        }
        processCrawlQueue();
      });
  }
}

async function runCrawlJob(target, { spot = false } = {}) {
  const key = target.id;
  const startedAt = new Date();
  const baseState = {
    status: 'running',
    startedAt: startedAt.toISOString(),
    targetId: key,
    targetName: target.name,
    url: target.url,
    spot,
    progress: { stage: 'starting', message: 'クロール開始', pct: 0, device: null },
  };
  crawlJobs.set(key, baseState);
  try {
    const expectedTimestamp = makeTimestamp(startedAt);
    // クロール本体は使い捨て子プロセスで実行する。OOM 等で落ちても server 本体 (Express)
    // は無事で、当該 job だけ status:'error' になる。詳細は lib/crawl-runner.js / scripts/crawl-worker.js のヘッダ参照。
    const msg = await runCrawlInWorker(target, {
      reportsRoot: REPORTS_DIR,
      timestamp: expectedTimestamp,
      // クロールの各段階を crawlJobs Map に反映 → /api/crawl/status 経由で UI に届く
      // (子から IPC 経由で届く progress イベントを runCrawlInWorker がリレーする)
      onProgress: (p) => {
        const current = crawlJobs.get(key);
        if (!current || current.status !== 'running') return;
        crawlJobs.set(key, { ...current, progress: p });
      },
    });
    const deviceResults = msg.results;
    const { timestamp } = await writeReport({
      reportsRoot: REPORTS_DIR,
      startedAt,
      results: deviceResults,
      extra: spot ? { spot: true } : null,
    });
    try { pruneOldRuns(SCORE_RETENTION_DAYS); } catch (e) { logger.warn(`[prune] ${e.message}`); }
    // AI_PREFETCH 既定値: critical (深刻違反のみ事前キャッシュ、majorはユーザクリック時に生成)
    // 全件 prefetch したい場合は AI_PREFETCH=all、コスト最小なら none
    const mode = (process.env.AI_PREFETCH ?? (isAiAvailable() ? 'critical' : 'none')).toLowerCase();
    await prefetchAiSuggestions(deviceResults, mode);
    await tracker.persist();
    const primary = deviceResults[0] || {};
    crawlJobs.set(key, {
      status: 'done',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      targetId: key,
      targetName: target.name,
      url: target.url,
      spot,
      timestamp,
      total: primary.score?.total ?? null,
      error: primary.error ?? null,
      gateFailed: primary.gateFailed ?? false,
    });
  } catch (err) {
    logger.error(`crawl job ${key} failed: ${err.message}`);
    crawlJobs.set(key, {
      status: 'error',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      targetId: key,
      targetName: target.name,
      url: target.url,
      error: err.message,
    });
  }
}

// AI 状態
app.get('/api/ai/status', (_req, res) => {
  res.json({ enabled: isAiAvailable() });
});

// AI による修正提案
app.post('/api/suggest', async (req, res) => {
  try {
    const { rule, offenders, siteName, url } = req.body || {};
    if (!rule || !rule.id) {
      res.status(400).json({ error: 'rule.id is required' });
      return;
    }
    if (!isAiAvailable()) {
      res.status(503).json({ error: 'AI 機能は無効です (ANTHROPIC_API_KEY 未設定)' });
      return;
    }
    const result = await generateSuggestion({ rule, offenders: offenders ?? [], siteName, url });
    // 新規呼び出しがあれば usage.json を更新
    await tracker.persist();
    res.json(result);
  } catch (err) {
    logger.error('[/api/suggest]', err);
    res.status(500).json({ error: err.message });
  }
});

// AI 優先度レコメンド (使い捨て子プロセスで実行 — 親プロセスを OOM から守る)
app.post('/api/prioritize', async (req, res) => {
  try {
    const { siteName, url, score, threshold, weights, violations } = req.body || {};
    if (!Array.isArray(violations)) {
      res.status(400).json({ error: 'violations (array) is required' });
      return;
    }
    if (!isAiAvailable()) {
      res.status(503).json({ error: 'AI 機能は無効です (ANTHROPIC_API_KEY 未設定)' });
      return;
    }
    const result = await runPrioritizeInWorker({ siteName, url, score, threshold, weights, violations });
    res.json(result);
  } catch (err) {
    logger.error('[/api/prioritize]', err);
    res.status(500).json({ error: err.message });
  }
});

// ルール一覧 (ヘルプモーダル用)
app.get('/api/rules', (_req, res) => {
  const allRules = [...deterministicRules, ...aiRules];
  res.json({
    deterministic: deterministicRules.length,
    ai: aiRules.length,
    aiAvailable: isAiAvailable(),
    mainCategories: MAIN_CATEGORIES,
    rules: allRules.map((r) => ({
      id: r.id,
      name: r.name,
      mainCategory: r.mainCategory || SUB_TO_MAIN[r.category] || 'code',
      category: r.category,
      severity: r.severity,
      weight: r.weight,
      deviceSensitive: !!r.deviceSensitive,
      fix: r.fix ?? null,
      aiRule: !!r.aiRule,
    })),
  });
});

// AI トークン使用量
app.get('/api/usage', async (_req, res) => {
  try {
    const usage = await loadPersistedUsage();
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Config (target 管理)
app.get('/api/config', async (_req, res) => {
  try {
    const config = await loadConfig(CONFIG_PATH);
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新ドメイン追加 — 初期ページがあれば初回クロールも同時起動
// サイトの並び順を更新 (ドラッグ&ドロップ)。管理者限定。
app.put('/api/domains/order', requireAdmin, async (req, res) => {
  try {
    const order = req.body?.order;
    if (!Array.isArray(order)) { res.status(400).json({ error: 'order (array of domainId) required' }); return; }
    const config = await loadConfig(CONFIG_PATH);
    const byId = new Map(config.domains.map((d) => [d.id, d]));
    const reordered = order.map((id) => byId.get(id)).filter(Boolean);
    // order に無いドメイン (取りこぼし防止) は末尾に元順で追加
    for (const d of config.domains) if (!order.includes(d.id)) reordered.push(d);
    config.domains = reordered;
    await saveConfig(CONFIG_PATH, config);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[PUT /api/domains/order]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/domains', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const config = await loadConfig(CONFIG_PATH);
    const existingIds = new Set(config.domains.map((d) => d.id));
    const id = body.id ? slugify(body.id) : ensureUniqueId(slugify(body.name), existingIds);
    if (existingIds.has(id)) {
      res.status(409).json({ error: `domain id '${id}' already exists` });
      return;
    }
    // 受け取ったページにURL検証
    const incomingPages = Array.isArray(body.pages) ? body.pages : [];
    for (const p of incomingPages) {
      if (p.url && !validateUrl(p.url)) {
        res.status(400).json({ error: `page url must be http(s)://... : ${p.url}` });
        return;
      }
    }
    const newDomain = {
      id,
      name: body.name,
      enabled: true,
      timeout: body.timeout ?? 30000,
      weights: body.weights ?? DEFAULT_DOMAIN_WEIGHTS,
      thresholds: body.thresholds ?? DEFAULT_DOMAIN_THRESHOLDS,
      ruleOptions: body.ruleOptions ?? DEFAULT_DOMAIN_RULE_OPTIONS,
      pages: incomingPages,
    };
    config.domains.push(newDomain);
    await saveConfig(CONFIG_PATH, config);

    // 正規化後の config を読み直し、新ドメインのページ毎にクロール起動
    const updated = await loadConfig(CONFIG_PATH);
    const normalized = updated.domains.find((d) => d.id === id);
    const targets = flattenTargets(updated);
    const crawlJobIds = [];
    for (const page of normalized?.pages ?? []) {
      const target = targets.find((t) => t.domainId === id && t.pageId === page.id);
      if (!target) continue;
      const jobId = `${id}/${page.id}`;
      enqueueCrawl(target);
      crawlJobIds.push({ jobId, pageId: page.id, pageName: page.name });
    }

    res.status(201).json({ ...normalized, crawlJobIds });
  } catch (err) {
    logger.error('[POST /api/domains]', err);
    res.status(500).json({ error: err.message });
  }
});

// ドメイン部分更新 — クロール休止/再開。
// 専用のサイト編集モーダルは無く、サイドバーの休止ボタンから呼ばれる
app.patch('/api/domains/:domainId', requireAdmin, async (req, res) => {
  try {
    const config = await loadConfig(CONFIG_PATH);
    const domain = config.domains.find((d) => d.id === req.params.domainId);
    if (!domain) {
      res.status(404).json({ error: 'domain not found' });
      return;
    }
    const body = req.body || {};
    if ('enabled' in body) {
      domain.enabled = body.enabled !== false;
      // 再開時は古い休止理由が次回の休止に持ち越されないようクリアする
      domain.pausedReason = domain.enabled ? null : (body.pausedReason || null);
    } else if ('pausedReason' in body && domain.enabled === false) {
      domain.pausedReason = body.pausedReason || null;
    }
    await saveConfig(CONFIG_PATH, config);
    res.json(config.domains.find((d) => d.id === req.params.domainId));
  } catch (err) {
    logger.error('[PATCH /api/domains/:domainId]', err);
    res.status(500).json({ error: err.message });
  }
});

// ドメイン削除
app.delete('/api/domains/:domainId', requireAdmin, async (req, res) => {
  try {
    const config = await loadConfig(CONFIG_PATH);
    const before = config.domains.length;
    config.domains = config.domains.filter((d) => d.id !== req.params.domainId);
    if (config.domains.length === before) {
      res.status(404).json({ error: 'domain not found' });
      return;
    }
    await saveConfig(CONFIG_PATH, config);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ページ追加 — 成功時に非同期で初回クロールを開始
app.post('/api/domains/:domainId/pages', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || typeof body.name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!body.url || !validateUrl(body.url)) {
      res.status(400).json({ error: 'url must be http(s)://...' });
      return;
    }
    const config = await loadConfig(CONFIG_PATH);
    const domain = config.domains.find((d) => d.id === req.params.domainId);
    if (!domain) {
      res.status(404).json({ error: 'domain not found' });
      return;
    }
    const existingPageIds = new Set(domain.pages.map((p) => p.id));
    const id = body.id ? slugify(body.id) : ensureUniqueId(slugify(body.name), existingPageIds);
    if (existingPageIds.has(id)) {
      res.status(409).json({ error: `page id '${id}' already exists in this domain` });
      return;
    }
    if (domain.pages.some((p) => p.url === body.url)) {
      res.status(409).json({ error: `page URL already exists in this domain` });
      return;
    }
    const newPage = {
      id, name: body.name, url: body.url, enabled: true,
      devices: sanitizeDevices(body.devices),
    };
    domain.pages.push(newPage);
    await saveConfig(CONFIG_PATH, config);

    // 非同期でクロール開始 (レスポンスはすぐ返す)
    const updated = await loadConfig(CONFIG_PATH);
    const targets = flattenTargets(updated);
    const target = targets.find((t) => t.domainId === domain.id && t.pageId === id);
    const jobId = `${domain.id}/${id}`;
    if (target) enqueueCrawl(target);
    res.status(201).json({ ...newPage, crawlJobId: jobId });
  } catch (err) {
    logger.error('[POST /api/domains/:id/pages]', err);
    res.status(500).json({ error: err.message });
  }
});

// クロールジョブのステータス
app.get('/api/crawl/status', (req, res) => {
  const id = req.query.id;
  if (id) {
    const job = crawlJobs.get(String(id));
    res.json(job || { status: 'unknown', targetId: id });
    return;
  }
  res.json({ jobs: [...crawlJobs.entries()].map(([k, v]) => ({ id: k, ...v })) });
});

// 手動で既存ページのクロールを起動 (UI からの再クロール用)
app.post('/api/crawl/:domainId/:pageId', requireAdmin, async (req, res) => {
  try {
    const config = await loadConfig(CONFIG_PATH);
    const domain = config.domains.find((d) => d.id === req.params.domainId);
    const page = domain?.pages.find((p) => p.id === req.params.pageId);
    if (!page) {
      res.status(404).json({ error: 'page not found' });
      return;
    }
    if (domain.enabled === false || page.enabled === false) {
      res.status(409).json({ error: 'このページ (またはサイト) は休止中のためクロールできません' });
      return;
    }
    const targets = flattenTargets(config);
    const target = targets.find((t) => t.domainId === req.params.domainId && t.pageId === req.params.pageId);
    if (!target) {
      res.status(404).json({ error: 'page not found' });
      return;
    }
    const key = target.id;
    const existing = crawlJobs.get(key);
    if (existing && (existing.status === 'running' || existing.status === 'queued')) {
      res.status(409).json({ error: 'already running or queued', job: existing });
      return;
    }
    enqueueCrawl(target);
    res.status(202).json({ crawlJobId: key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ページ削除
// ページ部分更新 (名前 / URL / 担当者 / クロール休止)。管理者限定。
app.patch('/api/domains/:domainId/pages/:pageId', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const config = await loadConfig(CONFIG_PATH);
    const domain = config.domains.find((d) => d.id === req.params.domainId);
    if (!domain) { res.status(404).json({ error: 'domain not found' }); return; }
    const page = domain.pages.find((p) => p.id === req.params.pageId);
    if (!page) { res.status(404).json({ error: 'page not found' }); return; }

    if ('name' in body) {
      if (!body.name || typeof body.name !== 'string') { res.status(400).json({ error: 'name must be a non-empty string' }); return; }
      page.name = body.name;
    }
    if ('url' in body) {
      if (!validateUrl(body.url)) { res.status(400).json({ error: 'url must be http(s)://...' }); return; }
      // 同一ドメイン内の他ページと URL 重複を弾く
      if (domain.pages.some((p) => p.id !== page.id && p.url === body.url)) {
        res.status(409).json({ error: 'page URL already exists in this domain' });
        return;
      }
      page.url = body.url;
    }
    if ('assignees' in body) {
      if (!Array.isArray(body.assignees)) { res.status(400).json({ error: 'assignees must be an array' }); return; }
      page.assignees = body.assignees
        .map((a) => ({ id: Number(a?.id), name: String(a?.name ?? '') }))
        .filter((a) => Number.isFinite(a.id) && a.id > 0);
    }
    if ('enabled' in body) {
      page.enabled = body.enabled !== false;
      // 再開時は古い休止理由が次回の休止に持ち越されないようクリアする
      page.pausedReason = page.enabled ? null : (body.pausedReason || null);
    } else if ('pausedReason' in body && page.enabled === false) {
      page.pausedReason = body.pausedReason || null;
    }
    await saveConfig(CONFIG_PATH, config);
    const updated = (await loadConfig(CONFIG_PATH)).domains
      .find((d) => d.id === domain.id)?.pages.find((p) => p.id === page.id);
    res.json(updated);
  } catch (err) {
    logger.error('[PATCH /api/domains/:id/pages/:pid]', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/domains/:domainId/pages/:pageId', requireAdmin, async (req, res) => {
  try {
    const config = await loadConfig(CONFIG_PATH);
    const domain = config.domains.find((d) => d.id === req.params.domainId);
    if (!domain) {
      res.status(404).json({ error: 'domain not found' });
      return;
    }
    const before = domain.pages.length;
    domain.pages = domain.pages.filter((p) => p.id !== req.params.pageId);
    if (domain.pages.length === before) {
      res.status(404).json({ error: 'page not found' });
      return;
    }
    await saveConfig(CONFIG_PATH, config);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 検知項目の手動ステータス設定 (除外/NG/OK/検知に戻す)。管理者限定。
app.post('/api/overrides', requireAdmin, (req, res) => {
  const { domainId, pageId, device, ruleId, status } = req.body || {};
  if (!domainId || !pageId || !device || !ruleId) {
    res.status(400).json({ error: 'domainId, pageId, device, ruleId required' });
    return;
  }
  try {
    setOverride({ domainId, pageId, device, ruleId, status });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 推移グラフ用スコア履歴 (DB)。期間 (days) / デバイス指定。
app.get('/api/history', (req, res) => {
  const { domainId, pageId } = req.query;
  const device = req.query.device || 'pc';
  const days = Math.min(Number(req.query.days) || 120, 120);
  if (!domainId || !pageId) { res.status(400).json({ error: 'domainId, pageId required' }); return; }
  try {
    res.json({ series: scoreHistory({ domainId, pageId, device, days }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// runs 一覧 (通常ターゲット、spot は除外)
app.get('/api/runs', async (_req, res, next) => {
  try {
    res.json({ runs: await listRuns() });
  } catch (err) {
    next(err);
  }
});

// スポット評価 run 一覧
app.get('/api/runs/spots', async (_req, res, next) => {
  try {
    res.json({ runs: await listRuns({ onlySpot: true }) });
  } catch (err) {
    next(err);
  }
});

// スポット評価: config に登録せず 1 回だけクロール → report を保存 (spot フラグ付)
app.post('/api/crawl/spot', async (req, res) => {
  try {
    const body = req.body || {};
    const url = String(body.url || '').trim();
    if (!validateUrl(url)) {
      res.status(400).json({ error: 'Invalid URL (http/https only)' });
      return;
    }
    const devices = sanitizeDevices(body.devices);

    // 即席 target を生成 (config には保存しない)。id に "spot:" prefix を付けて
    // crawlJobs Map での衝突を回避 + クライアント側で判別可能に。
    const host = safeHost(url);
    const shortId = createHash('sha1').update(url + Date.now()).digest('hex').slice(0, 8);
    const target = {
      id: `spot:${shortId}`,
      name: `スポット評価: ${host}`,
      domainId: null,
      domainName: 'スポット評価',
      pageId: shortId,
      pageName: host,
      url,
      devices,
      timeout: Number(body.timeout) || 30000,
      weights: DEFAULT_DOMAIN_WEIGHTS,
      thresholds: DEFAULT_DOMAIN_THRESHOLDS,
      ruleOptions: DEFAULT_DOMAIN_RULE_OPTIONS,
    };
    enqueueCrawl(target, { spot: true });
    res.status(202).json({ crawlJobId: target.id, targetName: target.name });
  } catch (err) {
    logger.error('[POST /api/crawl/spot]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/latest', async (_req, res, next) => {
  try {
    const runs = await listRuns();
    if (runs.length === 0) {
      res.status(404).json({ error: 'no runs yet' });
      return;
    }
    res.json(runs[0]);
  } catch (err) {
    next(err);
  }
});

// ======================================================================
// Cross-site rule view + Export
// ======================================================================

async function loadLatestReport() {
  const runs = await listRuns();
  if (runs.length === 0) return null;
  const timestamp = runs[0].timestamp;
  try {
    const json = await readReport(join(REPORTS_DIR, timestamp));
    return { timestamp, ...json };
  } catch (err) {
    logger.warn(`loadLatestReport failed: ${err.message}`);
    return null;
  }
}

// 特定ルールの横断ビュー
app.get('/api/cross-view', async (req, res) => {
  try {
    const ruleId = req.query.ruleId;
    if (!ruleId) {
      res.status(400).json({ error: 'ruleId is required' });
      return;
    }
    const report = await loadLatestReport();
    if (!report) {
      res.json({ ruleId, rows: [], timestamp: null });
      return;
    }
    const rows = [];
    for (const r of report.results || []) {
      if (r.error || r.gateFailed) continue;
      const v = (r.violations || []).find((x) => x.id === ruleId);
      if (!v) continue;
      rows.push({
        domainId: r.site?.domainId ?? r.site?.id ?? null,
        domainName: r.site?.domainName ?? r.site?.name ?? '',
        pageId: r.site?.pageId ?? 'top',
        pageName: r.site?.pageName ?? 'TOP',
        url: r.pageData?.url ?? r.site?.url ?? '',
        passed: v.passed,
        severity: v.severity,
        category: v.category,
        message: v.message,
        offendersTotal: v.offendersTotal ?? (v.offenders ? v.offenders.length : 0),
        total: r.score?.total ?? null,
      });
    }
    rows.sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1;
      return (b.offendersTotal || 0) - (a.offendersTotal || 0);
    });
    res.json({ ruleId, timestamp: report.timestamp, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV エクスポート (最新 run)
app.get('/api/export/latest.csv', async (_req, res, next) => {
  try {
    const report = await loadLatestReport();
    if (!report) {
      res.status(404).send('no run yet');
      return;
    }
    const header = ['timestamp','domainName','pageName','url','category','ruleId','ruleName','severity','weight','passed','offendersTotal','message'];
    const lines = [header.join(',')];
    for (const r of report.results || []) {
      const base = {
        timestamp: report.timestamp,
        domainName: r.site?.domainName ?? r.site?.name ?? '',
        pageName: r.site?.pageName ?? 'TOP',
        url: r.pageData?.url ?? r.site?.url ?? '',
      };
      for (const v of r.violations || []) {
        lines.push([
          base.timestamp, base.domainName, base.pageName, base.url,
          v.category, v.id, v.name, v.severity, v.weight,
          v.passed ? 'true' : 'false',
          v.offendersTotal ?? (v.offenders ? v.offenders.length : 0),
          v.message ?? '',
        ].map(csvCell).join(','));
      }
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.timestamp}.csv"`);
    // BOM for Excel
    res.send('﻿' + lines.join('\n'));
  } catch (err) { next(err); }
});

// Markdown エクスポート (最新 run)
app.get('/api/export/latest.md', async (_req, res, next) => {
  try {
    const report = await loadLatestReport();
    if (!report) {
      res.status(404).send('no run yet');
      return;
    }
    const out = [];
    out.push(`# Web Quality Crawler レポート`);
    out.push(`- 実行日時: ${report.timestamp}`);
    out.push(``);
    for (const r of report.results || []) {
      const title = `${r.site?.domainName ?? r.site?.name ?? ''} / ${r.site?.pageName ?? 'TOP'}`;
      out.push(`## ${title}`);
      out.push(`- URL: ${r.pageData?.url ?? r.site?.url ?? ''}`);
      if (r.error) { out.push(`- エラー: ${r.error}`); out.push(''); continue; }
      if (r.gateFailed) { out.push(`- ゲート失敗`); out.push(''); continue; }
      out.push(`- 総合スコア: ${r.score?.total ?? '?'}`);
      out.push(``);
      const failed = (r.violations || []).filter((v) => !v.passed);
      if (failed.length === 0) {
        out.push(`_未達のルールはありません_`);
        out.push('');
        continue;
      }
      out.push(`### 未達ルール (${failed.length} 件)`);
      out.push('| Severity | Category | Rule | Offenders | Message |');
      out.push('| --- | --- | --- | ---: | --- |');
      for (const v of failed) {
        const off = v.offendersTotal ?? (v.offenders ? v.offenders.length : 0);
        out.push(`| ${v.severity} | ${v.category} | ${escapeMd(v.name)} (\`${v.id}\`) | ${off} | ${escapeMd(v.message || '')} |`);
      }
      out.push('');
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${report.timestamp}.md"`);
    res.send(out.join('\n'));
  } catch (err) { next(err); }
});

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function escapeMd(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// /reports/<TS>/report.json は DB から再構築して配信 (report.json 実体は廃止)。
// DB に無い (= DB 導入前の) ts は次の gzip ミドルウェア / 静的配信へフォールバック。
app.get('/reports/:ts/report.json', (req, res, next) => {
  const { ts } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(ts)) return next();
  try {
    const run = getRunByTs(ts);
    if (!run) return next();
    // 手動 override 反映で内容が動的に変わるためキャッシュ無効化
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// (旧) on-disk report.json.gz が残っている場合の gzip 透過配信フォールバック。
app.use('/reports', async (req, res, next) => {
  if (!req.path.endsWith('/report.json')) return next();
  const gzPath = join(REPORTS_DIR, req.path + '.gz');
  try {
    await readFile(gzPath); // 存在チェック
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.sendFile(gzPath);
  } catch {
    next();
  }
});

// 静的ファイル
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], fallthrough: true }));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  logger.error('server error:', err);
  res.status(500).send(`Internal Server Error: ${err.message}`);
});

app.listen(PORT, HOST, () => {
  logger.info(`Dashboard server listening on http://${HOST}:${PORT}`);
  logger.info(`Reports dir: ${REPORTS_DIR}`);
  logger.info(`Config: ${CONFIG_PATH}`);
});
