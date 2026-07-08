// 1 ターゲット (= 1 ページ × デバイス群) のクロールを実行する子プロセス。
// 親 (run.js / server.js) から IPC で target + opts を受け取り、crawlTarget を実行して
// 結果を IPC で返す。完了後はそのままプロセス終了する。
//
// 目的: クロール中に Node + 並走 Chromium (Playwright + Lighthouse の chrome-launcher)
// 合算でコンテナ cgroup OOM を起こした際、子プロセスだけが死に、親 (orchestrator) は
// 次の target に進める / リクエストを 500 で返す形に倒す。同時に各ページ完了ごとに
// 子を破棄することで Playwright / Lighthouse の累積メモリリークを断ち切る。
//
// child_process.fork で起動されることを前提にしている (process.send が必要)。
// 親への通知形式:
//   { type: 'progress', p }                          進捗イベント (UI に流すため)
//   { ok: true,  type: 'result', results, aiSummary } 正常終了
//   { ok: false, type: 'result', error }              異常終了
import { crawlTarget } from '../lib/crawl.js';
import { tracker } from '../lib/ai/cost-tracker.js';
import { logger } from '../lib/logger.js';

if (typeof process.send !== 'function') {
  console.error('[crawl-worker] this script must be launched via child_process.fork');
  process.exit(2);
}

// IPC 送信完了 (flush) を確実に待ってから exit する。crawlTarget の結果は violations や
// offenders を含む数 MB 級になることがあり、setImmediate だけでは flush 前に exit して
// 親側で「exit before message」と誤判定される。
function sendAndExit(message, code) {
  process.send(message, (err) => {
    if (err) console.error('[crawl-worker] IPC send failed:', err.message);
    process.exit(code);
  });
}

process.on('message', async (params) => {
  const { target, opts } = params || {};
  // 進捗イベントは IPC で親に流す。親側 lib/crawl-runner.js の `runCrawlInWorker` が
  // `type: 'progress'` を識別して、引数で受けた onProgress callback を呼ぶ。
  const wrappedOpts = {
    ...opts,
    onProgress: (p) => {
      try { process.send({ type: 'progress', p }); } catch { /* IPC 切断時は無視 */ }
    },
  };
  try {
    const results = await crawlTarget(target, wrappedOpts);
    // この子の AI 呼び出し分を usage.json に追記永続化 (load-add-write 方式なので
    // 直前の子の結果と合算される。CRAWL_CONCURRENCY=1 シリアル前提)。
    const aiSummary = tracker.summary();
    await tracker.persist();
    sendAndExit({ ok: true, type: 'result', results, aiSummary }, 0);
  } catch (err) {
    logger.error('[crawl-worker]', err);
    sendAndExit({ ok: false, type: 'result', error: err.message ?? String(err) }, 1);
  }
});

process.on('disconnect', () => process.exit(0));
