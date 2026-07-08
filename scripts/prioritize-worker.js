// /api/prioritize を実行する子プロセス。
// 親 (server.js) から IPC で params を受け取り、generatePriorities を実行して
// 結果を IPC で返す。完了後はそのままプロセス終了する。
//
// 目的: 失敗 audit 数が多いケースで Anthropic SDK のリクエスト/レスポンスバッファや
// JSON.parse が V8 ヒープを膨らませて Node 本体ごと OOM 死亡したインシデントの再発防止。
// 子プロセスを使い捨てにすることで、ヒープが膨らんでも親 (Express サーバー) は無事。
//
// child_process.fork で起動されることを前提にしている (process.send が必要)。
import { generatePriorities } from '../lib/ai/prioritize.js';
import { tracker } from '../lib/ai/cost-tracker.js';
import { logger } from '../lib/logger.js';

if (typeof process.send !== 'function') {
  console.error('[prioritize-worker] this script must be launched via child_process.fork');
  process.exit(2);
}

process.on('message', async (params) => {
  try {
    const result = await generatePriorities(params);
    // worker 側で usage.json を永続化 (親の tracker には積まれないため)
    await tracker.persist();
    process.send({ ok: true, result });
    // IPC 送信が flush される前に終了しないよう少し待ってから exit
    setImmediate(() => process.exit(0));
  } catch (err) {
    logger.error('[prioritize-worker]', err);
    process.send({ ok: false, error: err.message ?? String(err) });
    setImmediate(() => process.exit(1));
  }
});

// 親が想定外に切断したら速やかに自殺
process.on('disconnect', () => process.exit(0));
