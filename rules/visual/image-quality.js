// 画像が表示サイズ > 自然解像度 × 2 で描画されている (引き伸ばし) ケースを検出。
// 違反 0 → pass / 1-2 件 → minor / 3 件以上 → fail

const STRETCH_RATIO = 2.0;

export default {
  id: 'visual/image-quality',
  name: '画質 (画像の引き伸ばし検出)',
  category: 'visual',
  mainCategory: 'visual',
  severity: 'minor',
  weight: 2,
  fix: '画像は「表示サイズ ≦ 自然解像度」を原則にし、Retina 用には 2x 解像度の画像を srcset で提供してください。画質劣化を防ぎます。',
  check: ({ visualData }) => {
    const images = visualData?.images || [];
    if (images.length === 0) return { passed: true, message: '画像なし (スキップ)' };

    const offenders = [];
    for (const img of images) {
      if (!img.visible) continue;
      if (!img.naturalWidth || !img.naturalHeight) continue;
      const wRatio = img.displayedWidth / img.naturalWidth;
      const hRatio = img.displayedHeight / img.naturalHeight;
      const ratio = Math.max(wRatio, hRatio);
      if (ratio >= STRETCH_RATIO) {
        offenders.push({
          src: img.src.slice(0, 120),
          alt: img.alt,
          displayed: `${img.displayedWidth}×${img.displayedHeight}`,
          natural: `${img.naturalWidth}×${img.naturalHeight}`,
          ratio: Math.round(ratio * 10) / 10,
        });
      }
    }

    if (offenders.length === 0) return { passed: true };
    const severity = offenders.length >= 3 ? '3件以上 (fail)' : '1〜2件 (minor)';
    return {
      passed: offenders.length < 3,
      message: `引き伸ばし画像 ${offenders.length} 件 (${severity})`,
      offenders: offenders.slice(0, 20),
      offendersTotal: offenders.length,
      offendersTruncated: offenders.length > 20,
    };
  },
};
