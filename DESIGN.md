# DESIGN.md — 共通デザインシステム

このドキュメントは **Web Quality Crawler のダッシュボード UI を「基準デザイン」として定義**したものです。
今後作成する個人開発アプリはすべてこのトンマナ (色・タイポ・余白・コンポーネント・モーション) を踏襲し、見た目と操作感を統一します。

- 実体: [public/css/dashboard.css](public/css/dashboard.css) (約 4,000 行) と [public/index.html](public/index.html)
- このドキュメントは「読めば同じ見た目を再現できる」ことを目的とした**仕様書**。CSS を読む前の地図として使う
- 新規アプリでは、まず後述の「[§1 デザイントークン](#1-デザイントークンcss-変数)」を丸ごとコピーして `:root` に置くのが最速

---

## 0. デザインコンセプト

一言で言うと **「ライト基調 + ガラスモーフィズム + パステルなオーロラ背景 + 動くゲージ」**。

| 原則 | 内容 |
|------|------|
| **Light glass** | 白の半透明サーフェス (`rgba(255,255,255,0.72)`) を `backdrop-filter: blur()` で浮かせる。パネルは常にすりガラス |
| **Ambient aurora** | 画面最背面に青・紫・赤のぼかしブロブがゆっくり漂う。ガラスの透け感を演出する光源 |
| **Soft & crisp** | 影は淡く多層。角丸は 12px 基調。境界線は `slate` 系の低透明度で「線というより気配」 |
| **Data-forward** | 数値は `tabular-nums` で桁揃え。スコアは色 (緑/橙/赤) で即座に良し悪しが分かる |
| **Motion with purpose** | ゲージのカウントアップ、スケルトン、シマー、パルス。すべて「状態変化を伝える」ためだけに動かす |
| **Restrained accent** | 差し色は青 (`#3b82f6`) 一本。紫はごく一部 (Lighthouse / AI バッジ) の識別用のみ |

配色トーン: Tailwind の `slate` (テキスト・境界) + `blue` (アクセント) + `emerald / amber / red` (状態) をベースにしている。

---

## 1. デザイントークン (CSS 変数)

**新規アプリはこのブロックをそのまま `:root` にコピーする。** これが統一の要。

```css
:root {
  /* ---- Base surfaces ---- */
  --color-bg: #f6f8fb;                          /* ページ背景 (ごく淡い青みグレー) */
  --color-surface: rgba(255, 255, 255, 0.72);   /* ガラスパネルの地 */
  --color-surface-solid: #ffffff;               /* モーダル等の不透明サーフェス */

  /* ---- Text ---- */
  --color-text: #1e293b;            /* 本文 (slate-800) */
  --color-text-secondary: #64748b;  /* 補助 (slate-500) */
  --color-text-muted: #94a3b8;      /* 最も薄い (slate-400) */

  /* ---- Borders ---- */
  --color-border: rgba(148, 163, 184, 0.18);        /* 標準 */
  --color-border-strong: rgba(148, 163, 184, 0.28); /* 入力欄など */
  --color-border-light: rgba(226, 232, 240, 0.7);   /* 区切り線 */

  /* ---- Accent (blue) ---- */
  --primary-300: #93c5fd;
  --primary-400: #60a5fa;
  --primary-500: #3b82f6;   /* 主アクセント */
  --primary-600: #2563eb;   /* hover / 押下 */
  --primary-700: #1d4ed8;   /* テキストリンク・強調 */
  --primary-bg: rgba(59, 130, 246, 0.10);       /* 淡いアクセント地 */
  --primary-bg-light: rgba(59, 130, 246, 0.06); /* さらに淡い */

  /* ---- Sidebar (frosted) ---- */
  --sidebar-bg: rgba(255, 255, 255, 0.55);
  --sidebar-hover: rgba(255, 255, 255, 0.85);
  --sidebar-text: #1e293b;
  --sidebar-muted: #64748b;
  --sidebar-subtle: #94a3b8;
  --sidebar-accent: #3b82f6;
  --sidebar-border: rgba(148, 163, 184, 0.18);

  /* ---- Status (score) ---- */
  --color-pass: #10b981;    --color-pass-bg: rgba(16, 185, 129, 0.10);   --color-pass-border: rgba(16, 185, 129, 0.25);
  --color-average: #f59e0b; --color-average-bg: rgba(245, 158, 11, 0.10); --color-average-border: rgba(245, 158, 11, 0.25);
  --color-fail: #ef4444;    --color-fail-bg: rgba(239, 68, 68, 0.10);    --color-fail-border: rgba(239, 68, 68, 0.25);

  /* ---- Elevation (soft multi-layer) ---- */
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 2px 6px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06);
  --shadow-lg: 0 4px 12px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.08);

  /* ---- Geometry ---- */
  --radius: 12px;        /* パネル・カード */
  --radius-sm: 8px;      /* 小要素・入力欄 */
  --gap: 16px;           /* 標準グリッド間隔 */

  /* ---- Layout ---- */
  --sidebar-width: 272px;
  --glass-blur: 16px;    /* backdrop-filter の基準ぼかし量 */
}
```

### トークン運用ルール

- **色は必ず変数経由**で指定する。生の `#3b82f6` を新規に書かない (状態色のダーク版など、ごく一部の例外を除く)
- **紫 `#7c3aed` / `#8b5cf6`** は「Lighthouse」「AI」など*別ツール/別性質*を示す識別色。差し色として乱用しない
- 角丸は `--radius` (12px) と `--radius-sm` (8px) の2択。ピル型は `999px`
- 影は `--shadow-sm/md/lg` の3段のみ。`sm` = 静止、`md` = hover、`lg` = 浮遊要素 (モーダル/トースト/FAB)

---

## 2. タイポグラフィ

```css
body {
  font-family: "Inter","Noto Sans JP","Roboto",-apple-system,BlinkMacSystemFont,
               "Hiragino Kaku Gothic ProN",Meiryo,sans-serif;
  font-size: 14px;
  line-height: 1.55;
  letter-spacing: -0.003em;      /* 全体をわずかに詰める */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- **UI 標準は 14px / 行間 1.55。** 英語見出しは Inter、日本語は Noto Sans JP が担当
- **等幅**が必要な箇所 (URL, ルール ID, コード, 数値ログ) は
  `font-family: ui-monospace, SFMono-Regular, Menlo, monospace;`
- **数値は `font-variant-numeric: tabular-nums;`** を必ず付ける (スコア・件数・日時)。桁が揃ってガタつかない

### タイプスケール (実測値)

| 用途 | size | weight | letter-spacing | 備考 |
|------|------|--------|----------------|------|
| ページ見出し (`.main-header__name`) | 24px | 700 | -0.015em | |
| モーダルタイトル | 16px | 600 | -0.01em | |
| セクション見出し (h3) | 14px | 700 | -0.005em | |
| 本文 / ボタン | 13–14px | 400–500 | | |
| ラベル・補助 | 11–12px | 500–600 | | |
| **オーバーライン** (パネルタイトル等) | 10–11px | 700 | **.08em** + `text-transform: uppercase` | 大文字+字間広め=小見出しの定番 |
| マイクロラベル (バッジ内) | 9–10px | 700 | .04–.1em | uppercase |
| 特大数値 (ゲージ xlarge) | 48px | 700 | -0.02em | |

**「オーバーライン」パターンが多用される** — 小さな大文字テキスト + 字間広め + `--color-text-secondary`。パネル見出し・フォームラベル・メタ情報のラベルはすべてこれ。

---

## 3. レイアウト

```
┌─────────────┬──────────────────────────────────────┐
│             │  main-header (breadcrumb / name / …)  │
│  sidebar    │                                       │
│  (272px,    │  row-overview  (gauge + breakdown)    │
│   sticky,   │  row-categories (6 カードグリッド)     │
│   glass)    │  panel--lighthouse / trend / …        │
│             │  findings (タブ + アコーディオン)      │
└─────────────┴──────────────────────────────────────┘
     aurora blobs (fixed, z-index:-1) が全面背後に漂う
```

```css
.app-layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}
.main { padding: 28px 32px 48px; position: relative; }
```

- **サイドバー固定 (`position: sticky`) + main は body スクロール**。main 自身は `overflow` させない (popover が横方向にクリップされ、サイドバーに潜る事故を防ぐため)
- サイドバー幅はドラッグでリサイズ可 (`.sidebar__resizer`)。基準は 272px
- コンテンツ最大幅は特に絞らず、グリッドの列数をブレークポイントで畳む

### ブレークポイント (実際に使われている値)

| max-width | 効果 |
|-----------|------|
| 1100px | メインカテゴリカード 6列 → 3列 |
| 900px | overview 2列 → 1列 |
| 780px | Lighthouse 4列 → 2列 |
| 720px | ヘルプ2カラム → 1列 |
| 600px | カード 3列 → 2列 |

グリッドは `repeat(N, 1fr)` + `gap: var(--gap)` が基本形。

---

## 4. シグネチャ要素 (このデザインの「顔」)

新規アプリでも**この3つは必ず入れる**とトンマナが即座に揃う。

### 4.1 オーロラ背景

画面最背面 (`z-index:-1`, `position:fixed`) に3つのぼかしブロブを漂わせる。

```html
<div class="aurora" aria-hidden="true">
  <span class="aurora__blob aurora__blob--1"></span>
  <span class="aurora__blob aurora__blob--2"></span>
  <span class="aurora__blob aurora__blob--3"></span>
