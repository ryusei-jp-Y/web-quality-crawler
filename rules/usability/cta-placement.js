// CTA の配置妥当性 (CTA 数 × ページ長):
//   - CTA 数が極端に少ない (ページ高 > 3000px で 0〜1 件) → fail
//   - CTA 数が過多 (1000px あたり 3 件以上) → fail
//   - 適正: ページ高 1000px あたり 0.5〜2 件
// フッター共通ナビは .footer / role="contentinfo" の中にあるものを除外。

function isCtaLike($, el) {
  const tag = el.name;
  if (tag === 'button') return true;
  if (tag === 'input') {
    const type = ($(el).attr('type') || '').toLowerCase();
    return type === 'submit' || type === 'button';
  }
  if (tag === 'a') {
    const klass = ($(el).attr('class') || '').toLowerCase();
    if (/\b(btn|button|cta|action)\b/.test(klass)) return true;
    if ($(el).attr('role') === 'button') return true;
  }
  return false;
}

function isInFooter($, el) {
  // 祖先に footer / [role="contentinfo"] / .footer があれば除外
  const $el = $(el);
  if ($el.closest('footer').length > 0) return true;
  if ($el.closest('[role="contentinfo"]').length > 0) return true;
  if ($el.closest('.footer, #footer, .global-footer').length > 0) return true;
  return false;
}

export default {
  id: 'usability/cta-placement',
  name: 'CTA 配置の妥当性 (数 × ページ長)',
  category: 'usability',
  mainCategory: 'usability',
  severity: 'minor',
  weight: 2,
  fix: 'CTA 数はページ長 1000px あたり 0.5〜2 件を目安に配置してください。少なすぎると行動機会を失い、多すぎると主目的が分散します。フッター共通ナビは CTA として数えません。',
  check: ({ $, visualData }) => {
    const pageHeight = visualData?.pageMetrics?.scrollHeight || 0;
    if (pageHeight === 0) return { passed: true, message: 'ページ高未取得 (スキップ)' };

    const candidates = $('button, a, input').toArray()
      .filter((el) => isCtaLike($, el))
      .filter((el) => !isInFooter($, el));

    const ctaCount = candidates.length;
    const perKPx = ctaCount / (pageHeight / 1000); // CTA / 1000px
    const tooFew = pageHeight > 3000 && ctaCount <= 1;
    const tooMany = perKPx >= 3;

    if (!tooFew && !tooMany && perKPx >= 0.5 && perKPx <= 2) {
      return { passed: true, message: `CTA ${ctaCount} 件 / ${Math.round(pageHeight)}px (${perKPx.toFixed(1)}/1000px)` };
    }
    if (tooFew) {
      return {
        passed: false,
        message: `CTA が少なすぎる: ${ctaCount} 件 (ページ高 ${Math.round(pageHeight)}px)`,
      };
    }
    if (tooMany) {
      return {
        passed: false,
        message: `CTA が過多: ${ctaCount} 件 (${perKPx.toFixed(1)}/1000px) — 主目的が分散するリスク`,
      };
    }
    return {
      passed: false,
      message: `CTA 密度が推奨範囲外: ${perKPx.toFixed(1)}/1000px (推奨 0.5〜2)`,
    };
  },
};
