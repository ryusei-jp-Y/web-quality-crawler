export default {
  id: 'perf/head-inline-size',
  name: 'head内インラインCSS/JSサイズ',
  category: 'perf',
  severity: 'major',
  weight: 3,
  fix: 'head内のインライン<style>と<script>の合計を10KB以下に収めてください。CSS/JSは外部ファイル化を推奨。',
  check: ({ headInlineBytes }, options = {}) => {
    const maxBytes = options.maxBytes ?? 10240;
    if (headInlineBytes > maxBytes) {
      const kb = (headInlineBytes / 1024).toFixed(1);
      return {
        passed: false,
        message: `head内インラインサイズ ${kb}KB (上限${(maxBytes / 1024).toFixed(0)}KB)`,
      };
    }
    return { passed: true };
  },
};
