import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';

/**
 * クロール結果を JSON で出力する。HTML レンダリングはダッシュボードサーバが
 * 動的に行うため、ここでは JSON のみを書き出す（単一の真実ソース）。
 */
export async function generateReports(results, reportDir, startedAt) {
  await mkdir(reportDir, { recursive: true });

  const jsonPath = join(reportDir, 'report.json');
  await writeFile(jsonPath, JSON.stringify({ startedAt, results }, null, 2));

  logger.info(`report written: ${jsonPath}`);
  return { jsonPath };
}

export async function writeLatestPointer(reportsRoot, timestamp) {
  const indexHtml = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Web Quality Crawler - Latest</title>
<meta http-equiv="refresh" content="0; url=/reports/${timestamp}/report.html"></head>
<body><p><a href="/reports/${timestamp}/report.html">最新レポート（${timestamp}）</a></p></body></html>`;
  await writeFile(join(reportsRoot, 'index.html'), indexHtml);
}
