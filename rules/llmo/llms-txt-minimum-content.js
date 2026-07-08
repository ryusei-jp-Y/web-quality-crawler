export default {
  id: 'llmo/llms-txt-minimum-content',
  name: 'llms.txt の最低限の記述',
  category: 'llmo',
  severity: 'minor',
  weight: 2,
  fix: 'llms.txtにH1見出しと本文を300文字以上で記述してください。',
  check: ({ llmsTxt }, options = {}) => {
    if (!llmsTxt.exists || !llmsTxt.content) {
      return { passed: false, message: 'llms.txt が存在しません' };
    }
    const minLength = options.minLength ?? 300;
    const content = llmsTxt.content;
    const hasH1 = /^# .+/m.test(content);
    if (!hasH1) return { passed: false, message: 'llms.txt にH1見出し (# ...) がありません' };
    if (content.length < minLength) {
      return { passed: false, message: `llms.txt の本文が短すぎます (${content.length}文字、最低${minLength}文字)` };
    }
    return { passed: true };
  },
};
