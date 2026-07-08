// WCAG AA コントラスト比判定:
//   通常テキスト: 4.5:1 以上
//   大テキスト (>= 18pt / >= 14pt bold): 3.0:1 以上
// textSamples の最大 100 件をチェックし、違反率で合否判定。

function parseRgb(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  const [r, g, b, a] = m.map(Number);
  if (a !== undefined && a < 0.1) return null; // 透明扱い
  return { r, g, b };
}
function relLuminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(c1, c2) {
  const l1 = relLuminance(c1);
  const l2 = relLuminance(c2);
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

export default {
  id: 'visual/contrast',
  name: 'WCAG AA コントラスト比',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'major',
  weight: 3,
  fix: '通常テキストは 4.5:1、大テキスト (18pt 以上 / 14pt Bold 以上) は 3.0:1 以上のコントラスト比を確保してください。',
  check: ({ visualData }, options = {}) => {
    const samples = visualData?.textSamples || [];
    if (samples.length === 0) return { passed: true, message: 'テキストサンプルなし (スキップ)' };

    const maxFailRatio = options.maxFailRatio ?? 0.1;
    const offenders = [];
    let checked = 0;
    for (const s of samples) {
      const fg = parseRgb(s.color);
      const bg = parseRgb(s.bgColor);
      if (!fg || !bg) continue;
      checked++;
      const px = s.fontSize;
      const isBold = s.fontWeight >= 700;
      // 大テキスト: 18pt = 24px / 14pt Bold = 18.66px
      const isLargeText = px >= 24 || (px >= 18.66 && isBold);
      const required = isLargeText ? 3.0 : 4.5;
      const ratio = contrastRatio(fg, bg);
      if (ratio < required) {
        offenders.push({
          text: s.text,
          tag: s.tag,
          ratio: Math.round(ratio * 100) / 100,
          required,
          fontSize: px,
          fontWeight: s.fontWeight,
          fg: s.color,
          bg: s.bgColor,
        });
      }
    }

    if (checked === 0) return { passed: true, message: 'カラー解析不可 (スキップ)' };
    const ratio = offenders.length / checked;
    if (ratio <= maxFailRatio) {
      return { passed: true, message: `違反 ${offenders.length}/${checked} (${Math.round(ratio * 100)}%、閾値 ${Math.round(maxFailRatio * 100)}% 以下)` };
    }
    return {
      passed: false,
      message: `コントラスト違反 ${offenders.length}/${checked} 件 (${Math.round(ratio * 100)}%) — AA 要件を満たさない`,
      offenders: offenders.slice(0, 20),
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
