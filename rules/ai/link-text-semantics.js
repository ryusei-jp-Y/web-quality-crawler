import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたはWebアクセシビリティ/UX の専門家です。リンクテキストがリンク先内容を適切に示しているかを評価してください。

評価観点:
1. リンクテキストから遷移先が想像できるか (具体性)
2. 同じテキストで異なる URL を指すリンクが混在していないか (紛らわしさ)
3. 「詳細」「こちら」のような曖昧表現が単独で使われていないか (注: 決定的ルールで明白な NG は検出済み、ここでは**一見具体的だが実は曖昧**なものや**文脈から切り離すと意味不明**なものを拾う)
4. URL そのままを表示していないか (アクセシビリティ上 URL の読み上げは辛い)

問題のある上位10件を issues に列挙してください。`;

const SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'integer', description: '0-100' },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          href: { type: 'string' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['text', 'href', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

const MAX_LINKS = 60;

export default {
  id: 'ai/link-text-semantics',
  name: 'リンクテキストの具体性 (AI)',
  category: 'a11y',
  severity: 'minor',
  weight: 2,
  fix: 'リンクテキストはリンク先の内容・目的が分かる具体的な表現にしてください。',
  aiRule: true,
  async check({ $, url }) {
    const links = $('a').toArray().filter((el) => $(el).attr('href'));
    if (links.length === 0) return { passed: true };

    const sample = links.slice(0, MAX_LINKS).map((el) => ({
      text: $(el).text().trim().slice(0, 100),
      href: ($(el).attr('href') ?? '').slice(0, 200),
    })).filter((l) => l.text.length > 0);

    if (sample.length === 0) return { passed: true };

    const userPrompt = `URL: ${url}
リンク総数: ${links.length}${links.length > MAX_LINKS ? ` (最初の${MAX_LINKS}件を評価)` : ''}

リンク一覧 (text / href):
${sample.map((l, i) => `${i + 1}. "${l.text}" → ${l.href}`).join('\n')}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/link-text-semantics',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = (result.issues || []).map((i) => ({
      selector: 'a',
      snippet: `<a href="${i.href}">${i.text}</a>`,
      context: '',
      linkText: i.text,
      href: i.href,
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
