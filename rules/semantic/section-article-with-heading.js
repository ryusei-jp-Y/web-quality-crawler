import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'semantic/section-article-with-heading',
  name: 'section/articleに見出しを伴う',
  category: 'semantic',
  severity: 'major',
  weight: 3,
  fix: 'section および article 要素には、その内容を示す見出し（h1〜h6）を含めてください。',
  check: ({ $ }) => {
    const elements = $('section, article').toArray();
    if (elements.length === 0) return { passed: true };
    const withoutHeading = elements.filter((el) => {
      const $el = $(el);
      return (
        $el.find('h1, h2, h3, h4, h5, h6').length === 0 &&
        !$el.attr('aria-label') &&
        !$el.attr('aria-labelledby')
      );
    });
    if (withoutHeading.length === 0) return { passed: true };
    const { offenders, total, truncated } = describeElements($, withoutHeading);
    return {
      passed: false,
      message: `見出しのないsection/article: ${total}個`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
