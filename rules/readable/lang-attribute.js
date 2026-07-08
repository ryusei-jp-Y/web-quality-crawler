export default {
  id: 'readable/lang-attribute',
  name: 'html要素のlang属性',
  category: 'readable',
  severity: 'critical',
  weight: 4,
  fix: '<html lang="ja"> のようにlang属性を指定してください。',
  check: ({ $ }) => {
    const lang = $('html').attr('lang');
    if (!lang) return { passed: false, message: 'html要素にlang属性が設定されていません' };
    if (lang.length < 2) {
      return { passed: false, message: `lang属性値が不正: "${lang}"` };
    }
    return { passed: true };
  },
};
