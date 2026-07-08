export default {
  id: 'llmo/robots-txt-accessible',
  name: 'robots.txt の存在',
  category: 'llmo',
  severity: 'major',
  weight: 3,
  fix: 'サイトルートに /robots.txt を設置してください。',
  check: ({ robotsTxt }) => {
    if (!robotsTxt.exists) {
      return { passed: false, message: `/robots.txt が取得できません (status: ${robotsTxt.status})` };
    }
    return { passed: true };
  },
};
