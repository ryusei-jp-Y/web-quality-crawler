import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'structured/json-ld-valid-syntax',
  name: 'JSON-LDの構文正当性',
  category: 'structured',
  severity: 'critical',
  weight: 4,
  fix: 'JSON構文エラーを修正してください。余分なカンマ・引用符エスケープなどを確認。',
  check: ({ $ }) => {
    const scripts = $('script[type="application/ld+json"]').toArray();
    if (scripts.length === 0) return { passed: true };
    const offenders = [];
    const errors = [];
    scripts.forEach((el, i) => {
      try {
        JSON.parse($(el).html());
      } catch (e) {
        errors.push(`[${i}] ${e.message}`);
        offenders.push({
          ...describeElement($, el, { snippetMax: 120 }),
          scriptIndex: i,
          parseError: e.message,
          rawSnippet: ($(el).html() || '').slice(0, 300),
        });
      }
    });
    if (errors.length === 0) return { passed: true };
    return {
      passed: false,
      message: `JSON-LD構文エラー: ${errors.join(' / ')}`,
      offenders,
      offendersTotal: errors.length,
      offendersTruncated: false,
    };
  },
};
