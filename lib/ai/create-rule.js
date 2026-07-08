import { evaluateWithAi } from './evaluate.js';

// AI 判定ルールの boilerplate を削減するファクトリ。
// 各ルールは systemPrompt / schema / buildUserPrompt を渡すだけで完結する。
//
// schema は Anthropic structured output の JSON Schema を想定。
// 最低限 { passed, score, summary, issues[] } の形に揃えておくと
// UI の offenders 表示が共通の処理で回せる。
export const DEFAULT_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'integer' },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '該当箇所のセレクタ・見出し・引用など' },
          quote: { type: 'string', description: '該当テキスト抜粋 (最大 120 字)' },
          problem: { type: 'string', description: '何が問題か' },
          suggestion: { type: 'string', description: 'どう直すか' },
        },
        required: ['location', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

/**
 * @param {object} def
 * @param {string} def.id - 'ai/xxx' 形式
 * @param {string} def.name
 * @param {string} def.category - sub category
 * @param {string} def.mainCategory
 * @param {'critical'|'major'|'minor'} def.severity
 * @param {number} def.weight
 * @param {string} def.fix
 * @param {string} [def.systemPrompt] - 静的 system prompt
 * @param {(pageData: object) => string} [def.buildSystemPrompt] - 動的 system prompt
 *   (ブランドガイドライン等を pageData から差し込みたい場合に使用、systemPrompt より優先)
 * @param {object} [def.schema] - カスタムスキーマ (省略で DEFAULT_SCHEMA)
 * @param {(pageData: object) => string | null} def.buildUserPrompt - null なら対象外でスキップ
 */
export function createAiRule(def) {
  const schema = def.schema ?? DEFAULT_SCHEMA;
  if (!def.systemPrompt && !def.buildSystemPrompt) {
    throw new Error(`createAiRule(${def.id}): systemPrompt または buildSystemPrompt のどちらかが必須`);
  }
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    mainCategory: def.mainCategory,
    severity: def.severity,
    weight: def.weight,
    fix: def.fix,
    aiRule: true,
    async check(pageData) {
      const userPrompt = def.buildUserPrompt(pageData);
      if (!userPrompt) return { passed: true, message: '評価対象なし (スキップ)' };

      const systemPrompt = def.buildSystemPrompt
        ? def.buildSystemPrompt(pageData)
        : def.systemPrompt;

      const result = await evaluateWithAi({
        ruleId: def.id,
        systemPrompt,
        userPrompt,
        schema,
      });

      if (result.passed) {
        return { passed: true, message: result.summary, aiScore: result.score };
      }

      const offenders = (result.issues || []).map((i) => ({
        selector: i.location || '',
        snippet: i.quote ? `"${i.quote.slice(0, 160)}"` : '',
        context: '',
        aiProblem: i.problem,
        aiSuggestion: i.suggestion,
      }));
      return {
        passed: false,
        message: result.summary,
        offenders,
        offendersTotal: offenders.length,
        offendersTruncated: false,
        aiScore: result.score,
      };
    },
  };
}

// 本文テキストを要約サンプリング (トークン節約) — 長すぎるページは頭+末尾抜粋
export function sampleBodyText($, { maxChars = 6000 } = {}) {
  const body = $('body').clone();
  body.find('script, style, noscript').remove();
  const text = body.text().replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(text.length - Math.floor(maxChars * 0.3));
  return `${head}\n…(中略)…\n${tail}`;
}

// 見出し一覧抽出 (level付き)
export function extractHeadings($, { max = 80 } = {}) {
  const out = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    if (out.length >= max) return;
    out.push({
      level: Number(el.tagName.substring(1)) || Number(el.name?.substring(1)) || 2,
      text: $(el).text().trim().slice(0, 160),
    });
  });
  return out;
}
