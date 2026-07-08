import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたはSEO/アクセシビリティの専門家です。与えられたページの見出し階層(h1〜h6)を評価してください。

評価観点:
1. h1 がページの目的・内容を要約しているか
2. h2 以下の見出しテキストが配下セクションの内容を表しているか
3. 「詳細」「こちら」「もっと見る」など内容を示さない曖昧な見出しがあるか
4. 見出しが広告・装飾テキストとして使われていないか (意味上の乱用)

スコア基準: 90+=優秀 / 50-89=要改善(曖昧見出しや一部不適切) / <50=深刻(意味のある見出しが壊滅)`;

const SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'integer', description: '0-100' },
    summary: { type: 'string', description: '全体の1〜2文サマリ' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
          text: { type: 'string' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['level', 'text', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

const MAX_HEADINGS = 60;

export default {
  id: 'ai/heading-semantics',
  name: '見出しテキストの意味性 (AI)',
  category: 'semantic',
  severity: 'major',
  weight: 3,
  fix: '「詳細」「こちら」等の曖昧な見出しを避け、内容を具体的に示すテキストに書き換えてください。',
  aiRule: true,
  async check({ $, url }) {
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      headings.push({
        tag: el.tagName.toLowerCase(),
        text: $(el).text().trim().slice(0, 200),
      });
    });
    if (headings.length === 0) return { passed: true };

    const sample = headings.slice(0, MAX_HEADINGS);
    const listing = sample.map((h, i) => `${i + 1}. <${h.tag}> ${h.text}`).join('\n');
    const userPrompt = `URL: ${url}
見出し総数: ${headings.length}${headings.length > MAX_HEADINGS ? ` (最初の${MAX_HEADINGS}件を評価)` : ''}

見出し一覧:
${listing}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/heading-semantics',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = (result.issues || []).map((i) => ({
      selector: i.level,
      snippet: `<${i.level}>${i.text}</${i.level}>`,
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
