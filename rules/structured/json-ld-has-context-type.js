import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'structured/json-ld-has-context-type',
  name: '@context/@type + Schema.org検証',
  category: 'structured',
  severity: 'major',
  weight: 3,
  fix: '@contextをschema.orgに指定し、@typeで適切なタイプを指定してください。',
  check: ({ $ }) => {
    const scripts = $('script[type="application/ld+json"]').toArray();
    if (scripts.length === 0) return { passed: true };
    const issues = [];
    const offendersMap = new Map(); // scriptIndex -> offender
    scripts.forEach((el, i) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        const localIssues = [];
        items.forEach((item, j) => {
          if (!item['@context']) localIssues.push(`[${i}-${j}] @context欠落`);
          else if (!/schema\.org/.test(String(item['@context']))) {
            localIssues.push(`[${i}-${j}] @contextがschema.orgではない`);
          }
          if (!item['@type']) localIssues.push(`[${i}-${j}] @type欠落`);
        });
        if (localIssues.length > 0) {
          issues.push(...localIssues);
          if (!offendersMap.has(i)) {
            offendersMap.set(i, {
              ...describeElement($, el, { snippetMax: 120 }),
              scriptIndex: i,
              issues: localIssues,
              rawSnippet: ($(el).html() || '').slice(0, 300),
            });
          }
        }
      } catch {
        /* 構文エラーは別ルールで検出 */
      }
    });
    if (issues.length === 0) return { passed: true };
    const offenders = [...offendersMap.values()];
    return {
      passed: false,
      message: issues.join(' / '),
      offenders,
      offendersTotal: offenders.length,
      offendersTruncated: false,
    };
  },
};
