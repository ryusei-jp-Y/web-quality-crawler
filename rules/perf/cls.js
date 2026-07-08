export default {
  id: 'perf/cls',
  name: 'CLS (Cumulative Layout Shift)',
  category: 'perf',
  severity: 'major',
  weight: 0,
  deviceSensitive: true,
  scoreExcluded: true, // Lighthouse の cumulative-layout-shift と重複するためスコア計算から除外 (実測値は参考情報として表示)
  fix: '画像や iframe に width/height を指定、広告枠を予約、フォント読み込みで FOIT/FOUT を避けるなど、ロード中のレイアウトずれを抑えてください。目標は 0.1 以下。',
  check: ({ webVitals }, options = {}) => {
    const thresholdGood = options.good ?? 0.1;
    const thresholdPoor = options.poor ?? 0.25;
    const cls = webVitals?.cls;
    if (cls == null) return { passed: true, message: 'CLS 未計測 (スキップ)' };
    const val = Math.round(cls * 1000) / 1000;
    if (cls <= thresholdGood) {
      return { passed: true, message: `CLS ${val} (good)` };
    }
    const severity = cls > thresholdPoor ? '悪い' : '改善が必要';
    return {
      passed: false,
      message: `CLS ${val} — ${severity} (目標 ${thresholdGood} 以下)`,
    };
  },
};
