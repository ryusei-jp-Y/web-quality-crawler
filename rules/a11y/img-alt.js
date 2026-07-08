import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'a11y/img-alt',
  name: 'img要素のalt属性',
  category: 'a11y',
  severity: 'critical',
  weight: 5,
  fix: '意味のある画像には説明的なalt属性を、装飾画像には空のalt=""を設定してください。',
  check: ({ $ }) => {
    const missing = $('img').toArray().filter((el) => $(el).attr('alt') === undefined);
    if (missing.length === 0) return { passed: true };
    const { offenders, total, truncated } = describeElements($, missing);
    return {
      passed: false,
      message: `alt属性が欠落したimg要素: ${total}個`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
