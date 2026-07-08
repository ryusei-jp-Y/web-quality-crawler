import { describeElement } from '../../lib/describe-element.js';

export default {
  id: 'readable/image-text-alternative',
  name: '画像altの実効性',
  category: 'readable',
  severity: 'major',
  weight: 3,
  fix: '意味のある画像には10文字以上の説明的なalt属性を設定してください。',
  check: ({ $ }, options = {}) => {
    const minAltLength = options.minAltLength ?? 10;
    const maxShortAltRatio = options.maxShortAltRatio ?? 0.5;
    const nonDecorative = $('img').toArray().filter((el) => {
      const alt = $(el).attr('alt');
      return alt !== undefined && alt !== '';
    });
    if (nonDecorative.length === 0) return { passed: true };
    const shortAlts = nonDecorative.filter((el) => ($(el).attr('alt') || '').length < minAltLength);
    const ratio = shortAlts.length / nonDecorative.length;
    if (ratio <= maxShortAltRatio) return { passed: true };

    const offenders = shortAlts.slice(0, 20).map((el) => ({
      ...describeElement($, el),
      alt: $(el).attr('alt') || '',
      src: $(el).attr('src') || '',
    }));
    return {
      passed: false,
      message: `短いalt (${minAltLength}文字未満) の画像が${Math.round(ratio * 100)}% (${shortAlts.length}/${nonDecorative.length})`,
      offenders,
      offendersTotal: shortAlts.length,
      offendersTruncated: shortAlts.length > 20,
    };
  },
};
