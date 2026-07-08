// 同じ UI パターン (カード / ボタン) が同じ役割で使われているかの決定的チェック。
// 指標:
//   (a) 同一クラスの CTA ボタン群が同じドメインに飛んでいる (ドメイン一貫性)
//   (b) カード系要素 (class に card / item 含む) が 3 件以上で子要素構成が揃っている

export default {
  id: 'visual/ui-pattern-consistency',
  name: 'UI パターン一貫性 (CTA / カード構造)',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'minor',
  weight: 2,
  fix: '同じ見た目 (同クラス) の CTA は同じ役割 (同ドメイン遷移) で使う、同じカードスタイルは同じ子要素構成に揃えてください。',
  check: ({ $ }) => {
    const issues = [];

    // (a) 同一クラスの CTA ボタン: 同一 class 名の a[href] で href ドメインが割れていないか
    const ctaByClass = new Map();
    for (const a of $('a[class]').toArray()) {
      const klass = ($(a).attr('class') || '').toLowerCase();
      if (!/(btn|button|cta|action)/.test(klass)) continue;
      const firstClass = klass.split(/\s+/)[0];
      if (!firstClass) continue;
      const href = $(a).attr('href') || '';
      if (!/^https?:\/\//i.test(href)) continue;
      let host;
      try { host = new URL(href).host; } catch { continue; }
      if (!ctaByClass.has(firstClass)) ctaByClass.set(firstClass, new Set());
      ctaByClass.get(firstClass).add(host);
    }
    for (const [klass, hosts] of ctaByClass) {
      if (hosts.size >= 2) {
        issues.push({ kind: 'cta-domain-split', item: `.${klass}`, detail: `ドメインが ${hosts.size} 種類: ${[...hosts].slice(0, 3).join(', ')}` });
      }
    }

    // (b) カード系要素の子要素構成一貫性
    // 同一 class のカード 3 件以上で、子要素のタグ構成 (h + p + img など) が揃っているか
    const cardGroups = new Map();
    for (const el of $('[class*="card"], [class*="item"]').toArray()) {
      const klass = ($(el).attr('class') || '').toLowerCase();
      const firstClass = klass.split(/\s+/).find((c) => /card|item/.test(c));
      if (!firstClass) continue;
      const signature = [...$(el).children()].map((c) => c.tagName || c.name).filter(Boolean).join('>');
      if (!cardGroups.has(firstClass)) cardGroups.set(firstClass, []);
      cardGroups.get(firstClass).push(signature);
    }
    for (const [klass, sigs] of cardGroups) {
      if (sigs.length < 3) continue;
      const unique = new Set(sigs);
      if (unique.size > 1) {
        // 半数以上が特定パターンに揃っていれば OK、それ以外を違反と数える
        const counts = {};
        for (const s of sigs) counts[s] = (counts[s] || 0) + 1;
        const maxShare = Math.max(...Object.values(counts)) / sigs.length;
        if (maxShare < 0.7) {
          issues.push({ kind: 'card-structure-split', item: `.${klass}`, detail: `${sigs.length} 件のカード中、子構成が ${unique.size} 種類に分裂` });
        }
      }
    }

    if (issues.length === 0) return { passed: true };
    return {
      passed: false,
      message: `UI パターン不整合 ${issues.length} 件`,
      offenders: issues.slice(0, 20),
      offendersTotal: issues.length,
      offendersTruncated: issues.length > 20,
    };
  },
};
