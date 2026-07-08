export default {
  id: 'structured/json-ld-present',
  name: 'JSON-LDの存在',
  category: 'structured',
  severity: 'major',
  weight: 4,
  fix: 'script[type="application/ld+json"]でSchema.org準拠のJSON-LDを配置してください。',
  check: ({ $ }) => {
    const count = $('script[type="application/ld+json"]').length;
    if (count === 0) return { passed: false, message: 'JSON-LD構造化データが存在しません' };
    return { passed: true };
  },
};
