export default {
  id: 'llmo/og-required',
  name: 'OGP必須プロパティ',
  category: 'llmo',
  severity: 'major',
  weight: 3,
  fix: 'og:title, og:type, og:image, og:url を設定してください。',
  check: ({ $ }) => {
    const required = ['og:title', 'og:type', 'og:image', 'og:url'];
    const missing = required.filter((prop) => !$(`meta[property="${prop}"]`).attr('content'));
    if (missing.length > 0) {
      return { passed: false, message: `OGP必須プロパティ欠落: ${missing.join(', ')}` };
    }
    return { passed: true };
  },
};
