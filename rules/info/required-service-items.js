// サービスページに必要な 5 要素 (料金 / 機能 / ターゲット / 差別化 / 信頼性) が
// HTML テキストとして存在するかの決定的チェック。
// AI による「内容の妥当性」判定は別ルール。

function hasText($, patterns) {
  const body = $('body').clone();
  body.find('script, style, noscript').remove();
  const text = body.text();
  for (const p of patterns) {
    if (p instanceof RegExp ? p.test(text) : text.includes(p)) return true;
  }
  return false;
}

function hasTableWithCurrency($) {
  // <table> 内に 円 / ¥ / JPY / 月額 のいずれかを含むか
  for (const t of $('table').toArray()) {
    const text = $(t).text();
    if (/[¥￥]|\d+\s*円|月額|年額|JPY/.test(text)) return true;
  }
  return false;
}

export default {
  id: 'info/required-service-items',
  name: 'サービス必須項目の HTML 記載',
  category: 'info',
  mainCategory: 'info',
  severity: 'major',
  weight: 3,
  fix: '料金 (table)・機能一覧 (section)・ターゲット (「こんな方におすすめ」等)・差別化 (見出し+数値)・信頼性情報を画像ではなく本文テキストとして記載してください。',
  check: ({ $ }) => {
    const checks = {
      price: hasTableWithCurrency($) || hasText($, [/[¥￥]\s*\d{2,}/, /\d{3,}\s*円/, /月額\s*\d/]),
      features: hasText($, ['主な機能', '機能一覧', '対応機能', 'できること', /<section[^>]*>[^<]*機能/]),
      target: hasText($, ['こんな方におすすめ', 'おすすめの方', 'ご利用シーン', 'ユースケース', '対象ユーザー']),
      differentiation: hasText($, [/No\.?1/i, /業界[最初]/, /国内[最初]/, /最速/, /最安/, /\d+倍/, /\d+%/]),
      trust: hasText($, ['導入事例', '導入実績', 'お客様の声', /導入\s*\d{3,}/, /利用\s*\d{4,}/, 'ISO', 'プライバシーマーク']),
    };

    const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length === 0) {
      return { passed: true, message: '5 要素 (料金 / 機能 / ターゲット / 差別化 / 信頼性) すべて本文に存在' };
    }
    const labelMap = {
      price: '料金',
      features: '機能一覧',
      target: 'ターゲット',
      differentiation: '差別化',
      trust: '信頼性情報',
    };
    return {
      passed: false,
      message: `本文に見つからない要素: ${missing.map((k) => labelMap[k]).join(' / ')} (${missing.length}/5 欠落)`,
      offenders: missing.map((k) => ({ item: labelMap[k], key: k })),
      offendersTotal: missing.length,
      offendersTruncated: false,
    };
  },
};
