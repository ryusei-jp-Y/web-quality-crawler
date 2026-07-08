const CATEGORIES = ['llmo', 'semantic', 'structured', 'readable', 'a11y', 'perf', 'links'];

// Lighthouse カテゴリ → weights 設定キーのマッピング
const LH_WEIGHT_KEY = {
  performance: 'lh-performance',
  accessibility: 'lh-accessibility',
  'best-practices': 'lh-best-practices',
  seo: 'lh-seo',
};

/**
 * スコアを算出する。
 *
 * 採点モデル:
 *   - サブカテゴリスコア = そのサブに属するルールの重み付きパス率 (0-100)
 *   - メインカテゴリスコア = 配下サブカテゴリスコアの単純平均 (0-100)
 *   - 総合スコア = メインカテゴリ + Lighthouse カテゴリを config.weights で加重平均
 *
 * weights フォーマット:
 *   {
 *     "code": 0.10, "info": 0.15, "text": 0.10, "visual": 0.10, "usability": 0.10,
 *     "lh-performance": 0.05, "lh-accessibility": 0.20,
 *     "lh-best-practices": 0.10, "lh-seo": 0.10
 *   }
 *   (合計 1.00 を想定。Lighthouse 未実行などで適用不能な項目があれば
 *    実適用分で normalize する)
 *
 * @param {Array} violations
 * @param {Object} weights
 * @param {Object} [lighthouseScores] - { performance, accessibility, 'best-practices', seo } (0-100 または null)
 */
export function calculateScore(violations, weights, lighthouseScores = null) {
  const categoryScores = {};
  const presentCats = new Set([...CATEGORIES, ...violations.map((v) => v.category)]);

  for (const cat of presentCats) {
    const catRules = violations.filter((v) => v.category === cat);
    const totalWeight = catRules.reduce((sum, v) => sum + v.weight, 0);
    const passedWeight = catRules.filter((v) => v.passed).reduce((sum, v) => sum + v.weight, 0);
    categoryScores[cat] = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100;
  }

  // メインカテゴリスコア: サブの単純平均
  const mainCategoryScores = {};
  const mainCategoryCounts = {};
  const presentMains = new Set(violations.map((v) => v.mainCategory || 'code'));
  for (const main of presentMains) {
    const mainRules = violations.filter((v) => (v.mainCategory || 'code') === main);
    const subsInMain = [...new Set(mainRules.map((v) => v.category))];
    const subScores = subsInMain
      .map((sub) => categoryScores[sub])
      .filter((s) => Number.isFinite(s));
    mainCategoryScores[main] = subScores.length > 0
      ? Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length)
      : 100;
    mainCategoryCounts[main] = {
      total: mainRules.length,
      passed: mainRules.filter((v) => v.passed).length,
      failed: mainRules.filter((v) => !v.passed).length,
      critical: mainRules.filter((v) => !v.passed && v.severity === 'critical').length,
      major: mainRules.filter((v) => !v.passed && v.severity === 'major').length,
      minor: mainRules.filter((v) => !v.passed && v.severity === 'minor').length,
    };
  }

  // 総合スコア: メインカテゴリ + LH カテゴリの加重平均
  // 未適用の項目 (LH 未実行など) があれば適用した重みで normalize
  let weighted = 0;
  let appliedWeight = 0;
  const contributors = {};

  for (const main of Object.keys(mainCategoryScores)) {
    const w = weights[main] ?? 0;
    if (w <= 0) continue;
    weighted += mainCategoryScores[main] * w;
    appliedWeight += w;
    contributors[main] = { score: mainCategoryScores[main], weight: w };
  }

  if (lighthouseScores && typeof lighthouseScores === 'object') {
    for (const [cat, score] of Object.entries(lighthouseScores)) {
      if (!Number.isFinite(score)) continue;
      const key = LH_WEIGHT_KEY[cat];
      if (!key) continue;
      const w = weights[key] ?? 0;
      if (w <= 0) continue;
      weighted += score * w;
      appliedWeight += w;
      contributors[key] = { score, weight: w };
    }
  }

  // weights が旧形式 or 空で 1 項目もマッチしなかった場合は、
  // 100 点扱いにせず mainCategoryScores + LH scores の単純平均で fallback する。
  let total;
  if (appliedWeight > 0) {
    total = Math.round(weighted / appliedWeight);
  } else {
    const fallbackValues = [...Object.values(mainCategoryScores)];
    if (lighthouseScores && typeof lighthouseScores === 'object') {
      for (const v of Object.values(lighthouseScores)) {
        if (Number.isFinite(v)) fallbackValues.push(v);
      }
    }
    total = fallbackValues.length > 0
      ? Math.round(fallbackValues.reduce((a, b) => a + b, 0) / fallbackValues.length)
      : 0;
  }

  const counts = {
    critical: violations.filter((v) => !v.passed && v.severity === 'critical').length,
    major: violations.filter((v) => !v.passed && v.severity === 'major').length,
    minor: violations.filter((v) => !v.passed && v.severity === 'minor').length,
  };

  return {
    total,
    categories: categoryScores,
    mainCategories: mainCategoryScores,
    mainCounts: mainCategoryCounts,
    counts,
    weightedContributors: contributors, // 採点根拠表示用
  };
}
