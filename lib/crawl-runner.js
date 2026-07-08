// 1 ターゲットのクロールを使い捨て子プロセスで実行するためのランナー。
// run.js (cron 経路) と server.js (UI 経路) の両方から共通利用される。
//
// 目的: Node + Playwright Chromium + Lighthouse 経由 chrome-launcher Chromium の
// 3 プロセス合算で cgroup OOM を起こした際、子プロセスだけが死に、親 (orchestrator) は
// 次の target に進める / リクエストを 500 で返す形に倒す。同時に各ページ完了ごとに
// 子を破棄することで Playwright / Lighthouse の累積メモリ leak を断ち切る。
import { fork } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CRAWL_WORKER = join(PROJECT_ROOT, 'scripts', 'crawl-worker.js');

// 子のヒープ上限。.env の NODE_OPTIONS=--max-old-space-size=1536 と同等。
export const CRAWL_WORKER_HEAP_MB = Number(process.env.CRAWL_WORKER_HEAP_MB ?? 1536);
// 1 ターゲットあたりの最大実行時間。PC + SP + Lighthouse + AI 評価 + 修正提案 prefetch
// すべて含む。実測 5-10 分のページもあるため余裕を持って 15 分。
export const CRAWL_WORKER_TIMEOUT_MS = Number(process.env.CRAWL_WORKER_TIMEOUT_MS ?? 900_000);

/**
 * 子プロセスでクロールを実行し、結果を返す。
 *
 * @param {object} target  flattenTargets() の出力単位
 * @param {object} opts
 * @param {string} [opts.reportsRoot]  scrnshot 保存先 + 過去結果参照
 * @param {string} [opts.timestamp]    スクショ保存ディレクトリ名
 * @param {Function} [opts.onProgress] 進捗 callback。子で発生するイベントを IPC 経由でリレー
 * @returns {Promise<{ok: true, results, aiSummary}>}
 */
export function runCrawlInWorker(target, opts = {}) {
  // onProgress は関数なので IPC でシリアライズできない。親側で保持し、
  // 子が送ってくる progress イベントをここで受け取って呼び出す。
  const { onProgress, ...workerOpts } = opts;

  return new Promise((resolveResult, reject) => {
    // detached: true で子を新しいプロセスグループのリーダーにする。
    // Playwright / chrome-launcher が子の配下で起動する Chromium は同じグループに
    // 入るため、タイムアウト時にグループ全体をkillしてChromiumの孤児化を防ぐ
    // (child.kill() だと fork した Node本体しか死なず、配下のChromiumツリーが
    // PPID=1で生き残りCPU/メモリを食い続ける事故が実際に発生した)。
    const child = fork(CRAWL_WORKER, [], {
      execArgv: [`--max-old-space-size=${CRAWL_WORKER_HEAP_MB}`],
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      detached: true,
    });
    const killWorkerTree = () => {
      if (child.pid == null) return;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already dead */ }
      // SIGTERMで死なないプロセスが残っていた場合の保険
      setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already dead */ }
      }, 5000).unref();
    };
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killWorkerTree();
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error(`crawl worker timeout (${CRAWL_WORKER_TIMEOUT_MS}ms)`));
    }, CRAWL_WORKER_TIMEOUT_MS);
    child.on('message', (msg) => {
      if (!msg) return;
      // 進捗イベント (子の crawlTarget の onProgress callback からリレー)
      if (msg.type === 'progress') {
        if (onProgress) {
          try { onProgress(msg.p); } catch { /* UI 側エラーで子を巻き込まない */ }
        }
        return;
      }
      // 最終結果 (type:'result' or 旧形式 ok フィールドのみ)
      if (msg.ok) finish(resolveResult, msg);
      else finish(reject, new Error(msg.error ?? 'crawl worker failed'));
    });
    child.on('error', (err) => finish(reject, err));
    child.on('exit', (code, signal) => {
      // 'exit' は 'message' より先に届くケースがある (IPC stream のバッファ排出が
      // プロセス exit イベントより遅れる)。1 tick 待ってから error 確定させ、
      // 直後に届く 'message' に勝負を譲る。
      setImmediate(() => {
        finish(reject, new Error(`crawl worker exited (code=${code}, signal=${signal})`));
      });
    });
    child.send({ target, opts: workerOpts });
  });
}
