// 情報設計カテゴリの AI 判定ルール群。
// 各ルールは createAiRule ファクトリ経由で定義し、評価観点のみ差分を持つ。
import { createAiRule, sampleBodyText, extractHeadings } from '../../lib/ai/create-rule.js';

const COMMON = {
  category: 'info',
  mainCategory: 'info',
  severity: 'major',
  weight: 3,
};

export const aiInfoDuplication = createAiRule({
  ...COMMON,
  id: 'ai/info-duplication',
  name: '情報の重複 (AI)',
  fix: 'ファーストビューと本文、本文と FAQ、CTA 直前と前セクション等で同一訴求が繰り返されていないか点検してください。料金情報は 1 箇所に集約し、他では要約や導線のみにします。',
  systemPrompt: `あなたはサービスサイトの情報設計の専門家です。与えられたページ本文を読み、意図的でない「情報重複」を検出してください。
観点:
- ファーストビューと本文で同じ訴求を繰り返している
- 料金/機能メリットが複数セクションでほぼ同じ内容で載っている
- FAQ と本文で同じ説明を繰り返している
- CTA 直前の説明が前セクションと同じ
- 見出しが違うのに中身がほぼ同じセクションが並んでいる

judgement: 重複 0-1 箇所 → passed=true / 2-3 箇所 → passed=false score 50-70 / 4+ → passed=false score <50
issues は重複ペアごとに 1 エントリ (location に「セクションA vs セクションB」を書く)`,
  buildUserPrompt: ({ $, url, title }) => {
    const headings = extractHeadings($).map((h) => `${'#'.repeat(h.level)} ${h.text}`).join('\n');
    const body = sampleBodyText($);
    if (!body || body.length < 200) return null;
    return `URL: ${url}\nTitle: ${title}\n\n見出し:\n${headings}\n\n本文:\n${body}`;
  },
});

export const aiSectionSingleTheme = createAiRule({
  ...COMMON,
  id: 'ai/section-single-theme',
  name: 'セクション単一テーマ (AI)',
  fix: '各セクションの主題を一言で説明できるか確認し、「料金」内に機能紹介や事例を混ぜない、「FAQ」途中にキャンペーン訴求を差し込まない等、役割を純粋に保ってください。',
  systemPrompt: `あなたは情報設計の専門家です。ページの各セクションが単一テーマで構成されているかを判定してください。
NG 例:
- 「料金」セクションに機能紹介・お客様の声が混在
- 「FAQ」途中にキャンペーン訴求
- 「導入事例」に料金表が差し込まれている
judgement: 混在 0 → passed=true / 1-2 → passed=false score 50-70 / 3+ → score <50
issues の location に該当セクション名を書く`,
  buildUserPrompt: ({ $, url, title }) => {
    const sections = [];
    $('section, article, [class*="section"]').each((_, el) => {
      if (sections.length >= 25) return;
      const heading = $(el).find('h1, h2, h3').first().text().trim();
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!heading && text.length < 80) return;
      sections.push({ heading: heading || '(見出しなし)', excerpt: text.slice(0, 400) });
    });
    if (sections.length < 2) return null;
    return `URL: ${url}\nTitle: ${title}\n\n抽出されたセクション:\n${sections.map((s, i) => `[${i + 1}] ${s.heading}\n  ${s.excerpt}`).join('\n\n')}`;
  },
});

export const aiBlockSinglePurpose = createAiRule({
  ...COMMON,
  id: 'ai/block-single-purpose',
  name: 'ブロック (カード/アラート) の単一主張 (AI)',
  fix: '1 カード・1 吹き出し・1 アラートには 1 つの内容/主張のみを載せてください (機能説明 + 価格訴求 + 導入事例 の同居は NG)。',
  systemPrompt: `カード・吹き出し・アラートといった「1 単位の表現ブロック」が、1 つの主題に絞れているかを判定してください。
複数の論点 (機能説明 + 価格訴求 + 事例) が同居している場合は違反。
judgement: 違反 0 → pass / 1-2 → score 60-75 / 3+ → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const blocks = [];
    $('[class*="card"], [class*="panel"], [class*="alert"], [role="alert"], [class*="callout"]').each((_, el) => {
      if (blocks.length >= 30) return;
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length < 30) return;
      blocks.push({
        cls: ($(el).attr('class') || '').split(/\s+/)[0],
        excerpt: text.slice(0, 250),
      });
    });
    if (blocks.length < 2) return null;
    return `URL: ${url}\n\nブロック候補:\n${blocks.map((b, i) => `[${i + 1}] .${b.cls}\n  ${b.excerpt}`).join('\n\n')}`;
  },
});

export const aiParallelItemFormat = createAiRule({
  ...COMMON,
  id: 'ai/parallel-item-format',
  name: '同種情報の項目・順序揃え (AI)',
  fix: '料金プランや機能カードなど、並列に並ぶ要素は項目 (料金/容量/サポート 等) と順序を統一してください。あるプランが「料金/容量」だけ、別プランが「料金/特典/事例」は NG。',
  systemPrompt: `並列に並ぶ要素群 (料金プラン / 機能カード / 比較テーブル行) が項目・順序・表現を揃えているか判定してください。
違反例: A は「料金/容量」だけ、B は「料金/特典/事例」、C は文章のみ / 箇条書き・長文・画像中心の混在
judgement: 揃っている → pass / 一部ばらつき → score 50-70 / ばらばら → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const groups = [];
    $('[class*="plan"], [class*="price"], [class*="feature"], [class*="card-grid"], ul[class*="feature"]').each((_, el) => {
      if (groups.length >= 10) return;
      const items = $(el).children().toArray().slice(0, 8).map((c) => $(c).text().replace(/\s+/g, ' ').trim().slice(0, 200));
      if (items.length < 2) return;
      groups.push({ cls: ($(el).attr('class') || '').split(/\s+/)[0], items });
    });
    if (groups.length === 0) return null;
    return `URL: ${url}\n\n並列要素グループ:\n${groups.map((g, i) => `[${i + 1}] .${g.cls}\n${g.items.map((t, j) => `  子${j + 1}: ${t}`).join('\n')}`).join('\n\n')}`;
  },
});

