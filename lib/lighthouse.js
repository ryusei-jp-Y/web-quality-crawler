import { launch as launchChrome } from 'chrome-launcher';
import { chromium } from 'playwright';
import { logger } from './logger.js';

// 起動時は import せず、必要になったタイミングで dynamic import する
// (lighthouse は ESM only で重いため起動時オーバーヘッドを避ける)
let lighthouseImpl = null;
async function getLighthouse() {
  if (!lighthouseImpl) {
    const mod = await import('lighthouse');
    lighthouseImpl = mod.default || mod;
  }
  return lighthouseImpl;
}

// chrome-launcher が使う Chrome バイナリパスを解決する。
// 優先順位:
//   1. CHROME_PATH 環境変数 (明示指定)
//   2. Playwright がインストール済の Chromium (node:24 + Playwright 構成で必ず存在)
//   3. chrome-launcher の auto-detect (undefined 返却で委譲)
// Docker コンテナにシステム Chrome が入っていなくても、Playwright の Chromium を
// 流用することで Lighthouse を起動可能にする。
function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const p = chromium.executablePath();
    if (p) return p;
  } catch (_e) { /* ignore */ }
  return undefined;
}

const DESKTOP_SCREEN = {
  mobile: false,
  width: 1350,
  height: 940,
  deviceScaleFactor: 1,
  disabled: false,
};

const MOBILE_SCREEN = {
  mobile: true,
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  disabled: false,
};

// Lighthouse は内部で performance.mark/measure (Node プロセスのグローバル API) を
// 使うため、同一プロセス内で並列実行するとマークが衝突して
// "The 'start lh:runner:gather' performance mark has not been set" エラーで失敗する。
// クロールは CRAWL_CONCURRENCY=2 で並列のまま、Lighthouse 部分だけプロセス内で
// シリアライズする mutex を導入。
let lighthouseSerialLock = Promise.resolve();

async function withLighthouseLock(task) {
  const prev = lighthouseSerialLock;
  let release;
  lighthouseSerialLock = new Promise((resolve) => { release = resolve; });
  try {
    await prev;
    return await task();
  } finally {
    release();
  }
}

/**
 * Lighthouse を独立した Chromium で実行し、4 カテゴリのスコアを返す。
 * 失敗しても throw せず null を返す (評価フローを止めない)。
 * 同一プロセス内では mutex で 1 件ずつシリアル実行される。
 */
// ERRORED_DOCUMENT_REQUEST (5xx 等) は Playwright クロール直後の連打で発生することがある。
// 5秒待って1回リトライする。
export async function runLighthouse(url, opts = {}) {
  return withLighthouseLock(async () => {
    const result = await runLighthouseInternal(url, opts);
    if (result?.runtimeError?.code === 'ERRORED_DOCUMENT_REQUEST') {
      logger.info(`[lighthouse] retrying ${url} (${opts.device ?? 'pc'}) after ERRORED_DOCUMENT_REQUEST`);
      await new Promise((r) => setTimeout(r, 5000));
      return runLighthouseInternal(url, opts);
    }
    return result;
  });
}

