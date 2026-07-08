export default {
  id: 'perf/ttfb',
  name: 'TTFB (Time to First Byte)',
  category: 'perf',
  severity: 'minor',
  weight: 0,
  deviceSensitive: true,
  scoreExcluded: true, // Lighthouse の server-response-time と重複するためスコア計算から除外 (実測値は参考情報として表示)
  fix: 'サーバ応答が遅い場合、キャッシュ (CDN / Varnish) 導入、DB クエリ最適化、SSR のレスポンス時間短縮を検討してください。目標は 800ms 以下。',
  check: ({ webVitals }, options = {}) => {
    const thresholdGood = options.goodMs ?? 800;
    const thresholdPoor = options.poorMs ?? 1800;
    const ttfb = webVitals?.ttfb;
    if (ttfb == null) return { passed: true, message: 'TTFB 未計測 (スキップ)' };
    const ms = Math.round(ttfb);
    if (ttfb <= thresholdGood) {
      return { passed: true, message: `TTFB ${ms}ms (good)` };
    }
    const severity = ttfb > thresholdPoor ? '悪い' : '改善が必要';
    return {
      passed: false,
      message: `TTFB ${ms}ms — ${severity} (目標 ${thresholdGood}ms 以下)`,
    };
  },
};