</div>
```

```css
.aurora { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.aurora__blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.42;
                animation: aurora-float 30s ease-in-out infinite; }
.aurora__blob--1 { background: radial-gradient(circle, #60a5fa 0%, transparent 70%); width:520px; height:520px; top:-120px; left:-120px; }
.aurora__blob--2 { background: radial-gradient(circle, #c084fc 0%, transparent 70%); width:620px; height:620px; top:20%; right:-180px; animation-delay:-10s; }
.aurora__blob--3 { background: radial-gradient(circle, #fca5a5 0%, transparent 70%); width:460px; height:460px; bottom:-160px; left:30%; animation-delay:-20s; }
@keyframes aurora-float {
  0%,100% { transform: translate(0,0) scale(1); }
  33%     { transform: translate(40px,-30px) scale(1.08); }
  66%     { transform: translate(-30px,40px) scale(0.95); }
}
```

配色は青 → 紫 → 赤の3色固定。opacity 0.42 / blur 80px を守ると「淡すぎず主張しすぎず」になる。

### 4.2 ガラスパネル (`.panel`)

すべての箱の基本形。これに乗せるだけでトンマナが出る。

```css
.panel {
  background: var(--color-surface);
  backdrop-filter: blur(var(--glass-blur)) saturate(160%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(160%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 20px;
}
```

- `saturate(160%)` がポイント。背後のオーロラの色を吸って、ただの白より生き生きする
- `-webkit-` プレフィックスは Safari のため必須。**必ず両方書く**
- パネル見出しは前述のオーバーライン + アイコンを `--primary-500` で:

```css
.panel__title {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase; letter-spacing: .08em;
  margin: 0 0 14px;
}
.panel__title .icon { color: var(--primary-500); }
```

### 4.3 アニメーションゲージ (`.lh-gauge`)

スコアを円弧 + カウントアップで見せる。ダッシュボードの主役。

- サイズ 4段階: `--xlarge (140px) / --large (110px) / --medium (72px) / --small (48px)`
- SVG を `rotate(-90deg)` で12時始点にし、`stroke-dashoffset` を `1.2s cubic-bezier(.16,1,.3,1)` でトランジション → 弧が伸びる
- 状態で色分け: `--pass (緑) / --average (橙) / --fail (赤) / --na (グレー円)`
- 中央のパーセント数値は絶対配置 + `tabular-nums`。JS で `textContent` をカウントアップさせる

```css
.lh-gauge__arc {
  fill: none; stroke-width: 8; stroke-linecap: round;
  transition: stroke-dashoffset 1.2s cubic-bezier(.16, 1, .3, 1);
  filter: drop-shadow(0 2px 4px rgba(0,0,0,.08));
}
.lh-gauge--pass .lh-gauge__arc { stroke: var(--color-pass); }
```

**スコアしきい値の色分け規約** (アプリ全体で統一):
- **pass (緑)** = 良好 / **average (橙)** = 要改善 / **fail (赤)** = 不合格。
- 数値バッジ・トレンド線・チップ・ゲージすべてこの3色ルールに従う。

---

## 5. コンポーネント仕様

すべて `dashboard.css` に実装済み。クラス名を踏襲すれば流用できる。

### 5.1 ボタン

| クラス | 見た目 | 用途 |
|--------|--------|------|
| `.btn--primary` | 青地 (`--primary-500`) + 白字, hover で `--primary-600` | 主アクション (保存・実行) |
| `.btn--secondary` | 白地 + `--color-border-strong` 枠 | キャンセル・副次 |
| `.btn--sm` | padding 4/10px, 11px | 一覧内の小ボタン |
| `.btn-icon` | 24×24 正方, 角丸6px, hover でグレー地 | アイコンのみ (閉じる等) |
| `.dash-tool` | 白地 + 枠 + アイコン, hover で青 | ツールバー |
| `.dash-tool--ghost` | 透明地・muted 文字 | 控えめな書き出し系 |

共通: `padding: 8px 16px; font-size: 13px; font-weight: 500; border-radius: 6px; transition: all .15s;`
disabled は `opacity: .5; cursor: wait;` (処理中) または `cursor: not-allowed`。

### 5.2 フォーム入力

```css
.form-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
.form-field label { /* オーバーライン: 11px/600/uppercase/.06em, secondary */ }
.form-field input, .form-field textarea, .form-field select, .combobox__input {
  padding: 8px 12px; font-size: 14px; font-family: inherit;
  border: 1px solid var(--color-border-strong); border-radius: 6px;
  background: var(--color-surface-solid); color: var(--color-text);
  transition: border-color .15s, box-shadow .15s;
}
input:focus {  /* フォーカスリングの統一形 */
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
```

- **フォーカスは必ず「青枠 + 3px の淡い青グロー」**。これがアプリ全体のフォーカス表現
- `select` はネイティブ矢印を消し、SVG の chevron を `background-image` で描く (トンマナ統一)
- キーボードフォーカスは `:focus-visible { outline: 2px solid var(--primary-400); outline-offset: 2px; }`

### 5.3 チップ / バッジ

- **フィルタチップ `.chip`**: 未選択はグレー地、選択で状態色 (critical=赤 / major=橙 / minor=青 / pass=緑)。`checkbox` を隠して label で切り替え
- **ピルバッジ** (`.main-card__badge`, `.lh-meta__chip` 等): `border-radius: 999px`, 9–10px, uppercase, `--primary-bg` 地 + `--primary-700` 字
- **カウントバッジ** (`.findings__main-count` 等): 丸に近いピル, `tabular-nums`, グレー地。アクティブ時は反転
- **重大度チップ `.sev-chip`**: critical/major/minor/passed の4色。OFF は `opacity .4 + line-through`
- **AI バッジ `.help-rule__badge--ai`**: 紫 (`#7c3aed` on `rgba(139,92,246,0.15)`) で AI 由来を区別

### 5.4 モーダル

```css
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);            /* 背後もぼかす */
  z-index: 100; display: flex; align-items: center; justify-content: center;
  padding: 20px; animation: modal-fade-in .2s;
}
.modal {
  background: var(--color-surface-solid);  /* モーダルは不透明 */
  border: 1px solid var(--color-border); border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  max-width: 480px; width: 100%;
  animation: modal-slide-up .25s cubic-bezier(.16,1,.3,1);
}
.modal--wide { max-width: 1100px; }   /* ヘルプ等 */
```

- 背景は暗い半透明 + blur、モーダル本体は**不透明**白 (ガラスにしない = 可読性優先)
- 登場は `fade-in` (backdrop) + `slide-up 12px` (本体)。イージングは `cubic-bezier(.16,1,.3,1)` で統一
- ヘッダー: タイトル (16px/600) + `.btn-icon` の閉じる ✕
- 広いモーダルはタブ (`.help__tabs`) で内容を切り替える

### 5.5 タブ

2系統ある。用途で使い分ける:

- **セグメント型 `.findings__tabs`**: 枠付きコンテナに内包、アクティブは `--primary-500` 地 + 白字。少数の排他切替 (All/Failed 等)
- **ピル型 `.findings__main-tab`**: `border-radius:999px`, hover で青枠、アクティブで青地白字。多数のカテゴリ切替
- **デバイスタブ `.device-tabs`**: ピル型トグル (PC/SP)。角丸999pxコンテナ内でスライド風

### 5.6 アコーディオン / details

`<details>` を多用。共通ルール:

- `summary::-webkit-details-marker { display: none; }` でネイティブ三角を消す
- chevron アイコンを置き `[open]` で `transform: rotate(90deg)` (右向き→下向き)、`transition: transform .2s`
- 重大度アコーディオンは**左端 3px のアクセントストライプ** (`box-shadow: inset 3px 0 0 <色>`) で severity を示す
- 開いた `summary` の下に `border-bottom` を出して本文と繋げる

### 5.7 テーブル

- ヘッダー `thead th`: 10px / uppercase / .05em / muted / 下境界線 (これもオーバーライン)
- セル: 8–10px padding, `border-bottom: 1px solid var(--color-border-light)`, `vertical-align: top`
- 数値列は右寄せ + `tabular-nums`。状態行は淡い地色 (`rgba(239,68,68,0.04)` 等)

### 5.8 バナー / トースト

- **バナー `.banner`**: ページ内告知。左に4px アクセントボーダー + 状態色地 + blur。gate=赤 / error=橙 / paused=グレー
- **トースト `.toast`**: 右下 (`bottom:72px` で FAB を避ける) に積む。左3px ボーダーで状態、`slide-in` で登場。running はスピナー、done は ✓、error は !

### 5.9 コードブロック / スニペット

コード・整形済みログは**濃紺地の反転配色**で表示 (ライト UI の中で唯一のダーク面):

```css
/* .offender__snippet, .ai-suggest__body pre, .help-flow */
background: #0f172a;   /* slate-900 */
color: #e2e8f0;
padding: 8-12px; border-radius: 4-6px;
font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
font-size: 11px;
```

インラインコード `<code>` は `rgba(148,163,184,0.15)` の淡グレー地 + 角丸3px。
ダークな popover / tooltip も同じ `#0f172a` を使う (統一)。

---

## 6. モーション / アニメーション

**イージングは2つに統一**:
- `cubic-bezier(.16, 1, .3, 1)` — 登場・ゲージ (減速して着地する上品な動き)
- `ease` / `linear` — シマー・スピン・パルスなどループ系

| 種類 | 実装 | 時間 |
|------|------|------|
| hover 遷移 | `transition: all .15s` | 0.15s (UI 標準) |
| chevron 回転 | `transform: rotate(90deg) .2s` | 0.2s |
| ゲージ弧 | `stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)` | 1.2s |
| スピナー | `@keyframes spin { to { rotate 360deg } }` 0.8s linear | 無限 |
| スケルトン | シマーを `translateX(-100%→100%)` 1.6s | 無限 |
| プログレスバー | fill 上に白グラデをシマー | 無限 |
| モーダル登場 | fade .2s + slide-up .25s | — |
| トースト登場 | `slide-in` translateX 12px .25s | — |
| オーロラ | float 30s | 無限 |
| カード hover | `transform: translateY(-2px)` + 影を md へ | 0.15s |

**ローディング表現の使い分け**:
- 全画面初期ロード → `.app-loader` (ロゴの波形パルス `app-loader-flow` + breathe)
- 初回クロール等の長時間処理 → `.crawl-loader` (パルス + ステップチップ + プログレスバー)
- 一覧項目の非同期 → `.skeleton` (シマー)
- ボタン内 / 行内 → `.spinner` (回転リング)

### prefers-reduced-motion (対応済み)

OS の「視差効果を減らす」設定に追従する。dashboard.css 末尾に実装済みで、**新規アプリもこのブロックを踏襲する**。

方針は「全部止める」ではなく用途で切り分ける:

| 抑える (酔い・注意を引く) | 残す (機能表示) |
|---|---|
| 大きな移動・拡大 (オーロラ / slide-up / translateY) | 色・不透明度だけの変化 (fade) |
| ループするシマー・パルス・breathe | 小さなスピナー (処理中の合図) |
| ゲージの長い伸び (→ 即座に最終値へ) | hover の色変化 |

```css
@media (prefers-reduced-motion: reduce) {
  /* 装飾的なループアニメを停止 */
  .aurora__blob,
  .app-loader__pulse, .app-loader__ring, .app-loader__line,
  .crawl-loader__pulse, .crawl-loader__dot,
  .skeleton::after,
  .crawling-banner, .crawl-loader__progress-fill::after,
  .page-item--crawling::after,
  .screenshot-modal__rect { animation: none !important; }

  /* ゲージ・chevron / caret の transition は即座に完了 */
  .lh-gauge__arc,
  [class*="chevron"], [class*="caret"] { transition-duration: 0.01ms !important; }

  /* 登場アニメは移動を消して fade のみ */
  .modal, .toast, .modal-backdrop { animation-duration: 0.01ms !important; }

  /* スピナーは処理中の合図として意図的に残す */
}
```

> 手軽に済ませたい小規模アプリなら、`*, *::before, *::after` に `animation-duration/transition-duration: 0.01ms !important` を一括適用する「全体リセット」でも可。ただしスピナーも止まる点に注意。

---

## 7. アイコン

- **インライン SVG** で `viewBox="0 0 24 24"` + `fill="currentColor"`。色は親の `color` に追従
- サイズクラス: `.icon { 16px }` / `.icon--sm { 14px }` / `.icon--lg { 20px }`
- パネル見出しやアクセント箇所のアイコンは `--primary-500`、注意喚起は `--color-average` (橙)
- `flex-shrink: 0; vertical-align: middle;` を付けてテキストと揃える

---

## 8. アクセシビリティ規約

- インタラクティブ要素に `:focus-visible` で `2px solid var(--primary-400)` のアウトライン
- モーダルは `role="dialog" aria-modal="true" aria-labelledby`、閉じるボタンに `aria-label`
- ローディングは `role="status" aria-live="polite"`
- 装飾 SVG / 背景は `aria-hidden="true"`
- `all: unset` で作った擬似ボタンには `role="button" tabindex="0"` とキーボードハンドラを付ける
- 状態は色だけに頼らずアイコン/ラベルを併記 (トーストの ✓ / !、audit のアイコン等)

---

## 9. 新規アプリでの適用手順

1. `:root` に [§1 のトークン](#1-デザイントークンcss-変数)を丸ごとコピー
2. `body` に [§2 のフォント設定](#2-タイポグラフィ)を適用
3. `.aurora` (§4.1) をページ最背面に置く → 一瞬でこの世界観になる
4. 箱はすべて `.panel` (§4.2) で作る。見出しは `.panel__title` パターン
5. ボタン・フォーム・モーダルは §5 のクラスをそのまま流用 (クラス名も揃えると横断メンテしやすい)
6. スコア/ステータス表現が要るなら §4.3 のゲージ + 3色ルール (pass/average/fail)
7. ローディングは §6 の4パターンから選ぶ

### やってはいけないこと (トンマナが崩れる)

- ❌ 生の HEX を新規に散らす → 必ず変数
- ❌ 角丸を 10px や 16px など独自値にする → 12 / 8 / 999 の3択
- ❌ 影を独自に盛る → `--shadow-sm/md/lg`
- ❌ 青以外を差し色にする (紫は識別専用、状態色は状態専用)
- ❌ パネルを不透明ベタ塗りにする → ガラス (`backdrop-filter`) を殺さない
- ❌ `backdrop-filter` に `-webkit-` を書き忘れる → Safari で崩れる
- ❌ 数値に `tabular-nums` を付け忘れる → 桁がガタつく

---

## 10. 参照

- カラー/変数の一次ソース: [public/css/dashboard.css](public/css/dashboard.css) 冒頭 `:root`
- レイアウト構造の実例: [public/index.html](public/index.html)
- このデザインの由来は Web Quality Crawler ダッシュボード。スクリーンショットは [README.md](README.md) 参照
