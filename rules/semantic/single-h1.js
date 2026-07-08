import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'semantic/single-h1',
  name: 'h1要素の単一性',
  category: 'semantic',
  severity: 'critical',
  weight: 5,
  fix: 'ページ内のh1要素を1つだけに統合してください。',
  check: ({ $ }) => {
    const h1s = $('h1').toArray();
    if (h1s.length === 0) return { passed: false, message: 'h1要素が存在しません' };
    if (h1s.length === 1) return { passed: true };
    const { offenders, total, truncated } = describeElements($, h1s);
    const withText = offenders.map((o, i) => ({
      ...o,
      text: $(h1s[i]).text().trim().slice(0, 100),
    }));
    return {
      passed: false,
      message: `h1要素が${total}個あります`,
      offenders: withText,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
