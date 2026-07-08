import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたは LLMO (Large Language Model Optimization) の専門家です。llms.txt が AI クローラー (ChatGPT/Claude/Perplexity 等) にとって情報密度が十分かを評価してください。

評価観点:
1. サイトの目的・対象読者が明確か
2. 主要コンテンツ/サービスが一覧化され、外部 AI が「何について書かれているか」を即座に理解できるか
3. セクション構成が論理的か (H1 → H2 で適切に区切られているか)
4. 重要 URL が Markdown リンクで記述されているか
5. サイト固有の用語・独自概念が適切に説明されているか
6. 時事情報 (日付/キャンペーン名) が古いまま残っていないか`;

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
          aspect: { type: 'string', description: '問題のある観点(例: 情報密度 / 構造 / 時系列)' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['aspect', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

export default {
  id: 'ai/llms-txt-content-quality',
  name: 'llms.txt の情報密度/構造 (AI)',
  category: 'llmo',
  severity: 'minor',
  weight: 2,
  fix: 'llms.txt にサイトの目的・主要コンテンツ一覧・重要URLを構造的に記述してください。',
  aiRule: true,
  async check({ llmsTxt, url }) {
    if (!llmsTxt.exists || !llmsTxt.content) {
      return { passed: true, message: '(llms.txt 未存在、別ルールで検出済み)' };
    }

    const content = llmsTxt.content.slice(0, 8000);
    const userPrompt = `対象サイト: ${url}

/llms.txt の内容 (最大8KB):
${content}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/llms-txt-content-quality',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = (result.issues || []).map((i) => ({
      selector: '/llms.txt',
      snippet: `# ${i.aspect}`,
      context: '',
      aspect: i.aspect,
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
