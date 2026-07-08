export default {
  id: 'perf/html-total-size',
  name: 'HTML全体サイズ',
  category: 'perf',
  severity: 'minor',
  weight: 2,
  fix: 'HTML全体のサイズが1MBを超える場合、画像の外部化、コード分割、不要な要素の削除を検討してください。',
  check: ({ rawHtmlBytes }, options = {}) => {
    const maxBytes = options.maxBytes ?? 1048576;
    if (rawHtmlBytes > maxBytes) {
      const mb = (rawHtmlBytes / 1024 / 1024).toFixed(2);
      return {
        passed: false,
        message: `HTML全体サイズ ${mb}MB (上限${(maxBytes / 1024 / 1024).toFixed(1)}MB)`,
      };
    }
    return { passed: true };
  },
};
