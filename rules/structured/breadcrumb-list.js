export default {
  id: 'structured/breadcrumb-list',
  name: 'BreadcrumbListの存在',
  category: 'structured',
  severity: 'minor',
  weight: 2,
  fix: 'BreadcrumbList構造化データでパンくず情報を提供してください。',
  check: ({ $ }) => {
    const scripts = $('script[type="application/ld+json"]').toArray();
    let hasBreadcrumb = false;
    for (const el of scripts) {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'BreadcrumbList') {
            hasBreadcrumb = true;
            break;
          }
          if (Array.isArray(item['@graph'])) {
            if (item['@graph'].some((g) => g['@type'] === 'BreadcrumbList')) {
              hasBreadcrumb = true;
              break;
            }
          }
        }
        if (hasBreadcrumb) break;
      } catch {
        /* skip */
      }
    }
    if (!hasBreadcrumb) {
      return { passed: false, message: 'BreadcrumbList構造化データが見つかりません' };
    }
    return { passed: true };
  },
};
