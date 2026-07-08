// ブランド設定のロード。
//
// 商材を増やせる構造にするため、ブランド固有のガイドラインや表記ルールを
// config/brands/<brandId>/ 配下に外出ししている。
// AI ルール (logo-regulation / brand-guideline) は pageData.brand 経由で
// ガイドライン本文を受け取り、system prompt にインライン展開する。
//
// 新規ブランド追加 = config/brands/<id>/ に meta.json + ガイドライン .md を置くだけ。
//
// brand 未指定の domain では brand = null となり、ブランド固有 AI ルールは
// 「対象外」としてスキップ (passed: true 扱い) する。

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRANDS_ROOT = process.env.BRANDS_DIR
  ?? resolve(__dirname, '..', 'config', 'brands');

// brandId -> brand object | null (見つからなかった場合も null をキャッシュ)
const cache = new Map();

async function readFileSafe(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * @param {string|null|undefined} brandId
 * @returns {Promise<object|null>} brand context or null
 */
export async function loadBrand(brandId) {
  if (!brandId) return null;
  if (cache.has(brandId)) return cache.get(brandId);

  const dir = join(BRANDS_ROOT, brandId);
  const metaRaw = await readFileSafe(join(dir, 'meta.json'));
  if (!metaRaw) {
    logger.warn(`[brands] meta.json not found for brand="${brandId}"`);
    cache.set(brandId, null);
    return null;
  }

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (err) {
    logger.warn(`[brands] meta.json parse error for "${brandId}": ${err.message}`);
    cache.set(brandId, null);
    return null;
  }

  const [logoGuideline, visualGuideline] = await Promise.all([
    readFileSafe(join(dir, 'logo-guideline.md')),
    readFileSafe(join(dir, 'visual-guideline.md')),
  ]);

  const brand = {
    id: brandId,
    name: meta.name ?? brandId,
    displayName: meta.displayName ?? meta.name ?? brandId,
    parentBrand: meta.parentBrand ?? null,
    description: meta.description ?? null,
    preferredTerms: Array.isArray(meta.preferredTerms) ? meta.preferredTerms : [],
    avoidTerms: Array.isArray(meta.avoidTerms) ? meta.avoidTerms : [],
    logoGuideline,
    visualGuideline,
    // 任意の追加メタデータ (将来拡張用)
    extra: meta.extra ?? {},
  };
  cache.set(brandId, brand);
  return brand;
}

// テスト / 設定再読み込みで使う
export function clearBrandCache() {
  cache.clear();
}
