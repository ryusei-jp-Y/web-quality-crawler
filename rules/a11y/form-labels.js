import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'a11y/form-labels',
  name: 'フォーム入力のlabel関連付け',
  category: 'a11y',
  severity: 'critical',
  weight: 4,
  fix: 'label for属性、aria-label、aria-labelledby のいずれかで入力欄に名前を付けてください。placeholder単独はラベル代替として認められません。',
  check: ({ $ }) => {
    const formEls = $(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea',
    ).toArray();
    const unlabeled = formEls.filter((el) => {
      const $el = $(el);
      const id = $el.attr('id');
      const hasLabel = id && $(`label[for="${id}"]`).length > 0;
      const hasAriaLabel = !!$el.attr('aria-label');
      const hasAriaLabelledby = !!$el.attr('aria-labelledby');
      const wrappedInLabel = $el.parents('label').length > 0;
      return !(hasLabel || hasAriaLabel || hasAriaLabelledby || wrappedInLabel);
    });
    if (unlabeled.length === 0) return { passed: true };
    const { offenders, total, truncated } = describeElements($, unlabeled);
    return {
      passed: false,
      message: `ラベル未設定のフォーム要素: ${total}個 (placeholder単独はNG)`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
