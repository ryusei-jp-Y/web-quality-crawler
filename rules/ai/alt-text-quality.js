import { evaluateWithAi } from '../../lib/ai/evaluate.js';

const SYSTEM_PROMPT = `あなたはWebアクセシビリティの専門家です。画像の alt 属性が意味的に適切かを評価してください。

評価観点:
1. 意味のある説明か (「image1」「photo」などの曖昧な値は減点)
2. ファイル名そのまま (「DSC_0001.jpg」等) を流用していないか
3. 「〜の画像」「画像:〜」など冗長表現を含まないか
4. 装飾画像には空の alt="" が正しく使われているか
5. 周辺テキストとの整合性

問題のある上位10件までを issues に挙げてください。`;

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
          src: { type: 'string' },
          alt: { type: 'string' },
          problem: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['src', 'alt', 'problem', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['passed', 'score', 'summary', 'issues'],
  additionalProperties: false,
};

const MAX_IMAGES = 30;

export default {
  id: 'ai/alt-text-quality',
  name: 'alt属性の意味的品質 (AI)',
  category: 'a11y',
  severity: 'major',
  weight: 3,
  fix: 'alt 属性はファイル名やテンプレート文字列ではなく、画像の内容を正確に説明するテキストにしてください。',
  aiRule: true,
  async check({ $, url }) {
    const imgs = $('img').toArray().filter((el) => {
      const role = $(el).attr('role');
      const ariaHidden = $(el).attr('aria-hidden');
      return role !== 'presentation' && role !== 'none' && ariaHidden !== 'true';
    });
    const withAlt = imgs.filter((el) => $(el).attr('alt') !== undefined);
    if (withAlt.length === 0) return { passed: true };

    const sample = withAlt.slice(0, MAX_IMAGES).map((el) => ({
      src: ($(el).attr('src') ?? '').slice(0, 200),
      alt: $(el).attr('alt') ?? '',
      context: $(el).parent().text().trim().replace(/\s+/g, ' ').slice(0, 100),
    }));

    const userPrompt = `URL: ${url}
画像総数: ${imgs.length} / alt付き: ${withAlt.length}${withAlt.length > MAX_IMAGES ? ` (最初の${MAX_IMAGES}件を評価)` : ''}

画像リスト:
${sample.map((i, n) => `${n + 1}. src="${i.src}"\n   alt="${i.alt}"\n   周辺: "${i.context}"`).join('\n\n')}`;

    const result = await evaluateWithAi({
      ruleId: 'ai/alt-text-quality',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schema: SCHEMA,
    });

    if (result.passed) return { passed: true, message: result.summary };

    const offenders = (result.issues || []).map((i) => ({
      selector: `img[src="${i.src}"]`,
      snippet: `<img src="${i.src}" alt="${i.alt}">`,
      context: '',
      alt: i.alt,
      src: i.src,
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
