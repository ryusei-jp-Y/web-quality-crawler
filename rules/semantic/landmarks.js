export default {
  id: 'semantic/landmarks',
  name: 'ランドマーク要素の存在',
  category: 'semantic',
  severity: 'critical',
  weight: 5,
  fix: 'header / nav / main / footer でページの大枠を区切ってください。',
  check: ({ $ }) => {
    const landmarks = ['header', 'nav', 'main', 'footer'];
    const missing = landmarks.filter((tag) => $(tag).length === 0);
    if (missing.length > 0) {
      return { passed: false, message: `ランドマーク要素が不足: ${missing.join(', ')}` };
    }
    return { passed: true };
  },
};
