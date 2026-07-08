import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileCache } from './cache.js';
import { tracker } from './cost-tracker.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULE_CACHE_DIR = resolve(__dirname, '..', '..', 'public', 'ai-cache', 'rules');

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

const ruleCache = new FileCache(RULE_CACHE_DIR);

// 全 AI ルールで共通の評価フレームワーク。
// Anthropic Prompt Caching の最低トークン (sonnet/opus 1024 / haiku 2048) を
// 確実に超えるサイズで構成し、cache_control: 'ephemeral' を付与することで
// 2 回目以降の呼び出しでこの部分のコストが ~90% 削減される。
// ルール固有の system prompt は cache_control なしで個別に追加する。
const SHARED_FRAMEWORK = `あなたは Web サイト品質評価の専門家です。
企業やサービスのブランドサイトの品質を、情報設計・テキスト品質・ビジュアル・操作のしやすさ・
アクセシビリティ・SEO/AI フレンドリーの観点から評価します。

## 評価の基本姿勢
- ユーザーが欲しい情報 (料金 / 機能 / 対象ユーザー / 信頼性) に最短でたどり着けるか
- AI 検索エンジン (ChatGPT / Perplexity / Gemini 等) が「このサービスは何か」「料金は」
  「機能は」「向いている人は」等の質問に正確に答えやすい構造になっているか
- HTML テキストとして情報が記述されており、画像 / meta / alt のみに依存していないか
- 表記の正確性と一貫性 (サービス正式名称、長音記号、送り仮名)
- WCAG 2.1 AA 相当のアクセシビリティ
- ブランドガイドラインに沿ったカラー / フォント / ロゴ運用

## 出力形式 (JSON Schema 厳守)
評価結果は必ず以下の構造で返してください:
{
  "passed": boolean,             // 90 点以上なら true、それ未満は false
  "score": 0-100 の整数,
  "summary": "全体所感を 1〜2 文で",
  "issues": [
    {
      "location": "セクション名 / 見出し / セレクタ等の特定情報",
      "quote": "該当テキスト抜粋 (60 字以内、無ければ省略可)",
      "problem": "何が問題か (1 文)",
      "suggestion": "どう書き換えるべきか (具体的に 1〜2 文)"
    }
  ]
}

## スコア配分の目安
- 90-100 点 (passed=true): 観点を満たしており、改善優先度は低い
- 70-89 点 (passed=false): 一部に改善余地あり、現状でも機能はする
- 50-69 点 (passed=false): 多くのユーザーが不便を感じる中程度の問題が複数ある
- 0-49 点 (passed=false): ユーザーがサービスを正しく理解 / 利用できない致命的問題

## location / quote / suggestion の書き方
- location: セクション見出しテキスト (例: "料金プラン") か HTML 要素の指示 (例: "h2#pricing")
  どちらでも可。後続の修正担当が直接 DOM 上で該当箇所を見つけられる粒度で。
- quote: ページ上の実テキストをそのまま 60 字以内で抜粋。記号や絵文字も含めて転記する。
  画像内テキストは引用しない (HTML として取れていない箇所は問題そのもの)。
- suggestion: 抽象的助言 (NG: 「もっと具体的に書きましょう」) ではなく
  具体的な書き換え例を提示 (OK: 「『最短 3 分で登録完了』のように所要時間を明記する」)。
  既存テキストとの差分が明確になるよう心がける。

## 評価の前提
- 対象は日本語サイト
- ターゲット読者はサービスの見込み顧客 (個人 / 法人 両方を含み、エンジニアもいれば
  はじめてサーバーを契約する人もいる)
- サービスの正式名称・正式提供元の表記は対象ブランドのガイドライン (config/brands/<id>/) に従う
- サービス名は省略しない正式名称を推奨
- 対象 URL によって主目的が異なる (申込ページ / 機能紹介 / 料金比較 / お知らせ等)

## よくある減点パターン
1. 重要情報 (料金 / 機能 / 注意事項) が画像内テキストのみで HTML テキストとして取得不可
2. 抽象的見出し (魅力 / こだわり / ポイント / おすすめ / 特徴) のみで内容が想像できない
3. 同じメリット / 訴求が複数セクションでほぼ同内容で繰り返されている
4. CTA 文言が単独で意味が通らない (こちら / 詳細 / OK / 次へ / もっと見る)
5. 表記揺れの混在 (サーバ vs サーバー、申込 vs お申し込み、ござます 等のタイポ)
6. 見出しと本文の対応が不明瞭 (見出し「特徴」+ 本文「この点が強みです」のような曖昧ペア)
7. ターゲットが明示されない、ユースケース説明が無いため AI が誰向けか答えられない
8. 差別化ポイントが根拠数値なしのスローガンのみで信憑性が伝わらない
9. 並列要素 (料金プランカード等) で項目・順序・表現が揃っておらず比較しづらい
10. 1 つのカード / アラートに複数の主張 (機能説明 + 価格訴求 + 事例) が同居している

これらの観点を踏まえ、続く Rule 固有の評価指示に従って判定してください。
ルール固有の指示が SHARED_FRAMEWORK と矛盾する場合はルール固有指示を優先します。`;

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

// SHARED_FRAMEWORK の指紋。フレームワーク変更時にローカル file cache を一斉無効化する。
const SHARED_FRAMEWORK_VERSION = createHash('sha256').update(SHARED_FRAMEWORK).digest('hex').slice(0, 8);

function keyFor({ ruleId, systemPrompt, userPrompt }) {
  return createHash('sha256')
    .update(`${SHARED_FRAMEWORK_VERSION} ${ruleId} ${systemPrompt} ${userPrompt}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * AI ルール評価共通関数。キャッシュヒット時は API を呼ばずに保存結果を返す。
 * @returns 構造化出力（schema に従う）
 */
export async function evaluateWithAi({
  ruleId,
  systemPrompt,
  userPrompt,
  schema,
  model,
  maxTokens,
}) {
  const key = keyFor({ ruleId, systemPrompt, userPrompt });
  const cachedEntry = await ruleCache.get(key);
  if (cachedEntry) {
    tracker.record({ tag: `rule:${ruleId}`, model: cachedEntry.model, usage: cachedEntry.usage, cached: true });
    return cachedEntry.result;
  }

  const client = getClient();
  const theModel = model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;
  const theMax = Number(maxTokens ?? process.env.AI_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);

  logger.debug(`[ai-rule] call ${ruleId} (model=${theModel})`);
  const response = await client.messages.create({
    model: theModel,
    max_tokens: theMax,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    system: [
      // 全 AI ルール共通の評価フレームワーク (cache 対象、~1500 トークン)
      { type: 'text', text: SHARED_FRAMEWORK, cache_control: { type: 'ephemeral' } },
      // ルール固有の評価指示 (cache 非対象、ルール毎に異なる)
      { type: 'text', text: systemPrompt },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error(`max_tokens reached (max=${theMax}) — JSON が切れました。AI_MAX_TOKENS を大きくしてください`);
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`no text block (stop=${response.stop_reason})`);
  let result;
  try {
    result = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`JSON parse error (${err.message}) / raw head: ${textBlock.text.slice(0, 200)}`);
  }

  const usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };
  tracker.record({ tag: `rule:${ruleId}`, model: theModel, usage, cached: false });

  await ruleCache.set(key, { result, model: theModel, usage, generatedAt: new Date().toISOString() });
  return result;
}
