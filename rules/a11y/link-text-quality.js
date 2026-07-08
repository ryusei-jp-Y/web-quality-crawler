import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'a11y/link-text-quality',
  name: '非記述的リンクテキスト検出',
  category: 'a11y',
  severity: 'minor',
  weight: 2,
  fix: '「こちら」「詳細」「続きを読む」等の単独使用を避け、リンク先の内容を表すテキストにしてください。',
  check: ({ $ }) => {
    const badPatterns = [
      'こちら', 'ここ', '詳細', '続きを読む', 'もっと見る',
      'click here', 'here', 'more', 'read more',
    ];
    const badLinks = $('a').toArray().filter((el) => {
      const $el = $(el);
      const ariaLabel = $el.attr('aria-label');
      if (ariaLabel) return false;
      const text = $el.text().trim().toLowerCase();
      return badPatterns.some((p) => text === p.toLowerCase());
    });
    if (badLinks.length === 0) return { passed: true };
    const offenders = badLinks.slice(0, 20).map((el) => ({
      ...describeElement($, el),
      linkText: $(el).text().trim(),
      href: $(el).attr('href') || '',
    }));
    return {
      passed: false,
      message: `非記述的なリンクテキスト: ${badLinks.length}件`,
      offenders,
      offendersTotal: badLinks.length,
      offendersTruncated: badLinks.length > 20,
    };
  },
};
