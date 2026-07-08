import { describeElements } from '../../lib/describe-element.js';

export default {
  id: 'semantic/th-scope',
  name: 'table th の scope属性',
  category: 'semantic',
  severity: 'major',
  weight: 3,
  fix: 'table内のth要素にscope="col"またはscope="row"を指定してください。',
  check: ({ $ }) => {
    const ths = $('table th').toArray();
    if (ths.length === 0) return { passed: true };
    const withoutScope = ths.filter((el) => !$(el).attr('scope'));
    if (withoutScope.length === 0) return { passed: true };
    const { offenders, total, truncated } = describeElements($, withoutScope);
    return {
      passed: false,
      message: `scope属性のないth要素: ${total}個`,
      offenders,
      offendersTotal: total,
      offendersTruncated: truncated,
    };
  },
};