async function runLighthouseInternal(url, { device = 'pc', timeoutMs = 60000 } = {}) {
  let chrome;
  const chromePath = resolveChromePath();
  try {
    chrome = await launchChrome({
      chromePath,
      chromeFlags: [
        '--headless=new',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
      ],
    });
    logger.debug(`[lighthouse] chrome launched (path=${chromePath || 'auto'}, port=${chrome.port})`);
  } catch (err) {
    logger.warn(`[lighthouse] chrome launch failed (path=${chromePath || 'auto'}): ${err.message}`);
    return null;
  }

  try {
    const lighthouse = await getLighthouse();
    const options = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      maxWaitForLoad: timeoutMs,
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      formFactor: device === 'sp' ? 'mobile' : 'desktop',
      screenEmulation: device === 'sp' ? MOBILE_SCREEN : DESKTOP_SCREEN,
      // Lighthouse は Chrome フラグの --user-agent を CDP setUserAgentOverride で上書きするため、
      // フラグではなくこちらで設定する必要がある。Playwright と同じ UA を使い WP セキュリティ
      // プラグイン等の HeadlessChrome 検知を回避する。
      emulatedUserAgent: 'WebQualityCrawler/1.0',
    };

    const runnerResult = await lighthouse(url, options);
    if (!runnerResult?.lhr) {
      logger.warn('[lighthouse] no lhr in result');
      return null;
    }
    const { lhr } = runnerResult;
    // runtimeError はページロード失敗時に Lighthouse が設定する。
    // スコアが全 null になる原因の診断に必須なのでログと戻り値に含める。
    if (lhr.runtimeError?.code) {
      logger.warn(`[lighthouse] runtimeError for ${url}: ${lhr.runtimeError.code} — ${lhr.runtimeError.message}`);
    }
    const categories = lhr.categories || {};
    const audits = lhr.audits || {};

    const scoreOf = (key) => {
      const c = categories[key];
      if (!c || c.score == null) return null;
      return Math.round(c.score * 100);
    };
    const metric = (key) => {
      const a = audits[key];
      if (!a) return null;
      return {
        score: a.score,
        numeric: a.numericValue ?? null,
        unit: a.numericUnit ?? null,
        display: a.displayValue ?? null,
      };
    };

    // カテゴリ別の audit を抽出 (failed + passed、numeric/binary のみ)
    // LH の該当カテゴリに所属する audit なら、passed/failed にかかわらず全て拾う
    const auditsByCategory = {};        // failed のみ (既存 UI 互換)
    const allAuditsByCategory = {};     // passed + failed 全部
    for (const catId of ['performance', 'accessibility', 'best-practices', 'seo']) {
      const cat = categories[catId];
      if (!cat || !Array.isArray(cat.auditRefs)) {
        auditsByCategory[catId] = [];
        allAuditsByCategory[catId] = [];
        continue;
      }
      const all = [];
      const failed = [];
      for (const ref of cat.auditRefs) {
        const audit = audits[ref.id];
        if (!audit) continue;
        const mode = audit.scoreDisplayMode;
        // numeric / binary 以外 (informative / manual / notApplicable) はスキップ
        if (mode !== 'numeric' && mode !== 'binary') continue;
        if (audit.score == null) continue;
        const entry = {
          id: ref.id,
          title: audit.title,
          description: audit.description || '',
          score: audit.score,
          passed: audit.score >= 0.9,
          displayValue: audit.displayValue || null,
          weight: ref.weight || 0,
          group: ref.group || null,
          category: catId,
        };
        all.push(entry);
        if (!entry.passed) failed.push(entry);
      }
      failed.sort((a, b) => (b.weight || 0) - (a.weight || 0));
      all.sort((a, b) => {
        if (a.passed !== b.passed) return a.passed ? 1 : -1; // failed 先
        return (b.weight || 0) - (a.weight || 0);
      });
      auditsByCategory[catId] = failed;
      allAuditsByCategory[catId] = all;
    }

    return {
      scores: {
        performance: scoreOf('performance'),
        accessibility: scoreOf('accessibility'),
        'best-practices': scoreOf('best-practices'),
        seo: scoreOf('seo'),
      },
      metrics: {
        lcp: metric('largest-contentful-paint'),
        cls: metric('cumulative-layout-shift'),
        tbt: metric('total-blocking-time'),
        fcp: metric('first-contentful-paint'),
        si: metric('speed-index'),
        tti: metric('interactive'),
      },
      failedAudits: auditsByCategory,
      allAudits: allAuditsByCategory,
      version: lhr.lighthouseVersion,
      fetchedAt: new Date().toISOString(),
      formFactor: options.formFactor,
      runtimeError: lhr.runtimeError?.code
        ? { code: lhr.runtimeError.code, message: lhr.runtimeError.message }
        : null,
    };
  } catch (err) {
    logger.warn(`[lighthouse] run failed for ${url} (${device}): ${err.message}`);
    return null;
  } finally {
    try { await chrome.kill(); } catch (_e) { /* noop */ }
  }
}
