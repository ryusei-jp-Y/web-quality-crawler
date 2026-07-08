import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fetchPage } from './fetcher.js';
import { checkGate } from './gate.js';
import { runRules } from './runner.js';
import { calculateScore } from './scorer.js';
import { logger } from './logger.js';
import { generateSuggestion, isAiAvailable } from './ai/suggest.js';
import { runLighthouse } from './lighthouse.js';
import { mergeLighthouseIntoViolations } from '../rules/lighthouse-mapping.js';
import { loadBrand } from './brands.js';
import { saveRun, getRunByTs, findPreviousSuccess } from './report-store.js';

export function screenshotDirFor(reportsRoot, timestamp, target, device = 'pc') {
  return join(reportsRoot, timestamp, 'assets', target.domainId || 'd', target.pageId || 'p', device);
}

const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/;

/**
 * 前回成功した同一 target/device の result を取得する (なければ null)。
 * pageHash 比較で AI ルールスキップ判定に使う。
 */
async function findPreviousSuccessResult(reportsRoot, target, device) {
  // DB から直近成功 result を取得 (旧: reportsRoot を走査して report.json を読んでいた)。
  try {
    return findPreviousSuccess(target.domainId, target.pageId, device);
  } catch {
    return null;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
export const DEFAULT_REPORTS_ROOT = join(PROJECT_ROOT, 'public', 'reports');

/**
 * タイムスタンプ生成 (秒精度)
 * e.g. 2026-04-23T10-15-42
 */
export function makeTimestamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 単一 device でクロール → pageData + violations + screenshot を返す。
 * agnosticViolations が渡されたら、device-agnostic ルールはそれを流用。
 * onProgress: { stage, device, message, pct } の進捗を受け取るコールバック (任意)。
 */
async function crawlForDevice(target, device, {
  screenshotDir,
  skipLinkCheck = false,
  agnosticViolations = null,
  onProgress = null,
  pctOffset = 0,
  pctWeight = 100,
  reportsRoot = null,
} = {}) {
  const notify = (stage, message, stagePct) => {
    if (!onProgress) return;
    try {
      onProgress({
        stage,
        device,
        message,
        pct: Math.round(pctOffset + (stagePct / 100) * pctWeight),
      });
    } catch (_e) { /* noop */ }
  };
  let pageData;
  try {
    notify('fetching', `ページ取得中 (${device.toUpperCase()})`, 5);
    pageData = await fetchPage(target.url, target.timeout, { device, skipLinkCheck });
    // ブランドガイドラインを pageData に注入 (AI ルールが system prompt に展開する)。
    // target.brand 未指定なら null。ブランド固有 AI ルールはスキップ判定する。
    pageData.brand = await loadBrand(target.brand);
    const gateResult = checkGate(pageData, target.ruleOptions);
    if (!gateResult.passed) {
      return {
        site: { ...target, device },
        pageData: { url: pageData.url, title: pageData.title, statusCode: pageData.statusCode, webVitals: pageData.webVitals, device },
        gateFailed: true,
        gateResult,
        violations: [],
        score: null,
      };
    }

    // HTML 不変判定: 前回成功した同一 target/device の pageHash と比較し、
    // 同じなら AI ルール実行をスキップして前回 AI 結果を流用する (1.2 + 7.1)
    const prevResult = pageData.pageHash
      ? await findPreviousSuccessResult(reportsRoot, target, device)
      : null;
    const htmlUnchanged = !!(prevResult
      && prevResult.pageHash
      && pageData.pageHash
      && prevResult.pageHash.value === pageData.pageHash.value);
    const skipAi = htmlUnchanged && !agnosticViolations;
    if (skipAi) {
      logger.info(`[crawl] HTML unchanged for ${target.id} (${device}), skipping AI rules`);
    }

    let violations;
    if (agnosticViolations) {
      // PC で実行済の device-agnostic 結果を流用し、device-sensitive のみ再実行
      notify('rules', `検知ルール実行中 (${device.toUpperCase()}, device-sensitive のみ)`, 25);
      const freshSensitive = await runRules(pageData, target.ruleOptions);
      const sensitiveById = new Map();
      for (const v of freshSensitive) {
        if (v.deviceSensitive) sensitiveById.set(v.id, v);
      }
      violations = agnosticViolations.map((v) => {
        if (v.deviceSensitive && sensitiveById.has(v.id)) return sensitiveById.get(v.id);
        // 非 sensitive ルールの offenders は bbox を除いた clone (device 別 bbox は下で再解決)
        return deepCloneViolation(v, { stripRect: true });
      });
    } else {
      const stageMsg = skipAi
        ? `検知ルール実行中 (${device.toUpperCase()}, 決定的のみ — HTML 不変のため AI スキップ)`
        : `検知ルール実行中 (${device.toUpperCase()}, 決定的 49 + AI 23)`;
      notify('rules', stageMsg, 25);
      violations = await runRules(pageData, target.ruleOptions, {
        skipAi,
        previousAiViolations: skipAi ? prevResult.violations : null,
      });
    }

    notify('screenshot', `スクリーンショット保存中 (${device.toUpperCase()})`, 65);
    // bbox 解決 + スクリーンショット保存
    let screenshotUrl = null;
    let pageDimensions = null;
    if (screenshotDir && pageData._playwright) {
      try {
        const allSelectors = new Set();
        for (const v of violations) {
          if (!v.offenders) continue;
          for (const o of v.offenders) {
            if (o?.selector) allSelectors.add(o.selector);
          }
        }
        const boxes = await pageData._playwright.resolveBboxes([...allSelectors]);
        for (const v of violations) {
          if (!v.offenders) continue;
          for (const o of v.offenders) {
            if (o?.selector && boxes[o.selector]) o.rect = boxes[o.selector];
          }
        }
        pageDimensions = await pageData._playwright.getPageDimensions();
        await mkdir(screenshotDir, { recursive: true });
        // JPEG quality 80 で保存。PNG 比 ~80% 削減、画質劣化最小。
        const screenshotPath = join(screenshotDir, 'screenshot.jpg');
        const shot = await pageData._playwright.captureScreenshot(screenshotPath, { quality: 80 });
        // 高さ上限でクリップされた場合、UI の赤枠オーバーレイは dimensions に合わせて
        // 画像を強制リサイズするため、dimensions の高さも実キャプチャ高さに揃える
        // (揃えないと画像が縦に引き伸ばされ全 offender の赤枠位置がズレる)。
        if (shot?.clippedHeight && pageDimensions) {
          pageDimensions = { ...pageDimensions, height: shot.clippedHeight, clipped: true };
        }
        screenshotUrl = toPublicUrl(screenshotPath);
      } catch (err) {
        logger.warn(`screenshot/bbox failed for ${target.id} (${device}): ${err.message}`);
      }
    }

    // Playwright を完全に閉じてから Lighthouse を独立 Chromium で実行する。
    // 安定運用のため、メモリ重複 (Playwright + LH 同時起動) を避けて逐次実行する。
    // ホスト全体のリソース圧迫 → 他コンテナ 502 等を防ぐ目的。
    try { await pageData._playwright?.close(); } catch (_e) { /* noop */ }
    pageData._playwright = null;

    notify('lighthouse', `Lighthouse 実行中 (${device.toUpperCase()})`, 75);
    const lighthouse = process.env.LIGHTHOUSE_ENABLED === 'false'
      ? null
      : await runLighthouse(target.url, { device }).catch((err) => {
          logger.warn(`[lighthouse] failed for ${target.id} (${device}): ${err.message}`);
          return null;
        });
    notify('scoring', `スコア集計 (${device.toUpperCase()})`, 95);

    // Lighthouse 結果を violations にマージ (バッティングは 1 エントリに統合、単独 audit は末尾追加)
    const mergedViolations = mergeLighthouseIntoViolations(violations, lighthouse);
    // Lighthouse スコアは総合スコア算出 (weighted average) に直接寄与。
    // manualOnly ルール (ビジュアル等) は既定で除外 = 手動評価するまでスコアに含めない。
    const mergedScore = calculateScore(
      mergedViolations.filter((v) => !v.manualOnly),
      target.weights,
      lighthouse?.scores || null,
    );

    return {
      site: { ...target, device },
      pageData: {
        url: pageData.url,
        title: pageData.title,
        statusCode: pageData.statusCode,
        webVitals: pageData.webVitals,
        screenshot: screenshotUrl,
        dimensions: pageDimensions,
        device,
      },
      gateFailed: false,
      violations: mergedViolations,
      rawViolations: violations,    // LH merge 前 (SP が agnostic 流用する際に使う)
      score: mergedScore,
      lighthouse,
      pageHash: pageData.pageHash,
      htmlUnchanged: skipAi || false,
    };
  } catch (err) {
    logger.error(`crawl ${target.id} (${device}) failed: ${err.message}`);
    return { site: { ...target, device }, error: err.message };
  } finally {
    try { await pageData?._playwright?.close(); } catch (_e) { /* noop */ }
  }
}

function deepCloneViolation(v, { stripRect = false } = {}) {
  const cloned = JSON.parse(JSON.stringify(v));
  if (stripRect && Array.isArray(cloned.offenders)) {
    for (const o of cloned.offenders) if (o && 'rect' in o) delete o.rect;
  }
  return cloned;
}

/**
 * 単一 target のクロールを行う。デバイスごとに 1 結果を返す (通常は [pc] or [pc, sp])。
 * デバイスが複数指定されている場合、PC で全ルール実行 → SP は device-sensitive ルールのみ再実行し
 * device-agnostic ルールは流用する "smart" 戦略を取る。
 */
export async function crawlTarget(target, { reportsRoot, timestamp, onProgress } = {}) {
  const devices = Array.isArray(target.devices) && target.devices.length > 0 ? target.devices : ['pc'];
  const results = [];

  // デバイス毎の pct 配分 (PC フル実行が重い、SP 以降は軽い)
  // PC: 70%, 他は残りを均等配分
  const pctForDevice = devices.length === 1
    ? [100]
    : [70, ...Array(devices.length - 1).fill(30 / (devices.length - 1))];

  // 1 回目: PC (またはリストの先頭デバイス) でフル実行
  const primary = devices[0];
  const primaryScreenshotDir = reportsRoot && timestamp
    ? screenshotDirFor(reportsRoot, timestamp, target, primary)
    : null;
  const primaryResult = await crawlForDevice(target, primary, {
    screenshotDir: primaryScreenshotDir,
    onProgress,
    pctOffset: 0,
    pctWeight: pctForDevice[0],
    reportsRoot,
  });
  results.push(primaryResult);

  // 2 回目以降: device-sensitive のみ再実行、それ以外は PC の結果を流用
  if (!primaryResult.error && !primaryResult.gateFailed) {
    let offsetAcc = pctForDevice[0];
    for (let i = 1; i < devices.length; i++) {
      const device = devices[i];
      const screenshotDir = reportsRoot && timestamp
        ? screenshotDirFor(reportsRoot, timestamp, target, device)
        : null;
      const result = await crawlForDevice(target, device, {
        screenshotDir,
        skipLinkCheck: true, // リンク検査は device 非依存なので省略
        // LH merge 前の raw violation を渡す (device 別 LH が二重計上されないように)
        agnosticViolations: primaryResult.rawViolations,
        onProgress,
        pctOffset: offsetAcc,
        pctWeight: pctForDevice[i],
        reportsRoot,
      });
      results.push(result);
      offsetAcc += pctForDevice[i];
    }
  } else {
    // PC がエラー/ゲート失敗なら SP はスキップ (PC 結果のみ残す)
  }

  // rawViolations は report に保存しない (内部中間データ)
  for (const r of results) delete r.rawViolations;
  return results;
}

function toPublicUrl(absPath) {
  const idx = absPath.indexOf('/public/');
  if (idx === -1) return absPath;
  return absPath.slice(idx + '/public'.length);
}

/**
 * results を指定の startedAt で 1 つの report.json にまとめて書き出す
 */
// 構造化レポートの正本は SQLite (lib/report-store.js)。report.json(.gz) は廃止。
// スクリーンショット等の実体はファイルのまま (reportsRoot/<ts>/assets/) で、
// page_results.screenshot_path から参照する。
// 戻り値の reportDir はアセット保存ディレクトリ (互換のため維持)。
export async function writeReport({ reportsRoot, startedAt, results, extra = null }) {
  const { ts } = saveRun({ startedAt, results, spot: !!(extra && extra.spot) });
  return { timestamp: ts, reportDir: join(reportsRoot, ts), jsonPath: null };
}

/**
 * report を読み込む。まず DB (ts = ディレクトリ名) を引き、無ければ旧 on-disk
 * (.json.gz / .json) にフォールバックする (DB 導入前の過去レポート互換)。
 */
export async function readReport(reportDir) {
  const ts = reportDir.split('/').filter(Boolean).pop();
  const fromDb = ts ? getRunByTs(ts) : null;
  if (fromDb) return fromDb;
  const gzPath = join(reportDir, 'report.json.gz');
  try {
    const buf = await readFile(gzPath);
    return JSON.parse(gunzipSync(buf).toString('utf-8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const jsonPath = join(reportDir, 'report.json');
  return JSON.parse(await readFile(jsonPath, 'utf-8'));
}

/**
 * 失敗 audit の AI 修正提案を事前キャッシュ。
 * mode:
 *   'all'      : 失敗 (passed=false) audit すべて prefetch (高コスト)
 *   'failed'   : 'all' の別名 (失敗 audit すべて)
 *   'major'    : critical + major のみ prefetch (推奨)
 *   'critical' : critical のみ prefetch (既定)
 *   'none'     : prefetch しない (UI クリック時に on-demand 生成)
 */
export async function prefetchAiSuggestions(results, mode = 'critical') {
  if (mode === 'none' || !isAiAvailable()) return;
  for (const r of results) {
    if (r.error || r.gateFailed || !r.violations) continue;
    const targets = r.violations.filter((v) => {
      if (v.passed) return false;
      if (!v.offenders || v.offenders.length === 0) return false;
      if (mode === 'critical') return v.severity === 'critical';
      if (mode === 'major') return v.severity === 'critical' || v.severity === 'major';
      // 'all' / 'failed' = すべての失敗 audit
      return true;
    });
    for (const v of targets) {
      try {
        const result = await generateSuggestion({
          rule: { id: v.id, name: v.name, category: v.category, severity: v.severity, message: v.message, fix: v.fix },
          offenders: v.offenders,
          siteName: r.site.name,
          url: r.pageData?.url || r.site.url,
        });
        logger.debug(`  [${result.cached ? 'cache' : 'fresh'}] suggest ${v.id} (${r.site.name})`);
      } catch (err) {
        logger.warn(`  prefetch failed ${v.id}: ${err.message}`);
      }
    }
  }
}
