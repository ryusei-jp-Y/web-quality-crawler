import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたは構造化データ(JSON-LD)の専門家です。ページに含まれる JSON-LD と実際のページ表示内容が整合しているかを評価してください。

評価観点:
1. JSON-LD の name/description/url がページ (title/h1/meta description) と一致しているか
2. 実在しない情報 (古い商品名/終了したキャンペーン等) が JSON-LD に残っていないか
3. スキーマタイプが文脈にふさわしいか (EC ページに Article 等の誤用)
4. BreadcrumbList の内容がページのパンくず表示と一致しているか
5. 必須ではないが推奨される属性の欠落

構文エラーは別ルールで検出するので、ここでは構造の意味論を判定します。`;

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
          scriptIndex: { type: 'integer' },
          type: { type: 'string', description: 'JSON-LD の @type' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['scriptIndex', 'type', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

export default {
  id: 'ai/jsonld-page-alignment',
  name: 'JSON-LDとページ内容の整合性 (AI)',
  category: 'structured',
  severity: 'major',
  weight: 3,
  fix: 'JSON-LD の name/description/url をページ実体 (title/h1/meta description) と揃え、古い情報を除去してください。',
  aiRule: true,
  async check({ $, url }) {
    const scripts = $('script[type="application/ld+json"]').toArray();
    if (scripts.length === 0) return { passed: true, message: '(JSON-LDなし、AI評価スキップ)' };

    const parsed = [];
    scripts.forEach((el, i) => {
      try {
        const data = JSON.parse($(el).html());
        parsed.push({ index: i, data });
      } catch {
        // 構文エラーは別ルールで検出
      }
    });
    if (parsed.length === 0) return { passed: true, message: '(全てのJSON-LDが構文エラー、別ルールで検出済み)' };

    const title = $('head > title').text().trim();
    const h1 = $('h1').first().text().trim();
    const desc = $('head > meta[name="description"]').attr('content')?.trim() ?? '';

    const listing = parsed.map(({ index, data }) => {
      const truncated = JSON.stringify(data, null, 2).slice(0, 800);
      return `## script[${index}]\n\`\`\`json\n${truncated}\n\`\`\``;
    }).join('\n\n');

    const userPrompt = `URL: ${url}
title: ${title}
h1: ${h1}
meta description: ${desc}

検出されたJSON-LD (${parsed.length}件):
${listing}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/jsonld-page-alignment',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = (result.issues || []).map((i) => ({
      selector: `script[type="application/ld+json"]:nth-of-type(${i.scriptIndex + 1})`,
      snippet: `<script type="application/ld+json"><!-- @type: ${i.type} --></script>`,
      context: '',
      scriptIndex: i.scriptIndex,
      jsonldType: i.type,
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
