export default {
  id: 'readable/dom-text-volume',
  name: 'DOMテキスト量',
  category: 'readable',
  severity: 'major',
  weight: 3,
  fix: '重要な情報を画像ではなくHTMLテキストとして記述してください。',
  check: ({ bodyTextLength }, options = {}) => {
    const minChars = options.minChars ?? 1500;
    if (bodyTextLength < minChars) {
      return {
        passed: false,
        message: `body内テキスト量 ${bodyTextLength}文字 (最低${minChars}文字)`,
      };
    }
    return { passed: true };
  },
};
