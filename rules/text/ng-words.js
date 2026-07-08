// 定番 NG ワード辞書でテキストをスキャンする。
// 検出対象:
//   - 固有名称の誤記 (自社ブランド名の略記/誤記 → 正式名称)
//   - 送り仮名・表記のタイポ (ござます → ございます)
//   - 全角英字の混入 (ｎ 等)
// 拡張したい場合は NG_PATTERNS に追加する。正規表現 or 文字列可。
// message: 期待される表記 / 理由

const NG_PATTERNS = [
  // 固有名称の誤記 — 運用時に自社ブランド名の略記/誤表記を正式名称に正すパターンを登録する。
  // (例) { pattern: /Example社/g, correct: 'Example株式会社', note: '正式社名は「Example株式会社」' },

  // 送り仮名タイポ
  { pattern: /ござます/g, correct: 'ございます', note: '送り仮名タイポ' },
  { pattern: /いだたき/g, correct: 'いただき', note: '送り仮名タイポ' },
  // 全角英字の混入 (半角文脈の中の全角 n / m 等)
  // 周辺がひらがな・漢字・半角英数の場合のみマッチ
  { pattern: /[ぁ-んァ-ヶ一-龠][ｎｍｏｔｕｉａｅｓｒｃｄｎｕｙｇｐｌｂｈｋ][ぁ-んァ-ヶ一-龠。]/g, correct: '半角英字', note: '全角英字が混入しています' },
];

export default {
  id: 'text/ng-words',
  name: 'NG ワード / タイポ',
  category: 'text',
  mainCategory: 'text',
  severity: 'major',
  weight: 3,
  fix: '表記ガイドラインに従い、正式名称・正しい送り仮名・半角英字を使用してください。',
  check: ({ $ }) => {
    // body 全体のテキストを対象 (script / style は除外)
    const $body = $('body').clone();
    $body.find('script, style, noscript').remove();
    const text = $body.text();

    const offenders = [];
    for (const rule of NG_PATTERNS) {
      const re = rule.pattern instanceof RegExp
        ? new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g')
        : new RegExp(rule.pattern, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        const start = Math.max(0, m.index - 15);
        const end = Math.min(text.length, m.index + m[0].length + 15);
        offenders.push({
          match: m[0],
          context: '…' + text.slice(start, end).replace(/\s+/g, ' ') + '…',
          correct: rule.correct,
          note: rule.note,
        });
        if (offenders.length >= 30) break;
      }
      if (offenders.length >= 30) break;
    }

    if (offenders.length === 0) return { passed: true };
    return {
      passed: false,
      message: `NG 表記 ${offenders.length} 件検出 (${[...new Set(offenders.map((o) => o.match))].slice(0, 3).join(', ')} など)`,
      offenders: offenders.slice(0, 20),
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
