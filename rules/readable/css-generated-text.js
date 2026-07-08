export default {
  id: 'readable/css-generated-text',
  name: 'CSS擬似要素依存の検出',
  category: 'readable',
  severity: 'minor',
  weight: 2,
  fix: 'content プロパティで重要なテキストを生成せず、DOMに直接記述してください。',
  check: ({ pseudoTexts }) => {
    const meaningful = pseudoTexts.filter((p) => p.text.length >= 2);
    if (meaningful.length >= 10) {
      return {
        passed: false,
        message: `CSS擬似要素で生成されたテキストが${meaningful.length}件（重要情報がDOM外の可能性）`,
      };
    }
    return { passed: true };
  },
};
