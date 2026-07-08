export default {
  id: 'readable/table-dl-usage',
  name: 'table/dl要素の使用',
  category: 'readable',
  severity: 'minor',
  weight: 2,
  fix: '比較・一覧情報はdiv+CSSではなくtableまたはdl要素でマークアップしてください。',
  check: ({ $ }) => {
    const tableCount = $('table').length;
    const dlCount = $('dl').length;
    if (tableCount === 0 && dlCount === 0) {
      return { passed: false, message: 'table / dl 要素が使われていません（比較・一覧情報がdivのみの可能性）' };
    }
    return { passed: true };
  },
};
