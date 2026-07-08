// Lighthouse audit ID → 既存ルール ID のマッピング
// ここに載っていない LH audit は "Lighthouse 単独" 扱いで findings リストに追加される。
// 一意に重ねるべき audit のみ記述し、意味論が微妙にズレるものは敢えて分離する。
export const LH_AUDIT_TO_RULE_ID = {
  // Performance
  'largest-contentful-paint': 'perf/lcp',
  'cumulative-layout-shift':  'perf/cls',
  'total-blocking-time':      'perf/tbt',
  'server-response-time':     'perf/ttfb',

  // Accessibility
  'image-alt':              'a11y/img-alt',
  'label':                  'a11y/form-labels',
  'button-name':            'a11y/button-accessible-name',
  'link-name':              'a11y/link-text-quality',
  'heading-order':          'semantic/heading-hierarchy',
  'html-has-lang':          'readable/lang-attribute',
  'html-lang-valid':        'readable/lang-attribute',

  // SEO
  'canonical':              'llmo/canonical',
  'robots-txt':             'llmo/robots-txt-accessible',
  'structured-data':        'structured/json-ld-present',
};

// LH audit が属するカテゴリから、我々の sub-category を割り当てる
// (LH 単独 audit を findings に組み込む際のデフォルト分類)
export const LH_CATEGORY_TO_SUB = {
  performance:      'perf',
  accessibility:    'a11y',
  'best-practices': 'semantic',  // 確立したサブが無いため近接カテゴリへ仮置き
  seo:              'llmo',
};

// LH のカテゴリ → ダッシュボード表示用ラベル (source badge に使う)
export const LH_CATEGORY_LABEL = {
  performance:      'Perf',
  accessibility:    'A11y',
  'best-practices': 'Best Practices',
  seo:              'SEO',
};

/**
 * Lighthouse の audit (失敗 or 合格問わず) を我々の violation 形式にマージする。
 * - LH_AUDIT_TO_RULE_ID に該当する LH audit は、該当 rule の violation に sources[].lighthouse を追記
 * - それ以外の LH audit は新規 "lighthouse:<id>" 仮想 violation として配列末尾に追加
 *
 * @param {Array} violations 既存の決定的 + AI ルール評価結果
 * @param {Object} lighthouse runLighthouse() の戻り値 ({ allAudits: { perf: [...], ... } })
 * @returns {Array} sources[] が付与された violations
 */
export function mergeLighthouseIntoViolations(violations, lighthouse) {
  if (!lighthouse || !lighthouse.allAudits) {
    return violations.map((v) => ({
      ...v,
      sources: [{ type: 'code', id: v.id }],
    }));
  }

  // 既存 violation に sources[code] を付与
  const merged = violations.map((v) => ({
    ...v,
    sources: [{ type: 'code', id: v.id }],
  }));

  // rule id ↔ merged index マップ
  const indexByRuleId = new Map();
  merged.forEach((v, i) => indexByRuleId.set(v.id, i));

  // 使用済み LH audit ID (既存 rule と重複したもの)
  const consumed = new Set();

  // LH 各 audit をマージ
  for (const [catKey, list] of Object.entries(lighthouse.allAudits)) {
    for (const lhAudit of list) {
      const ruleId = LH_AUDIT_TO_RULE_ID[lhAudit.id];
      if (ruleId && indexByRuleId.has(ruleId)) {
        // バッティング: 既存 violation に LH source を追記
        const target = merged[indexByRuleId.get(ruleId)];
        target.sources.push({
          type: 'lighthouse',
          id: lhAudit.id,
          category: catKey,
          score: lhAudit.score,
          passed: lhAudit.passed,
          displayValue: lhAudit.displayValue,
        });
        consumed.add(lhAudit.id);
      }
    }
  }

  // LH 単独 audit を仮想 violation として末尾追加
  for (const [catKey, list] of Object.entries(lighthouse.allAudits)) {
    for (const lhAudit of list) {
      if (consumed.has(lhAudit.id)) continue;
      const sub = LH_CATEGORY_TO_SUB[catKey] || 'perf';
      merged.push({
        id: `lighthouse:${lhAudit.id}`,
        name: lhAudit.title,
        mainCategory: 'code',
        category: sub,
        severity: lhAudit.score < 0.5 ? 'major' : 'minor',
        weight: Math.max(1, Math.round((lhAudit.weight || 1) / 3)),
        deviceSensitive: false,
        passed: lhAudit.passed,
        message: lhAudit.displayValue || null,
        fix: lhAudit.description || null,
        offenders: null,
        offendersTotal: null,
        offendersTruncated: false,
        sources: [{
          type: 'lighthouse',
          id: lhAudit.id,
          category: catKey,
          score: lhAudit.score,
          passed: lhAudit.passed,
          displayValue: lhAudit.displayValue,
        }],
      });
    }
  }

  return merged;
}
