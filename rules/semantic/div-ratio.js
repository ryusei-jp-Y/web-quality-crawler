export default {
  id: 'semantic/div-ratio',
  name: 'div過剰使用の検出',
  category: 'semantic',
  severity: 'minor',
  weight: 2,
  fix: 'div の代わりに article / section / aside / header / footer 等のセマンティック要素を活用してください。',
  check: ({ $ }, options = {}) => {
    const minRatio = options.minRatio ?? 0.1;
    const semanticTags = ['header', 'footer', 'nav', 'main', 'article', 'section', 'aside', 'figure', 'figcaption'];
    const semanticCount = semanticTags.reduce((sum, tag) => sum + $(tag).length, 0);
    const divCount = $('div').length;
    const total = semanticCount + divCount;
    if (total === 0) return { passed: true };
    const ratio = semanticCount / total;
    const percent = Math.round(ratio * 100);
    if (ratio < minRatio) {
      return {
        passed: false,
        message: `セマンティック要素比率 ${percent}% (基準${Math.round(minRatio * 100)}%以上 / div ${divCount}個)`,
      };
    }
    return { passed: true };
  },
};
