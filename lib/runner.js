import { getRules, SUB_TO_MAIN } from '../rules/index.js';
import { logger } from './logger.js';

function resolveMainCategory(rule) {
  if (rule.mainCategory) return rule.mainCategory;
  return SUB_TO_MAIN[rule.category] || 'code';
}

// 1 ルールを実行して結果オブジェクトに整形する。
// check() 自体が throw しても捕捉して error エントリを返す (全体を止めない)。
async function runOneRule(rule, pageData, ruleOptions) {
  const options = ruleOptions[rule.id] || {};
  const base = {
    id: rule.id,
    name: rule.name,
    mainCategory: resolveMainCategory(rule),
    category: rule.category,
    severity: rule.severity,
    weight: rule.weight,
    deviceSensitive: !!rule.deviceSensitive,
    scoreExcluded: !!rule.scoreExcluded,
    manualOnly: !!rule.manualOnly,
  };
  // manualOnly ルール (ビジュアル等) は自動判定せず手動評価用プレースホルダを返す。
  // passed: null = 未評価。既定でスコア除外 (score-effective.js が処理)。
  if (rule.manualOnly) {
    return {
      ...base,
      passed: null,
      message: rule.manualMessage || '手動評価項目（管理者がOK/NGを設定）',
      fix: rule.fix || null,
      offenders: null,
      offendersTotal: null,
      offendersTruncated: false,
    };
  }
  try {
    const result = await rule.check(pageData, options);
    return {
      ...base,
      passed: result.passed,
      message: result.message || null,
      fix: rule.fix || null,
      offenders: result.offenders ?? null,
      offendersTotal: result.offendersTotal ?? null,
      offendersTruncated: result.offendersTruncated ?? false,
    };
  } catch (err) {
    logger.error(`rule ${rule.id} failed:`, err);
    return {
      ...base,
      passed: false,
      message: `Rule execution error: ${err.message}`,
      fix: null,
      offenders: null,
      offendersTotal: null,
      offendersTruncated: false,
    };
  }
}

// 同時実行数制限付きのワーカープール。順序を保つため results は index 固定で書き込む。
async function runWithConcurrency(rules, pageData, ruleOptions, limit) {
  const results = new Array(rules.length);
  let nextIdx = 0;
  const workerCount = Math.min(Math.max(1, limit), rules.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= rules.length) return;
      results[i] = await runOneRule(rules[i], pageData, ruleOptions);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * すべてのルールを実行する。
 * - 決定的ルールは CPU バウンドなので全件並列 (Promise.all)
 * - AI ルールは API 呼出があるので RULE_AI_CONCURRENCY (既定 6) で並列制御
 * - opts.skipAi=true の場合 AI ルールはスキップし、opts.previousAiViolations
 *   が渡されていればそれを再利用する (HTML 不変時の再クロール用)
 */
export async function runRules(pageData, ruleOptions = {}, opts = {}) {
  const rules = getRules();
  const detRules = rules.filter((r) => !r.aiRule);
  const aiRules = rules.filter((r) => r.aiRule);

  const aiConcurrency = Number(process.env.RULE_AI_CONCURRENCY ?? 6);

  const detPromise = Promise.all(detRules.map((r) => runOneRule(r, pageData, ruleOptions)));

  let aiResultsPromise;
  if (opts.skipAi) {
    // AI 実行をスキップし、前回 AI 結果を流用 (HTML 不変判定でのキャッシュ的扱い)
    const prev = Array.isArray(opts.previousAiViolations) ? opts.previousAiViolations : [];
    const prevById = new Map(prev.filter((v) => v && v.id?.startsWith('ai/')).map((v) => [v.id, v]));
    aiResultsPromise = Promise.resolve(
      aiRules.map((r) => prevById.get(r.id) || ({
        id: r.id,
        name: r.name,
        mainCategory: resolveMainCategory(r),
        category: r.category,
        severity: r.severity,
        weight: r.weight,
        deviceSensitive: !!r.deviceSensitive,
        scoreExcluded: !!r.scoreExcluded,
        passed: true,
        message: 'AI 評価スキップ (HTML 不変、前回結果なし)',
        fix: r.fix || null,
        offenders: null,
        offendersTotal: null,
        offendersTruncated: false,
      })),
    );
  } else {
    aiResultsPromise = runWithConcurrency(aiRules, pageData, ruleOptions, aiConcurrency);
  }

  const [detResults, aiResults] = await Promise.all([detPromise, aiResultsPromise]);
  return [...detResults, ...aiResults];
}
