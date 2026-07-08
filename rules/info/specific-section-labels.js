import { describeElement } from '../../lib/describe-element.js';

// 内容を想像できない抽象語のみで構成された見出しを検知する。
// 「魅力」「こだわり」「ポイント」「おすすめ」など、単独で使うと
// AI も人間も何の話かわからない語を blacklist 化。
// 複合語 ("サービスの魅力" / "選ばれる3つのポイント" など) は許容する。
const ABSTRACT_STANDALONE = new Set([
  '魅力',
  'こだわり',
  'ポイント',
  'おすすめ',
  '特徴',
  '強み',
  '選ばれる理由',
  'メリット',
]);

function normalizeHeadingText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[・:：|｜\-—–]/g, ' ')
    .trim();
}

export default {
  id: 'info/specific-section-labels',
  name: 'セクション見出しの具体性',
  category: 'info',
  mainCategory: 'info',
  severity: 'minor',
  weight: 2,
  fix: '見出しは「魅力」「こだわり」など抽象語単独ではなく、「料金プラン」「導入の流れ」「よくある質問」のように内容を想像できる具体名詞を使ってください。',
  check: ({ $ }) => {
    const headings = $('h1, h2, h3').toArray();
    if (headings.length === 0) return { passed: true, message: '見出しなし (スキップ)' };

    const offenders = [];
    for (const h of headings) {
      const raw = normalizeHeadingText($(h).text());
      if (!raw) continue;
      // 単語 1 語のみで、それが抽象語辞書に含まれる場合のみ NG
      // ("サービスの魅力" など 複合語は ABSTRACT_STANDALONE が Set 完全一致なので passes)
      if (ABSTRACT_STANDALONE.has(raw)) {
        offenders.push({ ...describeElement($, h), text: raw });
      }
    }
    if (offenders.length === 0) return { passed: true };
    return {
      passed: false,
      message: `抽象語のみの見出しが ${offenders.length} 件: ${offenders.slice(0, 3).map((o) => o.text).join(' / ')}`,
      offenders: offenders.slice(0, 20),
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
