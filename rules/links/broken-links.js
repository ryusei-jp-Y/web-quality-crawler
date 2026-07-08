export default {
  id: 'links/broken',
  name: 'リンク切れ (4xx / 5xx)',
  category: 'links',
  severity: 'critical',
  weight: 4,
  fix: '404 や 500 を返すリンクはユーザー体験・SEO を共に損ねます。正しい URL に修正するか、該当ページを復旧してください。',
  check: ({ linkCheck }) => {
    if (!linkCheck || !Array.isArray(linkCheck.results)) {
      return { passed: true, message: 'リンク検査 未計測 (スキップ)' };
    }
    const broken = linkCheck.results.filter((r) => {
      if (r.status === 0) return false; // timeout 等は別ルール扱い
      return r.status >= 400 && r.status < 600;
    });
    if (broken.length === 0) {
      return { passed: true, message: `${linkCheck.checked} 件のリンクを検査、切れなし` };
    }
    const offenders = broken.slice(0, 20).map((r) => ({
      href: r.url,
      linkText: r.text,
      attribute: 'status',
      invalidValue: String(r.status),
      snippet: `<a href="${r.url}">${r.text || ''}</a>`,
      context: r.isInternal ? '内部リンク' : '外部リンク',
    }));
    return {
      passed: false,
      message: `リンク切れ ${broken.length} 件 (検査 ${linkCheck.checked} 件中)`,
      offenders,
      offendersTotal: broken.length,
      offendersTruncated: broken.length > 20,
    };
  },
};
