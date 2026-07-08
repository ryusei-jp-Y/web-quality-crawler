// ブランドガイドライン (色・フォント・見出しサイズ・余白) AI 評価ルール (汎用化版)。
//
// ガイドライン本文は config/brands/<brand>/visual-guideline.md からロードされ、
// pageData.brand.visualGuideline に展開される。
// brand 未指定 (or guideline ファイル未配置) なら評価対象外としてスキップ。
//
// 新規ブランド追加 = config/brands/<id>/visual-guideline.md を置くだけで動作する。

import { createAiRule } from '../../lib/ai/create-rule.js';

function buildSystemPrompt({ brand }) {
  const brandName = brand?.displayName ?? brand?.name ?? 'ブランド';
  const guideline = brand?.visualGuideline ?? '';
  return `あなたは ${brandName} ブランドのデザインシステム専門家です。
ページのテキスト/色/フォント/見出しサイズ/余白がブランドガイドラインに沿っているかを判定してください。

# ${brandName} ブランドガイドライン (フォント / カラー / 見出しサイズ / 余白)

${guideline}

---

# 評価観点

1. **カラーパレット**: ガイドライン規定のブランドカラーを使用しているか
2. **フォントファミリー**: ガイドライン規定のフォントを使用しているか (日本語 / 英語 別)
3. **見出しサイズ階層**: ガイドライン規定の px / line-height に沿っているか
4. **line-height**: ガイドライン規定の値が反映されているか
5. **letter-spacing**: ガイドライン規定の値が反映されているか
6. **コントラスト比**: WCAG AA (通常 4.5:1, 大 3:1) を満たすか

# スコア配分

- ブランドカラーが全く使われていない / 規定外フォント主体 → score 30-50 / passed=false
- 部分的準拠 (一部規定色 / フォント混在) → score 60-79 / passed=false
- 概ね準拠 (主要要素はガイドライン通り) → score 80-89
- 完全準拠 → score 90+ / passed=true

issues の location は "見出し領域" や "ボタン要素" 等、quote は実際の色やフォント名を 60 字内で。`;
}

const aiBrandGuideline = createAiRule({
  id: 'ai/brand-guideline',
  name: 'ブランドガイドライン (色/フォント/サイズ/AI)',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'minor',
  weight: 2,
  fix: 'ブランドガイドライン (config/brands/<brand>/visual-guideline.md) のカラーパレット・フォントファミリー・見出し px 階層・line-height・letter-spacing・余白を遵守してください。',
  buildSystemPrompt,
  buildUserPrompt: ({ visualData, url, brand }) => {
    // brand 未指定 or ガイドライン未配置 → 対象外スキップ
    if (!brand?.visualGuideline) return null;

    const samples = visualData?.textSamples || [];
    if (samples.length === 0) return null;

    const top = samples.slice(0, 30);
    const fontFamilies = [...new Set(samples.map((s) => (s.fontFamily || '').split(',')[0]?.trim()).filter(Boolean))].slice(0, 8);
    const distinctColors = [...new Set(samples.map((s) => s.color).filter(Boolean))].slice(0, 12);

    return `URL: ${url}
ブランド: ${brand.displayName ?? brand.name}

# 観測されたフォントファミリー (上位 8)
${fontFamilies.length ? fontFamilies.map((f) => `- ${f}`).join('\n') : '(検出なし)'}

# 観測されたテキスト色 (重複除き 12 件まで)
${distinctColors.length ? distinctColors.map((c) => `- ${c}`).join('\n') : '(検出なし)'}

# テキストサンプル ${top.length} 件 (要素 / サイズ / 色 / 行間 / 字間)
${top.map((s, i) => `[${i + 1}] <${s.tag}> "${(s.text || '').slice(0, 40)}" size=${Math.round(s.fontSize)}px weight=${s.fontWeight} color=${s.color} bg=${s.bgColor} lh=${s.lineHeight} ls=${s.letterSpacing}`).join('\n')}`;
  },
});

export default aiBrandGuideline;
