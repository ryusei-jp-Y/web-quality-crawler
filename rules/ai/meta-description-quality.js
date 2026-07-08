import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたはSEO/LLMO最適化の専門家です。meta description がページの内容を正確に要約しているかを評価してください。

評価観点:
1. メタ description の文章が自然で、検索結果でクリックされやすいか
2. ページ内容(title, h1, body テキストの一部)と整合しているか
3. キーワード詰め込み・誇張表現がないか
4. 具体性があるか (「最高のサービスです」のような曖昧表現は減点)`;

const SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'integer', description: '0-100' },
    summary: { type: 'string' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['issue', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'problems'],
  additionalProperties: false,
};

export default {
  id: 'ai/meta-description-quality',
  name: 'meta description の意味的品質 (AI)',
  category: 'llmo',
  severity: 'major',
  weight: 3,
  fix: 'meta description はページ内容を正確に要約し、具体的な訴求を含めてください。',
  aiRule: true,
  async check({ $, url }) {
    const desc = $('head > meta[name="description"]').attr('content')?.trim() ?? '';
    const title = $('head > title').text().trim();
    const h1 = $('h1').first().text().trim();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 1500);

    if (!desc) return { passed: true, message: '(meta description 未設定のため AI 評価スキップ)' };

    const userPrompt = `URL: ${url}
title: ${title}
h1: ${h1}
meta description (${desc.length}文字):
"${desc}"

body冒頭 (最大1500文字):
${bodyText}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/meta-description-quality',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = [{
      selector: 'head > meta[name="description"]',
      snippet: `<meta name="description" content="${desc}">`,
      context: '',
      current: desc,
      issues: result.problems,
    }];
    return {
      passed: false,
      message: result.summary,
      offenders,
      offendersTotal: 1,
      offendersTruncated: false,
      aiScore: result.score,
    };
  },
};
