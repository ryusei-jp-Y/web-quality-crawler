// 本文の 1 文が長すぎないかを判定する。
// 句点 (。! ? ! ?) でセンテンス分割し、目安より長い文が閾値超えたら NG。
// 許容閾値 (maxChars) を超えた文の数が全体に対して過多 (>= 10%) の場合に fail。

const DEFAULT_MAX_CHARS = 60;
const DEFAULT_MAX_OFFENDER_RATIO = 0.1;

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[。!?！?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default {
  id: 'text/sentence-length',
  name: '1 文の長さ (読みやすさ)',
  category: 'text',
  mainCategory: 'text',
  severity: 'minor',
  weight: 2,
  fix: '1 文は 50〜60 文字以内を目安にしてください。意味のかたまりで分割すると読みやすさが上がります。',
  check: ({ $ }, options = {}) => {
    const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    const maxRatio = options.maxOffenderRatio ?? DEFAULT_MAX_OFFENDER_RATIO;

    // 本文テキストから文を抽出 (p / li / dd / td / section > 直接テキスト)
    const blocks = $('p, li, dd, td, blockquote').toArray();
    const sentences = [];
    for (const el of blocks) {
      const text = $(el).text();
      for (const s of splitSentences(text)) sentences.push({ el, text: s });
    }
    if (sentences.length === 0) return { passed: true, message: '文が見つからない (スキップ)' };

    const offenders = sentences.filter((s) => s.text.length > maxChars);
    const ratio = offenders.length / sentences.length;
    if (ratio <= maxRatio) {
      return {
        passed: true,
        message: `長文 (>${maxChars}字) ${offenders.length}/${sentences.length} 文 (${Math.round(ratio * 100)}%、閾値 ${Math.round(maxRatio * 100)}% 以下)`,
      };
    }

    const offenderList = offenders.slice(0, 20).map((o) => ({
      text: o.text.slice(0, 120) + (o.text.length > 120 ? '…' : ''),
      length: o.text.length,
    }));
    return {
      passed: false,
      message: `長文 (>${maxChars}字) が全体の ${Math.round(ratio * 100)}% (${offenders.length}/${sentences.length} 文) — 閾値 ${Math.round(maxRatio * 100)}% 超`,
      offenders: offenderList,
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
