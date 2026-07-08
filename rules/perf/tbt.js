export default {
  id: 'perf/tbt',
  name: 'TBT (Total Blocking Time)',
  category: 'perf',
  severity: 'minor',
  weight: 0,
  deviceSensitive: true,
  scoreExcluded: true, // Lighthouse の total-blocking-time と重複するためスコア計算から除外 (実測値は参考情報として表示)
  fix: 'メインスレッドを長時間ブロックする JS を分割してください (コード分割 / 不要な third-party スクリプト削減 / Web Worker 活用)。目標は 200ms 以下。',
  check: ({ webVitals }, options = {}) => {
    const thresholdGood = options.goodMs ?? 200;
    const thresholdPoor = options.poorMs ?? 600;
    const tbt = webVitals?.tbt;
    if (tbt == null) return { passed: true, message: 'TBT 未計測 (スキップ)' };
    const ms = Math.round(tbt);
    if (tbt <= thresholdGood) {
      return { passed: true, message: `TBT ${ms}ms (good)` };
    }
    const severity = tbt > thresholdPoor ? '悪い' : '改善が必要';
    return {
      passed: false,
      message: `TBT ${ms}ms — ${severity} (目標 ${thresholdGood}ms 以下)`,
    };
  },
};
