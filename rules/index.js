// LLMO
import llmsTxtPresent from './llmo/llms-txt-present.js';
import llmsTxtMinContent from './llmo/llms-txt-minimum-content.js';
import robotsTxt from './llmo/robots-txt-accessible.js';
import canonical from './llmo/canonical.js';
import ogRequired from './llmo/og-required.js';

// Semantic
import landmarks from './semantic/landmarks.js';
import sectionArticleHeading from './semantic/section-article-with-heading.js';
import singleMain from './semantic/single-main.js';
import singleH1 from './semantic/single-h1.js';
import headingHierarchy from './semantic/heading-hierarchy.js';
import thScope from './semantic/th-scope.js';
import divRatio from './semantic/div-ratio.js';

// Structured
import jsonLdPresent from './structured/json-ld-present.js';
import jsonLdSyntax from './structured/json-ld-valid-syntax.js';
import jsonLdContextType from './structured/json-ld-has-context-type.js';
import breadcrumbList from './structured/breadcrumb-list.js';

// Readable
import domTextVolume from './readable/dom-text-volume.js';
import cssGeneratedText from './readable/css-generated-text.js';
import tableDlUsage from './readable/table-dl-usage.js';
import imageTextAlternative from './readable/image-text-alternative.js';
import langAttribute from './readable/lang-attribute.js';

// A11y
import imgAlt from './a11y/img-alt.js';
import formLabels from './a11y/form-labels.js';
import buttonAccessibleName from './a11y/button-accessible-name.js';
import buttonVsAnchor from './a11y/button-vs-anchor.js';
import interactiveAriaState from './a11y/interactive-aria-state.js';
import linkTextQuality from './a11y/link-text-quality.js';

// Perf
import headInlineSize from './perf/head-inline-size.js';
import htmlTotalSize from './perf/html-total-size.js';
import perfLcp from './perf/lcp.js';
import perfCls from './perf/cls.js';
import perfTbt from './perf/tbt.js';
import perfTtfb from './perf/ttfb.js';

// Links
import linksBroken from './links/broken-links.js';
import linksRedirectChains from './links/redirect-chains.js';
import linksUnreachable from './links/timeouts.js';

// Info architecture
import infoSpecificSectionLabels from './info/specific-section-labels.js';
import infoHeadingVisualHierarchy from './info/heading-visual-hierarchy.js';
import infoRequiredServiceItems from './info/required-service-items.js';

// Text quality
import textSentenceLength from './text/sentence-length.js';
import textNgWords from './text/ng-words.js';
import textNotationConsistency from './text/notation-consistency.js';

// Visual
import visualImageQuality from './visual/image-quality.js';
import visualContrast from './visual/contrast.js';
// visual/logo-regulation, visual/brand-guideline はガイドライン照合の精度を上げるため
// AI ルール (ai/logo-regulation, ai/brand-guideline) に統合済 (v2.5)。
import visualUiPatternConsistency from './visual/ui-pattern-consistency.js';
import visualDsMargin from './visual/ds-margin.js';

// Usability
import usabilityCtaLabelSpecificity from './usability/cta-label-specificity.js';
import usabilityCtaPlacement from './usability/cta-placement.js';

// =============================================================
// Main categories registry
// =============================================================
// サブカテゴリ (旧 category) をメインカテゴリにまとめる。
// 新規追加時は該当 main.subs にサブを追加し、SUB_TO_MAIN も自動反映される。
// 現状 info/text/visual/usability は sub = main と同名 1 つのみ (分割不要の想定)。
export const MAIN_CATEGORIES = {
  code: {
    label: 'コード品質',
    short: 'Code',
    subs: ['llmo', 'semantic', 'structured', 'readable', 'a11y', 'perf', 'links'],
  },
  info: {
    label: '情報設計',
    short: 'Info',
    subs: ['info'],
  },
  text: {
    label: 'テキスト品質',
    short: 'Text',
    subs: ['text'],
  },
  visual: {
    label: 'ビジュアル',
    short: 'Visual',
    subs: ['visual'],
  },
  usability: {
    label: '操作のしやすさ',
    short: 'Usability',
    subs: ['usability'],
  },
};

// sub category → main category の逆引き
export const SUB_TO_MAIN = (() => {
  const m = {};
  for (const [main, meta] of Object.entries(MAIN_CATEGORIES)) {
    for (const sub of meta.subs) m[sub] = main;
  }
  return m;
})();

