import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getDb } from './db.js';
import { logger } from './logger.js';

// ------------------------------------------------------------------
// 設定 (domains/pages) の正本は SQLite (lib/db.js)。
// 以前は config/targets.json を読み書きしていたが、DB へ移行した。
//   - loadConfig() / saveConfig() の「{ domains: [...] }」形状は従来どおり維持し、
//     flattenTargets 等の全コンシューマは無改修で動く。
//   - 初回起動 (DB が空) のとき、既存 targets.json があれば一度だけ DB へ取り込む
//     (VM 上の本番 targets.json をシームレスに移行)。無ければ targets.example.json。
//   - path 引数は「シード元 JSON の探索」にのみ使う (書込みは常に DB)。
// ------------------------------------------------------------------

function slugify(s) {
  // URL 安全文字 + 日本語 (ひらがな/カタカナ/漢字/全角英数) は保持
  const normalized = String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[/\\?<>:*|"#%\x00-\x1f]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || `p${Date.now().toString(36)}`;
}

/** 旧 { sites: [...] } 形式を新 { domains: [{..., pages:[...]}] } に自動変換 */
function normalize(config) {
  if (!config || typeof config !== 'object') {
    return { domains: [] };
  }
  if (Array.isArray(config.domains)) {
    return { ...config, domains: config.domains.map(normalizeDomain) };
  }
  if (Array.isArray(config.sites)) {
    return {
      domains: config.sites.map((s) => {
        const host = safeHost(s.url);
        const id = slugify(s.id || s.name || host);
        return normalizeDomain({
          id,
          name: s.name || host,
          enabled: s.enabled !== false,
          timeout: s.timeout,
          weights: s.weights,
          thresholds: s.thresholds,
          ruleOptions: s.ruleOptions,
          pages: [{ id: 'top', name: 'TOP', url: s.url }],
        });
      }),
    };
  }
  return { domains: [] };
}

// 旧形式 weights を新形式 (main + lh-* キー) に自動変換。
const LEGACY_WEIGHT_KEYS = new Set(['llmo', 'semantic', 'structured', 'readable', 'a11y', 'perf', 'links']);
const NEW_FORMAT_DEFAULT_WEIGHTS = {
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
function migrateWeights(w) {
  if (!w || typeof w !== 'object') return w;
  const keys = Object.keys(w);
  const hasLegacy = keys.some((k) => LEGACY_WEIGHT_KEYS.has(k));
  const hasNew = keys.some((k) => k === 'code' || k === 'info' || k.startsWith('lh-'));
  if (hasLegacy && !hasNew) return { ...NEW_FORMAT_DEFAULT_WEIGHTS };
  return w;
}

function normalizeAssignees(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((a) => ({ id: Number(a?.id), name: String(a?.name ?? '') }))
    .filter((a) => Number.isFinite(a.id) && a.id > 0);
}

function normalizeDomain(d) {
  return {
    id: d.id || slugify(d.name || 'domain'),
    name: d.name || d.id || 'untitled',
    enabled: d.enabled !== false,
    pausedReason: d.enabled === false ? (d.pausedReason || null) : null,
    timeout: d.timeout,
    brand: d.brand ?? null,
    weights: migrateWeights(d.weights),
    thresholds: d.thresholds,
    ruleOptions: d.ruleOptions,
    pages: (d.pages || []).map((p) => ({
      id: p.id || slugify(p.name || 'page'),
      name: p.name || p.id || 'TOP',
      url: p.url,
      enabled: p.enabled !== false,
      pausedReason: p.enabled === false ? (p.pausedReason || null) : null,
      devices: normalizeDevices(p.devices),
      assignees: normalizeAssignees(p.assignees),
      ...(p.timeout ? { timeout: p.timeout } : {}),
      ...(p.weights ? { weights: p.weights } : {}),
      ...(p.thresholds ? { thresholds: p.thresholds } : {}),
      ...(p.ruleOptions ? { ruleOptions: p.ruleOptions } : {}),
    })),
  };
}

const SUPPORTED_DEVICES = ['pc', 'sp'];
const DEFAULT_DEVICES = ['pc', 'sp'];
function normalizeDevices(input) {
  if (!Array.isArray(input) || input.length === 0) return [...DEFAULT_DEVICES];
  const out = input.map((d) => String(d).toLowerCase()).filter((d) => SUPPORTED_DEVICES.includes(d));
  const unique = [...new Set(out)];
  return unique.length > 0 ? unique : [...DEFAULT_DEVICES];
}

function safeHost(url) {
  try { return new URL(url).host; } catch { return 'unknown'; }
}

const parseJson = (s, fallback = null) => {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

// --- DB 読み書き ----------------------------------------------------

function readConfigFromDb() {
  const db = getDb();
  const domainRows = db.prepare('SELECT * FROM domains ORDER BY sort_order, id').all();
  const pageStmt = db.prepare('SELECT * FROM pages WHERE domain_id = ? ORDER BY sort_order, id');
  const domains = domainRows.map((dr) => ({
    id: dr.id,
    name: dr.name,
    enabled: !!dr.enabled,
    pausedReason: dr.enabled ? null : (dr.paused_reason ?? null),
    timeout: dr.timeout ?? undefined,
    brand: dr.brand ?? null,
    weights: parseJson(dr.weights_json) ?? undefined,
    thresholds: parseJson(dr.thresholds_json) ?? undefined,
    ruleOptions: parseJson(dr.rule_options_json) ?? undefined,
    pages: pageStmt.all(dr.id).map((pr) => {
      const overrides = parseJson(pr.overrides_json) ?? {};
      return {
        id: pr.id,
        name: pr.name,
        url: pr.url,
        enabled: !!pr.enabled,
        pausedReason: pr.enabled ? null : (pr.paused_reason ?? null),
        devices: parseJson(pr.devices_json) ?? [...DEFAULT_DEVICES],
        assignees: parseJson(pr.assignees_json) ?? [],
        ...(overrides.timeout ? { timeout: overrides.timeout } : {}),
        ...(overrides.weights ? { weights: overrides.weights } : {}),
        ...(overrides.thresholds ? { thresholds: overrides.thresholds } : {}),
        ...(overrides.ruleOptions ? { ruleOptions: overrides.ruleOptions } : {}),
      };
    }),
  }));
  return { domains };
}

function writeConfigToDb(config) {
  const db = getDb();
  const normalized = normalize(config);
  const upDomain = db.prepare(`
    INSERT INTO domains (id, name, enabled, paused_reason, brand, timeout, weights_json, thresholds_json, rule_options_json, sort_order)
    VALUES (@id, @name, @enabled, @paused_reason, @brand, @timeout, @weights_json, @thresholds_json, @rule_options_json, @sort_order)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, enabled=excluded.enabled, paused_reason=excluded.paused_reason, brand=excluded.brand,
      timeout=excluded.timeout,
      weights_json=excluded.weights_json, thresholds_json=excluded.thresholds_json,
      rule_options_json=excluded.rule_options_json, sort_order=excluded.sort_order
  `);
  const upPage = db.prepare(`
    INSERT INTO pages (id, domain_id, name, url, enabled, paused_reason, devices_json, assignees_json, overrides_json, sort_order)
    VALUES (@id, @domain_id, @name, @url, @enabled, @paused_reason, @devices_json, @assignees_json, @overrides_json, @sort_order)
    ON CONFLICT(domain_id, id) DO UPDATE SET
      name=excluded.name, url=excluded.url, enabled=excluded.enabled, paused_reason=excluded.paused_reason,
      devices_json=excluded.devices_json, assignees_json=excluded.assignees_json,
      overrides_json=excluded.overrides_json, sort_order=excluded.sort_order
  `);
  const delDomain = db.prepare('DELETE FROM domains WHERE id = ?');
  const delPage = db.prepare('DELETE FROM pages WHERE domain_id = ? AND id = ?');

  const tx = db.transaction(() => {
    const incomingDomainIds = new Set(normalized.domains.map((d) => d.id));
    for (const row of db.prepare('SELECT id FROM domains').all()) {
      if (!incomingDomainIds.has(row.id)) delDomain.run(row.id); // pages は CASCADE
    }
    normalized.domains.forEach((d, di) => {
      upDomain.run({
        id: d.id,
        name: d.name,
        enabled: d.enabled === false ? 0 : 1,
        paused_reason: d.enabled === false ? (d.pausedReason || null) : null,
        brand: d.brand ?? null,
        timeout: d.timeout ?? null,
        weights_json: d.weights ? JSON.stringify(d.weights) : null,
        thresholds_json: d.thresholds ? JSON.stringify(d.thresholds) : null,
        rule_options_json: d.ruleOptions ? JSON.stringify(d.ruleOptions) : null,
        sort_order: di,
      });
      const incomingPageIds = new Set(d.pages.map((p) => p.id));
      for (const row of db.prepare('SELECT id FROM pages WHERE domain_id = ?').all(d.id)) {
        if (!incomingPageIds.has(row.id)) delPage.run(d.id, row.id);
      }
      d.pages.forEach((p, pi) => {
        const overrides = {};
        if (p.timeout) overrides.timeout = p.timeout;
        if (p.weights) overrides.weights = p.weights;
        if (p.thresholds) overrides.thresholds = p.thresholds;
        if (p.ruleOptions) overrides.ruleOptions = p.ruleOptions;
        upPage.run({
          id: p.id,
          domain_id: d.id,
          name: p.name,
          url: p.url,
          enabled: p.enabled === false ? 0 : 1,
          paused_reason: p.enabled === false ? (p.pausedReason || null) : null,
          devices_json: JSON.stringify(p.devices ?? [...DEFAULT_DEVICES]),
          assignees_json: JSON.stringify(p.assignees ?? []),
          overrides_json: Object.keys(overrides).length ? JSON.stringify(overrides) : null,
          sort_order: pi,
        });
      });
    });
  });
  tx();
}

// 初回起動 (DB が空) のとき、既存 JSON からシードする。
async function seedFromJsonIfEmpty(path) {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM domains').get().c;
  if (count > 0) return;
  const candidates = [path, path?.replace(/\.json$/, '.example.json'), path && `${dirname(path)}/targets.example.json`].filter(Boolean);
  for (const file of candidates) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf-8'));
      const cfg = normalize(raw);
      if (cfg.domains.length > 0) {
        writeConfigToDb(cfg);
        logger.info(`[config] seeded DB from ${file} (${cfg.domains.length} domains)`);
        return;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') logger.warn(`[config] seed skip ${file}: ${err.message}`);
    }
  }
}

export async function loadConfig(path) {
  await seedFromJsonIfEmpty(path);
  return readConfigFromDb();
}

export async function saveConfig(_path, config) {
  writeConfigToDb(config);
}

/** domains -> [target, ...] に展開。各 target はクローラ 1 サイト分の処理単位。 */
export function flattenTargets(config) {
  const targets = [];
  for (const domain of config.domains || []) {
    if (domain.enabled === false) continue;
    for (const page of domain.pages || []) {
      if (page.enabled === false) continue;
      if (!page.url) continue;
      targets.push({
        id: `${domain.id}/${page.id}`,
        name: `${domain.name} / ${page.name}`,
        domainId: domain.id,
        domainName: domain.name,
        pageId: page.id,
        pageName: page.name,
        url: page.url,
        devices: Array.isArray(page.devices) && page.devices.length > 0 ? page.devices : [...DEFAULT_DEVICES],
        timeout: page.timeout ?? domain.timeout ?? 30000,
        brand: domain.brand ?? null,
        weights: page.weights ?? domain.weights,
        thresholds: page.thresholds ?? domain.thresholds,
        ruleOptions: page.ruleOptions ?? domain.ruleOptions,
      });
    }
  }
  return targets;
}

export { slugify };
