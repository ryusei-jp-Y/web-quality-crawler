export default {
  id: 'a11y/button-vs-anchor',
  name: 'div/spanへのクリックイベント検出',
  category: 'a11y',
  severity: 'major',
  weight: 3,
  fix: 'クリック可能な要素は div / span ではなく button または a 要素で実装してください。やむを得ずdiv/spanを使う場合はrole="button"とtabindex, キーボード操作を実装してください。',
  check: ({ clickableNonButtons }) => {
    if (clickableNonButtons.length === 0) return { passed: true };
    // Playwright 側で集計済みの {tag, hasRole} を offenders 風に並べ直す
    const offenders = clickableNonButtons.slice(0, 20).map((c) => ({
      selector: `${c.tag}[onclick]${c.hasRole ? '[role]' : ''}`,
      snippet: `<${c.tag} onclick="..."${c.hasRole ? ' role="..."' : ''}>`,
      context: '',
      tag: c.tag,
    }));
    return {
      passed: false,
      message: `button/a 以外の要素にclickイベントが設定されています: ${clickableNonButtons.length}個`,
      offenders,
      offendersTotal: clickableNonButtons.length,
      offendersTruncated: clickableNonButtons.length > 20,
    };
  },
};
