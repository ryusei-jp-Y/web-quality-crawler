import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'a11y/interactive-aria-state',
  name: 'インタラクティブ要素のARIA状態',
  category: 'a11y',
  severity: 'minor',
  weight: 2,
  fix: 'aria-expanded属性の値はtrue/falseのみ、aria-hidden属性もtrue/falseのみ使用してください。',
  check: ({ $ }) => {
    const offenders = [];
    const issues = [];

    const checkAttr = (attr) => {
      $(`[${attr}]`).each((_, el) => {
        const v = $(el).attr(attr);
        if (v !== 'true' && v !== 'false') {
          issues.push(`${attr}="${v}"`);
          if (offenders.length < 20) {
            offenders.push({
              ...describeElement($, el),
              attribute: attr,
              invalidValue: v,
            });
          }
        }
      });
    };
    checkAttr('aria-expanded');
    checkAttr('aria-hidden');
    checkAttr('aria-selected');

    if (issues.length === 0) return { passed: true };
    return {
      passed: false,
      message: `ARIA状態値が不正: ${issues.slice(0, 5).join(', ')}${issues.length > 5 ? ' ほか' : ''}`,
      offenders,
      offendersTotal: issues.length,
      offendersTruncated: issues.length > 20,
    };
  },
};
