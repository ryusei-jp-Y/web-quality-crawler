// 見出しの視覚階層: H1 → H2 → H3... と font-size が単調非増加になっているか。
// 判定:
//   violation: 親見出しより子見出しが大きい (逆転)
//   warning:   隣接レベルが同サイズ (視覚的に区別できない)
// 違反 0 件: pass / 逆転あり: fail / 同サイズのみ: minor

export default {
  id: 'info/heading-visual-hierarchy',
  name: '見出しの視覚階層 (font-size)',
  category: 'info',
  mainCategory: 'info',
  severity: 'minor',
  weight: 2,
  fix: 'H1 → H2 → H3... の順に font-size が段階的に小さくなるよう CSS を整えてください。同サイズや逆転はレイアウトから親子関係が読めない原因になります。',
  check: ({ visualData }) => {
    const headings = visualData?.headings || [];
    if (headings.length < 2) return { passed: true, message: '見出し 2 件未満 (スキップ)' };

    // 各レベルの平均 font-size を算出
    const byLevel = {};
    for (const h of headings) {
      const L = h.level;
      if (!byLevel[L]) byLevel[L] = [];
      byLevel[L].push(h.fontSize);
    }
    const avg = {};
    for (const L of Object.keys(byLevel)) {
      const arr = byLevel[L];
      avg[L] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    const levels = Object.keys(avg).map(Number).sort((a, b) => a - b);

    const inversions = []; // 親が子より小さい
    const sameSize = [];    // 隣接レベル同サイズ
    for (let i = 0; i < levels.length - 1; i++) {
      const parent = levels[i];
      const child = levels[i + 1];
      const pSize = avg[parent];
      const cSize = avg[child];
      if (cSize > pSize + 0.5) {
        inversions.push({ parent: `H${parent}`, parentSize: Math.round(pSize), child: `H${child}`, childSize: Math.round(cSize) });
      } else if (Math.abs(cSize - pSize) < 0.5) {
        sameSize.push({ parent: `H${parent}`, child: `H${child}`, size: Math.round(pSize) });
      }
    }

    if (inversions.length > 0) {
      return {
        passed: false,
        message: `階層逆転 ${inversions.length} 件 (${inversions.map((o) => `${o.parent} ${o.parentSize}px < ${o.child} ${o.childSize}px`).join(' / ')})`,
        offenders: [...inversions, ...sameSize],
        offendersTotal: inversions.length + sameSize.length,
        offendersTruncated: false,
      };
    }
    if (sameSize.length > 0) {
      return {
        passed: false,
        message: `隣接レベルが同サイズ ${sameSize.length} 件 (${sameSize.map((o) => `${o.parent}=${o.child} ${o.size}px`).join(' / ')})`,
        offenders: sameSize,
        offendersTotal: sameSize.length,
        offendersTruncated: false,
      };
    }
    return { passed: true, message: `H1〜H${levels[levels.length - 1]} の font-size が降順` };
  },
};
