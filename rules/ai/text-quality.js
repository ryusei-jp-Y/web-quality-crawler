// テキスト品質カテゴリの AI 判定ルール群。
import { createAiRule, sampleBodyText, extractHeadings } from '../../lib/ai/create-rule.js';

const COMMON = {
  category: 'text',
  mainCategory: 'text',
  severity: 'major',
  weight: 2,
};

export const aiImageVsTextPriority = createAiRule({
  ...COMMON,
  id: 'ai/image-vs-text-priority',
  name: '重要情報の本文テキスト化 (AI)',
  fix: '料金・注意事項・申込条件などの重要情報は画像内テキストのみに依存せず、本文にもテキストとして記載してください。alt に書くだけで画面上の本文が空なのは NG。',
  systemPrompt: `ページ上の重要情報 (料金、注意事項、申込条件、フロー説明、機能差分) が画像だけに閉じ込められていないかを判定してください。
〇例: 料金図版と同じ内容が本文テキストや表でも記載されている / alt は補助
×例: 料金が画像のみ / 注意事項が画像のみ / alt にだけ詳細が入っていて本文が空
judgement: 違反 0 → pass / 1-2 → score 50-70 / 3+ → score <50`,
  buildUserPrompt: ({ $, url, title }) => {
    const body = sampleBodyText($, { maxChars: 4500 });
    if (!body) return null;
    const imgs = [];
    $('img').each((_, el) => {
      if (imgs.length >= 30) return;
      const alt = $(el).attr('alt') || '';
      const src = $(el).attr('src') || '';
      imgs.push(`- ${src.slice(0, 80)}${alt ? ' (alt: ' + alt.slice(0, 120) + ')' : ' (alt 無し)'}`);
    });
    return `URL: ${url}\nTitle: ${title}\n\n画像一覧:\n${imgs.join('\n')}\n\n本文サンプル:\n${body}`;
  },
});

export const aiDeixisClarity = createAiRule({
  ...COMMON,
  id: 'ai/deixis-clarity',
  name: '指示語や省略への依存 (AI)',
  fix: '「詳しくはこちら」「これにより」「その場合は」「問題があります」等、単独で意味が通らない表現を避け、主語・対象・条件を 1 文内で明記してください。',
  systemPrompt: `1 文が前後文脈なしでも具体的に意味が通るかを判定してください。
×例: 「詳しくはこちら」「これにより、より便利に使えます」「問題があります」「その場合は再度お試しください」
〇例: 「このプランでは月額 980 円で 5 ユーザーまで利用できます」「登録後、確認メールを送信します」
judgement: 曖昧表現 0-1 → pass / 2-4 → score 60-80 / 5+ → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const snippets = [];
    $('p, li, a, button').each((_, el) => {
      if (snippets.length >= 60) return;
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length < 4 || t.length > 120) return;
      snippets.push({ tag: el.tagName.toLowerCase(), text: t });
    });
    if (snippets.length < 5) return null;
    return `URL: ${url}\n\n短いテキスト断片 (指示語依存を疑うべき):\n${snippets.map((s, i) => `[${i + 1}] <${s.tag}> ${s.text}`).join('\n')}`;
  },
});

export const aiHeadingBodyAlignment = createAiRule({
  ...COMMON,
  id: 'ai/heading-body-alignment',
  name: '見出しと本文の整合 (AI)',
  fix: '見出しと直下本文だけで内容が特定できるように、見出しを具体名詞 (例: 「返金条件」) にし、本文はその定義/条件を記述してください。「特徴」+「この点が強みです」のような組合せは NG。',
  systemPrompt: `見出しと直下本文のまとまりだけで他の文脈に依存せず内容が理解できるかを判定してください。
×例: 見出し「特徴」本文「この点が強みです」 / 見出し「注意」本文「上記をご確認ください」
〇例: 見出し「返金条件」本文「申込日から 7 日以内で、初回契約に限り返金を受け付けます」
judgement: 曖昧ペア 0-1 → pass / 2-4 → score 50-70 / 5+ → score <50`,
  buildUserPrompt: ({ $, url }) => {
    const pairs = [];
    $('h2, h3, h4').each((_, h) => {
      if (pairs.length >= 25) return;
      const heading = $(h).text().trim();
      if (!heading) return;
      // 直後の段落・リスト
      let next = $(h).next();
      let body = '';
      for (let i = 0; i < 3 && next.length > 0; i++) {
        if (next.is('h1, h2, h3, h4, h5, h6')) break;
        body += ' ' + next.text().replace(/\s+/g, ' ').trim();
        next = next.next();
      }
      pairs.push({ heading, body: body.trim().slice(0, 200) });
    });
    if (pairs.length < 3) return null;
    return `URL: ${url}\n\n見出し + 直下本文ペア:\n${pairs.map((p, i) => `[${i + 1}] 見出し: ${p.heading}\n  本文: ${p.body || '(なし)'}`).join('\n\n')}`;
  },
});

export const aiServiceNameInText = createAiRule({
  ...COMMON,
  id: 'ai/service-name-in-text',
  name: 'サービス正式名称の HTML 明記 (AI)',
  fix: '<h1> などにサービス正式名称 (例: 〇〇 Cloud) をテキストで明記し、提供元 (例: 〇〇株式会社) もテキスト併記してください。ロゴ画像のみで alt も空は NG。',
  systemPrompt: `ページにサービスの正式名称と提供元がテキストとして明記されているかを判定してください。
〇例: <h1>サービス正式名称</h1> と「提供: 運営会社名」の記載
×例: ロゴ画像のみで alt にもサービス名なし / URL やパンくずからしか特定できない
judgement: 両方テキスト明記 → pass / 片方のみ → score 60-80 / 両方欠落 → score <50`,
  buildUserPrompt: ({ $, url, title }) => {
    const h1 = $('h1').first().text().trim();
    const logoAlt = $('img[class*="logo"], img[alt*="logo"], img[alt*="ロゴ"]').first().attr('alt') || '';
    const body = sampleBodyText($, { maxChars: 3000 });
    if (!body) return null;
    return `URL: ${url}\nTitle: ${title}\nH1: ${h1 || '(空)'}\nロゴ画像の alt: ${logoAlt || '(なし)'}\n\n本文サンプル:\n${body}`;
  },
});
