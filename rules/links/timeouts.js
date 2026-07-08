export default {
  id: 'links/unreachable',
  name: '到達不能リンク (タイムアウト / DNS 失敗)',
  category: 'links',
  severity: 'major',
  weight: 3,
  fix: 'リンク先にアクセスできません。DNS 設定・サーバ疎通・ネットワーク経路を確認してください。一時的障害の可能性もあります。',
  check: ({ linkCheck }) => {
    if (!linkCheck || !Array.isArray(linkCheck.results)) {
      return { passed: true, message: 'リンク検査 未計測 (スキップ)' };
    }
    const failed = linkCheck.results.filter((r) => r.status === 0 && r.error);
    if (failed.length === 0) {
      return { passed: true, message: 'すべてのリンクに到達可能' };
    }
    const offenders = failed.slice(0, 20).map((r) => ({
      href: r.url,
      linkText: r.text,
      attribute: 'error',
      invalidValue: r.error,
      snippet: `<a href="${r.url}">${r.text || ''}</a>`,
      context: r.isInternal ? '内部リンク' : '外部リンク',
    }));
    return {
      passed: false,
      message: `到達不能リンク ${failed.length} 件`,
      offenders,
      offendersTotal: failed.length,
      offendersTruncated: failed.length > 20,
    };
  },
};