export const aiRoleSeparation = createAiRule({
  ...COMMON,
  id: 'ai/role-separation',
  name: '役割 (見出し/説明/補足/行動) の分離 (AI)',
  fix: '見出しは要点だけ、説明文は詳細だけ、補足は補足らしく、CTA は独立して配置してください。1 要素が複数役割を担わないように。',
  systemPrompt: `各要素が「見出し・説明・補足・行動」のどれか 1 役割に収まっているかを判定してください。
違反例: 見出しの見た目なのに長い説明文、説明文内に行動指示+注意事項+補足が混在、1 要素が複数役割を兼ねる
judgement: 0-1 → pass / 2-3 → score 50-70 / 4+ → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const headings = extractHeadings($, { max: 40 });
    const longHeadings = headings.filter((h) => h.text.length > 60);
    const body = sampleBodyText($, { maxChars: 3000 });
    if (!body) return null;
    return `URL: ${url}\n\n見出し一覧 (長すぎる見出しも含む):\n${headings.map((h) => `h${h.level}: ${h.text}`).join('\n')}\n\n長すぎる見出し (>60字) 数: ${longHeadings.length}\n\n本文サンプル:\n${body}`;
  },
});

export const aiTargetAudienceClarity = createAiRule({
  ...COMMON,
  id: 'ai/target-audience-clarity',
  name: 'ターゲット・ユースケース明示 (AI)',
  fix: '「こんな方におすすめ」「ご利用シーン」等の専用セクションで、具体的なユーザー像・用途をテキストで明示してください。',
  systemPrompt: `ページにサービスのターゲット・ユースケースが具体的に明示されているか判定してください。
〇例: 「WordPress でブログを始めたい方」「サーバー移行を検討中の方」
×例: ターゲット未記載 / 抽象表現のみ
judgement: 具体的記述あり → pass / 抽象のみ → score 50-70 / 全く言及なし → score <50`,
  buildUserPrompt: ({ $, url, title }) => {
    const body = sampleBodyText($, { maxChars: 4500 });
    if (!body || body.length < 200) return null;
    const headings = extractHeadings($).map((h) => `h${h.level}: ${h.text}`).join('\n');
    return `URL: ${url}\nTitle: ${title}\n\n見出し:\n${headings}\n\n本文:\n${body}`;
  },
});

export const aiDifferentiationEvidence = createAiRule({
  ...COMMON,
  id: 'ai/differentiation-with-evidence',
  name: '差別化ポイントの根拠明示 (AI)',
  fix: '「国内最速」等の差別化は meta description やキャッチコピー画像だけでなく、見出し + 根拠数値 (出典付き) として本文に記載してください。',
  systemPrompt: `サービスの差別化ポイントが「見出し + 具体的な根拠数値」のセットで本文に記載されているか判定してください。
〇例: <h2>国内最速</h2><p>処理速度 No.1 (2024 年自社調べ)</p>
×例: meta description のみ / キャッチコピー画像内のみ / 根拠数値なしのスローガン
judgement: 数値+出典付き → pass / 数値のみで出典無し → score 60-80 / 抽象訴求のみ → score <50`,
  buildUserPrompt: ({ $, url, title }) => {
    const body = sampleBodyText($, { maxChars: 5000 });
    if (!body || body.length < 200) return null;
    const headings = extractHeadings($).map((h) => `h${h.level}: ${h.text}`).join('\n');
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    return `URL: ${url}\nTitle: ${title}\nMeta description: ${metaDesc}\n\n見出し:\n${headings}\n\n本文:\n${body}`;
  },
});
