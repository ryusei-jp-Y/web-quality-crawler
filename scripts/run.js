import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../lib/logger.js';
import { loadConfig, flattenTargets } from '../lib/config.js';
import { writeReport, prefetchAiSuggestions, DEFAULT_REPORTS_ROOT, makeTimestamp } from '../lib/crawl.js';
import { pruneOldRuns } from '../lib/report-store.js';
import { writeLatestPointer } from '../lib/reporter.js';
import { isAiAvailable } from '../lib/ai/suggest.js';
import { tracker } from '../lib/ai/cost-tracker.js';
import { runCrawlInWorker } from '../lib/crawl-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DEFAULT_CONFIG = join(PROJECT_ROOT, 'config', 'targets.json');

async function main() {
  const startedAt = new Date();
  logger.info(`Quality crawler v2 started`);

  const configPath = process.env.CONFIG_PATH ?? DEFAULT_CONFIG;
  const reportsRoot = process.env.REPORTS_DIR ?? DEFAULT_REPORTS_ROOT;

  const config = await loadConfig(configPath);
  const targets = flattenTargets(config);

  if (targets.length === 0) {
    logger.warn('no enabled targets; exiting');
    return;
  }

  const timestamp = makeTimestamp(startedAt);
  const results = [];
  let hasCritical = false;
  let hasGateFailure = false;
  // 各 worker から受け取った AI usage を親側で集計してログに出す
  // (実際の usage.json 永続化は子側で行うため、ここは表示用)
  const aiAgg = { total: 0, fresh: 0, cached: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  for (const target of targets) {
    logger.info(`Processing ${target.name} (${target.url}) ...`);
    let deviceResults;
    try {
      const msg = await runCrawlInWorker(target, { reportsRoot, timestamp });
      deviceResults = msg.results;
      if (msg.aiSummary) {
        aiAgg.total += msg.aiSummary.total ?? 0;
        aiAgg.fresh += msg.aiSummary.fresh ?? 0;
        aiAgg.cached += msg.aiSummary.cached ?? 0;
        aiAgg.inputTokens += msg.aiSummary.inputTokens ?? 0;
        aiAgg.outputTokens += msg.aiSummary.outputTokens ?? 0;
        aiAgg.costUsd += msg.aiSummary.costUsd ?? 0;
      }
    } catch (err) {
      // 子プロセス異常終了 (OOM 等) でも全体は止めず、エラー結果を 1 件記録して次へ進む。
      // これが C 案 (ページ単位プロセス分離) の主目的: 1 ページの事故で全クロールを失わない。
      logger.error(`Crawl worker failed for ${target.name}: ${err.message}`);
      const fallbackDevice = (Array.isArray(target.devices) && target.devices[0]) || 'pc';
      deviceResults = [{
        site: { ...target, device: fallbackDevice },
        error: `worker_failed: ${err.message}`,
      }];
    }

    for (const result of deviceResults) {
      results.push(result);
      if (result.error) continue;
      if (result.gateFailed) { hasGateFailure = true; continue; }
      const { score } = result;
      if (score.counts.critical > 0) hasCritical = true;
      const dev = result.site?.device ?? 'pc';
      logger.info(
        `  [${dev}] Total: ${score.total}/100 (Critical: ${score.counts.critical}, Major: ${score.counts.major}, Minor: ${score.counts.minor})`,
      );
    }
  }

  // Step 4: レポート出力
  await writeReport({ reportsRoot, startedAt, results });
  // スコア保持日数を超えた古い run を prune (既定 120 日)
  try { pruneOldRuns(Number(process.env.SCORE_RETENTION_DAYS ?? 120)); } catch (e) { logger.warn(`[prune] ${e.message}`); }
  await writeLatestPointer(reportsRoot, timestamp);
  await writeFile(
    join(reportsRoot, 'latest.json'),
    JSON.stringify({ startedAt, results }, null, 2),
  );

  // Step 5: 失敗audit の AI 修正提案を事前キャッシュ
  // 既定値: critical (深刻違反のみ事前キャッシュ、major/minor は UI クリック時に生成)
  // 全件 prefetch したい場合は AI_PREFETCH=all、コスト最小なら none
  // NOTE: prefetch は親プロセスで実行 (1 リクエストあたりのメモリは小さい)
  const prefetchMode = (process.env.AI_PREFETCH ?? (isAiAvailable() ? 'critical' : 'none')).toLowerCase();
  if (prefetchMode !== 'none') {
    logger.info(`AI_PREFETCH=${prefetchMode}: 修正提案を事前取得します`);
    await prefetchAiSuggestions(results, prefetchMode);
  }

  // Step 6: AI コスト集計ログ
  // 子プロセスでの呼び出し分は子側で usage.json に永続化済み。
  // 親側の prefetchAiSuggestions 呼び出し分はこのプロセスの tracker に積まれているので
  // 同様に persist する。
  const parentAi = tracker.summary();
  if (parentAi.total > 0) {
    aiAgg.total += parentAi.total;
    aiAgg.fresh += parentAi.fresh;
    aiAgg.cached += parentAi.cached;
    aiAgg.inputTokens += parentAi.inputTokens;
    aiAgg.outputTokens += parentAi.outputTokens;
    aiAgg.costUsd += parentAi.costUsd;
    await tracker.persist();
  }
  if (aiAgg.total > 0) {
    const costStr = aiAgg.costUsd === 0
      ? '$0 (全キャッシュヒット)'
      : `~$${aiAgg.costUsd.toFixed(4)}`;
    logger.info(
      `AI: ${aiAgg.total} calls (${aiAgg.fresh} fresh / ${aiAgg.cached} cached) ` +
      `input=${aiAgg.inputTokens} output=${aiAgg.outputTokens} ${costStr}`,
    );
  }

  // Step 7: 終了コード
  const hasRuntimeError = results.some((r) => r.error);
  let exitCode = 0;
  if (hasRuntimeError) exitCode = 3;
  else if (hasGateFailure) exitCode = 2;
  else if (hasCritical) exitCode = 1;

  logger.info(`Completed. Exit code: ${exitCode}`);
  process.exitCode = exitCode;
}

main().catch((err) => {
  logger.error('Fatal:', err);
  process.exit(3);
});