// AI-backed rules (意味論的判定)
import aiHeadingSemantics from './ai/heading-semantics.js';
import aiMetaDescriptionQuality from './ai/meta-description-quality.js';
import aiAltTextQuality from './ai/alt-text-quality.js';
import aiJsonLdPageAlignment from './ai/jsonld-page-alignment.js';
import aiLinkTextSemantics from './ai/link-text-semantics.js';
import aiLlmsTxtContentQuality from './ai/llms-txt-content-quality.js';

// Phase 2B: 情報設計 / テキスト / ビジュアル / 操作のしやすさ の AI ルール群
import {
  aiInfoDuplication, aiSectionSingleTheme, aiBlockSinglePurpose,
  aiParallelItemFormat, aiRoleSeparation,
  aiTargetAudienceClarity, aiDifferentiationEvidence,
} from './ai/info-architecture.js';
import {
  aiImageVsTextPriority, aiDeixisClarity,
  aiHeadingBodyAlignment, aiServiceNameInText,
} from './ai/text-quality.js';
import {
  aiEmphasisPriorityMatch,
  aiCtaPlacementQuality, aiErrorMessageSpecificity,
  aiStateFeedback, aiFlowResumeClarity, aiInputStateVisibility,
} from './ai/visual-usability.js';
// ガイドライン参照型 AI ルール (temp_guide/*.md を system prompt に含める)
import aiLogoRegulation from './ai/logo-regulation.js';
import aiBrandGuideline from './ai/brand-guideline.js';

export const deterministicRules = [
  llmsTxtPresent, llmsTxtMinContent, robotsTxt, canonical, ogRequired,
  landmarks, sectionArticleHeading, singleMain, singleH1, headingHierarchy, thScope, divRatio,
  jsonLdPresent, jsonLdSyntax, jsonLdContextType, breadcrumbList,
  domTextVolume, cssGeneratedText, tableDlUsage, imageTextAlternative, langAttribute,
  imgAlt, formLabels, buttonAccessibleName, buttonVsAnchor, interactiveAriaState, linkTextQuality,
  headInlineSize, htmlTotalSize,
  perfLcp, perfCls, perfTbt, perfTtfb,
  linksBroken, linksRedirectChains, linksUnreachable,
  // Phase 1: 新メインカテゴリの機械判定ルール
  infoSpecificSectionLabels,
  textSentenceLength, textNgWords,
  usabilityCtaLabelSpecificity,
  // Phase 2A: 機械判定できる残りルール
  infoHeadingVisualHierarchy, infoRequiredServiceItems,
  textNotationConsistency,
  visualImageQuality, visualContrast, visualUiPatternConsistency, visualDsMargin,
  usabilityCtaPlacement,
];

export const aiRules = [
  aiHeadingSemantics,
  aiMetaDescriptionQuality,
  aiAltTextQuality,
  aiJsonLdPageAlignment,
  aiLinkTextSemantics,
  aiLlmsTxtContentQuality,
  // Phase 2B: 新メインカテゴリの AI ルール群
  aiInfoDuplication, aiSectionSingleTheme, aiBlockSinglePurpose,
  aiParallelItemFormat, aiRoleSeparation,
  aiTargetAudienceClarity, aiDifferentiationEvidence,
  aiImageVsTextPriority, aiDeixisClarity,
  aiHeadingBodyAlignment, aiServiceNameInText,
  aiEmphasisPriorityMatch,
  aiCtaPlacementQuality, aiErrorMessageSpecificity,
  aiStateFeedback, aiFlowResumeClarity, aiInputStateVisibility,
  // ガイドライン参照型 (temp_guide/*.md を system prompt に含む)
  aiLogoRegulation, aiBrandGuideline,
];

// ビジュアルも他カテゴリと同様に自動検知する (一括 manualOnly 化は撤回)。
// 自動判定が困難な個別ルール (visual/ds-margin) のみ各定義で manualOnly: true を持つ。
// 表示面では「ビジュアル項目は pass も含め全件リスト表示」を frontend 側で担保する。

/**
 * allRules は AI_EVALUATION_ENABLED の有無で切替。
 * ランタイムに env を読むため、runner.js から呼ばれる時点の env を反映する。
 */
export function getRules({ includeAi } = {}) {
  const ai = includeAi ?? (process.env.AI_EVALUATION_ENABLED === 'true');
  return ai ? [...deterministicRules, ...aiRules] : deterministicRules;
}

