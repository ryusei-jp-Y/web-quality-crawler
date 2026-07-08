import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'semantic/heading-hierarchy',
  name: '見出し階層のスキップなし',
  category: 'semantic',
  severity: 'major',
  weight: 4,
  fix: '見出しレベルをスキップせず h1 → h2 → h3 の順で使用してください。',
  check: ({ $ }) => {
    const headings = $('h1, h2, h3, h4, h5, h6').toArray();
    const levels = headings.map((el) => parseInt(el.tagName.substring(1), 10));
    const skips = [];
    const offenders = [];
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        skips.push(`h${levels[i - 1]} → h${levels[i]}`);
        if (offenders.length < 20) {
          offenders.push({
            ...describeElement($, headings[i]),
            from: `h${levels[i - 1]}`,
            to: `h${levels[i]}`,
            text: $(headings[i]).text().trim().slice(0, 100),
          });
        }
      }
    }
    if (skips.length === 0) return { passed: true };
    return {
      passed: false,
      message: `見出しレベルスキップを検出: ${skips.join(', ')}`,
      offenders,
      offendersTotal: skips.length,
      offendersTruncated: skips.length > 20,
    };
  },
};
