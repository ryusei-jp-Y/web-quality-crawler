import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import { cacheKey, globalCache } from './cache.js';
import { tracker } from './cost-tracker.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 1500;

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  // timeout: ハング応答での無限待ちを防止 (既定 10 分は長すぎ)
  // maxRetries: 失敗時の自動リトライを 1 に制限 (既定 2、メモリ leak 抑制)
  cachedClient = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return cachedClient;
}

export function isAiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `あなたはフロントエンド品質 (SEO / LLMO / アクセシビリティ / セマンティックHTML / HTML軽量化) の専門家です。

与えられる情報:
- 検知されたルール (id, name, category, severity)
- そのルールが静的に返すメッセージ / 一般的な修正ガイダンス
- 実際に違反している具体的な DOM 要素 (selector + outerHTML 抜粋 + 周辺テキスト)

あなたのタスク:
1. この特定ページのコンテキストに即した「何が問題か」を 1〜2 文で説明する
2. 提示された違反箇所に対する **具体的な修正コード例** を最大 3 件示す (before / after)
3. 同じ違反を繰り返さないための運用的・技術的なアドバイスを 1〜2 行で書く

出力ルール:
- Markdown で記述 (### 見出し・\`\`\`html\`\`\` コードブロック使用可)
- 冗長な前置きや謝辞は書かない
- 出力は日本語・簡潔
- 推測に過ぎない内容には「(推測)」と付与する
- 全体 600 字程度に抑える`;

function buildUserPrompt({ rule, offenders, siteName, url }) {
  const offendersSection = offenders.slice(0, 5).map((o, i) => {
    const lines = [`### 箇所${i + 1}`];
    if (o.selector) lines.push(`selector: \`${o.selector}\``);
    if (o.snippet) lines.push(`snippet:\n\`\`\`html\n${o.snippet}\n\`\`\``);
    if (o.context) lines.push(`周辺テキスト: ${o.context}`);
    const extra = [];
    if (o.alt !== undefined) extra.push(`alt="${o.alt}"`);
    if (o.linkText) extra.push(`linkText="${o.linkText}"`);
    if (o.href) extra.push(`href="${o.href}"`);
    if (o.attribute) extra.push(`${o.attribute}="${o.invalidValue}"`);
    if (o.from && o.to) extra.push(`${o.from} → ${o.to}`);
    if (o.text) extra.push(`text="${o.text}"`);
    if (o.parseError) extra.push(`parseError: ${o.parseError}`);
    if (extra.length) lines.push(`extra: ${extra.join(' | ')}`);
    return lines.join('\n');
  }).join('\n\n');

  return `サイト: ${siteName ?? '(名称なし)'}
URL: ${url ?? '(URLなし)'}

## 違反ルール
- id: \`${rule.id}\`
- name: ${rule.name}
- category: ${rule.category}
- severity: ${rule.severity}
- 検知メッセージ: ${rule.message ?? '(なし)'}
- 一般的な修正ガイダンス: ${rule.fix ?? '(なし)'}

## 該当箇所 (最大5件)
${offendersSection}

上記の情報に基づいて、このページ特有の修正提案をお願いします。`;
}

/**
 * AI に修正提案を依頼。キャッシュヒット時は API を呼ばない。
 * @returns {Promise<{suggestion, cached, model, usage?}>}
 */
export async function generateSuggestion({ rule, offenders = [], siteName, url }) {
  const key = cacheKey({ ruleId: rule.id, url, offenders });

  const cached = await globalCache.get(key);
  if (cached) {
    logger.debug(`[ai-suggest] cache hit: ${rule.id}`);
    tracker.record({ tag: `suggest:${rule.id}`, model: cached.model, usage: cached.usage, cached: true });
    return { ...cached, cached: true };
  }

  if (!isAiAvailable()) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const client = getClient();
  const model = process.env.AI_MODEL ?? DEFAULT_MODEL;
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);

  logger.info(`[ai-suggest] calling Claude for rule ${rule.id} (model=${model})`);
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildUserPrompt({ rule, offenders, siteName, url }) }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const payload = {
    suggestion: text,
    model,
    usage,
    generatedAt: new Date().toISOString(),
    ruleId: rule.id,
  };

  tracker.record({ tag: `suggest:${rule.id}`, model, usage, cached: false });
  await globalCache.set(key, payload);
  return { ...payload, cached: false };
}
