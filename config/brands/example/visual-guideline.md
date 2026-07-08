# Example Cloud ブランドガイドライン (フォント / カラー / 見出しサイズ / 余白) — サンプル

> これはブランド参照型 AI ルール (`rules/ai/brand-guideline.js`) のデモ用サンプルです。
> 実運用では自社のビジュアルレギュレーションに差し替えてください。

## テキストレギュレーション

### 日本語

- Font Family：Noto Sans JP
- Font weight：Regular / Bold
- line-height：1.6
- letter-spacing：0.03em

### 英語

- Font Family：Inter (Google Fonts)
- Font weight：Regular / Bold
- line-height：1.6
- letter-spacing：0.02em

## 見出し・テキスト

| 用途 | PC | SP | line-height | 備考 |
|---|---:|---:|---:|---|
| H1 | 48px | 32px | 1.2 | ページ見出し |
| H2 | 36px | 28px | 1.3 | セクション見出し |
| H3 | 28px | 22px | 1.4 | 中見出し |
| H4 | 20px | 18px | 1.5 | 小見出し |
| P  | 16px | 16px | 1.6 | 本文 |
| small | 12px | 12px | 1.6 | 注記 |

## 余白

| 用途 | PC | SP |
|---|---:|---:|
| セクション間 (大) | 120px | 64px |
| セクション内 (中) | 64px | 40px |
| 要素間 (小) | 24px | 16px |

## カラー

| Token | Hex | 用途 |
|---|---|---|
| primary | #2563EB | メイン (ブランドプライマリ) |
| accent | #F97316 | 強調・CTA |
| text | #1F2937 | 本文テキスト |
| background | #F5F7FA | 背景 |
| border | #E5E7EB | ボーダー / 非アクティブ |
| success | #16A34A | 成功・肯定 |

### コントラスト

- 本文テキストと背景のコントラスト比は WCAG AA (4.5:1) 以上を確保する。
- CTA ボタンの文字色と背景色も 4.5:1 以上を目安とする。
