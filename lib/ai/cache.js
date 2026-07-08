import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = resolve(__dirname, '..', '..', 'public', 'ai-cache');

/**
 * audit の内容に依存した決定的なキーを作る。
 * offenders は上位3件の selector + snippet の冒頭を使い、同じ違反パターンに対して同じキーを返す
 */
export function cacheKey({ ruleId, url, offenders = [] }) {
  const signature = offenders.slice(0, 3).map((o) => `${o.selector}|${(o.snippet || '').slice(0, 120)}`).join('\n');
  const h = createHash('sha256').update(`${ruleId}::${url}::${signature}`).digest('hex');
  return h.slice(0, 32);
}

export class FileCache {
  constructor(dir = DEFAULT_DIR) {
    this.dir = dir;
    this.memCache = new Map();
  }

  async get(key) {
    if (this.memCache.has(key)) return this.memCache.get(key);
    try {
      const raw = await readFile(join(this.dir, `${key}.json`), 'utf-8');
      const parsed = JSON.parse(raw);
      this.memCache.set(key, parsed);
      return parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`cache read error for ${key}: ${err.message}`);
      }
      return null;
    }
  }

  async set(key, value) {
    this.memCache.set(key, value);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, `${key}.json`), JSON.stringify(value, null, 2), 'utf-8');
    } catch (err) {
      logger.warn(`cache write error for ${key}: ${err.message}`);
    }
  }
}

export const globalCache = new FileCache();
