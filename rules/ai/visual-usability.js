// ビジュアル・操作のしやすさカテゴリの AI 判定ルール群。
import { createAiRule, sampleBodyText } from '../../lib/ai/create-rule.js';

// =========================================================================
// Visual
// =========================================================================

export const aiEmphasisPriorityMatch = createAiRule({
  id: 'ai/emphasis-priority-match',
  name: '強調と情報重要度の一致 (AI)',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'minor',
  weight: 2,
  fix: '主要 CTA が最も目立つ色とサイズで配置され、エラーメッセージが入力補足より強く、重要ではないバッジやアイコンが主情報より目立たないように調整してください。',
  systemPrompt: `ページのテキスト一覧とサイズ・色情報から、視覚的強調が情報の重要度と一致しているかを推定してください。
観点:
- 主要 CTA が最も目立つか (色・サイズ)
- エラーメッセージが入力補足より強く表示されているか
- 装飾目的の見出しや過剰なバッジが重要情報の視認性を下げていないか
judgement: 齟齬 0 → pass / 1-2 → score 60-80 / 3+ → score <50`,
  buildUserPrompt: ({ visualData, url }) => {
    const samples = visualData?.textSamples || [];
    if (samples.length === 0) return null;
    // フォントサイズ降順で上位 30 件を渡す (目立っている順)
    const top = [...samples].sort((a, b) => (b.fontSize * (b.fontWeight >= 700 ? 1.2 : 1)) - (a.fontSize * (a.fontWeight >= 700 ? 1.2 : 1))).slice(0, 30);
    return `URL: ${url}\n\n視覚的に目立っている要素 (font-size + weight 順):\n${top.map((s, i) => `[${i + 1}] <${s.tag}> size=${Math.round(s.fontSize)}px weight=${s.fontWeight} color=${s.color} bg=${s.bgColor}\n    text: ${s.text}`).join('\n')}`;
  },
});

// =========================================================================
// Usability
// =========================================================================

const USABILITY_COMMON = {
  category: 'usability',
  mainCategory: 'usability',
  severity: 'major',
  weight: 3,
};

export const aiCtaPlacementQuality = createAiRule({
  ...USABILITY_COMMON,
  id: 'ai/cta-placement-quality',
  name: 'CTA 配置の質 (AI)',
  fix: 'CTA 直前に行動判断のための説明・価値訴求・根拠を置き、単独配置を避け、文言と直前訴求を整合させ、主 CTA が副 CTA より視覚優位になるよう配置してください。',
  systemPrompt: `ページの CTA 配置を、次の 8 観点で評価してください (フッター共通ナビは対象外):
1. CTA 直前に説明/価値訴求/根拠がある
2. サービス内容・便益の説明より前に CTA が単独配置されていない
3. 主要説明セクション直後または不安解消セクション直後に CTA
4. 画面内で CTA が他要素に埋もれていない
5. 文言と直前訴求が整合
6. 数量が適正 (少なすぎず/多すぎず)
7. 主 CTA が副 CTA より視覚優位
8. CTA 周辺に過剰な離脱導線がない
judgement: 7-8 満たす → pass / 5-6 → score 60-80 / 4 以下 → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const ctas = [];
    $('button, a[class*="btn"], a[class*="button"], a[class*="cta"], input[type="submit"]').each((_, el) => {
      if (ctas.length >= 20) return;
      if ($(el).closest('footer, [role="contentinfo"], .footer').length > 0) return;
      const text = $(el).text().trim() || $(el).attr('value') || '';
      if (!text) return;
      // 直前要素のテキスト (説明/価値訴求の有無)
      const prev = $(el).prev().text().replace(/\s+/g, ' ').trim().slice(0, 200);
      ctas.push({ text: text.slice(0, 80), prevText: prev || '(なし)' });
    });
    if (ctas.length === 0) return null;
    return `URL: ${url}\n\nページ固有 CTA 一覧 (フッター除外):\n${ctas.map((c, i) => `[${i + 1}] CTA: "${c.text}"\n  直前: ${c.prevText}`).join('\n\n')}`;
  },
});

export const aiErrorMessageSpecificity = createAiRule({
  ...USABILITY_COMMON,
  id: 'ai/error-message-specificity',
  name: 'エラーメッセージの具体性 (AI)',
  fix: '「エラーが発生しました」「入力に誤りがあります」等の総称でなく、「電話番号は半角数字で入力してください」のように「何が問題か」+「どう修正すればよいか」を対象入力欄の近くに表示してください。',
  systemPrompt: `フォームのエラーメッセージが「何が問題か」と「どう修正すればよいか」の両方を示しているか判定してください。
〇例: 「パスワードは 8 文字以上で入力してください」「電話番号は半角数字で」
×例: 「エラーが発生しました」「入力に誤りがあります」「その項目を確認してください」
judgement: フォーム要素無し → N/A (pass) / 曖昧メッセージ 0 → pass / 1-2 → score 60-80 / 3+ → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const errorCandidates = [];
    // エラー表示要素候補: class/id に error / alert / validation / invalid を含む要素
    $('[class*="error"], [class*="alert"], [class*="invalid"], [role="alert"], [aria-live]').each((_, el) => {
      if (errorCandidates.length >= 20) return;
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (!text || text.length < 5) return;
      errorCandidates.push(text.slice(0, 200));
    });
    const formCount = $('form').length;
    const inputCount = $('input, textarea, select').length;
    if (formCount === 0 && inputCount < 3) return null;
    if (errorCandidates.length === 0) {
      // フォームはあるがエラー要素が発見できないケースも AI に判断させる
      return `URL: ${url}\n\nフォーム数: ${formCount}, 入力要素: ${inputCount}\n\nエラーメッセージ要素: 発見できず (静的には表示されない、送信後に動的生成される可能性あり)\n→ フォーム実装の慣習から、エラー表示の仕組みが適切かを推定してください。`;
    }
    return `URL: ${url}\n\nフォーム数: ${formCount}, 入力要素: ${inputCount}\n\nエラーメッセージ候補:\n${errorCandidates.map((t, i) => `[${i + 1}] ${t}`).join('\n')}`;
  },
});

