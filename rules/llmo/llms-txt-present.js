export default {
  id: 'llmo/llms-txt-present',
  name: 'llms.txt の設置',
  category: 'llmo',
  severity: 'major',
  weight: 3,
  fix: 'サイトルートに /llms.txt ファイルを設置してください。',
  check: ({ llmsTxt }) => {
    if (!llmsTxt.exists) {
      return { passed: false, message: `/llms.txt が取得できません (status: ${llmsTxt.status})` };
    }
    return { passed: true };
  },
};
