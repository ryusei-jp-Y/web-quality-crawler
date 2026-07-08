// dashboard.js / dashboard.css を esbuild で minify する。
// `prestart` で自動実行されるので開発サーバ起動 = 最新の minified 版が生成される。
// 出力先は同じディレクトリの .min.js / .min.css とし、index.html はそれを参照する。

import esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

async function build() {
  const startedAt = Date.now();
  await Promise.all([
    esbuild.build({
      entryPoints: [resolve(PROJECT_ROOT, 'public/js/dashboard.js')],
      outfile: resolve(PROJECT_ROOT, 'public/js/dashboard.min.js'),
      bundle: false,
      minify: true,
      target: ['es2022'],
      format: 'esm',
      legalComments: 'none',
      logLevel: 'warning',
    }),
    esbuild.build({
      entryPoints: [resolve(PROJECT_ROOT, 'public/css/dashboard.css')],
      outfile: resolve(PROJECT_ROOT, 'public/css/dashboard.min.css'),
      bundle: false,
      minify: true,
      loader: { '.css': 'css' },
      legalComments: 'none',
      logLevel: 'warning',
    }),
  ]);
  const elapsed = Date.now() - startedAt;
  console.log(`[build:frontend] minified dashboard.{js,css} in ${elapsed}ms`);
}

build().catch((err) => {
  console.error('[build:frontend] failed:', err);
  process.exit(1);
});
