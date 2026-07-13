import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['lib', 'rules', 'scripts'];
const ignoredDirs = new Set(['node_modules', '.git', '.next', 'public/reports']);

function listJavaScriptFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) {
        files.push(...listJavaScriptFiles(path));
      }
      continue;
    }

    if (entry.endsWith('.js')) {
      files.push(path);
    }
  }

  return files;
}

const files = roots.flatMap(listJavaScriptFiles);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`Syntax check failed: ${relative(process.cwd(), file)}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Checked ${files.length} JavaScript files.`);
