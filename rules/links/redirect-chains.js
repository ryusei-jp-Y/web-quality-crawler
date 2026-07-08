export default {
  id: 'links/redirect-chain',
  name: 'リダイレクトチェーン (2 ホップ以上)',
  category: 'links',
  severity: 'minor',
  weight: 2,
  fix: 'リンクのリダイレクトが 2 段以上になるとクローラと閲覧者の体験が低下します。最終 URL を直接記述してください。',
  check: ({ linkCheck }) => {
    if (!linkCheck || !Array.isArray(linkCheck.redirectChains)) {
      return { passed: true, message: 'リンク検査 未計測 (スキップ)' };
    }
    const chains = linkCheck.redirectChains.filter((c) => (c.chain?.length || 0) >= 3); // start + 2 hops
    if (chains.length === 0) {
      return { passed: true, message: 'リダイレクトチェーンなし' };
    }
    const offenders = chains.slice(0, 20).map((c) => ({
      href: c.start,
      linkText: c.text,
      attribute: 'hops',
      invalidValue: String(c.chain.length - 1),
      snippet: c.chain.map((h) => `${h.status} → ${h.url}`).join('\n'),
      context: `${c.chain.length - 1} ホップのリダイレクト`,
    }));
    return {
      passed: false,
      message: `リダイレクトチェーン ${chains.length} 件`,
      offenders,
      offendersTotal: chains.length,
      offendersTruncated: chains.length > 20,
    };
  },
};
