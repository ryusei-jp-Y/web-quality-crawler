import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'a11y/button-accessible-name',
  name: 'button要素のアクセシブル名',
  category: 'a11y',
  severity: 'major',
  weight: 3,
  fix: 'button要素にテキスト内容またはaria-labelを設定してください。',
  check: ({ $ }) => {
    const buttons = $('button').toArray();
    const unnamed = buttons.filter((el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const ariaLabel = $el.attr('aria-label');
      const ariaLabelledby = $el.attr('aria-labelledby');
      const hasImgAlt = $el.find('img[alt]:not([alt=""])').length > 0;
      return !text && !ariaLabel && !ariaLabelledby && !hasImgAlt;
    });
    if (unnamed.length === 0) return { passed: true };
    const { offenders, total, truncated } = describeElements($, unnamed);
    return {
      passed: false,
      message: `アクセシブル名のないbutton: ${total}個`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
