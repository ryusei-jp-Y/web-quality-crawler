export function checkGate(pageData, ruleOptions = {}) {
  const maxBytes = ruleOptions['gate/body-start-offset']?.maxBytes ?? 28672;

  // HTTP 4xx/5xx はエラーページ (例: WP の「データベースエラー」) を
  // 本物のページとして採点してしまうため評価対象外にする。
  // statusCode 0 (response 取得不能) は従来挙動を維持して通す。
  if (pageData.statusCode >= 400) {
    return {
      passed: false,
      gateId: 'gate/http-status',
      message: `HTTP ${pageData.statusCode} 応答のため評価対象外 (エラーページの可能性)`,
      actual: pageData.statusCode,
      threshold: 400,
    };
  }

  if (pageData.bodyStartOffset > maxBytes) {
    const kb = (pageData.bodyStartOffset / 1024).toFixed(1);
    return {
      passed: false,
      gateId: 'gate/body-start-offset',
      message: `body開始位置が${kb}KBで基準(${(maxBytes / 1024).toFixed(0)}KB)を超過`,
      actual: pageData.bodyStartOffset,
      threshold: maxBytes,
    };
  }

  return { passed: true };
}
