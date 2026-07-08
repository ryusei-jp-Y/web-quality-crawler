import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'semantic/single-main',
  name: 'main要素の単一性',
  category: 'semantic',
  severity: 'major',
  weight: 3,
  fix: 'main要素は1ページに1つだけ配置してください。',
  check: ({ $ }) => {
    const mains = $('main').toArray();
    if (mains.length === 0) return { passed: false, message: 'main要素が存在しません' };
    if (mains.length === 1) return { passed: true };
    const { offenders, total, truncated } = describeElements($, mains);
    return {
      passed: false,
      message: `main要素が${total}個あります`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