export const aiStateFeedback = createAiRule({
  ...USABILITY_COMMON,
  id: 'ai/state-feedback',
  name: '状態フィードバック (入力中/送信中/完了) (AI)',
  severity: 'minor',
  weight: 2,
  fix: '送信中は「送信しています…」表示で二重送信を防ぎ、完了後は「登録が完了しました。確認メールをご確認ください」のように次ステップを案内してください。',
  systemPrompt: `フォーム操作の各状態 (入力中 / 送信中 / 完了) で次アクションが明確かを判定してください。
〇例: ボタン disable + 「送信中…」 / 完了画面に次ステップの明示
×例: ボタン押下後に無反応 / 完了後に次にやることが書かれていない
judgement: フォーム無し → N/A (pass) / 明確 → pass / 一部曖昧 → score 60-80 / 全く無し → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const formCount = $('form').length;
    if (formCount === 0) return null;
    const submitBtns = [];
    $('button[type="submit"], input[type="submit"]').each((_, el) => {
      const t = $(el).text().trim() || $(el).attr('value') || '';
      if (t) submitBtns.push(t.slice(0, 80));
    });
    const body = sampleBodyText($, { maxChars: 3000 });
    return `URL: ${url}\n\nフォーム数: ${formCount}\nSubmit ボタン文言: ${submitBtns.join(' / ') || '(なし)'}\n\n本文サンプル (完了メッセージの有無を推定):\n${body}`;
  },
});

export const aiFlowResumeClarity = createAiRule({
  ...USABILITY_COMMON,
  id: 'ai/flow-resume-clarity',
  name: 'フロー再訪時の現在地・次アクション (AI)',
  severity: 'minor',
  weight: 2,
  fix: 'ステップ表示「3/5: お届け先入力」等で現在地を示し、再訪時も「次は本人確認書類をアップロードしてください」のように次アクションが画面内情報だけで分かるようにしてください。',
  systemPrompt: `複数ステップのフロー (申込、登録など) が途中離脱・再訪しても、現在地と次アクションが画面上の情報だけで分かるかを判定してください。
観点:
- ステップ表示 (例: 3/5) の有無
- 再訪時の次アクション明示
- 確認画面での選択肢 (「修正する」「この内容で送信する」)
judgement: フォームまたはステップ UI 無し → N/A (pass) / 明確 → pass / 一部 → score 60-80 / 無し → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const formCount = $('form').length;
    const stepIndicators = $('[class*="step"], [class*="progress"], ol[class*="flow"], nav[class*="breadcrumb"]').length;
    if (formCount === 0 && stepIndicators === 0) return null;
    const stepTexts = [];
    $('[class*="step"], [class*="progress"]').each((_, el) => {
      if (stepTexts.length >= 10) return;
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t) stepTexts.push(t.slice(0, 150));
    });
    return `URL: ${url}\n\nフォーム数: ${formCount}\nステップ指標要素数: ${stepIndicators}\n\nステップ系要素のテキスト:\n${stepTexts.map((t, i) => `[${i + 1}] ${t}`).join('\n') || '(なし)'}`;
  },
});

export const aiInputStateVisibility = createAiRule({
  ...USABILITY_COMMON,
  id: 'ai/input-state-visibility',
  name: '入力状態の可視性 (AI)',
  severity: 'minor',
  weight: 2,
  fix: '入力済みフォーム値の保持、選択済みプラン/オプションの画面表示、完了ステップのチェックマーク等で、ユーザーの記憶に依存せず状態が見える UI にしてください。',
  systemPrompt: `フォームや選択 UI で、入力途中・選択済み・完了/未完了の状態が画面上で見えるかを判定してください。
観点:
- 入力済み値の保持
- 選択済みプラン/オプションの可視化
- 完了済みステップのチェック、未完了の未対応表示
judgement: フォーム/選択 UI 無し → N/A (pass) / 見える → pass / 一部 → score 60-80 / 見えない → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const formCount = $('form').length;
    const checkboxRadio = $('input[type="checkbox"], input[type="radio"]').length;
    if (formCount === 0 && checkboxRadio < 2) return null;
    // selected / checked / current 系の class を持つ要素数
    const activeIndicators = $('[class*="selected"], [class*="active"], [class*="current"], [class*="complete"]').length;
    const body = sampleBodyText($, { maxChars: 2500 });
    return `URL: ${url}\n\nフォーム数: ${formCount}\nチェックボックス/ラジオ: ${checkboxRadio}\nselected/active/current 系要素: ${activeIndicators}\n\n本文サンプル:\n${body}`;
  },
});
