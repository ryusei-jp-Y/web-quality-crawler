// ロゴレギュレーション AI 評価ルール (汎用化版)。
//
// ガイドライン本文は config/brands/<brand>/logo-guideline.md からロードされ、
// pageData.brand.logoGuideline に展開される。
// brand 未指定 (or guideline ファイル未配置) なら評価対象外としてスキップ。
//
// 新規ブランド追加 = config/brands/<id>/logo-guideline.md を置くだけで動作する。

import { createAiRule } from '../../lib/ai/create-rule.js';

function buildSystemPrompt({ brand }) {
  const brandName = brand?.displayName ?? brand?.name ?? 'ブランド';
  const guideline = brand?.logoGuideline ?? '';
  return `あなたは ${brandName} ブランドロゴのレギュレーション専門家です。
以下のガイドラインに照らして、ページ上のロゴ画像が遵守されているかを判定してください。

# ${brandName} ロゴガイドライン

${guideline}

---

# 評価観点

1. **最小サイズ遵守**: ガイドラインで規定された最小サイズを満たしているか
2. **アイソレーション**: 周辺余白がガイドライン基準を満たすか — 隣接要素との衝突や近接配置になっていないか
3. **変形なし**: transform / filter で歪み・回転・色調変更が加えられていないか (禁則項目)
4. **縦横比維持**: 自然解像度 (naturalWidth/Height) と表示サイズ (displayedWidth/Height) の比率が保たれているか
5. **alt 属性**: 設定済かつ空でないか、ブランド/サービス名を含むか
6. **カラー表示規定**: 背景濃度に合わせたポジティブ/ネガティブ/モノクロが選択されているか (画像 src 名や class から推測)
7. **テキスト表記規定**: ガイドラインで規定された表記ルール (例: 親会社/グループ名併記) が守られているか (alt や周辺テキストから判断)

# スコア配分

- 致命的 (最小サイズ違反 / 変形あり / alt 空 / 禁則違反) 1 件以上 → score 30-49 / passed=false
- 軽微違反 (アイソレーション微妙、規定外バリエーション疑い) のみ → score 70-85 / passed=false
- 全項目クリア → score 90+ / passed=true
- ロゴ候補が見つからない → passed=true (評価対象外として扱う)

issues は違反 1 件につき 1 エントリ。location には "header の ${brandName} ロゴ" のような特定情報、quote は src の末尾 60 字または alt 値、suggestion はガイドラインの該当条項に基づく具体的修正案。`;
}

const aiLogoRegulation = createAiRule({
  id: 'ai/logo-regulation',
  name: 'ロゴレギュレーション (ガイドライン照合 / AI)',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'minor',
  weight: 2,
  fix: 'ブランドガイドライン (config/brands/<brand>/logo-guideline.md) に従い、最小サイズ・アイソレーション・カラー規定・変形なし・alt 設定・親会社表記を遵守してください。',
  buildSystemPrompt,
  buildUserPrompt: ({ visualData, url, brand }) => {
    // brand 未指定 or ガイドライン未配置 → 対象外スキップ
    if (!brand?.logoGuideline) return null;

    const images = visualData?.images || [];
    const logos = images.filter((img) => {
      const hay = `${img.className} ${img.id} ${img.alt} ${img.src}`.toLowerCase();
      return /\blogo\b/.test(hay) || hay.includes('ロゴ');
    });
    if (logos.length === 0) return null;

    const lines = logos.slice(0, 12).map((l, idx) => {
      const aspectNatural = l.naturalWidth && l.naturalHeight ? (l.naturalWidth / l.naturalHeight).toFixed(2) : 'N/A';
      const aspectDisplayed = l.displayedWidth && l.displayedHeight ? (l.displayedWidth / l.displayedHeight).toFixed(2) : 'N/A';
      return `[${idx + 1}] src: ${(l.src || '').slice(0, 120)}
    alt: "${l.alt || ''}"
    class: "${l.className || ''}" id: "${l.id || ''}"
    displayed: ${l.displayedWidth}×${l.displayedHeight}px (aspect ${aspectDisplayed})
    natural:   ${l.naturalWidth}×${l.naturalHeight}px (aspect ${aspectNatural})
    transform: ${l.transform || 'none'}
    filter:    ${l.filter || 'none'}
    visible:   ${l.visible}`;
    }).join('\n\n');
    return `URL: ${url}
ブランド: ${brand.displayName ?? brand.name}

検出されたロゴ候補 (class/alt/src/id に "logo" を含む) ${logos.length} 件:

${lines}`;
  },
});

export default aiLogoRegulation;
