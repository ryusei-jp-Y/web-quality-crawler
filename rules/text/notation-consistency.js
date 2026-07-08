// 表記揺れ検出: 同じ内容を別表記で記述している箇所を辞書で検知。
// 同じページ内に揺れペアの両方が出現している場合のみ fail。
// - ペアは [正, 旧] の形 (正が推奨)
// - 誤検知避けのため、前後の文字で区切られた場合のみマッチ (単純包含含む)

const NOTATION_PAIRS = [
  ['サーバー', 'サーバ'],      // カタカナ長音
  ['お申し込み', '申込'],        // 送り仮名
  ['問い合わせ', '問合せ'],      // 送り仮名
  ['行う', '行なう'],            // 送り仮名
  ['受け取る', '受取る'],        // 送り仮名
  ['ひとつ', '1つ'],             // 数詞
  ['Cloudflare', 'CloudFlare'],  // 英語表記 (大文字小文字揺れ)
];

export default {
  id: 'text/notation-consistency',
  name: 'ページ内の表記揺れ',
  category: 'text',
  mainCategory: 'text',
  severity: 'minor',
  weight: 2,
  fix: '同じ内容を指すのに複数表記 (例: サーバ / サーバー、申込 / お申し込み) が混在しないよう、ページ内で統一してください。',
  check: ({ $ }) => {
    const body = $('body').clone();
    body.find('script, style, noscript').remove();
    const text = body.text();

    const offenders = [];
    for (const [a, b] of NOTATION_PAIRS) {
      // カウント
      const aCount = (text.match(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const bCount = (text.match(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      // 両方使われている時のみ揺れと判定 (各 1 件以上)
      if (aCount > 0 && bCount > 0) {
        offenders.push({
          pair: `${a} / ${b}`,
          recommended: a,
          counts: `${a}: ${aCount}, ${b}: ${bCount}`,
        });
      }
    }

    if (offenders.length === 0) return { passed: true };
    return {
      passed: false,
      message: `揺れペア ${offenders.length} 件 (${offenders.slice(0, 3).map((o) => o.pair).join(' / ')})`,
      offenders,
      offendersTotal: offenders.length,
      offendersTruncated: false,
    };
  },
};
