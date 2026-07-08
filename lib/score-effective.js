// 手動ステータス (除外/NG/OK) を violations に適用し、スコアを再計算する。
// ------------------------------------------------------------------
// 既定の扱い:
//   - override 'exclude'      → スコア計算から外す (effStatus='exclude')
//   - override 'ok'           → 合格扱い (effStatus='ok')
//   - override 'ng'           → 不合格扱い (effStatus='ng')
//   - override なし & manualOnly(ビジュアル等) → 既定で除外 (effStatus='unevaluated')
//   - override なし & 通常ルール → 検知結果のまま (effStatus='detected-ok'/'detected-ng')
//   manual フラグは override 行がある場合に true。
// 計算式 (calculateScore) は不変。除外項目は violations から落とすだけ。
import { calculateScore } from './scorer.js';

/**
 * violations に override を適用し、表示用の注釈付き violations と
 * スコア計算に渡す violations を返す。
 * @param {Array} violations
 * @param {Object<string,string>} overrides  ruleId -> 'exclude'|'ng'|'ok'
 */
export function annotateViolations(violations, overrides = {}) {
  return (violations || []).map((v) => {
    const ov = overrides[v.id] || null;
    let effStatus;
    let scored = true;
    let passed = v.passed;
    if (ov === 'exclude') { effStatus = 'exclude'; scored = false; }
    else if (ov === 'ok') { effStatus = 'ok'; passed = true; }
    else if (ov === 'ng') { effStatus = 'ng'; passed = false; }
    else if (v.manualOnly) { effStatus = 'unevaluated'; scored = false; }
    else { effStatus = v.passed ? 'detected-ok' : 'detected-ng'; }
    return { ...v, effStatus, manual: !!ov, _effPassed: passed, _scored: scored };
  });
}

/** override 適用後のスコアオブジェクトを返す (calculateScore と同形)。 */
export function effectiveScore(violations, overrides, weights, lighthouseScores = null) {
  const annotated = annotateViolations(violations, overrides);
  const scored = annotated
    .filter((v) => v._scored)
    .map((v) => ({ ...v, passed: v._effPassed }));
  return calculateScore(scored, weights, lighthouseScores);
}

/** 検知のみ (manualOnly を除外) の raw スコア。クロール時の保存用。 */
export function rawScore(violations, weights, lighthouseScores = null) {
  const scored = (violations || []).filter((v) => !v.manualOnly);
  return calculateScore(scored, weights, lighthouseScores);
}
