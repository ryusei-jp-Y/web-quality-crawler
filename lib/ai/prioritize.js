import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileCache } from './cache.js';
import { tracker } from './cost-tracker.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = resolve(__dirname, '..', '..', 'public', 'ai-cache', 'prioritize');
const cache = new FileCache(CACHE_DIR);

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
// 失敗 audit を AI に送信する上限。多すぎると max_tokens で truncate されたり
// プロンプト/レスポンスバッファが膨らんで Node の V8 ヒープを圧迫する。
// severity (critical > major > minor) と weight でランキングし上位 N 件を採用。
const MAX_FAILED_AUDITS = Number(process.env.PRIORITIZE_MAX_AUDITS ?? 20);

const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 };

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

const SYSTEM_PROMPT = `あなたはフロントエンド品質 (SEO / LLMO / アクセシビリティ / セマンティックHTML / パフォーマンス) の専門コンサルタントです。

与えられる情報:
- 対象ページの URL と現在の総合スコア / カテゴリ別重み
- そのページで検知された違反ルール一覧 (id, name, category, severity, weight, 違反箇所数)

あなたのタスク:
限られた工数で総合スコアを最も改善できる「優先対応 Top 3 〜 5」を選び、以下を JSON で返してください:
- priorities: 優先度順のリスト
  - ruleId: 対象ルールの id (必ず提示されたリストのもの)
  - reason: なぜこれを優先すべきかを日本語 1〜2 文で
  - estimatedGain: 総合スコア上で期待される改善幅 (整数 pt, 現実的な見積もり)
  - effort: 想定工数 ("low" | "medium" | "high")
- summary: 全体戦略を日本語 1〜2 文で (どこから着手すべきかの方針)

判断基準:
- カテゴリ重み × severity × weight × 違反数の組み合わせを重視
- クイックウィン (effort=low かつ影響大) を上位に
- 同じカテゴリに偏らず、バランスよく上げられる順を推奨
- 対応難易度が極端に高い項目 (例: サイト全体の再設計) は下位に回す`;

const SCHEMA = {
  type: 'object',
  required: ['priorities', 'summary'],
  additionalProperties: false,
  properties: {
    priorities: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ruleId', 'reason', 'estimatedGain', 'effort'],
        additionalProperties: false,
        properties: {
          ruleId: { type: 'string' },
          reason: { type: 'string' },
          estimatedGain: { type: 'integer', description: '期待スコア改善幅 (pt)' },
          effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    summary: { type: 'string' },
  },
};

// 失敗 audit を severity (critical > major > minor) + weight でランキングし
// 上位 N 件のみを返す。AI へ渡すプロンプト肥大化と max_tokens 切れを防ぐ。
function pickTopFailed(violations, limit = MAX_FAILED_AUDITS) {
  const failed = violations.filter((v) => !v.passed);
  failed.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9;
    const sb = SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return (b.weight ?? 0) - (a.weight ?? 0);
  });
  return failed.slice(0, limit);
}

function buildUserPrompt({ siteName, url, score, threshold, weights, violations }) {
  const failed = pickTopFailed(violations);
  const totalFailedCount = violations.filter((v) => !v.passed).length;
  const failedSection = failed.map((v) => {
    const parts = [
      `- id: \`${v.id}\``,
      `  name: ${v.name}`,
      `  category: ${v.category}`,
      `  severity: ${v.severity}`,
      `  weight: ${v.weight}`,
    ];
    if (v.offendersTotal != null) parts.push(`  offenders: ${v.offendersTotal}`);
    if (v.message) parts.push(`  message: ${v.message}`);
    return parts.join('\n');
  }).join('\n');

  const truncatedNote = totalFailedCount > failed.length
    ? `\n※ 失敗 ${totalFailedCount} 件のうち severity / weight 上位 ${failed.length} 件を提示しています。`
    : '';

  return `# 対象ページ
- サイト: ${siteName ?? '(名称なし)'}
- URL: ${url ?? '(URLなし)'}
- 現在の総合スコア: ${score ?? '(不明)'} / 100
- 目標しきい値: ${threshold ?? 80}
- カテゴリ重み: ${JSON.stringify(weights ?? {})}

# 未達のルール (${failed.length} 件${truncatedNote ? ' / 全体 ' + totalFailedCount + ' 件中' : ''})
${failedSection}${truncatedNote}

上記を踏まえ、優先対応 Top 3〜5 を JSON で返してください。`;
}

function keyFor({ url, violations, score }) {
  const ids = violations.filter((v) => !v.passed).map((v) => v.id).sort().join(',');
  return createHash('sha256').update(`${url}|${score}|${ids}`).digest('hex').slice(0, 32);
}

export async function generatePriorities({ siteName, url, score, threshold, weights, violations }) {
  const failed = (violations ?? []).filter((v) => !v.passed);
  if (failed.length === 0) {
    return {
      priorities: [],
      summary: 'すべてのルールが pass 済みです。現状維持を推奨します。',
      cached: false,
      model: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const key = keyFor({ url, violations, score });
  const cached = await cache.get(key);
  if (cached) {
    tracker.record({ tag: 'prioritize', model: cached.model, usage: cached.usage, cached: true });
    return { ...cached, cached: true };
  }

  if (!isAiAvailable()) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = getClient();
  const model = process.env.AI_MODEL ?? DEFAULT_MODEL;
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);

  const sentToAi = pickTopFailed(violations).length;
  logger.info(`[ai-prioritize] calling Claude (model=${model}, failed=${failed.length} / sent to AI=${sentToAi}, max_tokens=${maxTokens})`);
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: buildUserPrompt({ siteName, url, score, threshold, weights, violations }) }],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error(`max_tokens reached (max=${maxTokens})`);
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`no text block (stop=${response.stop_reason})`);
  const parsed = JSON.parse(textBlock.text);

  // 返された ruleId が元リストに無い場合は除外
  const validIds = new Set(violations.map((v) => v.id));
  parsed.priorities = (parsed.priorities ?? []).filter((p) => validIds.has(p.ruleId)).slice(0, 5);

  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };
  tracker.record({ tag: 'prioritize', model, usage, cached: false });

  const payload = {
    priorities: parsed.priorities,
    summary: parsed.summary ?? '',
    model,
    usage,
    generatedAt: new Date().toISOString(),
  };
  await cache.set(key, payload);
  return { ...payload, cached: false };
}
