import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_FILE = resolve(__dirname, '..', '..', 'public', 'ai-cache', 'usage.json');

// 2026-04 時点の Anthropic 標準料金 (USD / 1M tokens)
const PRICING = {
  'claude-opus-4-7':   { input: 5.0, output: 25.0 },
  'claude-opus-4-6':   { input: 5.0, output: 25.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5':  { input: 1.0, output: 5.0 },
};

function costOf(model, usage) {
  const p = PRICING[model] ?? { input: 3.0, output: 15.0 };
  const it = usage.input_tokens ?? 0;
  const ot = usage.output_tokens ?? 0;
  const crt = usage.cache_read_input_tokens ?? 0;
  return ((it - crt) * p.input + crt * p.input * 0.1 + ot * p.output) / 1_000_000;
}

class CostTracker {
  constructor() {
    this.calls = [];
  }

  reset() {
    this.calls = [];
  }

  record({ tag, model, usage, cached }) {
    this.calls.push({
      tag: tag ?? 'unknown',
      model: model ?? 'unknown',
      usage: usage ?? {},
      cached: !!cached,
      at: Date.now(),
    });
  }

  summary() {
    const total = this.calls.length;
    const cached = this.calls.filter((c) => c.cached).length;
    const fresh = total - cached;
    let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, costUsd = 0;
    for (const c of this.calls) {
      if (c.cached) continue;
      inputTokens += c.usage.input_tokens ?? 0;
      outputTokens += c.usage.output_tokens ?? 0;
      cacheReadTokens += c.usage.cache_read_input_tokens ?? 0;
      costUsd += costOf(c.model, c.usage);
    }
    const byTag = {};
    for (const c of this.calls) {
      if (!byTag[c.tag]) byTag[c.tag] = { total: 0, cached: 0, fresh: 0 };
      byTag[c.tag].total++;
      if (c.cached) byTag[c.tag].cached++;
      else byTag[c.tag].fresh++;
    }
    return {
      total, cached, fresh, inputTokens, outputTokens, cacheReadTokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
      byTag,
    };
  }

  /**
   * 現在のトラッカー内容を usage.json に永続化 (追記)。
   * 同じプロセス内で run.js 終了時 or 個別 suggest 後に呼ばれる。
   */
  async persist() {
    if (this.calls.length === 0) return;
    const existing = await loadPersistedUsageRaw();
    if (!existing.byDay) existing.byDay = {};
    for (const c of this.calls) {
      existing.totals.calls += 1;
      if (c.cached) existing.totals.cached += 1;
      else {
        existing.totals.fresh += 1;
        existing.totals.inputTokens += c.usage.input_tokens ?? 0;
        existing.totals.outputTokens += c.usage.output_tokens ?? 0;
        existing.totals.cacheReadTokens += c.usage.cache_read_input_tokens ?? 0;
        existing.totals.costUsd += costOf(c.model, c.usage);
      }
      // model 別
      const m = c.model;
      if (!existing.byModel[m]) {
        existing.byModel[m] = { calls: 0, fresh: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }
      existing.byModel[m].calls += 1;
      if (c.cached) existing.byModel[m].cached += 1;
      else {
        existing.byModel[m].fresh += 1;
        existing.byModel[m].inputTokens += c.usage.input_tokens ?? 0;
        existing.byModel[m].outputTokens += c.usage.output_tokens ?? 0;
        existing.byModel[m].costUsd += costOf(c.model, c.usage);
      }
      // tag 別
      const t = c.tag;
      if (!existing.byTag[t]) existing.byTag[t] = { calls: 0, fresh: 0, cached: 0 };
      existing.byTag[t].calls += 1;
      if (c.cached) existing.byTag[t].cached += 1;
      else existing.byTag[t].fresh += 1;
      // 日別 (ローカル TZ = コンテナ TZ, 既定 Asia/Tokyo)
      const day = dayKeyFor(c.at);
      if (!existing.byDay[day]) {
        existing.byDay[day] = { calls: 0, fresh: 0, cached: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
      }
      const d = existing.byDay[day];
      d.calls += 1;
      if (c.cached) d.cached += 1;
      else {
        d.fresh += 1;
        d.inputTokens += c.usage.input_tokens ?? 0;
        d.outputTokens += c.usage.output_tokens ?? 0;
        d.cacheReadTokens += c.usage.cache_read_input_tokens ?? 0;
        d.costUsd += costOf(c.model, c.usage);
      }
    }
    existing.totals.costUsd = Math.round(existing.totals.costUsd * 10000) / 10000;
    for (const m of Object.values(existing.byModel)) {
      m.costUsd = Math.round(m.costUsd * 10000) / 10000;
    }
    for (const d of Object.values(existing.byDay)) {
      d.costUsd = Math.round(d.costUsd * 10000) / 10000;
    }
    existing.updatedAt = new Date().toISOString();

    try {
      await mkdir(dirname(USAGE_FILE), { recursive: true });
      await writeFile(USAGE_FILE, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`cost usage persist failed: ${err.message}`);
    }
    // 永続化後にトラッカーをリセット (二重計上防止)
    this.reset();
  }
}

function emptyUsage() {
  return {
    totals: { calls: 0, fresh: 0, cached: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
    byModel: {},
    byTag: {},
    byDay: {},
    updatedAt: null,
  };
}

function emptyDayBucket() {
  return { calls: 0, fresh: 0, cached: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
}

// ローカルタイムゾーン (コンテナ TZ = Asia/Tokyo を想定) の YYYY-MM-DD を返す
function dayKeyFor(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function monthKeyFor(timestamp) {
  return dayKeyFor(timestamp).slice(0, 7); // YYYY-MM
}

function aggregateWindow(byDay, predicate) {
  const agg = emptyDayBucket();
  for (const [day, bucket] of Object.entries(byDay || {})) {
    if (!predicate(day)) continue;
    agg.calls += bucket.calls ?? 0;
    agg.fresh += bucket.fresh ?? 0;
    agg.cached += bucket.cached ?? 0;
    agg.inputTokens += bucket.inputTokens ?? 0;
    agg.outputTokens += bucket.outputTokens ?? 0;
    agg.cacheReadTokens += bucket.cacheReadTokens ?? 0;
    agg.costUsd += bucket.costUsd ?? 0;
  }
  agg.costUsd = Math.round(agg.costUsd * 10000) / 10000;
  return agg;
}

async function loadPersistedUsageRaw() {
  try {
    const raw = await readFile(USAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      totals: { ...emptyUsage().totals, ...(parsed.totals ?? {}) },
      byModel: parsed.byModel ?? {},
      byTag: parsed.byTag ?? {},
      byDay: parsed.byDay ?? {},
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`load usage failed: ${err.message}`);
    return emptyUsage();
  }
}

export async function loadPersistedUsage() {
  const raw = await loadPersistedUsageRaw();
  const now = Date.now();
  const todayKey = dayKeyFor(now);
  const monthKey = monthKeyFor(now);
  const today = aggregateWindow(raw.byDay, (d) => d === todayKey);
  const thisMonth = aggregateWindow(raw.byDay, (d) => d.startsWith(monthKey));
  return { ...raw, today, thisMonth };
}

export const tracker = new CostTracker();
