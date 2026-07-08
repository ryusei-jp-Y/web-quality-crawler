// デザインシステム規定マージンの適切な使用 (手動評価項目)。
// ビジュアルは検知精度の問題から手動評価に寄せているため、本ルールも manualOnly。
// 管理者がダッシュボード/詳細から OK/NG/除外 を設定する。
export default {
  id: 'visual/ds-margin',
  name: 'デザインシステム規定マージンの適切な使用',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'major',
  weight: 3,
  manualOnly: true,
  fix: [
    'セクション間マージンが DS 既定のものに統一されているか',
    'コンテンツ間マージンが DS 既定のものに統一されているか',
    'その他、DS で規定した spacing の規定が使用されているか',
  ].join(' / '),
};
