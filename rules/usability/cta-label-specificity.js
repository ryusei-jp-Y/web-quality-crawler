import { describeElement } from '../../lib/describe-element.js';

// CTA (ボタン/行動導線) の文言が単独で意味が通るか判定。
// 「OK」「次へ」「送信」「詳細」「こちら」「More」等の単体弱語は、
// 何が起こるか予測できないため NG。
//
// 検出対象:
//   - <button>
//   - <a> で class に "btn" / "button" / "cta" を含む or role=button
//   - <input type="submit|button">
//
// 注: フッター共通ナビのリンクは対象外の方針 (今は class 名ヒューリスティックで
// CTA 類似要素のみ拾うため、フッター内リンクはほぼ排除される)。

const WEAK_STANDALONE_LABELS = new Set([
  'OK', 'ok', 'Ok',
  '次へ', 'つぎへ',
  '進む',
  '送信', '送る',
  '詳細',
  'こちら', 'ここ',
  'クリック',
  'More', 'more', 'もっと見る',
  '戻る',
  'はい', 'いいえ',
  '確認',
  '申込', 'お申込み', // "お申し込みはこちら" などは複合なので OK
]);

function normalizeLabel(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isCtaLike($, el) {
  const tag = el.name;
  if (tag === 'button') return true;
  if (tag === 'input') {
    const type = ($(el).attr('type') || '').toLowerCase();
    return type === 'submit' || type === 'button';
  }
  if (tag === 'a') {
    const klass = ($(el).attr('class') || '').toLowerCase();
    if (/\b(btn|button|cta|action)\b/.test(klass)) return true;
    if ($(el).attr('role') === 'button') return true;
  }
  return false;
}

export default {
  id: 'usability/cta-label-specificity',
  name: 'CTA 文言の具体性',
  category: 'usability',
  mainCategory: 'usability',
  severity: 'minor',
  weight: 2,
  fix: '「OK」「次へ」「送信」「詳細」「こちら」など単体で何が起こるか分からない文言は避け、「資料をダウンロードする」「確認画面へ進む」のように動作目的を明記してください。',
  check: ({ $ }) => {
    const candidates = $('button, a, input').toArray().filter((el) => isCtaLike($, el));
    if (candidates.length === 0) return { passed: true, message: 'CTA 候補なし (スキップ)' };

    const offenders = [];
    for (const el of candidates) {
      const rawText = $(el).text() || $(el).attr('value') || $(el).attr('aria-label') || '';
      const label = normalizeLabel(rawText);
      if (!label) continue;
      if (WEAK_STANDALONE_LABELS.has(label)) {
        offenders.push({ ...describeElement($, el), text: label });
      }
    }
    if (offenders.length === 0) return { passed: true };
    const uniques = [...new Set(offenders.map((o) => o.text))];
    return {
      passed: false,
      message: `単体で意味が通らない CTA 文言 ${offenders.length} 件 (${uniques.slice(0, 3).join(' / ')})`,
      offenders: offenders.slice(0, 20),
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
