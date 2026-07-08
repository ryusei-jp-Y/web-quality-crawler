export default {
  id: 'llmo/canonical',
  name: 'canonical URLの設定',
  category: 'llmo',
  severity: 'critical',
  weight: 4,
  fix: 'link[rel="canonical"]で絶対URLの正規URLを指定してください。',
  check: ({ $ }) => {
    const canonical = $('link[rel="canonical"]').attr('href');
    if (!canonical) return { passed: false, message: 'canonical URLが設定されていません' };
    if (!/^https?:\/\//.test(canonical)) {
      return { passed: false, message: `canonicalが絶対URLではありません: ${canonical}` };
    }
    return { passed: true };
  },
};
