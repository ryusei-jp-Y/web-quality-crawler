export default {
  id: 'perf/lcp',
  name: 'LCP (Largest Contentful Paint)',
  category: 'perf',
  severity: 'major',
  weight: 0,
  deviceSensitive: true,
  scoreExcluded: true, // Lighthouse の largest-contentful-paint と重複するためスコア計算から除外 (実測値は参考情報として表示)
  fix: 'ヒーロー画像やメインコンテンツの描画を高速化してください (画像の軽量化 / preload / critical CSS / サーバ応答時間短縮など)。目標は 2500ms 以下。',
  check: ({ webVitals }, options = {}) => {
    const thresholdGood = options.goodMs ?? 2500;
    const thresholdPoor = options.poorMs ?? 4000;
    const lcp = webVitals?.lcp;
    if (lcp == null) return { passed: true, message: 'LCP 未計測 (スキップ)' };
    const ms = Math.round(lcp);
    if (lcp <= thresholdGood) {
      return { passed: true, message: `LCP ${ms}ms (good)` };
    }
    const severity = lcp > thresholdPoor ? '悪い' : '改善が必要';
    return {
      passed: false,
      message: `LCP ${ms}ms — ${severity} (目標 ${thresholdGood}ms 以下)`,
    };
  },
};
