// =============================================================
// Web Quality Crawler — Dashboard (v3: domains/pages + glass + animated)
// =============================================================

const CATEGORY_ORDER = [
  'llmo', 'semantic', 'structured', 'readable', 'a11y', 'perf', 'links',
  'info', 'text', 'visual', 'usability',
];
const CATEGORY_LABEL = {
  llmo: 'LLMO 基盤',
  semantic: 'セマンティック HTML',
  structured: '構造化データ',
  readable: '機械可読性',
  a11y: 'ARIA・アクセシビリティ',
  perf: 'HTML 軽量化 / Core Web Vitals',
  links: 'リンク健全性',
  info: '情報設計',
  text: 'テキスト品質',
  visual: 'ビジュアル',
  usability: '操作のしやすさ',
};
const CATEGORY_SHORT = {
  llmo: 'LLMO', semantic: 'Semantic', structured: 'Structured',
  readable: 'Readable', a11y: 'A11y', perf: 'Perf', links: 'Links',
  info: 'Info', text: 'Text', visual: 'Visual', usability: 'Usability',
};

// メインカテゴリ定義 (rules/index.js の MAIN_CATEGORIES と同期)
// 'lighthouse' はスコアレジストリには含めず、Audits タブの仮想フィルタとして扱う (sources[] ベース)
const MAIN_CATEGORY_ORDER = ['lighthouse', 'info', 'text', 'visual', 'usability', 'code'];
const MAIN_CATEGORY_LABEL = {
  code: 'コード品質',
  info: '情報設計',
  text: 'テキスト品質',
  visual: 'ビジュアル',
  usability: '操作のしやすさ',
  lighthouse: 'Lighthouse',
};
const MAIN_CATEGORY_SHORT = {
  code: 'Code',
  info: 'Info',
  text: 'Text',
  visual: 'Visual',
  usability: 'Usability',
  lighthouse: 'Lighthouse',
};
const SUB_TO_MAIN = {
  llmo: 'code', semantic: 'code', structured: 'code', readable: 'code',
  a11y: 'code', perf: 'code', links: 'code',
  info: 'info', text: 'text', visual: 'visual', usability: 'usability',
};
function mainOf(subCategory) {
  return SUB_TO_MAIN[subCategory] || 'code';
}

// Lighthouse ネイティブカテゴリ (main='lighthouse' 選択時のサブタブで使用)
const LH_SUB_ORDER = ['performance', 'accessibility', 'best-practices', 'seo'];
const LH_SUB_SHORT = {
  performance: 'Perf',
  accessibility: 'A11y',
  'best-practices': 'Best',
  seo: 'SEO',
};

// sources[] が無い旧レポート互換: id prefix から推測する
function isLighthouseVirtual(v) {
  return typeof v.id === 'string' && v.id.startsWith('lighthouse:');
}
function hasLighthouseSource(v) {
  if (Array.isArray(v.sources)) return v.sources.some((s) => s.type === 'lighthouse');
  return isLighthouseVirtual(v);
}
function hasCodeSource(v) {
  if (Array.isArray(v.sources)) return v.sources.some((s) => s.type === 'code');
  // sources[] が無い古いレポートは LH 仮想でない限り Code ルール由来とみなす
  return !isLighthouseVirtual(v);
}
function lighthouseSubOf(v) {
  if (Array.isArray(v.sources)) {
    const s = v.sources.find((x) => x.type === 'lighthouse');
    if (s?.category) return s.category;
  }
  // LH 仮想 violation の場合はサブカテゴリから LH カテゴリを逆推定
  if (isLighthouseVirtual(v)) {
    const map = { perf: 'performance', a11y: 'accessibility', semantic: 'best-practices', llmo: 'seo' };
    return map[v.category] || 'performance';
  }
  return null;
}
function violationInMain(v, main) {
  if (main === 'all') return true;
  if (main === 'lighthouse') return hasLighthouseSource(v);
  if (main === 'code') {
    // LH 単独 virtual は Code から除外。それ以外 (sources 有無問わず) は category が code ファミリなら Code
    if (isLighthouseVirtual(v) && !hasCodeSource(v)) return false;
    return (v.mainCategory || mainOf(v.category)) === 'code';
  }
  return (v.mainCategory || mainOf(v.category)) === main;
}
const SEVERITY_LABEL = { critical: 'Critical', major: 'Major', minor: 'Minor' };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };

// --- Icons -------------------------------------------------------------
const ICON = {
  check: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.41 14.59L6 12l1.41-1.41 3.18 3.18 6.36-6.36 1.41 1.41-7.77 7.77z"/></svg>`,
  x: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm3.59 12.3a1 1 0 11-1.42 1.4L12 13.42l-2.17 2.3a1 1 0 11-1.42-1.41L10.59 12 8.41 9.7a1 1 0 111.42-1.4L12 10.58l2.17-2.3a1 1 0 111.42 1.42L13.41 12l2.18 2.3z"/></svg>`,
  triangle: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 17.36L14.93 4.1a3.4 3.4 0 00-5.86 0L1.44 17.36a3.4 3.4 0 002.93 5.1h15.26a3.4 3.4 0 002.93-5.1zM12 19.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm1-5.5a1 1 0 11-2 0V9a1 1 0 112 0v5z"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a1.25 1.25 0 110 2.5A1.25 1.25 0 0112 7zm1 10h-.5a1.5 1.5 0 01-1.5-1.5V12a1 1 0 112 0v3.5a.5.5 0 00.5.5H13a1 1 0 110 2z"/></svg>`,
  chart: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M22 19v2H2V3h2v16h18zM7 17H5v-5h2v5zm4 0H9V8h2v9zm4 0h-2v-7h2v7zm4 0h-2V6h2v11z"/></svg>`,
  target: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm0-13a5 5 0 100 10 5 5 0 000-10zm0 8a3 3 0 110-6 3 3 0 010 6zm0-4a1 1 0 100 2 1 1 0 000-2z"/></svg>`,
  clock: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4 13h-5a1 1 0 01-1-1V7a1 1 0 112 0v6h4a1 1 0 110 2z"/></svg>`,
  list: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M4 6h16a1 1 0 100-2H4a1 1 0 100 2zm0 7h16a1 1 0 100-2H4a1 1 0 100 2zm0 7h16a1 1 0 100-2H4a1 1 0 100 2z"/></svg>`,
  filter: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18a1 1 0 01.7 1.7L15 12.4V20a1 1 0 01-1.45.9l-4-2A1 1 0 019 18v-5.6L2.3 5.7A1 1 0 013 4z"/></svg>`,
  chevron: `<svg class="icon icon--chevron" viewBox="0 0 24 24"><path fill="currentColor" d="M9.3 7.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L12.58 12 9.3 8.7a1 1 0 010-1.4z"/></svg>`,
  trendUp: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M21 7h-5a1 1 0 100 2h2.6l-5.6 5.59-3.29-3.3a1 1 0 00-1.42 0l-5 5a1 1 0 101.42 1.42L8 13.41l3.3 3.3a1 1 0 001.4 0L19 10.4V13a1 1 0 102 0V7z"/></svg>`,
  bulb: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 00-4 12.74V17a2 2 0 002 2h4a2 2 0 002-2v-2.26A7 7 0 0012 2zm2 15h-4v-1h4v1zm-2-3.5a1 1 0 01-1-1V10a1 1 0 112 0v2.5a1 1 0 01-1 1z"/></svg>`,
  plus: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 17.27l5.18 3.73-1.64-6.03L20 10.97l-6.19-.51L12 4.5l-1.81 5.96L4 10.97l4.46 3.99L6.82 21z"/></svg>`,
  send: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>`,
  external: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14 3a1 1 0 100 2h3.59l-8.3 8.3a1 1 0 101.42 1.4L19 6.42V10a1 1 0 102 0V4a1 1 0 00-1-1h-6zM5 7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5a1 1 0 10-2 0v5H5V9h5a1 1 0 100-2H5z"/></svg>`,
  download: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3a1 1 0 011 1v8.59l2.3-2.3a1 1 0 011.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.42l2.3 2.3V4a1 1 0 011-1zM5 19a1 1 0 100 2h14a1 1 0 100-2H5z"/></svg>`,
  edit: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
  grip: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/></svg>`,
  pause: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
  play: `<svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>`,
};

// --- Utilities ----------------------------------------------------------

function scoreRating(score) {
  if (score == null || !Number.isFinite(Number(score))) return 'na';
  const s = Number(score);
  if (s >= 90) return 'pass';
  if (s >= 50) return 'average';
  return 'fail';
}

const CIRCUMFERENCE = 2 * Math.PI * 56;
let gaugeIdSeq = 0;

function gaugeHtml(score, size = 'medium') {
  const rating = scoreRating(score);
  if (rating === 'na') {
    return `<div class="lh-gauge lh-gauge--${size} lh-gauge--na"><div>—</div></div>`;
  }
  const s = Math.max(0, Math.min(100, Math.round(Number(score))));
  const id = `g${++gaugeIdSeq}`;
  // Start at 0 (offset = CIRCUMFERENCE), then animate to target via JS after mount
  return `
    <div class="lh-gauge lh-gauge--${size} lh-gauge--${rating}" data-gauge-id="${id}" data-gauge-target="${s}">
      <svg class="lh-gauge__svg" viewBox="0 0 120 120">
        <circle class="lh-gauge__base" r="56" cx="60" cy="60"></circle>
        <circle class="lh-gauge__arc" r="56" cx="60" cy="60"
          style="stroke-dasharray:${CIRCUMFERENCE.toFixed(2)};stroke-dashoffset:${CIRCUMFERENCE.toFixed(2)};"></circle>
      </svg>
      <div class="lh-gauge__percentage count-up" data-count-target="${s}">0</div>
    </div>`;
}

/** 全ての data-gauge-id をアニメで埋める。renderMain 完了後に呼ぶ */
function animateGauges(root = document) {
  const gauges = [...root.querySelectorAll('[data-gauge-id][data-gauge-target]')];
  if (gauges.length === 0) {
    animateRemainingCounters(root);
    return;
  }
  // まず一度 reflow を発生させて初期状態 (stroke-dashoffset = CIRCUMFERENCE) を
  // ブラウザにペイントさせる。double-RAF でないと innerHTML 直後の同フレームで
  // 最終値に「ワープ」してしまう。
  void root.getBoundingClientRect?.();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const el of gauges) {
        const target = Number(el.dataset.gaugeTarget);
        const arc = el.querySelector('.lh-gauge__arc');
        const pct = el.querySelector('.lh-gauge__percentage');
        if (!arc || !pct) continue;
        const offset = CIRCUMFERENCE * (1 - target / 100);
        arc.style.strokeDashoffset = offset.toFixed(2);
        animateNumber(pct, 0, target, 1200);
        delete el.dataset.gaugeId;
      }
      animateRemainingCounters(root);
    });
  });
}

function animateRemainingCounters(root) {
  for (const el of root.querySelectorAll('.count-up[data-count-target]')) {
    if (el.closest('[data-gauge-target]')) continue;
    const target = Number(el.dataset.countTarget);
    animateNumber(el, 0, target, 900);
    delete el.dataset.countTarget;
  }
}

function animateNumber(el, from, to, durationMs) {
  const t0 = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - t0) / durationMs);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - t, 3);
    const v = Math.round(from + (to - from) * eased);
    el.textContent = String(v);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = String(to);
  }
  requestAnimationFrame(frame);
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }); }
  catch { return String(iso); }
}
function formatDateShort(iso) {
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return String(iso); }
}
function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = `${url} -> ${res.status}`;
    try { const j = JSON.parse(body); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
// 管理者トークン (localStorage 永続)。管理者限定 API はこれを X-Admin-Token で送る。
const ADMIN_TOKEN_KEY = 'wqc_admin_token';
function getAdminToken() { try { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } }
function setAdminToken(token) {
  try { token ? localStorage.setItem(ADMIN_TOKEN_KEY, token) : localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
}
// トークンがあれば認証ヘッダを足す (非管理 API に付いても無害)。
function authHeaders(base = {}) {
  const token = getAdminToken();
  return token ? { ...base, 'x-admin-token': token } : { ...base };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}
async function deleteJson(url) {
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
}
async function patchJson(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// --- Audit / offender renderers ----------------------------------------

// renderOffender で既知フィールドとして扱うキー (これ以外は末尾で汎用的に表示)
const OFFENDER_KNOWN_KEYS = new Set([
  'selector', 'snippet', 'tag',
  'alt', 'linkText', 'href', 'attribute', 'invalidValue',
  'from', 'to', 'text', 'parseError', 'scriptIndex', 'aspect',
  'context', 'rect',
  'aiProblem', 'aiSuggestion',
]);

// 新規ルールが独自フィールド (item / issues / displayed / pair 等) を
// 入れていても表示されるよう、未知の scalar フィールドは汎用 meta として出す。
function renderOffenderExtraMeta(o) {
  const extra = [];
  for (const [k, v] of Object.entries(o || {})) {
    if (OFFENDER_KNOWN_KEYS.has(k)) continue;
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      extra.push(`<strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}`);
    }
  }
  return extra.length > 0 ? `<div class="offender__meta offender__meta--extra">${extra.join(' · ')}</div>` : '';
}

// offender から実ページの該当箇所への deep link を作る。
// 要素 id が取れれば `#id`、無理ならテキストの Scroll-to-Text Fragment (#:~:text=)。
// どちらも作れない offender は null (リンクを出さない)
function buildPageAnchorUrl(o) {
  const base = (state.currentSiteUrl || '').split('#')[0];
  if (!base) return null;
  // selector 末尾寄りの #id、または snippet 内の id 属性
  const idFromSelector = [...(o.selector || '').matchAll(/#([A-Za-z_][\w-]*)/g)].pop()?.[1];
  const idFromSnippet = (o.snippet || '').match(/\bid="([^"<>]+)"/)?.[1];
  const elementId = idFromSelector || idFromSnippet;
  if (elementId) return `${base}#${encodeURIComponent(elementId)}`;
  // ページ上に実在する可視テキストとして信頼できる順: text (検知対象) > linkText > context (周辺テキスト)。
  // HTML マークアップが混ざっている候補 (一部ルールの text はスニペット) は可視テキストではないので除外
  const candidate = [o.text, o.linkText, o.context]
    .map((t) => String(t || '').trim())
    .find((t) => t.length >= 4 && !/[<>{};]/.test(t));
  if (candidate) {
    // text fragment では `-` が範囲区切りのメタ文字なので追加エスケープする
    const frag = encodeURIComponent(candidate.slice(0, 60)).replace(/-/g, '%2D');
    return `${base}#:~:text=${frag}`;
  }
  return null;
}

function renderOffender(o) {
  const parts = [];
  if (o.selector) parts.push(`<code class="offender__selector">${escapeHtml(o.selector)}</code>`);
  if (o.snippet) parts.push(`<pre class="offender__snippet">${escapeHtml(o.snippet)}</pre>`);
  const meta = [];
  if (o.alt !== undefined) meta.push(`alt="${escapeHtml(o.alt)}"`);
  if (o.linkText) meta.push(`text: "${escapeHtml(o.linkText)}"`);
  if (o.href) meta.push(`href: ${escapeHtml(o.href)}`);
  if (o.attribute) meta.push(`${escapeHtml(o.attribute)}="${escapeHtml(o.invalidValue)}"`);
  if (o.from && o.to) meta.push(`${o.from} → ${o.to}`);
  if (o.text) meta.push(`"${escapeHtml(o.text)}"`);
  if (o.parseError) meta.push(`parseError: ${escapeHtml(o.parseError)}`);
  if (o.scriptIndex !== undefined) meta.push(`script[${o.scriptIndex}]`);
  if (o.aspect) meta.push(`観点: ${escapeHtml(o.aspect)}`);
  if (meta.length > 0) parts.push(`<div class="offender__meta">${meta.join(' · ')}</div>`);
  parts.push(renderOffenderExtraMeta(o));
  if (o.context) parts.push(`<div class="offender__context">周辺: ${escapeHtml(o.context)}</div>`);
  const actions = [];
  if (o.rect && state.currentScreenshot) {
    actions.push(`
      <button class="offender__locate-btn" type="button"
              data-locate-x="${o.rect.x}" data-locate-y="${o.rect.y}"
              data-locate-w="${o.rect.w}" data-locate-h="${o.rect.h}">
        ${ICON.target}<span>該当箇所を画像で表示</span>
      </button>`);
  }
  const pageAnchor = buildPageAnchorUrl(o);
  if (pageAnchor) {
    actions.push(`
      <a class="offender__page-link" href="${escapeHtml(pageAnchor)}" target="_blank" rel="noopener noreferrer"
         title="実ページの該当箇所を新規タブで開く (テキスト一致ジャンプはページ側の動的書換えで外れることがあります)">
        ${ICON.external}<span>ページの該当箇所を開く</span>
      </a>`);
  }
  if (actions.length > 0) parts.push(`<div class="offender__actions">${actions.join('')}</div>`);
  if (o.aiProblem || o.aiSuggestion) {
    const problem = o.aiProblem ? `<div class="offender__ai-problem"><strong>問題:</strong> ${escapeHtml(o.aiProblem)}</div>` : '';
    const suggestion = o.aiSuggestion ? `<div class="offender__ai-suggestion">${ICON.bulb}<strong>提案:</strong> ${escapeHtml(o.aiSuggestion)}</div>` : '';
    parts.push(`<div class="offender__ai">${problem}${suggestion}</div>`);
  }
  return `<li class="offender">${parts.join('')}</li>`;
}

function renderOffendersBlock(v) {
  if (!v.offenders || v.offenders.length === 0) return '';
  const items = v.offenders.map(renderOffender).join('');
  const truncNote = v.offendersTruncated
    ? `<div class="offenders__footer">全 ${v.offendersTotal} 件中 ${v.offenders.length} 件を表示</div>`
    : '';
  return `
    <details class="offenders">
      <summary class="offenders__summary">${ICON.chevron}<span>該当箇所 ${v.offendersTotal ?? v.offenders.length} 件を表示</span></summary>
      <ul class="offenders__list">${items}</ul>
      ${truncNote}
    </details>`;
}

function renderAuditSourceBadges(v) {
  const sources = Array.isArray(v.sources) && v.sources.length > 0
    ? v.sources
    : [{ type: 'code', id: v.id }];
  const scoreExcluded = !!v.scoreExcluded;
  return sources.map((s) => {
    if (s.type === 'code') {
      if (scoreExcluded) {
        return '<span class="audit__source audit__source--code-info" title="Quality Crawler の実測値 (参考情報)。このルールはスコア計算に含まれず、スコアは Lighthouse 側に準拠します">Code <em>参考</em></span>';
      }
      return '<span class="audit__source audit__source--code" title="Quality Crawler の独自ルールで検知">Code</span>';
    }
    if (s.type === 'lighthouse') {
      const pct = s.score != null ? Math.round(s.score * 100) : null;
      const cat = s.category || '';
      const catLabel = { performance: 'Perf', accessibility: 'A11y', 'best-practices': 'Best', seo: 'SEO' }[cat] || cat;
      const cls = s.passed === false ? 'audit__source--lh-fail' : 'audit__source--lh-pass';
      const scoreAuthority = scoreExcluded ? ' · スコア準拠元' : '';
      const titleSuffix = scoreExcluded ? ' (このメトリクスのスコアは Lighthouse 準拠)' : '';
      return `<span class="audit__source ${cls}" title="Lighthouse ${cat} の ${s.id} (score ${pct ?? '—'})${titleSuffix}">Lighthouse${catLabel ? ` · ${catLabel}` : ''}${pct != null ? ` <strong>${pct}</strong>` : ''}${scoreAuthority}</span>`;
    }
    return '';
  }).join('');
}

function renderAuditItem(v, { showCategory = false } = {}) {
  const sev = v.severity;
  // 実効ステータス (手動 override 反映後)。注釈が無い場合は passed から導出。
  const st = v.effStatus || (v.passed ? 'detected-ok' : 'detected-ng');
  const isPass = st === 'ok' || st === 'detected-ok';
  const isExcluded = st === 'exclude';
  const isUneval = st === 'unevaluated';
  const passed = isPass; // 既存ロジック (フィルタ判定等) 用
  let iconCls = 'audit__icon--pass';
  let iconSvg = ICON.check;
  if (isExcluded) { iconCls = 'audit__icon--excluded'; iconSvg = ICON.x; }
  else if (isUneval) { iconCls = 'audit__icon--uneval'; iconSvg = ICON.info; }
  else if (!isPass) {
    if (sev === 'minor')    { iconCls = 'audit__icon--minor';    iconSvg = ICON.triangle; }
    else if (sev === 'critical') { iconCls = 'audit__icon--critical'; iconSvg = ICON.x; }
    else                    { iconCls = 'audit__icon--major';    iconSvg = ICON.x; }
  }
  // ステータスピル (OK/NG/除外/未評価) + 手動フラグ
  const statusPill = renderStatusPill(st, v.manual);
  const adminStatusControl = state.isAdmin ? renderStatusControl(v) : '';
  const sevChip = (!isPass && !isExcluded && !isUneval) ? `<span class="audit__severity audit__severity--${sev}">${SEVERITY_LABEL[sev] || sev}</span>` : '';
  const catChip = showCategory ? `<span class="audit__cat">${CATEGORY_SHORT[v.category] || v.category}</span>` : '';
  const weightChip = v.scoreExcluded
    ? '<span class="audit__weight audit__weight--excluded" title="スコア計算から除外 (Lighthouse 準拠)">情報のみ</span>'
    : `<span class="audit__weight">w${v.weight}</span>`;
  const offCount = v.offenders?.length
    ? `<span class="audit__offcount">${v.offendersTotal ?? v.offenders.length} 件</span>`
    : '';
  const sourceBadges = renderAuditSourceBadges(v);

  // 本体（展開時のみ表示）
  const msg = v.message ? `<div class="audit__body">${escapeHtml(v.message)}</div>` : '';
  const offendersBlock = !passed ? renderOffendersBlock(v) : '';
  const fix = (!passed && v.fix)
    ? `<div class="audit__body audit__fix">${ICON.bulb}<span>${escapeHtml(v.fix)}</span></div>`
    : '';
  const aiBtn = (!passed && v.offenders && v.offenders.length > 0)
    ? `<button class="ai-suggest-btn" data-audit-id="${escapeHtml(v.id)}">${ICON.bulb}<span>AIに修正提案を依頼</span></button>`
    : '';
  const aiSlot = !passed ? `<div class="ai-suggest" data-audit-slot="${escapeHtml(v.id)}"></div>` : '';

  const hasBody = !passed || v.message || state.isAdmin;
  const summaryContent = `
    <span class="audit__icon ${iconCls}">${iconSvg}</span>
    <div class="audit__title-wrap">
      <p class="audit__title">
        <span class="audit__name">${escapeHtml(v.name)}</span>
        ${statusPill}${sourceBadges}${catChip}${sevChip}${!passed ? weightChip : ''}${offCount}
      </p>
      <button type="button" class="audit__id audit__id--clickable"
              data-cross-view="${escapeHtml(v.id)}"
              title="このルールを横断ビューで表示">${escapeHtml(v.id)}</button>
    </div>
    ${hasBody ? `<span class="audit__chevron">${ICON.chevron}</span>` : ''}`;

  return `
    <li class="audit audit--sev-${sev} ${passed ? 'audit--passed' : 'audit--failed'} ${v.manual ? 'audit--manual' : ''}"
        data-severity="${sev}" data-passed="${passed ? '1' : '0'}"
        data-category="${v.category}" data-audit-id="${escapeHtml(v.id)}">
      ${hasBody ? `
        <details class="audit__details">
          <summary class="audit__summary">${summaryContent}</summary>
          <div class="audit__expanded">
            ${msg}${offendersBlock}${fix}${aiBtn}${aiSlot}${adminStatusControl}
          </div>
        </details>` : `
        <div class="audit__summary">${summaryContent}</div>`}
    </li>`;
}

const EFF_STATUS_LABEL = { ok: 'OK', ng: 'NG', exclude: '除外', unevaluated: '未評価' };
function renderStatusPill(st, manual) {
  let pill = '';
  if (st === 'ok') pill = `<span class="audit__status audit__status--ok">OK</span>`;
  else if (st === 'ng') pill = `<span class="audit__status audit__status--ng">NG</span>`;
  else if (st === 'exclude') pill = `<span class="audit__status audit__status--exclude">除外</span>`;
  else if (st === 'unevaluated') pill = `<span class="audit__status audit__status--uneval">未評価</span>`;
  const manualMark = manual
    ? `<span class="audit__manual-flag" title="管理者が手動で設定したステータスです（自動検知の結果を上書き）">${ICON.edit}<span>手動設定</span></span>`
    : '';
  return pill + manualMark;
}

// 管理者用ステータス変更コントロール (除外 / NG / OK / 検知に戻す)。
function renderStatusControl(v) {
  const cur = v.effStatus || '';
  const btn = (status, label) =>
    `<button type="button" class="status-btn ${cur === status ? 'status-btn--active' : ''}" data-set-status="${status}" data-rule-id="${escapeHtml(v.id)}">${label}</button>`;
  return `
    <div class="audit__status-control">
      <span class="audit__status-control-label">手動ステータス:</span>
      ${btn('ok', 'OK')}${btn('ng', 'NG')}${btn('exclude', '除外')}
      <button type="button" class="status-btn status-btn--reset" data-set-status="detected" data-rule-id="${escapeHtml(v.id)}">検知状態に戻す</button>
    </div>`;
}

// --- Lighthouse panel ---------------------------------------------------

const LIGHTHOUSE_CATEGORIES = [
  { key: 'performance',     label: 'Performance' },
  { key: 'accessibility',   label: 'Accessibility' },
  { key: 'best-practices',  label: 'Best Practices' },
  { key: 'seo',             label: 'SEO' },
];

function openLighthouseDetailModal(catKey) {
  const lh = state.currentResult?.lighthouse;
  if (!lh?.failedAudits) return;
  const audits = lh.failedAudits[catKey] || [];
  const catLabel = LIGHTHOUSE_CATEGORIES.find((c) => c.key === catKey)?.label || catKey;
  const items = audits.map((a) => {
    const scorePct = a.score != null ? Math.round(a.score * 100) : null;
    const rating = scorePct >= 50 ? 'average' : 'fail';
    return `
      <li class="lh-audit-item lh-audit-item--${rating}">
        <div class="lh-audit-item__head">
          <span class="lh-audit-item__title">${escapeHtml(a.title)}</span>
          <span class="lh-audit-item__score">${scorePct ?? '—'}</span>
        </div>
        ${a.displayValue ? `<div class="lh-audit-item__display">${escapeHtml(a.displayValue)}</div>` : ''}
        ${a.description ? `<div class="lh-audit-item__desc">${renderMarkdown(a.description)}</div>` : ''}
        <div class="lh-audit-item__meta">
          <code>${escapeHtml(a.id)}</code>
          ${a.weight > 0 ? `<span>weight: ${a.weight}</span>` : ''}
        </div>
      </li>`;
  }).join('');
  const body = audits.length === 0
    ? `<div class="empty-state">Failed audits は無しです。</div>`
    : `<ol class="lh-audit-list">${items}</ol>`;
  openModal(`Lighthouse: ${catLabel} の failed audits (${audits.length})`, body, { wide: true });
}

// --- Panels -------------------------------------------------------------

function renderTotalPanel(r) {
  const total = r.score.total;
  const threshold = r.site.thresholds?.total ?? 80;
  const meetsThreshold = total >= threshold;
  return `
    <div class="panel panel--total">
      ${gaugeHtml(total, 'xlarge')}
      <div class="panel--total__meta">
        <div class="panel--total__label">Total Score</div>
        <div class="panel--total__threshold">${ICON.target} 閾値 ${threshold}</div>
        <div class="panel--total__status ${meetsThreshold ? 'panel--total__status--pass' : 'panel--total__status--below'}">
          ${meetsThreshold ? ICON.check + ' 閾値達成' : ICON.x + ' 閾値未達'}
        </div>
      </div>
    </div>`;
}

function renderBreakdownPanel(r, violations) {
  const counts = r.score.counts;
  const passedCount = violations.filter((v) => v.passed).length;
  const total = violations.length;
  return `
    <div class="panel panel--breakdown">
      <h3 class="panel__title">${ICON.chart} Violation Breakdown</h3>
      <ul>
        <li class="breakdown__item breakdown__item--critical">
          <span class="breakdown__label">${ICON.x} Critical</span>
          <span class="breakdown__value count-up" data-count-target="${counts.critical || 0}">0</span>
        </li>
        <li class="breakdown__item breakdown__item--major">
          <span class="breakdown__label">${ICON.x} Major</span>
          <span class="breakdown__value count-up" data-count-target="${counts.major || 0}">0</span>
        </li>
        <li class="breakdown__item breakdown__item--minor">
          <span class="breakdown__label">${ICON.triangle} Minor</span>
          <span class="breakdown__value count-up" data-count-target="${counts.minor || 0}">0</span>
        </li>
        <li class="breakdown__item breakdown__item--passed">
          <span class="breakdown__label">${ICON.check} Passed</span>
          <span class="breakdown__value count-up" data-count-target="${passedCount}">0</span>
        </li>
      </ul>
      <div class="panel--breakdown__footer">Total ${total} audits evaluated</div>
    </div>`;
}

function renderSubItemInPopover(sub, r, violations) {
  const cv = violations.filter((v) => v.category === sub);
  if (cv.length === 0) return '';
  const score = r.score.categories?.[sub];
  const failed = cv.filter((v) => !v.passed).length;
  const label = CATEGORY_LABEL[sub] || sub;
  const rating = scoreRating(score);
  return `
    <li class="main-popover__sub" data-sub-jump="${escapeHtml(sub)}">
      <div class="main-popover__sub-info">
        <span class="main-popover__sub-name">${escapeHtml(label)}</span>
        <span class="main-popover__sub-meta">
          ${failed > 0 ? `<span class="main-popover__sub-failed">${failed} failed</span>` : ''}
          <span class="main-popover__sub-total">${cv.length} rules</span>
        </span>
      </div>
      <span class="main-popover__sub-score main-popover__sub-score--${rating}">${score ?? '—'}</span>
    </li>`;
}

function renderLighthouseMainCard(r) {
  const lh = r?.lighthouse;
  if (!lh || !lh.scores) return '';
  const items = LIGHTHOUSE_CATEGORIES.map((c) => {
    const score = lh.scores[c.key];
    if (score == null) return '';
    const failedCount = lh.failedAudits?.[c.key]?.length ?? 0;
    const rating = scoreRating(score);
    return `
      <li class="main-popover__sub" data-lh-jump="${c.key}">
        <div class="main-popover__sub-info">
          <span class="main-popover__sub-name">${escapeHtml(c.label)}</span>
          <span class="main-popover__sub-meta">
            ${failedCount > 0 ? `<span class="main-popover__sub-failed">${failedCount} failed</span>` : '<span>全 pass</span>'}
          </span>
        </div>
        <span class="main-popover__sub-score main-popover__sub-score--${rating}">${score}</span>
      </li>`;
  }).filter(Boolean).join('');

  // 平均スコア
  const scoreVals = Object.values(lh.scores).filter((s) => Number.isFinite(s));
  const avg = scoreVals.length > 0 ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length) : null;
  const totalFailed = Object.values(lh.failedAudits || {}).reduce((sum, arr) => sum + arr.length, 0);

  return `
    <div class="main-card main-card--lighthouse" data-main-card="lighthouse">
      ${gaugeHtml(avg, 'medium')}
      <div class="main-card__title">Lighthouse</div>
      <div class="main-card__stats">
        ${totalFailed > 0 ? `<span class="main-card__stat main-card__stat--fail"><strong>${totalFailed}</strong> failed</span>` : ''}
        <span class="main-card__stat">${lh.formFactor || 'desktop'}</span>
      </div>
      <div class="main-popover" role="tooltip" aria-hidden="true">
        <div class="main-popover__title">
          <span class="main-card__badge">Lighthouse</span>
          <span>カテゴリ別スコア</span>
        </div>
        <ul class="main-popover__list">${items}</ul>
      </div>
    </div>`;
}

// サブカテゴリのスコア群から、メインカテゴリのスコアを単純平均で算出する。
// scorer.js が同じロジックで mainCategories を出力する新レポートでは stored 値と一致するが、
// 旧レポート (mainCategories なし) でも正しく表示するためのフォールバック兼算出関数。
function computeMainScoreFromSubs(r, main) {
  const subs = CATEGORY_ORDER.filter((c) => mainOf(c) === main);
  const subScores = subs
    .map((s) => r.score?.categories?.[s])
    .filter((s) => Number.isFinite(s));
  if (subScores.length === 0) return null;
  return Math.round(subScores.reduce((a, b) => a + b, 0) / subScores.length);
}

function computeMainCountsFromViolations(main, violations) {
  const mainViolations = violations.filter((v) => (v.mainCategory || mainOf(v.category)) === main);
  return {
    total: mainViolations.length,
    passed: mainViolations.filter((v) => v.passed).length,
    failed: mainViolations.filter((v) => !v.passed).length,
    critical: mainViolations.filter((v) => !v.passed && v.severity === 'critical').length,
    major: mainViolations.filter((v) => !v.passed && v.severity === 'major').length,
    minor: mainViolations.filter((v) => !v.passed && v.severity === 'minor').length,
  };
}

// popover を body 直下へ移す (card ancestor の transform / backdrop-filter が
// fixed positioning の containing block を作って popover 座標がカード基準に
// なるのを回避する。card と popover は data 属性でリンクして取り回す)。
// 再レンダリング時は古い body-level popover を破棄してから新しく移す。
function detachAllMainPopovers() {
  for (const p of document.querySelectorAll('body > .main-popover')) p.remove();
  for (const card of document.querySelectorAll('[data-main-card]')) {
    const popover = card.querySelector(':scope > .main-popover');
    if (popover) {
      popover.dataset.popoverFor = card.dataset.mainCard;
      document.body.appendChild(popover);
    }
  }
}
function getMainPopoverFor(card) {
  const key = card.dataset.mainCard;
  return document.querySelector(`.main-popover[data-popover-for="${CSS.escape(key)}"]`);
}
function closeAllMainPopovers() {
  for (const c of document.querySelectorAll('[data-main-card]')) c.classList.remove('main-card--pinned');
  for (const p of document.querySelectorAll('.main-popover')) {
    p.classList.remove('main-popover--visible', 'main-popover--pinned');
  }
}

// メインカード popover の fixed 位置計算。
// 中央寄せしつつビューポート内に clamp し、矢印は元々の card 中央を指す。
function positionMainPopover(card) {
  const popover = getMainPopoverFor(card) || card.querySelector('.main-popover');
  if (!popover) return;
  const cardRect = card.getBoundingClientRect();
  // 幅を実測するために一旦 display だけ確保
  const prevVisibility = popover.style.visibility;
  popover.style.visibility = 'hidden';
  popover.style.display = 'block';
  const popWidth = popover.offsetWidth || 300;
  const popHeight = popover.offsetHeight || 180;
  popover.style.visibility = prevVisibility;
  popover.style.display = '';

  const margin = 12;
  const cardCenterX = cardRect.left + cardRect.width / 2;
  let left = cardCenterX - popWidth / 2;
  left = Math.max(margin, Math.min(window.innerWidth - popWidth - margin, left));

  // 下に入らない場合は上に出す
  let top = cardRect.bottom + 8;
  let openAbove = false;
  if (top + popHeight > window.innerHeight - margin) {
    top = cardRect.top - popHeight - 8;
    openAbove = true;
  }

  popover.style.left = left + 'px';
  popover.style.top = top + 'px';
  // 矢印位置 (popover 左端から card 中央までの距離)
  const arrowX = Math.max(16, Math.min(popWidth - 16, cardCenterX - left));
  popover.style.setProperty('--arrow-offset', arrowX + 'px');
  popover.classList.toggle('main-popover--above', openAbove);
}

function renderCategoryCards(r, violations) {
  // mainCategory 毎に 1 枚のメインカードを描画。sub は hover/click でフローティング表示
  // MAIN_CATEGORY_ORDER 通りの順で出す (Lighthouse も同列に混ざる)。
  const mainsPresent = new Set(violations.map((v) => v.mainCategory || mainOf(v.category)));
  const cards = [];
  for (const main of MAIN_CATEGORY_ORDER) {
    if (main === 'lighthouse') {
      const lhCard = renderLighthouseMainCard(r);
      if (lhCard) cards.push(lhCard);
      continue;
    }
    if (!mainsPresent.has(main)) continue;
    const subs = CATEGORY_ORDER.filter((c) => mainOf(c) === main);
    const subItemsHtml = subs.map((s) => renderSubItemInPopover(s, r, violations)).filter(Boolean).join('');
    if (!subItemsHtml) continue;

    // 旧レポート互換: mainCategories が無ければサブから単純平均で算出
    const mainScore = r.score?.mainCategories?.[main] ?? computeMainScoreFromSubs(r, main);
    const mainCounts = r.score?.mainCounts?.[main] ?? computeMainCountsFromViolations(main, violations);
    const failedN = mainCounts?.failed ?? 0;
    const passedN = mainCounts?.passed ?? 0;

    cards.push(`
      <div class="main-card" data-main-card="${main}">
        ${gaugeHtml(mainScore, 'medium')}
        <div class="main-card__title">${escapeHtml(MAIN_CATEGORY_LABEL[main] || main)}</div>
        <div class="main-card__stats">
          ${failedN > 0 ? `<span class="main-card__stat main-card__stat--fail"><strong>${failedN}</strong> failed</span>` : ''}
          <span class="main-card__stat"><strong>${passedN}</strong> passed</span>
        </div>
        <div class="main-popover" role="tooltip" aria-hidden="true">
          <div class="main-popover__title">
            <span class="main-card__badge">${escapeHtml(MAIN_CATEGORY_SHORT[main] || main)}</span>
            <span>サブカテゴリ別スコア</span>
          </div>
          <ul class="main-popover__list">${subItemsHtml}</ul>
        </div>
      </div>`);
  }
  return `<div class="main-card-row">${cards.join('')}</div>`;
}

// --- Trend chart -------------------------------------------------------

// 推移グラフのコンテナを返す。データは drawTrendChart() が /api/history から非同期取得して描画。
function renderTrendPanel(pageEntry) {
  const threshold = pageEntry?.runs?.[0]?.threshold ?? 80;
  const periodBtns = TREND_DAYS_OPTIONS.map((d) =>
    `<button type="button" class="trend-period ${state.trend.days === d ? 'trend-period--active' : ''}" data-trend-days="${d}">${d}日</button>`
  ).join('');
  const legend = TREND_SERIES.map((s) =>
    `<button type="button" class="trend-legend ${state.trend.hidden.has(s.key) ? 'trend-legend--off' : ''}" data-trend-series="${s.key}">
      <span class="trend-legend__swatch" style="background:${s.color}"></span>${s.label}
    </button>`
  ).join('');
  return `
    <div class="panel panel--trend" data-trend
         data-domain-id="${escapeHtml(state.currentDomainId || '')}"
         data-page-id="${escapeHtml(state.currentPageId || '')}"
         data-threshold="${threshold}">
      <div class="trend-head">
        <h3 class="panel__title">${ICON.trendUp} Score Trend</h3>
        <div class="trend-periods">${periodBtns}</div>
      </div>
      <div class="trend-legends">${legend}</div>
      <div class="trend-svg-wrap" id="trend-svg-wrap"><div class="trend-empty">読み込み中…</div></div>
    </div>`;
}

// /api/history から取得して複数シリーズの折線を描画する。
async function drawTrendChart() {
  const panel = document.querySelector('[data-trend]');
  if (!panel) return;
  const wrap = panel.querySelector('#trend-svg-wrap');
  const domainId = panel.dataset.domainId;
  const pageId = panel.dataset.pageId;
  const threshold = Number(panel.dataset.threshold) || 80;
  if (!domainId || !pageId) { wrap.innerHTML = `<div class="trend-empty">データなし</div>`; return; }
  let series;
  try {
    const resp = await fetchJson(`/api/history?domainId=${encodeURIComponent(domainId)}&pageId=${encodeURIComponent(pageId)}&device=${encodeURIComponent(state.currentDevice)}&days=${state.trend.days}`);
    series = resp.series || [];
  } catch (err) {
    wrap.innerHTML = `<div class="trend-empty">履歴取得エラー: ${escapeHtml(err.message)}</div>`;
    return;
  }
  if (series.length < 1) { wrap.innerHTML = `<div class="trend-empty">この期間のデータがありません</div>`; return; }

  const valueOf = (pt, key) => key === 'total' ? pt.total
    : key === 'lhAvg' ? pt.lhAvg
    : (pt.mainCategories ? pt.mainCategories[key] : null);

  const W = 1200, H = 260;
  const padL = 44, padR = 24, padT = 16, padB = 38;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = series.length;
  const xFor = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yFor = (v) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;
  const gridLines = [0, 25, 50, 75, 100].map((v) => `<line x1="${padL}" y1="${yFor(v)}" x2="${W - padR}" y2="${yFor(v)}"/>`).join('');
  const yLabels = [0, 50, 100].map((v) => `<text x="${padL - 8}" y="${yFor(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const tickIdx = n <= 3 ? series.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const xLabels = tickIdx.map((i) => `<text x="${xFor(i)}" y="${H - 12}" text-anchor="middle">${escapeHtml(formatDateShort(series[i].startedAt))}</text>`).join('');
  const thY = yFor(threshold);
  const thresholdLine = `<line class="trend-threshold" x1="${padL}" y1="${thY}" x2="${W - padR}" y2="${thY}"/>
    <text class="trend-threshold-label" x="${W - padR}" y="${thY - 6}" text-anchor="end">閾値 ${threshold}</text>`;

  const lines = TREND_SERIES.filter((s) => !state.trend.hidden.has(s.key)).map((s) => {
    const pts = series.map((pt, i) => ({ i, v: valueOf(pt, s.key) })).filter((p) => Number.isFinite(p.v));
    if (!pts.length) return '';
    const poly = pts.map((p) => `${xFor(p.i)},${yFor(p.v)}`).join(' ');
    const dots = pts.map((p) => {
      const cx = xFor(p.i), cy = yFor(p.v);
      // 透明の大きめ当たり判定 + 表示用ドット
      return `<circle class="trend-hit" cx="${cx}" cy="${cy}" r="10" fill="transparent"
                data-label="${escapeHtml(s.label)}" data-date="${escapeHtml(formatDateShort(series[p.i].startedAt))}" data-value="${p.v}" data-color="${s.color}"></circle>
              <circle class="trend-dot" cx="${cx}" cy="${cy}" r="3.2" fill="${s.color}"></circle>`;
    }).join('');
    const line = pts.length >= 2 ? `<polyline points="${poly}" fill="none" stroke="${s.color}" stroke-width="2"/>` : '';
    return line + dots;
  }).join('');

  wrap.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <g class="trend-grid">${gridLines}</g>
      ${thresholdLine}
      ${lines}
      <g class="trend-axis">${yLabels}${xLabels}</g>
    </svg>
    <div class="trend-tooltip" id="trend-tooltip" hidden></div>`;

  // ドットホバーでツールチップ表示
  const tip = wrap.querySelector('#trend-tooltip');
  for (const hit of wrap.querySelectorAll('.trend-hit')) {
    hit.addEventListener('mouseenter', () => {
      tip.innerHTML = `<span class="trend-tooltip__row"><span class="trend-tooltip__sw" style="background:${hit.dataset.color}"></span>${escapeHtml(hit.dataset.label)}<strong>${escapeHtml(hit.dataset.value)}</strong></span><span class="trend-tooltip__date">${escapeHtml(hit.dataset.date)}</span>`;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect();
      const cr = hit.getBoundingClientRect();
      tip.style.left = `${cr.left - wr.left + cr.width / 2}px`;
      tip.style.top = `${cr.top - wr.top}px`;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
  }
}

// --- Priority recommend -----------------------------------------------

function renderPriorityPanel(r, violations) {
  const failed = (violations || []).filter((v) => !v.passed);
  if (failed.length === 0) return '';
  const key = priorityKeyFor(r);
  const cached = state.priorityCache.get(key);
  return `
    <section class="panel priority-panel" data-priority-panel>
      <div class="panel__title-row">
        <h3 class="panel__title">${ICON.star}<span>AI 優先度レコメンド</span></h3>
        <button class="btn btn--primary priority-panel__btn" id="priority-run-btn"
                ${cached ? 'hidden' : ''}>
          ${ICON.bulb}<span style="margin-left:6px">
            ${cached ? '再生成' : '優先順位を提案 (AI)'}
          </span>
        </button>
      </div>
      <p class="priority-panel__hint">
        現状の検知結果をもとに、総合スコアを最も改善できる対応を AI が ${' '}Top 3〜5 で提案します。
      </p>
      <div class="priority-panel__body" data-priority-slot>
        ${cached ? renderPriorityContent(cached) : ''}
      </div>
    </section>`;
}

function priorityKeyFor(r) {
  const did = r.site?.domainId ?? 'd';
  const pid = r.site?.pageId ?? 'p';
  const ts = r.startedAt ?? r.timestamp ?? '';
  return `${did}/${pid}/${ts}`;
}

function effortLabel(effort) {
  return { low: '低', medium: '中', high: '高' }[effort] || effort || '—';
}

function renderPriorityContent(payload) {
  if (!payload) return '';
  if (payload.error) {
    return `<div class="priority-error">${ICON.triangle}<span>${escapeHtml(payload.error)}</span></div>`;
  }
  const items = (payload.priorities || []).map((p, idx) => {
    const v = (state.currentViolations || []).find((x) => x.id === p.ruleId);
    const ruleName = v?.name || p.ruleId;
    const category = v?.category || '';
    const severity = v?.severity || '';
    const catChip = category ? `<span class="audit__cat">${escapeHtml(category)}</span>` : '';
    const sevChip = severity ? `<span class="audit__severity audit__severity--${severity}">${escapeHtml(severity)}</span>` : '';
    const gain = Number.isFinite(Number(p.estimatedGain)) ? `+${Math.max(0, Math.round(p.estimatedGain))}pt` : '—';
    // 現在の検知一覧に存在するルールだけページ内ジャンプ可能にする
    const jumpAttr = v ? ` data-jump-audit="${escapeHtml(p.ruleId)}" title="Failed Audits の該当項目へ移動" role="link" tabindex="0"` : '';
    return `
      <li class="priority-item priority-item--effort-${p.effort || 'medium'}"${jumpAttr}>
        <div class="priority-item__rank">${idx + 1}</div>
        <div class="priority-item__main">
          <div class="priority-item__head">
            <span class="priority-item__title">${escapeHtml(ruleName)}</span>
            ${catChip}${sevChip}
            <span class="priority-item__id">${escapeHtml(p.ruleId)}</span>
          </div>
          <p class="priority-item__reason">${escapeHtml(p.reason || '')}</p>
        </div>
        <div class="priority-item__metrics">
          <div class="priority-metric priority-metric--gain">
            <div class="priority-metric__label">期待改善</div>
            <div class="priority-metric__value">${gain}</div>
          </div>
          <div class="priority-metric priority-metric--effort">
            <div class="priority-metric__label">工数</div>
            <div class="priority-metric__value priority-effort priority-effort--${p.effort || 'medium'}">
              ${effortLabel(p.effort)}
            </div>
          </div>
        </div>
      </li>`;
  }).join('');
  const summary = payload.summary
    ? `<div class="priority-summary">${ICON.info}<span>${escapeHtml(payload.summary)}</span></div>`
    : '';
  const cachedTag = payload.cached ? '<span class="priority-cached">(キャッシュ)</span>' : '';
  return `
    ${summary}
    <ol class="priority-list">${items}</ol>
    <div class="priority-footer">
      生成: ${escapeHtml(payload.generatedAt || '')} ${cachedTag}
    </div>`;
}

// --- Findings ----------------------------------------------------------

// 実効的に pass か (手動 override 反映後)。
function effIsPass(v) {
  const s = v.effStatus;
  if (s) return s === 'ok' || s === 'detected-ok';
  return !!v.passed;
}
// メインリスト(failed 側)に表示するか。
// 実効的に未 pass、または「ビジュアル項目は pass 含め常に全件表示」。
function showInFindingsList(v) {
  return !effIsPass(v) || v.mainCategory === 'visual';
}

function renderFindingsBySeverity(violations) {
  const failed = violations.filter(showInFindingsList);
  if (failed.length === 0) return `<div class="findings-empty">${ICON.check}<div>すべての audit が pass しました</div></div>`;
  failed.sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (s !== 0) return s;
    return (b.weight ?? 0) - (a.weight ?? 0);
  });
  const groups = { critical: [], major: [], minor: [] };
  for (const v of failed) (groups[v.severity] || groups.minor).push(v);
  const sections = [];
  for (const sev of ['critical', 'major', 'minor']) {
    if (groups[sev].length === 0) continue;
    const items = groups[sev].map((v) => renderAuditItem(v, { showCategory: true })).join('');
    const icon = sev === 'critical' ? ICON.x : sev === 'major' ? ICON.x : ICON.triangle;
    sections.push(`
      <section class="audit-group audit-group--sev-${sev}">
        <div class="audit-group__header">
          <h4 class="audit-group__name">${icon}<span>${SEVERITY_LABEL[sev]}</span></h4>
          <span class="audit-group__count audit-group__count--${sev}">${groups[sev].length}</span>
        </div>
        <ul class="audits">${items}</ul>
      </section>`);
  }
  return sections.join('');
}

function renderFindingsByCategory(violations) {
  const failed = violations.filter(showInFindingsList);
  if (failed.length === 0) return `<div class="findings-empty">${ICON.check}<div>すべての audit が pass しました</div></div>`;
  const sections = [];
  for (const cat of CATEGORY_ORDER) {
    const cv = failed.filter((v) => v.category === cat);
    if (cv.length === 0) continue;
    cv.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
    const items = cv.map((v) => renderAuditItem(v)).join('');
    sections.push(`
      <section class="audit-group" id="cat-${cat}" data-category="${cat}">
        <div class="audit-group__header">
          <h4 class="audit-group__name"><span>${CATEGORY_LABEL[cat]}</span></h4>
          <span class="audit-group__count">${cv.length}</span>
        </div>
        <ul class="audits">${items}</ul>
      </section>`);
  }
  return sections.join('');
}

function renderPassedAudits(violations) {
  // ビジュアルはメインリストに全件出すため、Passed セクションからは除外して重複を防ぐ。
  const passed = violations.filter((v) => effIsPass(v) && v.mainCategory !== 'visual');
  if (passed.length === 0) return '';
  passed.sort((a, b) => {
    if (a.category !== b.category) return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return a.id.localeCompare(b.id);
  });
  const items = passed.map((v) => renderAuditItem(v, { showCategory: true })).join('');
  return `
    <details class="passed-audits">
      <summary>${ICON.chevron}<span>Passed Audits (${passed.length})</span></summary>
      <ul class="audits">${items}</ul>
    </details>`;
}

// --- Site content -------------------------------------------------------

function renderSiteBanner(r) {
  if (r.error) {
    return `<div class="banner banner--error">${ICON.triangle}<div><strong>計測エラー</strong>${escapeHtml(r.error)}</div></div>`;
  }
  if (r.gateFailed) {
    return `<div class="banner banner--gate">${ICON.x}<div><strong>ゲート条件未通過</strong>${escapeHtml(r.gateResult?.message || '')}<br><span style="font-size:11px">ゲート条件を満たさないため、評価ルールを実行していません。</span></div></div>`;
  }
  return '';
}

// 表示中のページ (またはその親ドメイン) が休止中のとき、再開導線付きのバナーを出す。
function renderPausedBanner(domain, page) {
  const domainPaused = domain.enabled === false;
  const pagePaused = domainPaused || page.enabled === false;
  if (!pagePaused) return '';
  const reason = domainPaused ? domain.pausedReason : page.pausedReason;
  const scopeLabel = domainPaused ? 'このサイト全体' : 'このページ';
  const resumeKind = domainPaused ? 'domain' : 'page';
  const resumeId = domainPaused ? domain.id : `${domain.id}/${page.id}`;
  const resumeBtn = state.isAdmin
    ? `<button class="btn btn--secondary btn--sm banner__action" id="paused-banner-resume-btn"
        data-resume-kind="${escapeHtml(resumeKind)}" data-resume-id="${escapeHtml(resumeId)}">${ICON.play}<span style="margin-left:4px">再開する</span></button>`
    : '';
  return `<div class="banner banner--paused">${ICON.pause}<div><strong>${scopeLabel}のクロールを休止しています</strong>${reason ? escapeHtml(reason) : ''}</div>${resumeBtn}</div>`;
}

function renderMainHeader({ r, run, domainName, pageName, domainId, pageId, paused }) {
  const url = r.pageData?.url || r.site?.url || '';
  // クロール実行中は二重起動を防ぐためボタンを無効化する。休止中も同様に再クロールできない。
  const crawling = isJobRunning(domainId, pageId);
  const recrawlLabel = crawling ? 'クロール中…' : '再クロール';
  return `
    <header class="main-header">
      <div class="main-header__info">
        <div class="main-header__breadcrumb">${escapeHtml(domainName)} <span style="margin:0 6px">›</span> ${escapeHtml(pageName)}</div>
        <h2 class="main-header__name">${escapeHtml(r.site?.name || pageName)}</h2>
        <a class="main-header__url" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      </div>
      <div class="main-header__meta">
        <span class="main-header__meta-item">${ICON.clock}<span>${escapeHtml(formatDate(run.startedAt))}</span></span>
        ${state.isAdmin ? `<button class="btn btn--secondary" id="edit-page-btn"
          data-domain-id="${escapeHtml(domainId)}" data-page-id="${escapeHtml(pageId)}">ページ編集</button>` : ''}
        ${state.isAdmin ? `<button class="btn btn--secondary main-header__recrawl" id="recrawl-btn"
          data-domain-id="${escapeHtml(domainId)}" data-page-id="${escapeHtml(pageId)}" data-page-name="${escapeHtml(pageName)}"
          ${(crawling || paused) ? 'disabled aria-disabled="true"' : ''} ${paused ? 'title="休止中は再クロールできません。再開してから実行してください"' : ''}>
          ${ICON.trendUp}<span style="margin-left:4px">${recrawlLabel}</span>
        </button>` : ''}
      </div>
    </header>`;
}

function renderDeviceTabs(pageEntry) {
  const devices = (pageEntry.page.devices && pageEntry.page.devices.length > 0)
    ? pageEntry.page.devices
    : ['pc'];
  if (devices.length <= 1) return '';
  const label = { pc: 'PC / Desktop', sp: 'SP / Mobile' };
  return `
    <div class="device-tabs" role="tablist">
      ${devices.map((d) => `
        <button class="device-tab ${state.currentDevice === d ? 'device-tab--active' : ''}"
                data-device-tab="${d}">
          ${label[d] || d}
        </button>`).join('')}
    </div>`;
}

function renderSiteContent(r, run, pageEntry, domain) {
  const page = pageEntry.page;
  const paused = domain.enabled === false || page.enabled === false;
  const pausedBanner = renderPausedBanner(domain, page);
  const banner = renderSiteBanner(r);
  const header = renderMainHeader({
    r, run,
    domainName: domain.name,
    pageName: page.name,
    domainId: domain.id,
    pageId: page.id,
    paused,
  });
  const deviceTabs = renderDeviceTabs(pageEntry);
  if (r.error || r.gateFailed) return `${header}${deviceTabs}${pausedBanner}${banner}`;
  const violations = r.violations || [];

  // Findings (Failed Audits) は findings-region に隔離し、タブ切替時はここだけを
  // 差分描画する (refreshFindings)。ページ全体の再取得/再描画を避け SPA 風にする。
  return `
    ${header}
    ${deviceTabs}
    ${pausedBanner}
    <div class="row-overview">
      ${renderTotalPanel(r)}
      ${renderBreakdownPanel(r, violations)}
    </div>
    <div class="row-categories">
      ${renderCategoryCards(r, violations)}
    </div>
    ${renderTrendPanel(pageEntry)}
    ${renderPriorityPanel(r, violations)}
    <div id="findings-region">${renderFindingsRegion(r)}</div>`;
}

// Failed Audits 部分 (タブ + フィルタ + 一覧 + Passed) のみを組み立てる。
// findingsMainTab / findingsSubTab / findingsTab / severityFilter に依存し、
// これらの切替では renderMain せず本関数の出力で #findings-region を差し替える。
function renderFindingsRegion(r) {
  const violations = r.violations || [];
  const tabMode = state.findingsTab;

  // メインカテゴリタブは常時表示 (Code / Design / Lighthouse / 今後追加分)。
  // Lighthouse タブは sources[] に lighthouse を含む violation を横断的に拾う (仮想フィルタ)。
  const mainFilter = state.findingsMainTab || 'all';
  const afterMainFilter = violations.filter((v) => violationInMain(v, mainFilter));

  // サブタブ: Lighthouse main のときは LH ネイティブカテゴリ、それ以外は v.category
  const isLhMain = mainFilter === 'lighthouse';
  const subsPresent = isLhMain
    ? [...new Set(afterMainFilter.map(lighthouseSubOf).filter(Boolean))]
        .sort((a, b) => LH_SUB_ORDER.indexOf(a) - LH_SUB_ORDER.indexOf(b))
    : [...new Set(afterMainFilter.map((v) => v.category))]
        .filter((c) => c)
        .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 999) - (CATEGORY_ORDER.indexOf(b) + 999));
  if (!subsPresent.includes(state.findingsSubTab) && state.findingsSubTab !== 'all') {
    state.findingsSubTab = 'all';
  }
  const subFilter = state.findingsSubTab;
  const filteredViolations = subFilter === 'all'
    ? afterMainFilter
    : afterMainFilter.filter((v) => (isLhMain ? lighthouseSubOf(v) : v.category) === subFilter);

  const findings = tabMode === 'category'
    ? renderFindingsByCategory(filteredViolations)
    : renderFindingsBySeverity(filteredViolations);

  const mainTabsHtml = `
    <div class="findings__main-tabs" role="tablist">
      <button class="findings__main-tab ${mainFilter === 'all' ? 'findings__main-tab--active' : ''}" data-findings-main="all">
        すべて <span class="findings__main-count">${violations.filter((v) => !v.passed).length}</span>
      </button>
      ${MAIN_CATEGORY_ORDER.map((m) => {
        const n = violations.filter((v) => !v.passed && violationInMain(v, m)).length;
        const empty = n === 0 && !violations.some((v) => violationInMain(v, m));
        return `
          <button class="findings__main-tab ${mainFilter === m ? 'findings__main-tab--active' : ''}${empty ? ' findings__main-tab--empty' : ''}${m === 'lighthouse' ? ' findings__main-tab--lh' : ''}" data-findings-main="${m}">
            ${escapeHtml(MAIN_CATEGORY_LABEL[m] || m)} <span class="findings__main-count">${n}</span>
          </button>`;
      }).join('')}
    </div>`;

  const subTabsHtml = subsPresent.length >= 1 ? `
    <div class="findings__sub-tabs" role="tablist">
      <button class="findings__sub-tab ${subFilter === 'all' ? 'findings__sub-tab--active' : ''}" data-findings-sub="all">
        すべて <span class="findings__sub-count">${afterMainFilter.filter((v) => !v.passed).length}</span>
      </button>
      ${subsPresent.map((s) => {
        const n = afterMainFilter.filter((v) => !v.passed && (isLhMain ? lighthouseSubOf(v) : v.category) === s).length;
        const label = isLhMain ? (LH_SUB_SHORT[s] || s) : (CATEGORY_SHORT[s] || s);
        return `
          <button class="findings__sub-tab ${subFilter === s ? 'findings__sub-tab--active' : ''}" data-findings-sub="${escapeHtml(s)}">
            ${escapeHtml(label)} <span class="findings__sub-count">${n}</span>
          </button>`;
      }).join('')}
    </div>` : '';

  return `
    <div class="findings" style="margin-top:var(--gap);">
      <div class="findings__header">
        <h3 class="findings__title">${ICON.list}<span>Failed Audits</span></h3>
        <div class="findings__tabs" role="tablist">
          <button class="findings__tab ${tabMode === 'severity' ? 'findings__tab--active' : ''}" data-findings-tab="severity">重要度順</button>
          <button class="findings__tab ${tabMode === 'category' ? 'findings__tab--active' : ''}" data-findings-tab="category">カテゴリ順</button>
        </div>
      </div>
      <div class="findings__severity" role="group" aria-label="重大度フィルタ">
        ${[['critical', 'Critical'], ['major', 'Major'], ['minor', 'Minor'], ['passed', 'Passed']].map(([k, label]) =>
          `<button class="sev-chip sev-chip--${k} ${state.severityFilter[k] ? '' : 'sev-chip--off'}" data-sev-toggle="${k}">${label}</button>`
        ).join('')}
      </div>
      ${mainTabsHtml}
      ${subTabsHtml}
      ${findings}
    </div>
    ${renderPassedAudits(filteredViolations)}`;
}

// findings-region だけを再描画する (タブ/カード/カテゴリ切替の SPA 化)。
// state.currentResult を使うので再取得しない = 即時。region 内のイベントを再バインドする。
function refreshFindings(afterRender) {
  const region = document.getElementById('findings-region');
  if (!region || !state.currentResult) { renderMain(); return; }
  region.innerHTML = renderFindingsRegion(state.currentResult);
  applyFilters();
  bindFindingsEvents(region);
  if (typeof afterRender === 'function') afterRender();
}

// --- Aggregation --------------------------------------------------------

/**
 * runs (API) と config (domains) を結合し、
 * Map<domainId, {domain, pagesByPageId: Map<pageId, {page, runs:[]}>}> を作る
 */
function aggregate(runs, config) {
  const domains = new Map();
  // config で定義されたドメイン/ページのみ取り込む
  for (const d of config.domains || []) {
    domains.set(d.id, { domain: d, pagesByPageId: new Map() });
    for (const p of d.pages || []) {
      domains.get(d.id).pagesByPageId.set(p.id, { page: p, runs: [] });
    }
  }
  for (const run of runs) {
    for (const res of run.results || []) {
      const did = res.domainId;
      const pid = res.pageId;
      if (!did || !pid) continue;
      const domainEntry = domains.get(did);
      if (!domainEntry) continue; // config から外れたドメインのレポートは表示しない
      const pageEntry = domainEntry.pagesByPageId.get(pid);
      if (!pageEntry) continue;
      pageEntry.runs.push({
        timestamp: run.timestamp,
        startedAt: run.startedAt,
        device: res.device || 'pc',
        total: res.total,
        categories: res.categories,
        counts: res.counts,
        gateFailed: res.gateFailed,
        error: res.error,
        threshold: res.threshold,
      });
    }
  }
  for (const de of domains.values()) {
    for (const pe of de.pagesByPageId.values()) {
      pe.runs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    }
  }
  return domains;
}

// --- Sidebar render -----------------------------------------------------

function renderSidebar() {
  const ul = document.getElementById('domain-list');
  // スポット評価の synthetic domain (__spot__) はサイドバーには出さない
  const domains = (state.config.domains || []).filter((d) => d.id !== '__spot__');

  if (domains.length === 0) {
    ul.innerHTML = `<li class="domain-list__placeholder">サイトがありません。${state.isAdmin ? '<br>上の「サイトを追加」から追加してください。' : ''}</li>`;
    bindSidebarEvents();
    return;
  }

  // page 表示中なら、現在のドメインは必ず展開しておく
  if (state.view === 'page' && state.currentDomainId) {
    state.expandedDomains.add(state.currentDomainId);
  }

  const domainsHtml = domains.map((d) => {
    const expanded = state.expandedDomains.has(d.id);
    const de = state.byDomain.get(d.id);
    const pages = d.pages || [];
    const domainPaused = d.enabled === false;
    const pagesHtml = pages.map((p) => {
      const pe = de?.pagesByPageId.get(p.id);
      const latest = pe?.runs.find((r) => r.device === 'pc') ?? pe?.runs[0];
      const scoreClass = !latest ? 'na'
        : latest.error ? 'fail'
        : latest.gateFailed ? 'fail'
        : scoreRating(latest.total);
      const scoreLabel = !latest ? '—'
        : latest.error ? 'ERR'
        : latest.gateFailed ? 'GATE'
        : (latest.total ?? '—');
      const activeCls = (state.view === 'page' && state.currentDomainId === d.id && state.currentPageId === p.id) ? 'page-item--active' : '';
      const crawlingCls = isJobRunning(d.id, p.id) ? 'page-item--crawling' : '';
      const pagePaused = domainPaused || p.enabled === false;
      const pausedCls = pagePaused ? 'page-item--paused' : '';
      const scoreContent = isJobRunning(d.id, p.id)
        ? `<span class="page-item__spinner" aria-label="クロール中"></span>`
        : `<span class="page-item__score page-item__score--${scoreClass}">${scoreLabel}</span>`;
      const pauseBadge = pagePaused
        ? `<button class="badge badge--paused" data-edit-pause="page:${escapeHtml(d.id)}/${escapeHtml(p.id)}" title="${escapeHtml(pausedReasonTitle(d, p))}">休止中</button>`
        : '';
      const pauseBtn = state.isAdmin
        ? (p.enabled === false
          ? `<button class="page-item__pause" data-resume-page="${escapeHtml(d.id)}/${escapeHtml(p.id)}" title="クロールを再開">${ICON.play}</button>`
          : `<button class="page-item__pause" data-pause-page="${escapeHtml(d.id)}/${escapeHtml(p.id)}" title="クロールを休止" ${domainPaused ? 'disabled' : ''}>${ICON.pause}</button>`)
        : '';
      const delBtn = state.isAdmin
        ? `<button class="page-item__delete" data-delete-page="${escapeHtml(d.id)}/${escapeHtml(p.id)}" title="ページを削除">${ICON.trash}</button>`
        : '';
      return `
        <li class="page-item ${activeCls} ${crawlingCls} ${pausedCls}" data-domain-id="${escapeHtml(d.id)}" data-page-id="${escapeHtml(p.id)}">
          <span class="page-item__name" title="${escapeHtml(p.url)}">${escapeHtml(p.name)}</span>
          ${pauseBadge}
          ${scoreContent}
          ${pauseBtn}
          ${delBtn}
        </li>`;
    }).join('');

    const domainPauseBtn = state.isAdmin
      ? (domainPaused
        ? `<button class="domain-acc__action" data-resume-domain="${escapeHtml(d.id)}" title="サイトのクロールを再開">${ICON.play}</button>`
        : `<button class="domain-acc__action" data-pause-domain="${escapeHtml(d.id)}" title="サイトのクロールを休止">${ICON.pause}</button>`)
      : '';
    const adminBtns = state.isAdmin ? `
      ${domainPauseBtn}
      <button class="domain-acc__action" data-add-page="${escapeHtml(d.id)}" title="ページを追加">${ICON.plus}</button>
      <button class="domain-acc__action domain-acc__delete" data-delete-domain="${escapeHtml(d.id)}" title="サイトを削除">${ICON.trash}</button>` : '';

    const domainBadge = domainPaused
      ? `<button class="badge badge--paused" data-edit-pause="domain:${escapeHtml(d.id)}" title="${escapeHtml(pausedReasonTitle(d, null))}">休止中</button>`
      : '';

    const grip = state.isAdmin
      ? `<span class="domain-acc__grip" title="ドラッグで並べ替え" aria-hidden="true">${ICON.grip}</span>`
      : '';
    return `
      <li class="domain-acc ${expanded ? 'domain-acc--open' : ''} ${domainPaused ? 'domain-acc--paused' : ''}" data-domain-id="${escapeHtml(d.id)}" ${state.isAdmin ? 'draggable="true"' : ''}>
        <div class="domain-acc__header" data-toggle-domain="${escapeHtml(d.id)}">
          ${grip}
          <span class="domain-acc__caret">${ICON.chevron}</span>
          <span class="domain-acc__name">${escapeHtml(d.name)}</span>
          ${domainBadge}
          <span class="domain-acc__count">${pages.length}</span>
          ${adminBtns}
        </div>
        ${expanded ? `<ul class="page-list">${pagesHtml}</ul>` : ''}
      </li>`;
  }).join('');

  ul.innerHTML = domainsHtml;
  bindSidebarEvents();
}

/** 休止バッジ/アイコンの title 用テキスト (ドメイン休止起因かページ自身の休止かを区別) */
function pausedReasonTitle(domain, page) {
  if (domain.enabled === false) {
    return domain.pausedReason ? `サイト全体が休止中: ${domain.pausedReason}` : 'サイト全体が休止中 (クリックで理由を編集)';
  }
  if (page && page.enabled === false) {
    return page.pausedReason ? `休止中: ${page.pausedReason}` : '休止中 (クリックで理由を編集)';
  }
  return '';
}

let _dragDomainId = null;
// サイトのドラッグ&ドロップ並べ替え。drop で state.config.domains の順を更新し、
// PUT /api/domains/order で永続化 (sort_order として DB 保存)。
function bindDomainDnD() {
  const list = document.getElementById('domain-list');
  for (const li of list.querySelectorAll('.domain-acc[draggable="true"]')) {
    li.addEventListener('dragstart', (e) => {
      _dragDomainId = li.dataset.domainId;
      li.classList.add('domain-acc--dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', _dragDomainId); } catch { /* noop */ }
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('domain-acc--dragging');
      list.querySelectorAll('.domain-acc--dragover').forEach((x) => x.classList.remove('domain-acc--dragover'));
      _dragDomainId = null;
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (li.dataset.domainId !== _dragDomainId) li.classList.add('domain-acc--dragover');
    });
    li.addEventListener('dragleave', () => li.classList.remove('domain-acc--dragover'));
    li.addEventListener('drop', async (e) => {
      e.preventDefault();
      li.classList.remove('domain-acc--dragover');
      const targetId = li.dataset.domainId;
      if (!_dragDomainId || _dragDomainId === targetId) return;
      const doms = state.config.domains.filter((d) => d.id !== '__spot__');
      const srcIdx = doms.findIndex((d) => d.id === _dragDomainId);
      if (srcIdx < 0) return;
      const [moved] = doms.splice(srcIdx, 1);
      const tgtIdx = doms.findIndex((d) => d.id === targetId);
      doms.splice(tgtIdx, 0, moved); // ターゲットの前に挿入
      const spot = state.config.domains.filter((d) => d.id === '__spot__');
      state.config.domains = [...doms, ...spot];
      renderSidebar();
      try {
        await fetch('/api/domains/order', {
          method: 'PUT',
          headers: authHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ order: doms.map((d) => d.id) }),
        });
      } catch (err) {
        showToast({ id: `order-${Date.now()}`, status: 'error', message: `並び順の保存に失敗: ${err.message}` });
      }
    });
  }
}

function bindSidebarEvents() {
  // サイトの並べ替え (ドラッグ&ドロップ, 管理者)
  if (state.isAdmin) bindDomainDnD();
  // ドメインアコーディオンの開閉
  for (const el of document.querySelectorAll('[data-toggle-domain]')) {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return; // 削除/休止ボタン・チェックボックスは別ハンドラ
      const id = el.dataset.toggleDomain;
      if (state.expandedDomains.has(id)) state.expandedDomains.delete(id);
      else state.expandedDomains.add(id);
      renderSidebar();
    });
  }
  // page select
  for (const li of document.querySelectorAll('.page-item:not(.page-item--add)')) {
    li.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      const did = li.dataset.domainId;
      const pid = li.dataset.pageId;
      state.view = 'page';
      state.currentDomainId = did;
      state.currentPageId = pid;
      renderSidebar();
      renderMain();
    });
  }
  // add page
  for (const btn of document.querySelectorAll('[data-add-page]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddPageModal(btn.dataset.addPage);
    });
  }
  // delete domain
  for (const btn of document.querySelectorAll('[data-delete-domain]')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteDomain;
      const domain = state.config.domains.find((d) => d.id === id);
      if (!confirm(`サイト「${domain?.name || id}」を削除します。よろしいですか？`)) return;
      try {
        await deleteJson(`/api/domains/${encodeURIComponent(id)}`);
        state._domainSelectorOpen = false;
        await reloadConfigAndReruns();
      } catch (err) {
        alert(`削除失敗: ${err.message}`);
      }
    });
  }
  // delete page
  for (const btn of document.querySelectorAll('[data-delete-page]')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const [did, pid] = btn.dataset.deletePage.split('/');
      const domain = state.config.domains.find((d) => d.id === did);
      const page = domain?.pages.find((p) => p.id === pid);
      if (!confirm(`ページ「${page?.name || pid}」を削除します。よろしいですか？`)) return;
      try {
        await deleteJson(`/api/domains/${encodeURIComponent(did)}/pages/${encodeURIComponent(pid)}`);
        await reloadConfigAndReruns();
      } catch (err) {
        alert(`削除失敗: ${err.message}`);
      }
    });
  }
  // ページ休止/再開
  for (const btn of document.querySelectorAll('[data-pause-page]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPauseModal({ kind: 'page', id: btn.dataset.pausePage });
    });
  }
  for (const btn of document.querySelectorAll('[data-resume-page]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      resumeTarget({ kind: 'page', id: btn.dataset.resumePage });
    });
  }
  // サイト (ドメイン) 休止/再開
  for (const btn of document.querySelectorAll('[data-pause-domain]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPauseModal({ kind: 'domain', id: btn.dataset.pauseDomain });
    });
  }
  for (const btn of document.querySelectorAll('[data-resume-domain]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      resumeTarget({ kind: 'domain', id: btn.dataset.resumeDomain });
    });
  }
  // 休止バッジ (クリックで理由編集モーダルを再オープン)
  for (const btn of document.querySelectorAll('[data-edit-pause]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [kind, id] = btn.dataset.editPause.split(/:(.+)/); // 先頭の ':' だけで分割 (page id に '/' を含むため)
      openPauseModal({ kind, id });
    });
  }
}

// --- Modal --------------------------------------------------------------

function openModal(title, bodyHtml, opts = {}) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const bd = document.getElementById('modal-backdrop');
  const modal = bd.querySelector('.modal');
  modal.classList.toggle('modal--wide', !!opts.wide);
  bd.hidden = false;
}
function closeModal() {
  document.getElementById('modal-backdrop').hidden = true;
  document.getElementById('modal-body').innerHTML = '';
}

// ============== スポット評価 (config に登録せず 1 回限りの URL クロール) ==============
function openSpotCrawlModal() {
  openModal('スポット評価', `
    <form id="spot-form">
      <div class="form-field">
        <label for="spot-url">URL</label>
        <input id="spot-url" name="url" required type="url" placeholder="https://example.com/">
        <div class="form-field__hint">config に登録せず 1 回だけクロールします (結果は履歴に保存)</div>
      </div>
      <div class="form-field">
        <label>デバイス</label>
        <div class="form-inline-options">
          <label><input type="checkbox" name="device" value="pc" checked> PC</label>
          <label><input type="checkbox" name="device" value="sp"> SP</label>
        </div>
        <div class="form-field__hint">初回は PC のみでも十分 (SP を加えるとクロール時間 +30% 目安)</div>
      </div>
      <div class="form-error" id="spot-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="spot-submit">クロール開始</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('spot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('spot-url').value.trim();
    const devices = [...document.querySelectorAll('input[name="device"]:checked')].map((i) => i.value);
    if (devices.length === 0) devices.push('pc');
    const errorEl = document.getElementById('spot-error');
    const btn = document.getElementById('spot-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      const resp = await postJson('/api/crawl/spot', { url, devices });
      closeModal();
      // 進捗 toast + 完了後に result takeover
      startWatchingSpotJob(resp.crawlJobId, resp.targetName, url);
    } catch (err) {
      errorEl.textContent = err.message || 'スポット評価に失敗しました';
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

// spot 用の watching: 通常の startWatchingJob と似ているが、完了後に
// 結果を takeover 表示する。
function startWatchingSpotJob(jobId, displayName, url) {
  showToast({ id: jobId, message: `「${displayName}」のクロールを実行中…`, status: 'running' });
  if (activeJobs.has(jobId)) clearTimeout(activeJobs.get(jobId));

  const poll = async () => {
    const s = await pollJobStatus(jobId);
    if (s.status === 'running' || s.status === 'queued') {
      updateJobProgressUi(jobId, displayName, s.progress);
      activeJobs.set(jobId, setTimeout(poll, 2000));
      return;
    }
    activeJobs.delete(jobId);
    if (s.status === 'done') {
      const msg = s.error
        ? `「${s.targetName}」: エラー (${s.error})`
        : `「${s.targetName}」: 完了 (スコア ${s.total}/100)`;
      showToast({ id: jobId, message: msg, status: 'done' });
      setTimeout(() => removeToast(jobId), 6000);
      if (s.timestamp && !s.error) {
        enterSpotView(s.timestamp, displayName, url);
      }
    } else if (s.status === 'error') {
      showToast({ id: jobId, message: `クロール失敗: ${s.error || 'unknown'}`, status: 'error' });
    } else {
      removeToast(jobId);
    }
  };
  activeJobs.set(jobId, setTimeout(poll, 1500));
}

// スポットレポートを state に一時的に注入して通常のレンダリングを利用する。
// sidebar には表示しないが、main content は既存の renderMain で描画。
async function enterSpotView(timestamp, targetName, url) {
  try {
    const report = await fetchJson(`/reports/${encodeURIComponent(timestamp)}/report.json`);
    const SPOT_DOMAIN_ID = '__spot__';
    // synthetic domain (sidebar には表示されない)
    let spotDomain = state.config.domains.find((d) => d.id === SPOT_DOMAIN_ID);
    if (!spotDomain) {
      spotDomain = { id: SPOT_DOMAIN_ID, name: 'スポット評価', pages: [] };
      state.config.domains.push(spotDomain);
    }
    const spotPageId = timestamp;
    if (!spotDomain.pages.find((p) => p.id === spotPageId)) {
      const device0 = report.results?.[0]?.pageData?.device || report.results?.[0]?.site?.device || 'pc';
      spotDomain.pages.push({ id: spotPageId, name: targetName, url, devices: [device0, ...(report.results || []).slice(1).map((r) => r.pageData?.device || r.site?.device).filter(Boolean)] });
    }
    // run を state.runs に注入 (domainId / pageId を spot に書き換え)
    const syntheticRun = {
      timestamp,
      startedAt: report.startedAt,
      results: (report.results || []).map((r) => ({
        ...r,
        site: {
          ...(r.site || {}),
          domainId: SPOT_DOMAIN_ID,
          pageId: spotPageId,
          domainName: 'スポット評価',
          pageName: targetName,
        },
      })),
    };
    // 既存の synthetic run があれば入れ替え
    state.runs = state.runs.filter((r) => r.timestamp !== timestamp);
    state.runs.push(syntheticRun);
    state.fullReports.set(timestamp, report);
    state.byDomain = aggregate(state.runs, state.config);
    state.currentDomainId = SPOT_DOMAIN_ID;
    state.currentPageId = spotPageId;
    state.expandedDomains.add(SPOT_DOMAIN_ID);
    renderSidebar();
    await renderMain();
  } catch (err) {
    showToast({ id: 'spot-load-err', message: `スポットレポート読込失敗: ${err.message}`, status: 'error' });
  }
}

// スポット評価履歴モーダル
async function openSpotHistoryModal() {
  openModal('スポット評価の履歴', '<div class="loading">Loading…</div>');
  try {
    const { runs } = await fetchJson('/api/runs/spots');
    const body = document.getElementById('modal-body');
    if (!runs || runs.length === 0) {
      body.innerHTML = '<div class="empty-state">スポット評価の履歴はまだありません。</div>';
      return;
    }
    const rows = runs.map((run) => {
      const r = run.results?.[0] || {};
      const dateLabel = new Date(run.startedAt || run.timestamp).toLocaleString('ja-JP');
      return `
        <li class="spot-history__row" data-spot-ts="${escapeHtml(run.timestamp)}" data-spot-url="${escapeHtml(r.url || '')}" data-spot-name="${escapeHtml(r.pageName || r.url || '')}">
          <div class="spot-history__main">
            <div class="spot-history__name">${escapeHtml(r.pageName || r.url || '-')}</div>
            <div class="spot-history__url">${escapeHtml(r.url || '')}</div>
            <div class="spot-history__date">${escapeHtml(dateLabel)}</div>
          </div>
          <div class="spot-history__score">${r.total ?? '—'}</div>
          <button class="btn btn--primary btn--sm" data-spot-open>開く</button>
        </li>`;
    }).join('');
    body.innerHTML = `<ul class="spot-history__list">${rows}</ul>`;
    for (const btn of body.querySelectorAll('[data-spot-open]')) {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-spot-ts]');
        closeModal();
        enterSpotView(row.dataset.spotTs, row.dataset.spotName, row.dataset.spotUrl);
      });
    }
  } catch (err) {
    document.getElementById('modal-body').innerHTML = `<div class="empty-state">履歴の取得に失敗しました: ${escapeHtml(err.message)}</div>`;
  }
}

// ============== 管理者モード ==============
// 管理者状態に応じて UI を出し分ける (静的ボタンの表示/ラベル更新 + 再描画)。
function applyAdminUi() {
  const btn = document.getElementById('admin-mode-btn');
  if (btn) btn.textContent = state.isAdmin ? '管理者モードを終了 (ログアウト)' : '管理者モードでログイン';
  // Targets ヘッダの「サイトを追加 (+)」は管理者のみ表示
  const addDomainBtn = document.getElementById('add-domain-btn');
  if (addDomainBtn) addDomainBtn.hidden = !state.isAdmin;
}

function handleAdminButton() {
  if (state.isAdmin) {
    openModal('管理者モードを終了', `
      <p style="margin-bottom:20px">管理者モードを終了します。よろしいですか？</p>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="button" class="btn btn--primary" id="admin-logout-btn">ログアウト</button>
      </div>`);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('admin-logout-btn').addEventListener('click', async () => {
      try { await postJson('/api/admin/logout', {}); } catch {}
      setAdminToken('');
      state.isAdmin = false;
      closeModal();
      applyAdminUi();
      renderSidebar();
      renderMain();
    });
    return;
  }
  openAdminLoginModal();
}

function openAdminLoginModal() {
  openModal('管理者モードでログイン', `
    <form id="admin-login-form">
      <div class="form-field">
        <label for="admin-id">ID</label>
        <input id="admin-id" name="id" required autocomplete="username">
      </div>
      <div class="form-field">
        <label for="admin-pass">パスワード</label>
        <input id="admin-pass" name="pass" type="password" required autocomplete="current-password">
      </div>
      <div class="form-field__hint">ターゲットの追加・再クロールには管理者モードが必要です。</div>
      <div class="form-error" id="admin-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="admin-submit">ログイン</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('admin-id').value;
    const pass = document.getElementById('admin-pass').value;
    const errorEl = document.getElementById('admin-error');
    const btn = document.getElementById('admin-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      const resp = await postJson('/api/admin/login', { id, pass });
      setAdminToken(resp.token);
      state.isAdmin = true;
      closeModal();
      applyAdminUi();
      renderSidebar();
      renderMain();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

function openAddDomainModal() {
  openModal('サイトを追加', `
    <form id="add-domain-form">
      <div class="form-field">
        <label for="d-name">サイト名</label>
        <input id="d-name" name="name" required placeholder="例: Example VPS">
        <div class="form-field__hint">サイドバーに表示される表示名</div>
      </div>
      <div class="form-field">
        <label for="d-page-name">初期ページ名 (optional)</label>
        <input id="d-page-name" name="pageName" placeholder="TOP">
      </div>
      <div class="form-field">
        <label for="d-page-url">初期ページURL (optional)</label>
        <input id="d-page-url" name="pageUrl" placeholder="https://example.com/">
        <div class="form-field__hint">空欄なら後からページ追加</div>
      </div>
      <div class="form-error" id="d-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="d-submit">追加</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-domain-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('d-name').value.trim();
    const pageName = document.getElementById('d-page-name').value.trim();
    const pageUrl = document.getElementById('d-page-url').value.trim();
    const errorEl = document.getElementById('d-error');
    const btn = document.getElementById('d-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      const body = { name };
      if (pageUrl) body.pages = [{ id: 'top', name: pageName || 'TOP', url: pageUrl }];
      const resp = await postJson('/api/domains', body);
      closeModal();
      state.expandedDomains.add(resp.id);
      await reloadConfigAndReruns();
      // 新ドメイン配下のページがあればクロール監視を開始
      if (Array.isArray(resp.crawlJobIds)) {
        for (const job of resp.crawlJobIds) {
          startWatchingJob(job.jobId, `${resp.name} / ${job.pageName}`);
        }
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

function openAddPageModal(domainId) {
  const domain = state.config.domains.find((d) => d.id === domainId);
  openModal(`ページを追加 (${domain?.name || domainId})`, `
    <form id="add-page-form">
      <div class="form-field">
        <label for="p-name">ページ名</label>
        <input id="p-name" name="name" required placeholder="例: キャンペーン">
      </div>
      <div class="form-field">
        <label for="p-url">URL</label>
        <input id="p-url" name="url" required placeholder="https://example.com/campaign/">
        <div class="form-field__hint">追加後、自動的に初回クロールが実行されます (5〜10 分程度)</div>
      </div>
      <div class="form-field">
        <label>評価デバイス</label>
        <div class="device-check-list">
          <label class="device-check"><input type="checkbox" value="pc" checked disabled><span>PC / Desktop</span></label>
          <label class="device-check"><input type="checkbox" value="sp" id="p-device-sp" checked><span>SP / Mobile (iPhone 13 emulation)</span></label>
        </div>
        <div class="form-field__hint">SP を有効にすると Core Web Vitals 等の device 依存指標をモバイル視点でも評価 (クロール時間 +20〜40%)</div>
      </div>
      <div class="form-error" id="p-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="p-submit">追加してクロール</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('add-page-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('p-name').value.trim();
    const url = document.getElementById('p-url').value.trim();
    const spChecked = document.getElementById('p-device-sp')?.checked;
    const devices = spChecked ? ['pc', 'sp'] : ['pc'];
    const errorEl = document.getElementById('p-error');
    const btn = document.getElementById('p-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      const resp = await postJson(`/api/domains/${encodeURIComponent(domainId)}/pages`, { name, url, devices });
      closeModal();
      state.expandedDomains.add(domainId);
      await reloadConfigAndReruns();
      if (resp.crawlJobId) {
        startWatchingJob(resp.crawlJobId, name);
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

// =============================================================
// Help modal (4 tabs)
// =============================================================

const HELP_TABS = [
  { id: 'about', label: 'このツールについて' },
  { id: 'display', label: '表示説明' },
  { id: 'crawl', label: 'クロールロジック' },
  { id: 'rules', label: '検知ルール' },
  { id: 'scoring', label: '評価ロジック' },
  { id: 'changelog', label: 'リリースノート' },
];

let helpRulesCache = null;

async function openHelpModal() {
  openModal('ヘルプ', `
    <div class="help">
      <nav class="help__tabs" role="tablist">
        ${HELP_TABS.map((t, i) => `<button class="help__tab ${i === 0 ? 'help__tab--active' : ''}" data-help-tab="${t.id}">${t.label}</button>`).join('')}
      </nav>
      <div class="help__body" id="help-body">
        ${renderHelpAbout()}
      </div>
      <div class="help__footer">
        <span class="help__footer-label">管理者モード</span>
        <button type="button" class="btn btn--secondary" id="admin-mode-btn">${state.isAdmin ? '管理者モードを終了 (ログアウト)' : '管理者モードでログイン'}</button>
      </div>
    </div>`, { wide: true });

  document.getElementById('admin-mode-btn')?.addEventListener('click', handleAdminButton);

  for (const btn of document.querySelectorAll('[data-help-tab]')) {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('[data-help-tab]').forEach((b) => b.classList.remove('help__tab--active'));
      btn.classList.add('help__tab--active');
      const body = document.getElementById('help-body');
      const tab = btn.dataset.helpTab;
      body.innerHTML = '<div class="help__loading">読み込み中…</div>';
      if (tab === 'about') body.innerHTML = renderHelpAbout();
      else if (tab === 'display') body.innerHTML = renderHelpDisplay();
      else if (tab === 'crawl') body.innerHTML = renderHelpCrawl();
      else if (tab === 'rules') body.innerHTML = await renderHelpRules();
      else if (tab === 'scoring') body.innerHTML = renderHelpScoring();
      else if (tab === 'changelog') {
        body.innerHTML = renderHelpChangelog();
        bindChangelogAccordion(body);
      }
    });
  }
}

function bindChangelogAccordion(root) {
  for (const btn of root.querySelectorAll('[data-changelog-toggle]')) {
    btn.addEventListener('click', () => {
      const release = btn.closest('[data-changelog-release]');
      if (!release) return;
      const collapsed = release.classList.toggle('help-changelog__release--collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }
}

function renderHelpChangelog() {
  return `
    <section class="help-section">
      <h3>${ICON.list}<span>リリースノート</span></h3>
      <p class="help-changelog__note">直近の主要な機能追加と仕様変更を新しい順で掲載しています。</p>
    </section>

    <section class="help-section help-changelog__release" data-changelog-release="v4.1">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="true">
        <span class="help-changelog__version">v4.1</span>
        <span class="help-changelog__date">2026-07-06</span>
        <span class="help-changelog__headline">クロール休止機能 + ダッシュボード/サイドバーの操作性改善</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.pause}<span>クロール休止 / 再開 (管理者)</span></h4>
        <ul>
          <li>サイドバーの各サイト・ページに<strong>休止 / 再開ボタン</strong>を追加。休止すると cron・手動再クロールの対象から外れ、Playwright / Lighthouse 実行によるメモリ・ディスク消費を抑制できる</li>
          <li>休止中はサイドバーで<strong>グレーアウト + 「休止中」バッジ</strong>表示。バッジをクリックすると<strong>休止理由メモ</strong>を追記・編集できる</li>
          <li>休止中のページを開くと詳細画面に休止バナーを表示し、再クロールボタンは無効化 (誤操作防止)。バナーから直接「再開する」も可能</li>
          <li>休止/再開は既存の<strong>サイト/ページ有効フラグ</strong>を利用しているため、過去のスクリーンショット・レポート履歴はそのまま保持される (削除はされない)</li>
        </ul>

        <h4>${ICON.bulb}<span>操作性の改善</span></h4>
        <ul>
          <li><strong>ページ詳細のタブ切替をシームレス化</strong>：カテゴリタブ・スコアカード・重要度フィルタをクリックしても画面全体を読み込み直さず、該当箇所だけを即時更新 (チラつき・待ち時間を解消)</li>
          <li><strong>サイドバー幅をドラッグで変更可能に</strong>：右端をドラッグして広げられる (従来幅が最小)。幅は保存され次回も維持、ダブルクリックで初期化</li>
          <li><strong>ダッシュボードのサイトをアコーディオン開閉</strong>：サイト見出しをクリックして各サイトのページ一覧を折りたためる</li>
          <li>管理者モードのサイドバーで、休止/削除などの<strong>アイコンボタンはホバー時のみ表示</strong>し、通常時はサイト/ページ名を読みやすく</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v4.0">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v4.0</span>
        <span class="help-changelog__date">2026-06-25</span>
        <span class="help-changelog__headline">SQLite 集約 + TOP ダッシュボード + 管理者モード + 手動評価 (メジャーアップデート)</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.chart}<span>データ基盤を SQLite に集約</span></h4>
        <ul>
          <li><strong>設定 (サイト/ページ) と構造化レポートを SQLite に一元化</strong>。従来の <code>report.json</code> ファイルは廃止し、横断クエリ・トランザクション保存・履歴取得を高速化。スクリーンショット等の画像はファイルのまま (DB はパス参照のみ)</li>
          <li><strong>スコア履歴を最大 120 日保持</strong>。古い run は自動的に prune</li>
          <li>初回起動時、既存の <code>targets.json</code> から設定を自動取り込み (以降は DB が正本)</li>
        </ul>

        <h4>${ICON.list}<span>TOP ダッシュボード (全サイト一覧)</span></h4>
        <ul>
          <li>サイドバーのタイトル / 「ダッシュボード」から開く<strong>全サイト・全ページの現況一覧</strong>。総合スコアは <strong>PC / SP の平均</strong>で表示</li>
          <li>各ページに<strong>担当者</strong>を複数設定でき、担当者で絞り込み可能</li>
          <li>スポット評価・履歴・CSV / Markdown 書き出しは TOP のツールバーに集約</li>
        </ul>

        <h4>${ICON.filter}<span>サイドバー再編</span></h4>
        <ul>
          <li>全サイトを<strong>アコーディオン形式</strong>で縦に一覧表示 (サイト名→配下ページ)。タイトルクリックで TOP へ</li>
          <li>重要度フィルタは各ページ詳細の Failed Audits 側へ移設。カテゴリ絞り込みは詳細のタブで代替</li>
        </ul>

        <h4>${ICON.check}<span>管理者モード</span></h4>
        <ul>
          <li><strong>サイト/ページの追加・編集・削除・再クロール・手動ステータス変更を管理者限定</strong>に。閲覧は誰でも可能</li>
          <li>ログインはヘルプ (?) 内の「管理者モード」から。一度ログインすると<strong>72 時間維持</strong> (リロード・再起動を跨いで保持)</li>
          <li>ページの<strong>名前 / URL を編集</strong>できる (管理者)。過去のスコア履歴は維持</li>
        </ul>

        <h4>${ICON.edit}<span>手動評価ステータス</span></h4>
        <ul>
          <li>各検知項目に<strong>「除外 / NG / OK / 検知状態に戻す」</strong>の手動ステータスを設定可能 (管理者)。検知後でも上書きでき、<strong>再クロールしても引き継がれる</strong></li>
          <li><strong>除外</strong>はスコア計算から外し、<strong>OK/NG</strong>は合格/不合格として再計算 (計算式自体は不変)。手動変更した項目には「<strong>手動設定</strong>」フラグを表示</li>
          <li><strong>ビジュアル項目は検知精度の都合で全件を常に一覧表示</strong>し、手動評価しやすく。新ルール<strong>「デザインシステム規定マージンの適切な使用」</strong>を追加 (手動評価項目)</li>
        </ul>

        <h4>${ICON.trendUp}<span>推移グラフ拡張</span></h4>
        <ul>
          <li>総合 + メイン5カテゴリ + Lighthouse 平均の<strong>7 系列</strong>を表示 (凡例クリックで表示切替)</li>
          <li>期間を <strong>7 / 30 / 90 / 120 日</strong>から選択可能</li>
        </ul>

        <h4>${ICON.info}<span>セットアップ (本番反映時)</span></h4>
        <ul>
          <li>DB ファイル (<code>data/app.db</code>) は <strong>docker 永続ボリューム</strong>上に配置すること (再デプロイで消えないように)。詳細は <code>docs/deploy-v3.2-db.md</code></li>
          <li>デプロイは <code>docker compose up -d --build</code> (<code>better-sqlite3</code> のネイティブビルド)。過去レポートを引き継ぐ場合は <code>node scripts/import-reports.js --days 120</code></li>
          <li>任意 env: <code>ADMIN_ID</code> / <code>ADMIN_PASS</code> (管理者資格情報) / <code>ADMIN_TOKEN_TTL_MS</code> (既定 72h) / <code>SCORE_RETENTION_DAYS</code> (既定 120) / <code>ASSIGNEE_BELONGING_KEYWORD</code> (担当者の所属絞り込み、既定「クリエイティブ」)</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v3.0">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v3.0</span>
        <span class="help-changelog__date">2026-06-10</span>
        <span class="help-changelog__headline">検知箇所への導線強化 + 採点品質・運用修正</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.target}<span>検知箇所への導線強化</span></h4>
        <ul>
          <li><strong>実ページの該当箇所リンク</strong>: offender に「ページの該当箇所を開く」を追加。要素 id または可視テキスト (Scroll-to-Text Fragment) で対象ページの該当部へ直接ジャンプ (生成可能な箇所のみ)</li>
          <li><strong>AI 優先度レコメンドからのページ内ジャンプ</strong>: 提案項目クリックで Failed Audits の該当検知項目へスクロール + 自動展開 + ハイライト</li>
          <li>ヘッダの URL をリンク化 (新規タブで対象ページを開ける)</li>
        </ul>

        <h4>${ICON.filter}<span>採点品質・運用修正</span></h4>
        <ul>
          <li><strong>HTTP 4xx/5xx エラーページを採点対象外に</strong> (<code>gate/http-status</code>): サーバエラーページを本物のページとして採点しスコア履歴を汚染していた問題を修正。レポートに <code>statusCode</code> も記録</li>
          <li>index.html を min 生成物から <code>dashboard.css/js</code> 直読みに変更 — デプロイ手順によってスタイルが消失する事故を解消</li>
          <li>サイドバーを内部スクロール化 — コンテンツが長くなっても AI Usage が画面外に押し出されない</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.5">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.5</span>
        <span class="help-changelog__date">2026-04-27</span>
        <span class="help-changelog__headline">ロゴ / ブランドガイドラインルールを AI 化</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.target}<span>既存決定的ルールを AI 評価に置き換え</span></h4>
        <ul>
          <li>従来の <code>visual/logo-regulation</code> (機械判定: サイズ / transform / alt 等) を <code>ai/logo-regulation</code> に置換 — ブランドガイドライン (<code>config/brands/&lt;id&gt;/</code>) の本文を system prompt に埋め込み、最小サイズ・アイソレーション・縦横比・alt・カラー表示規定・禁則などを総合判定</li>
          <li>従来の <code>visual/brand-guideline</code> (機械判定: ブランドカラー含有チェック等) を <code>ai/brand-guideline</code> に置換 — ブランドガイドラインに基づくカラーパレット・フォントファミリー・見出しサイズ階層・line-height・letter-spacing を判定</li>
          <li>機械判定では捉えきれなかった「ガイドライン精神に沿った遵守」を AI で評価可能に</li>
        </ul>

        <h4>${ICON.info}<span>ガイドラインの管理</span></h4>
        <ul>
          <li>ガイドライン本文はブランドごとに <code>config/brands/&lt;id&gt;/</code> のファイルで管理し、AI ルールが対象ブランドの本文を読み込んで判定</li>
          <li>新ブランド追加はディレクトリを置くだけで、ルールコードの変更は不要</li>
          <li>ガイドライン更新時はブランドの設定ファイルを直接編集する運用</li>
        </ul>

        <h4>${ICON.bulb}<span>累計ルール数</span></h4>
        <ul>
          <li>全 <strong>72 ルール</strong> (決定的 47 + AI 25)</li>
          <li>決定的 logo-regulation / brand-guideline (機械判定 2 件) を削除し、AI ルール 2 件で置換 (差し引き 0)</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.4">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.4</span>
        <span class="help-changelog__date">2026-04-26</span>
        <span class="help-changelog__headline">UI 整理 / 運用安定化 / コスト・速度の大幅最適化</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.chart}<span>サイドバー UI 整理</span></h4>
        <ul>
          <li>TARGETS をサイト切替セレクタ + 選択中サイトのページのみ表示する形に再構成 (サイト数が増えても見通し維持)</li>
          <li>用語を <strong>「ドメイン」→「サイト」</strong> に統一 (サイト追加モーダル / 削除確認 / 各 button title 等)</li>
          <li>「+ ページを追加」を点線ボタンとしてページリスト末尾に常時表示</li>
          <li>セレクタドロップダウン内に「+ サイトを追加」を追加導線として配置</li>
        </ul>

        <h4>${ICON.filter}<span>運用安定化</span></h4>
        <ul>
          <li><strong>クロール同時実行数の制御</strong>: <code>CRAWL_CONCURRENCY</code> (既定 2) で並列数を制限。
            複数サイト連続追加時の OOM 再起動 / Lighthouse タイムアウト / port 競合を防止</li>
          <li>キュー待機中も <code>crawlJobs</code> Map に <em>queued</em> ステータスを記録、UI に「順番待ち (前 N 件)」を表示</li>
          <li><strong>クロール頻度を毎日</strong> (平日のみ → 毎日 9:00) に変更、週末計測も可能に</li>
          <li><strong>レポート保持期間</strong> を 14 日 → 7 日 (スクショ assets は 3 日) に短縮 + 毎日 3:00 掃除でディスク節約</li>
          <li>新規ドメインの <code>DEFAULT_DOMAIN_WEIGHTS</code> を新形式 (LH + main 各カテゴリ) に統一 (旧形式は自動マイグレ)</li>
        </ul>

        <h4>${ICON.target}<span>AI コスト最適化</span></h4>
        <ul>
          <li><strong>Anthropic Prompt Caching</strong> 適用: 全 AI ルール共通の評価フレームワーク (~1500 トークン) を <code>cache_control: ephemeral</code> で共有。2 回目以降は ~90% コスト削減</li>
          <li><strong>HTML 不変なら AI ルール全スキップ</strong>: fetchPage 後に pageHash を計算し、前回成功した同一 target/device の hash と一致すれば AI 23 件を完全スキップして前回結果を流用</li>
          <li><strong>AI 修正提案の prefetch を critical 限定に</strong>: 既定値を <code>all</code> → <code>critical</code> に変更。major / minor は UI クリック時に on-demand 生成するためコスト ~70% 減</li>
          <li>SHARED_FRAMEWORK のバージョン hash をキャッシュキーに含めて、フレームワーク変更時にローカルキャッシュを一斉無効化</li>
        </ul>

        <h4>${ICON.bulb}<span>速度・ストレージ最適化</span></h4>
        <ul>
          <li><strong>runRules + Lighthouse の並列実行</strong>: Lighthouse を独立 Chromium で並行起動するよう変更し、1 デバイスあたり ~15-20 秒短縮</li>
          <li><strong>report.json を gzip 圧縮保存</strong> (<code>report.json.gz</code>): ストレージ ~5x 削減。Express 側で <code>Content-Encoding: gzip</code> ヘッダ付きで透過配信、クライアント変更不要</li>
          <li>旧 <code>report.json</code> 形式は自動フォールバックで読込互換維持</li>
          <li><strong>スクリーンショットを PNG → JPEG 80%</strong> に変更: 1 枚あたり ~80% サイズ減 (~5MB → ~1MB)、視認性は維持</li>
          <li><strong>dashboard.js / dashboard.css を esbuild で minify</strong>: <code>npm run start</code> の prestart で自動生成、index.html は <code>.min.js</code> / <code>.min.css</code> を参照</li>
        </ul>

        <h4>${ICON.info}<span>その他改善</span></h4>
        <ul>
          <li>クロール進捗のリアルタイム表示 (stage / device / pct) ※ v2.3 から継続改良</li>
          <li>初回クロール中の main 表示をパルス波ローダに刷新 (v2.3)</li>
          <li>メインカードクリックで該当 Failed Audits へスクロール遷移</li>
          <li>popover を body 直下に退避して transform/backdrop-filter による配置不具合を解消</li>
          <li>サイドバーのページスコア表示を <strong>PC の総合スコア固定</strong> に統一</li>
          <li>新規ルールの offenders 独自フィールドが表示されない問題を修正 (汎用 meta フォールバック)</li>
          <li><code>config/targets.json</code> を git 管理から外し、UI 編集データの上書き消失リスクを排除</li>
          <li>scorer: weights 不整合時に 100 点固定せず単純平均で fallback</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.3">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.3</span>
        <span class="help-changelog__date">2026-04-24</span>
        <span class="help-changelog__headline">スポット評価 / 進捗表示 / UI 改善 / 運用修正</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.target}<span>スポット評価 (URL 1 回限りクロール)</span></h4>
        <ul>
          <li>config にターゲット登録せず、任意 URL をその場でクロールする機能を追加</li>
          <li>サイドバー下部「ツール」の「スポット評価 (URL 1 回限り)」ボタンから起動</li>
          <li>レポートは通常同様 <code>public/reports/&lt;TS&gt;/</code> に保存 (<code>spot: true</code> フラグ付)</li>
          <li>サイドバーの通常ターゲットとは分離表示。「スポット評価の履歴」から過去分を再表示可能</li>
          <li>API: <code>POST /api/crawl/spot</code> / <code>GET /api/runs/spots</code></li>
        </ul>

        <h4>${ICON.filter}<span>クロール進捗のリアルタイム表示</span></h4>
        <ul>
          <li>サーバ → クライアントに stage (fetching / rules / screenshot / lighthouse / scoring) + % を送信</li>
          <li>初回クロール中の main パネルを <strong>スケルトン廃止 → パルス波ローダ</strong> に刷新</li>
          <li>progress bar (shimmer アニメ) + 現在ステージ名 + % を表示</li>
          <li>PC 70% / SP 30% の配分で single %-bar に集約</li>
          <li>ポーリング間隔 3s → 2s に短縮</li>
          <li>リロード時にサーバ側で進行中のジョブがあれば watching を自動再開</li>
        </ul>

        <h4>${ICON.chart}<span>UI 改善</span></h4>
        <ul>
          <li>メインカードクリックで該当 Failed Audits へ <strong>スクロール遷移</strong></li>
          <li>popover を body 直下に退避して transform/backdrop-filter による containing block 問題を根本解消 (サイドバー下に潜る / 画面外はみ出し解消)</li>
          <li>Toast を help-fab と重ならない位置に調整</li>
          <li>サイドバーのページスコアを <strong>PC の総合スコア固定</strong> (PC 未計測なら任意デバイスにフォールバック)</li>
          <li>新規ルールの offenders が独自フィールドを返していても表示されるよう汎用 meta 描画を追加</li>
        </ul>

        <h4>${ICON.info}<span>運用系修正</span></h4>
        <ul>
          <li><strong>targets.json を git 管理から除外</strong>: UI 編集データが git push で上書き消失するリスクを解消。初期値は <code>config/targets.example.json</code> から自動コピー</li>
          <li>旧形式 weights (<code>llmo / semantic / ...</code>) を新形式 (<code>code / info / text / visual / usability / lh-*</code>) に自動マイグレ</li>
          <li><code>DEFAULT_DOMAIN_WEIGHTS</code> を新形式に更新 (新規ドメインが 100 点固定になる問題を修正)</li>
          <li>scorer: 重み不整合時に 100 点固定せず mainCategory + LH の単純平均で fallback</li>
          <li>ルール実行を並列化: AI 23 件が同時実行数 6 のワーカープールで ~5x 高速化</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.2">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.2</span>
        <span class="help-changelog__date">2026-04-24</span>
        <span class="help-changelog__headline">新メインカテゴリ 4 種 (情報設計 / テキスト品質 / ビジュアル / 操作のしやすさ) + 30 ルール追加</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

        <h4>${ICON.chart}<span>メインカテゴリ追加 (4 種) と Design 廃止</span></h4>
        <ul>
          <li>新規メインカテゴリ: <strong>情報設計 / テキスト品質 / ビジュアル / 操作のしやすさ</strong> を Code と並列で追加</li>
          <li>将来用に用意していた「デザイン品質」メインは削除 (新 4 カテゴリで代替)</li>
          <li>サイドバー Category フィルタ・Failed Audits メインタブ・スコアカードに全て反映</li>
        </ul>

        <h4>${ICON.filter}<span>Phase 1-2A: 機械判定ルール 13 件</span></h4>
        <ul>
          <li><strong>情報設計</strong>: specific-section-labels (抽象語見出し検出) / heading-visual-hierarchy (H1-H6 font-size 降順) / required-service-items (料金/機能/ターゲット/差別化/信頼性の本文テキスト化)</li>
          <li><strong>テキスト品質</strong>: sentence-length (1 文 60 字以内) / ng-words (誤表記・ NG ワード / ござます / 全角英字混入) / notation-consistency (サーバ/サーバー等の表記揺れ)</li>
          <li><strong>ビジュアル</strong>: image-quality (引き伸ばし) / contrast (WCAG AA) / logo-regulation / brand-guideline / ui-pattern-consistency</li>
          <li><strong>操作のしやすさ</strong>: cta-label-specificity (OK/次へ/詳細 等) / cta-placement (CTA 密度)</li>
          <li>lib/fetcher.js に computed style / 画像寸法 / 見出しサイズ / ページ寸法を 1 回の page.evaluate で集約する <code>visualData</code> 収集を追加</li>
        </ul>

        <h4>${ICON.bulb}<span>Phase 2B: AI 判定ルール 17 件</span></h4>
        <ul>
          <li><strong>情報設計</strong> (7): info-duplication / section-single-theme / block-single-purpose / parallel-item-format / role-separation / target-audience-clarity / differentiation-with-evidence</li>
          <li><strong>テキスト品質</strong> (4): image-vs-text-priority / deixis-clarity (指示語依存) / heading-body-alignment / service-name-in-text</li>
          <li><strong>ビジュアル</strong> (1): emphasis-priority-match (強調と重要度の整合)</li>
          <li><strong>操作のしやすさ</strong> (5): cta-placement-quality / error-message-specificity / state-feedback / flow-resume-clarity / input-state-visibility</li>
          <li>共通ヘルパー <code>lib/ai/create-rule.js</code> (createAiRule / sampleBodyText / extractHeadings) で AI ルール本体の boilerplate を削減</li>
        </ul>

        <h4>${ICON.info}<span>累計ルール数</span></h4>
        <ul>
          <li>全 <strong>72 ルール</strong> (決定的 49 + AI 23)</li>
          <li>mainCategory 別: Code 42 / Info 10 / Text 7 / Visual 6 / Usability 7</li>
        </ul>

        <h4>${ICON.filter}<span>メインカテゴリの並び順変更</span></h4>
        <ul>
          <li>メインカード・Audits メインタブの並び順を <strong>Lighthouse → 情報設計 → テキスト品質 → ビジュアル → 操作のしやすさ → コード品質</strong> に変更</li>
          <li>サイドバーの Category フィルタも <strong>情報設計 → テキスト品質 → ビジュアル → 操作のしやすさ → コード品質</strong> の順に並び替え (LH は Code の perf/a11y 等サブで既に制御されるため専用グループは置かない)</li>
        </ul>

        <h4>${ICON.target}<span>総合スコアの重み付け再設計</span></h4>
        <ul>
          <li>従来の「サブカテゴリ × 重み」加重平均を廃止し、<strong>メインカテゴリ + Lighthouse カテゴリ</strong> を横断した weighted average に統一</li>
          <li>新しい重み (targets.json / weights):
            <ul>
              <li>LH-パフォーマンス: <strong>5</strong></li>
              <li>LH-ユーザー補助: <strong>20</strong></li>
              <li>LH-おすすめの方法 (Best Practices): <strong>10</strong></li>
              <li>LH-SEO: <strong>10</strong></li>
              <li>情報設計: <strong>15</strong></li>
              <li>テキスト品質: <strong>10</strong></li>
              <li>ビジュアル: <strong>10</strong></li>
              <li>操作のしやすさ: <strong>10</strong></li>
              <li>コード品質: <strong>10</strong> (配下 7 サブの単純平均 × 10%)</li>
              <li>合計: <strong>100%</strong></li>
            </ul>
          </li>
          <li>Lighthouse 実行が無い場合は、適用できる重みだけで <strong>normalize</strong> して総合スコアを算出 (欠損項目で 0 点扱いされない)</li>
          <li><code>score.weightedContributors</code> に各項目のスコア+重みが入るので採点根拠表示が可能</li>
        </ul>
      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.1">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.1</span>
        <span class="help-changelog__date">2026-04-24</span>
        <span class="help-changelog__headline">Lighthouse 統合 + メインカテゴリ階層 + UI 刷新</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">

      <h4>${ICON.target}<span>Lighthouse 統合</span></h4>
      <ul>
        <li>Lighthouse を独立 Chromium で実行し <strong>4 カテゴリ (Performance / Accessibility / Best Practices / SEO)</strong> のスコアを取得</li>
        <li>既存ルールと重なる audit は <code>sources[]</code> で統合表示 (<em>Code</em> + <em>Lighthouse</em> の両バッジ)</li>
        <li>Lighthouse 単独 audit は <code>lighthouse:&lt;id&gt;</code> の仮想 violation として末尾に追加</li>
        <li>CWV 4 ルール (LCP / CLS / TBT / TTFB) は <strong>スコア計算を Lighthouse 準拠に変更</strong> (weight 0 / scoreExcluded)。Quality Crawler の実測値は <em>Code 参考</em> バッジで参考表示</li>
      </ul>

      <h4>${ICON.chart}<span>メインカテゴリ階層の導入</span></h4>
      <ul>
        <li>サブカテゴリをまとめる <strong>メインカテゴリ</strong> (コード品質 / 情報設計 / テキスト品質 / ビジュアル / 操作のしやすさ) を新設</li>
        <li>メインカード (円形ゲージ) が横並び表示。hover / click でサブカテゴリスコアを popover</li>
        <li>メインカテゴリスコア = サブカテゴリ群の単純平均</li>
        <li>Design カテゴリは箱だけ用意済。今後のルール追加で自動的に UI に現れる</li>
      </ul>

      <h4>${ICON.filter}<span>Failed Audits タブの 2 階層化</span></h4>
      <ul>
        <li>メインタブ (<em>すべて / Code / Design / Lighthouse</em>) + サブタブの 2 段構成</li>
        <li><strong>Lighthouse メインタブ</strong>は <code>sources[]</code> ベースの横断フィルタ。Code と重複する audit も再掲 (「LH 視点で見る」切替)</li>
        <li>Lighthouse タブ選択時のみサブタブが LH ネイティブ (Perf / A11y / Best / SEO) に切替</li>
      </ul>

      <h4>${ICON.bulb}<span>サイドバー / ローディング</span></h4>
      <ul>
        <li>サイドバー各セクションを <strong>アコーディオン</strong> 化 (折畳状態は localStorage で永続化)</li>
        <li>Targets / Category は内部スクロール (長くなっても固定高で収まる)</li>
        <li>全画面 <strong>ローディングアニメーション</strong> 追加 (パルス波が流れる演出)</li>
        <li>favicon をサイドバーロゴ (パルスアイコン) に統一</li>
      </ul>

      <h4>${ICON.info}<span>その他</span></h4>
      <ul>
        <li>旧レポート互換: <code>mainCategories</code> が無い古いレポートでもサブスコアから単純平均でフォールバック算出</li>
        <li>Lighthouse を Docker コンテナ (node:22 + Playwright 構成) で動作させるため、chrome-launcher に Playwright の Chromium を流用する解決処理を追加</li>
      </ul>

      </div>
    </section>

    <section class="help-section help-changelog__release help-changelog__release--collapsed" data-changelog-release="v2.0">
      <button class="help-changelog__header" type="button" data-changelog-toggle aria-expanded="false">
        <span class="help-changelog__version">v2.0</span>
        <span class="help-changelog__date">〜2026-04-23</span>
        <span class="help-changelog__headline">AI 評価 + SPA ダッシュボード化</span>
        <span class="help-changelog__caret">${ICON.chevron}</span>
      </button>
      <div class="help-changelog__body">
        <ul>
          <li><strong>SPA ダッシュボード (Express + port 3001)</strong> を新設</li>
          <li>domains / pages 階層の config 管理 (UI からの追加 / 削除 / 再クロール API)</li>
          <li><strong>AI 評価ルール 6 種</strong> + AI 修正提案 + 改善優先度レコメンドエンジン</li>
          <li>Core Web Vitals (LCP / CLS / TBT / TTFB) 計測と perf ルール 4 件</li>
          <li>リンク健全性カテゴリ新設 (broken / redirect-chain / unreachable)</li>
          <li>offender の bbox 解決 + 全画面スクリーンショット保存 + モーダルで赤枠プレビュー</li>
          <li>CSV / Markdown エクスポート、ルール横断ビュー API</li>
          <li>AI トークン使用量を日別バケットで追跡 (本日 / 今月 / 累計)</li>
          <li>PC / SP デュアルデバイス評価 (C-smart: device-sensitive のみ再実行)</li>
        </ul>
      </div>
    </section>`;
}

function renderHelpAbout() {
  return `
    <section class="help-section">
      <h3>${ICON.chart}<span>このツールについて</span></h3>
      <p>登録したサイトの品質を自動でクロールして評価・可視化するダッシュボードです。
      「コード品質 / 情報設計 / テキスト品質 / ビジュアル / 操作のしやすさ」の 5 観点 + Lighthouse 4 カテゴリで採点し、
      改善すべき箇所を検知項目として一覧化します。</p>
    </section>

    <section class="help-section">
      <h3>${ICON.check}<span>できること</span></h3>
      <ul>
        <li><strong>サイト/ページ単位の品質スコア化</strong>：PC / SP それぞれをクロールし、総合スコア (0–100) とカテゴリ別スコアを表示</li>
        <li><strong>TOP ダッシュボード</strong>：全サイト・全ページの現況を一覧 (総合スコアは PC/SP 平均)、担当者の設定・絞り込み</li>
        <li><strong>検知項目の可視化</strong>：該当箇所 (セレクタ + HTML スニペット) と修正ガイダンス。AI による具体的な修正提案も依頼可能</li>
        <li><strong>スコア推移グラフ</strong>：総合 + メイン5 + Lighthouse の 7 系列を期間指定 (7/30/90/120日) で表示</li>
        <li><strong>手動評価ステータス</strong>：検知結果を管理者が「除外 / NG / OK」で上書き可能 (再クロールしても維持)</li>
        <li><strong>スポット評価</strong>：未登録の任意 URL をその場で 1 回だけ評価</li>
      </ul>
    </section>

    <section class="help-section">
      <h3>${ICON.info}<span>仕様 (概要)</span></h3>
      <dl class="help-dl">
        <dt>評価軸</dt>
        <dd>決定的ルール + AI ルール (合計はサイドバー上部に表示) と Lighthouse 4 カテゴリ。詳細は「検知ルール」「評価ロジック」タブ参照。</dd>
        <dt>クロール対象</dt>
        <dd>サイト → ページの階層で管理。各ページを PC / SP でレンダリングして評価 (詳細は「クロールロジック」タブ)。</dd>
        <dt>実行タイミング</dt>
        <dd>平日早朝の定期クロール (cron) + 管理者の手動再クロール + ページ追加時の初回クロール。1 ページ 5〜10 分程度。</dd>
        <dt>データ保持</dt>
        <dd>スコア履歴は最大 120 日。レポート本体は SQLite に保存、スクリーンショット画像はファイルで保持。</dd>
        <dt>ビジュアル項目</dt>
        <dd>自動検知の精度に限界があるため、<strong>pass も含め全件を一覧表示</strong>し、管理者の手動評価で補正する運用。</dd>
        <dt>権限</dt>
        <dd>閲覧は誰でも可能。<strong>サイト/ページの追加・編集・削除・再クロール・手動ステータス変更は管理者モード限定</strong> (ヘルプ下部からログイン、72 時間維持)。</dd>
      </dl>
    </section>

    <section class="help-section">
      <h3>${ICON.triangle}<span>使用上の注意</span></h3>
      <ul>
        <li><strong>スコアは「相対的な品質の目安」</strong>です。自動検知の特性上、誤検知・取りこぼしがあり得ます。気になる項目は手動ステータス (除外/OK/NG) で調整してください。</li>
        <li><strong>表示は「最後にクロールした時点」の結果</strong>です。サイト修正後は再クロールするまで反映されません。</li>
        <li><strong>再クロールやページ追加はクロール完了まで数分</strong>かかります。連続実行はサーバ負荷になるため順番待ちで処理されます。</li>
        <li><strong>スポット評価の結果は履歴に分離保存</strong>され、通常の一覧/ダッシュボードには出ません。</li>
        <li>監視対象サイトが<strong>社内ネットワークから別サーバに見える</strong>等で正しく評価できない場合があります (DNS/到達性)。「ゲート未通過 (HTTP 4xx/5xx)」が続く場合は接続経路をご確認ください。</li>
      </ul>
    </section>

    <section class="help-section">
      <h3>${ICON.send}<span>問い合わせ先</span></h3>
      <p>不具合報告・機能要望・運用相談は下記まで:</p>
      <dl class="help-dl">
        <dt>担当</dt>
        <dd>—</dd>
      </dl>
    </section>`;
}

function renderHelpDisplay() {
  return `
    <section class="help-section">
      <h3>ダッシュボードの構成</h3>
      <p>初期表示は <strong>TOP ダッシュボード</strong>（全サイト一覧）。サイドバーから個別ページを選ぶと、そのページの最新レポートを表示します。</p>
      <dl class="help-dl">
        <dt>サイドバー（サイト一覧）</dt>
        <dd>全サイトを<strong>アコーディオン</strong>で縦に表示。サイト名クリックで配下ページを開閉、ページクリックで詳細へ。各ページ右のバッジは<strong>総合スコア</strong>（<span class="help-inline-score help-inline-score--pass">90+</span> / <span class="help-inline-score help-inline-score--average">50–89</span> / <span class="help-inline-score help-inline-score--fail">〜49</span>）。<strong>管理者</strong>はサイト名右の <code>+</code> でページ追加、<code>🗑</code> で削除。最上部の「サイトを追加」でサイト追加（管理者のみ）。タイトル「Quality Crawler」クリックで TOP へ戻る。</dd>
        <dt>サイドバー：AI Usage</dt>
        <dd>Claude API 呼び出しの累計。Calls = API呼出回数、Tokens = 入力+出力合計、Cost = 推定コスト (USD)。キャッシュヒット分は課金されません。</dd>
        <dt>TOP ダッシュボード</dt>
        <dd>全サイト・全ページの現況一覧。総合スコアは <strong>PC/SP の平均</strong>。各行に<strong>担当者</strong>チップ（管理者はクリックで編集）、担当者での絞り込みも可能。上部のツールバーに<strong>スポット評価 / スポット履歴 / CSV / Markdown 書き出し</strong>。</dd>
        <dt>ツール（TOP のツールバー）</dt>
        <dd>
          <ul class="help-tool-list">
            <li><strong>スポット評価</strong>：登録していない任意の URL を、その場で 1 回だけクロール・評価。通常ページと同じルール + Lighthouse を実行しますが、結果は <code>spot</code> 扱いでサイト一覧には追加されません。</li>
            <li><strong>スポット履歴</strong>：過去のスポット評価一覧。クリックで当時のレポートを再表示。</li>
            <li><strong>CSV / Markdown</strong>：直近クロールの全ページ × スコアを書き出し（集計・共有 / Issue 貼り付け用）。</li>
          </ul>
        </dd>
        <dt>管理者モード</dt>
        <dd>ヘルプ (?) 内の「管理者モード」からログイン。サイト/ページの追加・編集・削除、再クロール、手動ステータス変更が可能になります（72 時間維持）。閲覧は誰でも可能。</dd>
        <dt>メイン：Total Score / Violation Breakdown / カテゴリカード</dt>
        <dd>総合スコア（カテゴリ重み付き平均、閾値未達は赤）、Critical / Major / Minor / Passed 件数、メインカテゴリ（コード品質 / 情報設計 / テキスト / ビジュアル / 操作のしやすさ）+ Lighthouse のスコアカード。カードクリックで該当ルールへジャンプ。</dd>
        <dt>メイン：Score Trend</dt>
        <dd>総合 + メイン5カテゴリ + Lighthouse 平均の<strong>7 系列</strong>の推移。期間 <strong>7 / 30 / 90 / 120 日</strong>を選択でき、凡例クリックで系列の表示/非表示を切り替え。破線は閾値。</dd>
        <dt>メイン：Failed Audits</dt>
        <dd>重要度順/カテゴリ順の2ビュー。ヘッダの<strong>重要度フィルタ</strong>で絞り込み。各項目に該当箇所（selector + HTMLスニペット）と修正ガイダンス、AI提案。<strong>管理者</strong>は各項目で<strong>手動ステータス（除外 / NG / OK / 検知に戻す）</strong>を設定可能（「手動設定」フラグ付き）。<strong>ビジュアル項目は pass も含め全件表示</strong>されます。</dd>
      </dl>
    </section>`;
}

function renderHelpCrawl() {
  return `
    <section class="help-section">
      <h3>クロールの流れ</h3>
      <pre class="help-flow">
対象URL
  ↓
[1] Playwright で headless Chromium 起動
    ページを読み込み、レンダリング後の DOM を取得
  ↓
[2] 補助ファイル取得 (/llms.txt, /robots.txt)
  ↓
[3] ページデータ抽出
    - HTML 全体サイズ / body開始位置 / head内インラインサイズ
    - 本文テキスト量
    - CSS擬似要素のテキスト
    - div/span の click イベント検出
  ↓
[4] ゲート条件 (gate/body-start-offset) 判定
    - body が 28KB 以内か？ 超過 → 以降の評価をスキップ
  ↓
[5] 決定的ルール 27 個を実行 (Cheerio ベース)
  ↓
[6] AI ルール 6 個を実行 (AI_EVALUATION_ENABLED=true のとき)
    - Claude API に DOM/コンテキストを渡して意味論的判定
  ↓
[7] カテゴリ別スコア + 総合スコア算出
    (手動ステータス「除外」の項目は計算から除外、OK/NG は上書き反映)
  ↓
[8] SQLite (data/app.db) に保存
    - スコア/検知結果は DB、スクショ画像は public/reports/&lt;ts&gt;/assets/ にファイル保存
    - 手動ステータスは run と独立に保持され再クロールでも引き継がれる
  ↓
[9] AI 修正提案を failed audit について事前生成
    (AI_PREFETCH=all のとき、キャッシュ済みならスキップ)
      </pre>
    </section>
    <section class="help-section">
      <h3>実行トリガー</h3>
      <ul>
        <li><strong>自動定期実行</strong>: 平日9時 (JST)、ホスト cron → <code>npm run crawl</code></li>
        <li><strong>手動実行</strong>: メインヘッダーの「再クロール」ボタン、または空状態の「クロールを実行」ボタン</li>
        <li><strong>ページ追加時</strong>: 新規ページ追加と同時に初回クロールを自動開始</li>
      </ul>
    </section>
    <section class="help-section">
      <h3>AI 連携</h3>
      <ul>
        <li>AI 評価ルール: 6 ルール（見出しの意味性、meta description 品質、alt 品質、JSON-LD 整合性、リンクテキスト具体性、llms.txt 情報密度）</li>
        <li>AI 修正提案: 各 failed audit に対し、Claude (Sonnet 4.6) が具体的な before/after コードを生成</li>
        <li>キャッシュキー: <code>ruleId + URL + 違反箇所の signature</code> の SHA-256。同一内容なら再呼び出しなし</li>
        <li>コスト追跡: <code>public/ai-cache/usage.json</code> に累積保存、サイドバーに表示</li>
      </ul>
    </section>`;
}

async function renderHelpRules() {
  if (!helpRulesCache) {
    try { helpRulesCache = await fetchJson('/api/rules'); }
    catch (err) { return `<div class="help-section">ルール情報取得失敗: ${escapeHtml(err.message)}</div>`; }
  }
  const { rules, deterministic, ai, aiAvailable } = helpRulesCache;
  const byCategory = {};
  for (const r of rules) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  const sections = CATEGORY_ORDER.filter((c) => byCategory[c]).map((cat) => {
    const items = byCategory[cat].map((r) => `
      <details class="help-rule">
        <summary>
          <span class="help-rule__name">${escapeHtml(r.name)}</span>
          <span class="help-rule__meta">
            ${r.aiRule ? '<span class="help-rule__badge help-rule__badge--ai">AI</span>' : ''}
            <span class="help-rule__severity help-rule__severity--${r.severity}">${SEVERITY_LABEL[r.severity] || r.severity}</span>
            <span class="help-rule__weight">weight ${r.weight}</span>
          </span>
        </summary>
        <div class="help-rule__body">
          <div class="help-rule__id"><code>${escapeHtml(r.id)}</code></div>
          ${r.fix ? `<div class="help-rule__fix">${ICON.bulb}<span>${escapeHtml(r.fix)}</span></div>` : ''}
        </div>
      </details>`).join('');
    return `
      <section class="help-section">
        <h4>${escapeHtml(CATEGORY_LABEL[cat])} <span class="help-rule__count">${byCategory[cat].length} ルール</span></h4>
        ${items}
      </section>`;
  }).join('');
  return `
    <section class="help-section">
      <p>全 <strong>${rules.length}</strong> ルール（決定的 ${deterministic} + AI ${ai}）。
      AI ルールは ${aiAvailable ? '<strong style="color:var(--color-pass)">有効</strong>' : '<strong style="color:var(--color-fail)">無効</strong> (ANTHROPIC_API_KEY 未設定)'}。</p>
    </section>
    ${renderHelpToolDivision()}
    ${sections}`;
}

function renderHelpToolDivision() {
  return `
    <section class="help-section help-section--divide">
      <h3>${ICON.info} Quality Crawler と Lighthouse の棲み分け</h3>
      <p>本ダッシュボードは <strong>Quality Crawler (独自ルール)</strong> と <strong>Google Lighthouse</strong> を並列実行し、結果を統合表示しています。<br>
      重なるのは全体の約 <strong>30%</strong>。それ以外の約 70% はお互いにしか検知できない項目です。</p>

      <div class="help-divide-grid">
        <div class="help-divide-col">
          <h4>Quality Crawler のみで検知</h4>
          <ul>
            <li><strong>LLMO 系</strong>: llms.txt 存在 / 本文品質、OG 必須タグ</li>
            <li><strong>Structured 詳細</strong>: JSON-LD 構文、@context / @type、BreadcrumbList、本文との整合性 (AI)</li>
            <li><strong>機械可読性</strong>: DOM テキスト量、CSS 擬似要素依存、table/dl 用途、div 比率</li>
            <li><strong>Semantic 厳格</strong>: single main、single h1、landmarks、th-scope、section/article と見出しの対応</li>
            <li><strong>リンク健全性</strong>: 4xx/5xx、リダイレクトチェーン、到達不能 (HEAD 検査)</li>
            <li><strong>AI 評価</strong>: 見出し意味論、alt 品質、meta-description 品質、リンク意味論、llms.txt 内容品質</li>
          </ul>
        </div>
        <div class="help-divide-col">
          <h4>Lighthouse のみで検知</h4>
          <ul>
            <li><strong>Performance 詳細</strong>: unused-javascript、unused-css、font-display、cache TTL、render-blocking-resources、third-party-summary、long-tasks、画像最適化</li>
            <li><strong>Accessibility 詳細</strong>: color-contrast、ARIA 厳密チェック、duplicate-id、tabindex、landmark 厳密、list/listitem など 30+ 項目</li>
            <li><strong>Best Practices</strong>: HTTPS/CSP、脆弱性ライブラリ、console error、image aspect ratio、doctype、charset、deprecations</li>
            <li><strong>SEO 補完</strong>: meta-description、tap-targets、hreflang、font-size、crawlable-anchors</li>
          </ul>
        </div>
      </div>

      <h4 style="margin-top:18px">両方で検知される項目</h4>
      <p>以下は両ツールが重複して評価しますが、<strong>判定ロジックや閾値が異なる</strong>ため相互検証として有用です。
      ダッシュボード下部の Failed Audits では <em>Code + Lighthouse</em> の両バッジが付きます:</p>
      <ul class="help-divide-overlap">
        <li><code>perf/lcp</code> ↔ <code>largest-contentful-paint</code> <em class="help-divide-note-chip">スコアは LH 準拠</em></li>
        <li><code>perf/cls</code> ↔ <code>cumulative-layout-shift</code> <em class="help-divide-note-chip">スコアは LH 準拠</em></li>
        <li><code>perf/tbt</code> ↔ <code>total-blocking-time</code> <em class="help-divide-note-chip">スコアは LH 準拠</em></li>
        <li><code>perf/ttfb</code> ↔ <code>server-response-time</code> <em class="help-divide-note-chip">スコアは LH 準拠</em></li>
        <li><code>a11y/img-alt</code> ↔ <code>image-alt</code></li>
        <li><code>a11y/form-labels</code> ↔ <code>label</code></li>
        <li><code>a11y/button-accessible-name</code> ↔ <code>button-name</code></li>
        <li><code>a11y/link-text-quality</code> ↔ <code>link-name</code></li>
        <li><code>semantic/heading-hierarchy</code> ↔ <code>heading-order</code></li>
        <li><code>readable/lang-attribute</code> ↔ <code>html-has-lang</code>, <code>html-lang-valid</code></li>
        <li><code>llmo/canonical</code> ↔ <code>canonical</code></li>
        <li><code>llmo/robots-txt-accessible</code> ↔ <code>robots-txt</code></li>
        <li><code>structured/json-ld-present</code> ↔ <code>structured-data</code></li>
      </ul>
      <p class="help-divide-note">
        <strong>CWV 系 (LCP / CLS / TBT / TTFB) のスコア扱い:</strong>
        計測方式が Quality Crawler (<code>PerformanceObserver</code> によるリアル環境実測 / throttling なし)
        と Lighthouse (4G + CPU throttling のシミュレーション) で異なり、値が乖離するため
        <strong>スコア計算は Lighthouse の Performance カテゴリに準拠</strong>します。
        Quality Crawler 側の実測値は参考情報として並記され (audit 一覧で <em>Code 参考</em> バッジ表示)、
        サブカテゴリ <code>perf</code> のスコアには影響しません。
      </p>
      <p class="help-divide-note">
        <strong>Failed Audits のメインタブ:</strong> <em>すべて / Code / Design / Lighthouse</em> で絞り込めます。
        <em>Lighthouse</em> タブは <code>sources[]</code> に lighthouse を含む audit を横断的に拾う仮想フィルタで、
        Code ルールと重複している audit も Lighthouse タブに再掲されます (「LH 視点で見る」用)。
        サブタブは Lighthouse のときだけ LH ネイティブカテゴリ (Perf / A11y / Best / SEO) に切り替わります。
      </p>
    </section>`;
}

function renderHelpScoring() {
  return `
    <section class="help-section">
      <h3>ゲート条件</h3>
      <p><code>gate/body-start-offset</code>: body 開始位置 28KB 以内。未通過時は以降の評価をスキップし、レポートに「ゲート未通過」として明示。</p>
    </section>
    <section class="help-section">
      <h3>カテゴリ別スコア</h3>
      <p>各カテゴリ内で <strong>重み付きパス率</strong>:</p>
      <pre class="help-formula">categoryScore = (パスしたルールの weight 合計 / 全ルールの weight 合計) × 100</pre>
      <p>例: カテゴリ a11y に weight 5/4/3/3/2/2 の 6ルールがあり、3ルールパス (5,4,3) なら (5+4+3)/(5+4+3+3+2+2) × 100 = 12/19 × 100 ≈ 63</p>
    </section>
    <section class="help-section">
      <h3>総合スコア</h3>
      <p>カテゴリスコアに<strong>カテゴリ別重み (config.weights)</strong> を掛けて加重平均:</p>
      <pre class="help-formula">total = Σ (categoryScore × categoryWeight)</pre>
      <p>例 (デフォルト):</p>
      <pre class="help-formula">total = llmo × 0.15 + semantic × 0.25 + structured × 0.15
      + readable × 0.15 + a11y × 0.20 + perf × 0.10</pre>
    </section>
    <section class="help-section">
      <h3>重要度と重み</h3>
      <p>各ルールは以下のいずれかの severity と weight を持ちます:</p>
      <dl class="help-dl">
        <dt><span class="help-rule__severity help-rule__severity--critical">CRITICAL</span></dt>
        <dd>weight 4〜5。SEO/A11y への影響が大きく、必ず修正すべき項目。</dd>
        <dt><span class="help-rule__severity help-rule__severity--major">MAJOR</span></dt>
        <dd>weight 3〜4。明確な品質低下を引き起こす項目。</dd>
        <dt><span class="help-rule__severity help-rule__severity--minor">MINOR</span></dt>
        <dd>weight 2。推奨レベル。</dd>
      </dl>
    </section>
    <section class="help-section">
      <h3>手動ステータス (v4)</h3>
      <p>管理者は各検知項目のステータスを手動で上書きできます（検知後でも変更可、再クロールしても維持）:</p>
      <dl class="help-dl">
        <dt><span class="help-rule__severity help-rule__severity--minor">除外</span></dt>
        <dd>スコア計算から完全に外す（分母にも含めない）。計算式は変えず対象から除くだけ。</dd>
        <dt><span class="help-rule__severity help-rule__severity--major">NG / OK</span></dt>
        <dd>不合格 / 合格として扱い、スコアを再計算。</dd>
        <dt>検知状態に戻す</dt>
        <dd>手動上書きを解除し、自動検知の結果に戻す。</dd>
      </dl>
      <p>手動変更した項目には「手動設定」フラグが付きます。<strong>ビジュアル項目は検知精度の都合で pass も含め全件を一覧表示</strong>し、手動評価で補正できます。</p>
    </section>
    <section class="help-section">
      <h3>閾値と終了コード</h3>
      <p><code>config.thresholds.total</code> に閾値 (デフォルト 80)。ダッシュボードの Total パネルで達成/未達を表示。</p>
      <p>CLI 終了コード:</p>
      <ul>
        <li><code>0</code>: すべて pass</li>
        <li><code>1</code>: Critical 違反あり</li>
        <li><code>2</code>: ゲート未通過</li>
        <li><code>3</code>: 実行時エラー</li>
      </ul>
    </section>`;
}

// =============================================================
// Toast
// =============================================================
const activeJobs = new Map(); // jobId -> poll timeout handle

function showToast({ id, message, status = 'running', onClick }) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  let toast = container.querySelector(`[data-toast-id="${CSS.escape(id)}"]`);
  if (!toast) {
    toast = document.createElement('div');
    toast.className = `toast toast--${status}`;
    toast.dataset.toastId = id;
    toast.innerHTML = `
      <span class="toast__spinner"></span>
      <span class="toast__msg"></span>
      <button class="toast__close" aria-label="閉じる">${ICON.x}</button>`;
    toast.querySelector('.toast__close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
  } else {
    toast.className = `toast toast--${status}`;
  }
  toast.querySelector('.toast__msg').textContent = message;
  if (onClick) toast.onclick = (e) => { if (!e.target.closest('button')) onClick(); };
  return toast;
}

function removeToast(id) {
  const toast = document.querySelector(`[data-toast-id="${CSS.escape(id)}"]`);
  if (toast) toast.remove();
}

// 手動クロール起動 (POST /api/crawl/:domainId/:pageId)
async function triggerCrawl(domainId, pageId, pageName) {
  // 既に同一ページのジョブが走っている場合は二重起動しない (ボタン disabled の保険)
  if (isJobRunning(domainId, pageId)) return;
  try {
    const resp = await postJson(`/api/crawl/${encodeURIComponent(domainId)}/${encodeURIComponent(pageId)}`, {});
    if (resp.crawlJobId) {
      startWatchingJob(resp.crawlJobId, pageName || `${domainId}/${pageId}`);
    }
  } catch (err) {
    showToast({
      id: `err-${Date.now()}`,
      status: 'error',
      message: `クロール起動失敗: ${err.message}`,
    });
  }
}

async function pollJobStatus(jobId) {
  try {
    const status = await fetchJson(`/api/crawl/status?id=${encodeURIComponent(jobId)}`);
    return status;
  } catch {
    return { status: 'unknown' };
  }
}

function isJobRunning(domainId, pageId) {
  return activeJobs.has(`${domainId}/${pageId}`);
}

function startWatchingJob(jobId, displayName) {
  showToast({ id: jobId, message: `「${displayName}」のクロールを実行中…`, status: 'running' });

  if (activeJobs.has(jobId)) clearTimeout(activeJobs.get(jobId));

  // サイドバーに pulse 表示、現在表示中のページなら main にもバナー
  renderSidebar();
  if (`${state.currentDomainId}/${state.currentPageId}` === jobId) renderMain();

  const poll = async () => {
    const s = await pollJobStatus(jobId);
    if (s.status === 'running' || s.status === 'queued') {
      // progress を toast と crawl-loader に反映
      updateJobProgressUi(jobId, displayName, s.progress);
      activeJobs.set(jobId, setTimeout(poll, 2000));
      return;
    }
    activeJobs.delete(jobId);
    if (s.status === 'done') {
      const msg = s.gateFailed
        ? `「${s.targetName}」: ゲート未通過`
        : s.error
          ? `「${s.targetName}」: エラー (${s.error})`
          : `「${s.targetName}」: 完了 (スコア ${s.total}/100)`;
      showToast({ id: jobId, message: msg, status: 'done' });
      setTimeout(() => removeToast(jobId), 6000);
      reloadConfigAndReruns();
    } else if (s.status === 'error') {
      showToast({ id: jobId, message: `クロール失敗: ${s.error || 'unknown'}`, status: 'error' });
      renderSidebar();
      // 現在表示中ページなら再クロールボタンを再有効化するため main も描き直す
      if (`${state.currentDomainId}/${state.currentPageId}` === jobId) renderMain();
    } else {
      removeToast(jobId);
      renderSidebar();
      if (`${state.currentDomainId}/${state.currentPageId}` === jobId) renderMain();
    }
  };

  activeJobs.set(jobId, setTimeout(poll, 1500));
}

// 進捗 (progress: { stage, device, message, pct }) を UI に反映
function updateJobProgressUi(jobId, displayName, progress) {
  if (!progress || typeof progress !== 'object') return;
  const pct = Number.isFinite(progress.pct) ? Math.min(100, Math.max(0, progress.pct)) : null;
  const pctText = pct != null ? ` ${pct}%` : '';
  const msg = progress.message || 'クロール中';
  showToast({
    id: jobId,
    message: `「${displayName}」${pctText} — ${msg}`,
    status: 'running',
  });
  // 現在開いているページが対象ならインラインの crawl-loader も更新
  if (`${state.currentDomainId}/${state.currentPageId}` !== jobId) return;
  const fill = document.querySelector('.crawl-loader__progress-fill');
  if (fill && pct != null) fill.style.width = `${pct}%`;
  const stageLabel = document.querySelector('.crawl-loader__stage');
  if (stageLabel) stageLabel.textContent = msg;
  const pctLabel = document.querySelector('.crawl-loader__pct');
  if (pctLabel && pct != null) pctLabel.textContent = `${pct}%`;
  // ステップの active 状態を stage から推定
  const stepOrder = { fetching: 0, rules: 1, screenshot: 2, lighthouse: 2, scoring: 2 };
  const stepIdx = stepOrder[progress.stage];
  const steps = document.querySelectorAll('.crawl-loader__step');
  if (Number.isFinite(stepIdx)) {
    steps.forEach((el, i) => {
      el.classList.toggle('crawl-loader__step--active', i === stepIdx);
      el.classList.toggle('crawl-loader__step--done', i < stepIdx);
    });
  }
}

// --- Filtering ---------------------------------------------------------

// 重大度フィルタを DOM に適用する。カテゴリ絞り込みは Findings の main/sub タブが
// レンダリング時に行うため、ここでは重大度のみを見る (旧サイドバーのカテゴリ依存は廃止)。
function applyFilters() {
  const sev = state.severityFilter;
  for (const audit of document.querySelectorAll('.audit')) {
    const s = audit.dataset.severity;
    const passed = audit.dataset.passed === '1';
    const sevOk = passed ? sev.passed : !!sev[s];
    audit.dataset.hidden = sevOk ? '' : '1';
  }
  for (const group of document.querySelectorAll('.audit-group')) {
    const remaining = group.querySelectorAll('.audit:not([data-hidden="1"])');
    group.dataset.empty = remaining.length > 0 ? '' : '1';
  }
}

// main category トグル → その配下の sub category をまとめて ON/OFF
function handleMainCategoryToggle(el) {
  const main = el.dataset.mainCategory;
  const group = el.closest('.filter-group');
  if (!group) return;
  for (const sub of group.querySelectorAll('input[data-category]')) {
    sub.checked = el.checked;
  }
  applyFilters();
}

// sub category 変化時に main トグル状態を同期
function syncMainToggleFromSubs(subEl) {
  const group = subEl.closest('.filter-group');
  if (!group) return;
  const mainEl = group.querySelector('input[data-main-category]');
  if (!mainEl) return;
  const subs = group.querySelectorAll('input[data-category]');
  const allChecked = [...subs].every((s) => s.checked);
  const someChecked = [...subs].some((s) => s.checked);
  mainEl.checked = allChecked;
  mainEl.indeterminate = !allChecked && someChecked;
}

// --- App state ----------------------------------------------------------

const state = {
  config: { domains: [] },
  runs: [],                   // newest first
  byDomain: new Map(),        // domainId -> {domain, pagesByPageId: Map<pageId, {page, runs}>}
  fullReports: new Map(),     // timestamp -> full report.json
  currentDomainId: null,
  currentPageId: null,
  expandedDomains: new Set(),
  findingsTab: 'severity',
  findingsMainTab: 'all',  // 'all' | 'code' | 'info' | 'text' | 'visual' | 'usability' | 'lighthouse'
  findingsSubTab: 'all',   // 'all' | <category> — サブカテゴリ絞り込み
  // 重大度フィルタ (旧: サイドバー / 現: ページ詳細 Findings 側に移設)
  severityFilter: { critical: true, major: true, minor: true, passed: true },
  currentDevice: 'pc',
  aiEnabled: false,
  aiCache: new Map(),
  priorityCache: new Map(), // key = `${domainId}/${pageId}/${timestamp}` -> payload
  // 管理者モード (ターゲット追加 / 再クロールを許可)
  isAdmin: false,
  // 表示中ビュー: 'dashboard' (TOP一覧/初期表示) | 'page' (個別ページ詳細)
  view: 'dashboard',
  // TOP ダッシュボードの担当者フィルタ (空 = 全件表示)。Set<userId>
  dashAssigneeFilter: new Set(),
  // TOP ダッシュボードで折りたたみ中のサイトグループ。Set<domainId> (既定は全展開)
  dashCollapsed: new Set(),
  // 推移グラフ: 期間(日) と 非表示シリーズ
  trend: { days: 30, hidden: new Set(['code', 'info', 'text', 'visual', 'usability', 'lhAvg']) },
};

// 推移グラフのシリーズ定義 (総合 + メイン5 + LH平均)
const TREND_SERIES = [
  { key: 'total', label: '総合', color: '#2563eb' },
  { key: 'code', label: 'コード品質', color: '#7c3aed' },
  { key: 'info', label: '情報設計', color: '#0891b2' },
  { key: 'text', label: 'テキスト', color: '#16a34a' },
  { key: 'visual', label: 'ビジュアル', color: '#db2777' },
  { key: 'usability', label: '操作性', color: '#ea580c' },
  { key: 'lhAvg', label: 'Lighthouse', color: '#ca8a04' },
];
const TREND_DAYS_OPTIONS = [7, 30, 90, 120];

// Full report detail loader (may need to search through results by domain/page)
async function loadRunDetail(timestamp) {
  if (state.fullReports.has(timestamp)) return state.fullReports.get(timestamp);
  // レポートは手動 override 反映で動的に変わるため HTTP キャッシュを使わず常に取得
  const res = await fetch(`/reports/${timestamp}/report.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`/reports/${timestamp}/report.json -> ${res.status}`);
  const json = await res.json();
  state.fullReports.set(timestamp, json);
  return json;
}

// --- Render main --------------------------------------------------------

// --- TOP ダッシュボード -------------------------------------------------
// 全サイト×全ページの現況を縦積みで一覧。総合スコアは PC/SP の平均。
function buildDashboardRows() {
  const domains = (state.config.domains || []).filter((d) => d.id !== '__spot__');
  const rows = [];
  for (const d of domains) {
    const de = state.byDomain.get(d.id);
    for (const p of d.pages || []) {
      const pe = de?.pagesByPageId.get(p.id);
      const runs = pe?.runs || [];
      const pc = runs.find((r) => (r.device || 'pc') === 'pc');
      const sp = runs.find((r) => r.device === 'sp');
      const latest = pc || sp || runs[0] || null;
      const valid = [pc, sp].filter((r) => r && typeof r.total === 'number' && !r.error && !r.gateFailed);
      const avg = valid.length ? Math.round(valid.reduce((s, r) => s + r.total, 0) / valid.length) : null;
      const status = !latest ? 'none' : latest.error ? 'err' : latest.gateFailed ? 'gate' : 'ok';
      rows.push({
        domainId: d.id, domainName: d.name, pageId: p.id, pageName: p.name, url: p.url,
        assignees: p.assignees || [],
        avg, pc: pc?.total ?? null, sp: sp?.total ?? null,
        threshold: latest?.threshold ?? d.thresholds?.total ?? 80,
        status,
      });
    }
  }
  return rows;
}

async function renderDashboard(main) {
  const allRows = buildDashboardRows();

  // 担当者フィルタ: 全ページの担当者を集約してチップ化
  const assigneeMap = new Map();
  for (const r of allRows) for (const a of r.assignees || []) if (!assigneeMap.has(a.id)) assigneeMap.set(a.id, a.name || String(a.id));
  const filterSet = state.dashAssigneeFilter;
  const rows = filterSet.size === 0
    ? allRows
    : allRows.filter((r) => (r.assignees || []).some((a) => filterSet.has(a.id)));

  const filterChips = assigneeMap.size
    ? `<div class="dash-filter">
        <span class="dash-filter__label">担当者で絞り込み:</span>
        ${[...assigneeMap.entries()].map(([id, name]) =>
          `<button type="button" class="dash-filter__chip ${filterSet.has(id) ? 'dash-filter__chip--on' : ''}" data-assignee-filter="${id}">${escapeHtml(name)}</button>`
        ).join('')}
        ${filterSet.size ? `<button type="button" class="dash-filter__clear" data-assignee-filter-clear>クリア</button>` : ''}
      </div>`
    : '';

  const toolbar = `
    <div class="dash-toolbar">
      <button type="button" class="dash-tool" id="dash-spot-btn">${ICON.target}<span>スポット評価</span></button>
      <button type="button" class="dash-tool" id="dash-spot-history-btn">${ICON.clock}<span>スポット履歴</span></button>
      <span class="dash-toolbar__divider" aria-hidden="true"></span>
      <span class="dash-toolbar__export-label">${ICON.download}<span>書き出し</span></span>
      <a class="dash-tool dash-tool--ghost" href="/api/export/latest.csv" download>CSV</a>
      <a class="dash-tool dash-tool--ghost" href="/api/export/latest.md" download>Markdown</a>
    </div>
    ${filterChips}`;

  let body;
  if (rows.length === 0) {
    body = `<div class="empty-state">${allRows.length ? '該当する担当者のページがありません。' : '対象ページがありません。'}</div>`;
  } else {
    // サイトごとにグループ化して縦積み
    const byDomain = new Map();
    for (const r of rows) {
      if (!byDomain.has(r.domainId)) byDomain.set(r.domainId, { id: r.domainId, name: r.domainName, items: [] });
      byDomain.get(r.domainId).items.push(r);
    }
    const groups = [...byDomain.values()].map((g) => {
      const collapsed = state.dashCollapsed.has(g.id);
      const items = g.items.map((r) => {
        const scoreClass = r.status === 'ok' ? scoreRating(r.avg) : 'fail';
        const scoreLabel = r.status === 'err' ? 'ERR' : r.status === 'gate' ? 'GATE' : r.status === 'none' ? '—' : (r.avg ?? '—');
        const belowCls = (r.status === 'ok' && r.avg != null && r.avg < r.threshold) ? 'dash-row__score--below' : '';
        const hasAssignees = (r.assignees || []).length > 0;
        const chips = hasAssignees
          ? r.assignees.map((a) => `<span class="dash-chip">${escapeHtml(a.name || a.id)}</span>`).join('')
          : '';
        let assigneeCell;
        if (state.isAdmin) {
          // 管理者: 常に編集可能。未設定なら「+ 担当者」の明示 CTA、設定済みなら chips + 編集アイコン
          const inner = hasAssignees
            ? `${chips}<span class="dash-row__assignees-edit-icon" aria-hidden="true">${ICON.plus}</span>`
            : `<span class="dash-chip dash-chip--add">${ICON.plus}担当者</span>`;
          assigneeCell = `<button type="button" class="dash-row__assignees dash-row__assignees--edit" data-edit-assignee="${escapeHtml(r.domainId)}/${escapeHtml(r.pageId)}" title="担当者を編集">${inner}</button>`;
        } else {
          assigneeCell = `<span class="dash-row__assignees">${hasAssignees ? chips : '<span class="dash-chip dash-chip--empty">—</span>'}</span>`;
        }
        return `
          <li class="dash-row" data-domain-id="${escapeHtml(r.domainId)}" data-page-id="${escapeHtml(r.pageId)}">
            <span class="dash-row__name" title="${escapeHtml(r.url)}">${escapeHtml(r.pageName)}</span>
            <span class="dash-row__score dash-row__score--${scoreClass} ${belowCls}">${scoreLabel}</span>
            <span class="dash-row__devices">${r.pc != null ? `PC ${r.pc}` : ''}${r.sp != null ? ` / SP ${r.sp}` : ''}</span>
            ${assigneeCell}
          </li>`;
      }).join('');
      return `
        <section class="dash-group ${collapsed ? 'dash-group--collapsed' : ''}">
          <button type="button" class="dash-group__title" data-toggle-dash-group="${escapeHtml(g.id)}" aria-expanded="${collapsed ? 'false' : 'true'}">
            <span class="dash-group__caret">${ICON.chevron}</span>
            <span class="dash-group__name">${escapeHtml(g.name)}</span>
            <span class="dash-group__count">${g.items.length}</span>
          </button>
          ${collapsed ? '' : `<ul class="dash-list">${items}</ul>`}
        </section>`;
    }).join('');
    body = `<div class="dash-groups">${groups}</div>`;
  }

  main.innerHTML = `
    <header class="main-header"><div class="main-header__info">
      <h2 class="main-header__name">ダッシュボード</h2>
      <div class="main-header__breadcrumb">全サイトの現況一覧 (総合スコアは PC/SP 平均)</div>
    </div></header>
    ${toolbar}
    ${body}`;

  document.getElementById('dash-spot-btn')?.addEventListener('click', openSpotCrawlModal);
  document.getElementById('dash-spot-history-btn')?.addEventListener('click', openSpotHistoryModal);
  // サイトグループの開閉 (アコーディオン)
  for (const btn of main.querySelectorAll('[data-toggle-dash-group]')) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleDashGroup;
      if (state.dashCollapsed.has(id)) state.dashCollapsed.delete(id);
      else state.dashCollapsed.add(id);
      renderMain();
    });
  }
  // 担当者フィルタ
  for (const chip of main.querySelectorAll('[data-assignee-filter]')) {
    chip.addEventListener('click', () => {
      const id = Number(chip.dataset.assigneeFilter);
      if (state.dashAssigneeFilter.has(id)) state.dashAssigneeFilter.delete(id);
      else state.dashAssigneeFilter.add(id);
      renderMain();
    });
  }
  main.querySelector('[data-assignee-filter-clear]')?.addEventListener('click', () => {
    state.dashAssigneeFilter.clear();
    renderMain();
  });
  // 担当者編集 (管理者)
  for (const btn of main.querySelectorAll('[data-edit-assignee]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const [did, pid] = btn.dataset.editAssignee.split('/');
      openAssigneeEditor(did, pid);
    });
  }
  for (const li of main.querySelectorAll('.dash-row')) {
    li.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit-assignee]')) return;
      state.view = 'page';
      state.currentDomainId = li.dataset.domainId;
      state.currentPageId = li.dataset.pageId;
      renderSidebar();
      renderMain();
    });
  }
}

async function renderMain() {
  const main = document.getElementById('main');
  if (state.view === 'dashboard') {
    await renderDashboard(main);
    return;
  }
  const did = state.currentDomainId;
  const pid = state.currentPageId;
  if (!did || !pid) {
    main.innerHTML = `<div class="empty-state">サイドバーからページを選択してください。</div>`;
    return;
  }
  const domainEntry = state.byDomain.get(did);
  if (!domainEntry) {
    main.innerHTML = `<div class="empty-state">ドメインが見つかりません。</div>`;
    return;
  }
  const pageEntry = domainEntry.pagesByPageId.get(pid);
  const domain = domainEntry.domain;
  if (!pageEntry) {
    main.innerHTML = `<div class="empty-state">ページが見つかりません。</div>`;
    return;
  }
  if (pageEntry.runs.length === 0) {
    const crawling = isJobRunning(did, pid);
    if (crawling) {
      main.innerHTML = renderCrawlingSkeleton(domain.name, pageEntry.page.name, pageEntry.page.url);
      return;
    }
    main.innerHTML = `<div class="empty-state">
      <p style="font-size:16px;font-weight:500;color:var(--color-text);margin-bottom:16px">${escapeHtml(domain.name)} / ${escapeHtml(pageEntry.page.name)}</p>
      <p style="margin-bottom:20px">クロールを実行してください。</p>
      ${state.isAdmin
        ? `<button class="btn btn--primary" id="empty-crawl-btn">${ICON.trendUp}<span style="margin-left:6px">クロールを実行</span></button>`
        : `<p style="font-size:13px;color:var(--color-text-muted)">クロールの実行には管理者モードが必要です。</p>`}
    </div>`;
    document.getElementById('empty-crawl-btn')?.addEventListener('click', () => triggerCrawl(did, pid, pageEntry.page.name));
    return;
  }

  // 設定されているデバイスを取得 (デフォルト ['pc'])
  const availableDevices = (pageEntry.page.devices && pageEntry.page.devices.length > 0)
    ? pageEntry.page.devices
    : ['pc'];
  if (!availableDevices.includes(state.currentDevice)) {
    state.currentDevice = availableDevices[0];
  }
  const device = state.currentDevice;

  // 最新の該当デバイス run を優先
  const latest = pageEntry.runs.find((r) => (r.device || 'pc') === device) || pageEntry.runs[0];
  // レポート未取得のときだけローディング表示 (キャッシュ済みなら差し替えのみで瞬時=チラつき回避)
  if (!state.fullReports.has(latest.timestamp)) {
    main.innerHTML = `<div class="loading">Loading report…</div>`;
  }
  let full;
  try { full = await loadRunDetail(latest.timestamp); }
  catch (err) {
    main.innerHTML = `<div class="empty-state">レポート取得エラー: ${escapeHtml(err.message)}</div>`;
    return;
  }
  const result = (full.results || []).find((r) =>
    r.site?.domainId === did && r.site?.pageId === pid && (r.site?.device || r.pageData?.device || 'pc') === device
  ) || (full.results || []).find((r) => r.site?.domainId === did && r.site?.pageId === pid);
  if (!result) {
    main.innerHTML = `<div class="empty-state">レポート内に該当ページが見つかりません。</div>`;
    return;
  }
  state.currentViolations = result.violations || [];
  state.currentSiteName = result.site?.name || `${domain.name} / ${pageEntry.page.name}`;
  state.currentSiteUrl = result.pageData?.url || result.site?.url || pageEntry.page.url;
  state.currentResult = result;
  state.currentRunTimestamp = latest.timestamp;

  state.currentScreenshot = result.pageData?.screenshot
    ? { url: result.pageData.screenshot, dimensions: result.pageData.dimensions || null }
    : null;

  const html = renderSiteContent(result, latest, pageEntry, domain);
  // クロール中ならバナー挿入
  const crawlingBanner = isJobRunning(did, pid)
    ? `<div class="crawling-banner">
         <span class="crawling-banner__spinner"></span>
         <span>クロール実行中… 完了後に自動で更新されます</span>
       </div>`
    : '';
  main.innerHTML = crawlingBanner + html;
  applyFilters();
  bindDynamicEvents();
  animateGauges(main);
}

function renderCrawlingSkeleton(domainName, pageName, url) {
  // スケルトンではなく app-loader と同じパルス波を流すインライン版を表示。
  // 初回クロールは 5〜10 分かかるため、視覚的に「動いている」ことを伝える。
  return `
    <header class="main-header">
      <div class="main-header__info">
        <div class="main-header__breadcrumb">${escapeHtml(domainName)} <span style="margin:0 6px">›</span> ${escapeHtml(pageName)}</div>
        <h2 class="main-header__name">${escapeHtml(pageName)}</h2>
        <a class="main-header__url" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      </div>
    </header>
    <div class="crawl-loader" role="status" aria-live="polite">
      <svg class="app-loader__pulse crawl-loader__pulse" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="app-loader__ring" cx="12" cy="12" r="10.2" fill="none"/>
        <path class="app-loader__line" pathLength="32"
              d="M2.5 12 H6.5 L8.5 15 L11.5 8 L13.5 13 H21.5"
              fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="crawl-loader__label">クロール実行中</div>
      <div class="crawl-loader__sublabel">Playwright + AI + Lighthouse を順次実行しています。<br>初回は 5〜10 分ほどかかります。完了すると自動的に結果が表示されます。</div>
      <div class="crawl-loader__progress">
        <div class="crawl-loader__progress-head">
          <span class="crawl-loader__stage">クロール開始</span>
          <span class="crawl-loader__pct">0%</span>
        </div>
        <div class="crawl-loader__progress-bar">
          <div class="crawl-loader__progress-fill" style="width:0%"></div>
        </div>
      </div>
      <div class="crawl-loader__steps">
        <div class="crawl-loader__step crawl-loader__step--active">
          <span class="crawl-loader__dot"></span>
          <span>ページ取得 / CWV 計測</span>
        </div>
        <div class="crawl-loader__step">
          <span class="crawl-loader__dot"></span>
          <span>決定的ルール 49 件 / AI ルール 23 件</span>
        </div>
        <div class="crawl-loader__step">
          <span class="crawl-loader__dot"></span>
          <span>Lighthouse 実行 + スコア集計</span>
        </div>
      </div>
    </div>`;
}

// Failed Audits 内の該当検知項目までスクロールして展開・ハイライトする。
// タブ絞り込みで描画されていない場合は「すべて」に戻してから再試行する
function jumpToAudit(ruleId) {
  const locate = () => document.querySelector(`.audit[data-audit-id="${CSS.escape(ruleId)}"]`);
  const jump = (audit) => {
    const details = audit.querySelector('.audit__details');
    if (details) details.open = true;
    audit.scrollIntoView({ behavior: 'smooth', block: 'center' });
    audit.classList.add('audit--flash');
    setTimeout(() => audit.classList.remove('audit--flash'), 2400);
  };
  const el = locate();
  if (el && el.dataset.hidden !== '1') {
    jump(el);
    return;
  }
  state.findingsMainTab = 'all';
  state.findingsSubTab = 'all';
  refreshFindings(() => setTimeout(() => {
    const retry = locate();
    if (retry) jump(retry);
  }, 60));
}

function bindDynamicEvents() {
  // 推移グラフ: 非同期描画 + 期間/シリーズ切替
  if (document.querySelector('[data-trend]')) {
    drawTrendChart();
    for (const btn of document.querySelectorAll('[data-trend-days]')) {
      btn.addEventListener('click', () => {
        state.trend.days = Number(btn.dataset.trendDays);
        for (const b of document.querySelectorAll('[data-trend-days]')) b.classList.toggle('trend-period--active', b === btn);
        drawTrendChart();
      });
    }
    for (const btn of document.querySelectorAll('[data-trend-series]')) {
      btn.addEventListener('click', () => {
        const k = btn.dataset.trendSeries;
        if (state.trend.hidden.has(k)) state.trend.hidden.delete(k);
        else state.trend.hidden.add(k);
        btn.classList.toggle('trend-legend--off', state.trend.hidden.has(k));
        drawTrendChart();
      });
    }
  }
  // Failed Audits (findings-region) 内のイベントは差分描画でも使い回すため別関数に集約
  bindFindingsEvents(document);
  // デバイス切替はデータ (スコア/カード) が変わるためページ全体を再描画する
  for (const tab of document.querySelectorAll('[data-device-tab]')) {
    tab.addEventListener('click', () => {
      const next = tab.dataset.deviceTab;
      if (state.currentDevice === next) return;
      state.currentDevice = next;
      renderMain();
    });
  }
  // メインカード popover: mouseenter / click でビューポート内に収まる fixed 位置へ配置。
  // popover は body 直下に移動済 (containing block 回避)。hover 状態は JS で管理。
  detachAllMainPopovers();
  for (const card of document.querySelectorAll('[data-main-card]')) {
    const popover = getMainPopoverFor(card);
    if (!popover) continue;

    let hideTimer = null;
    const show = () => {
      clearTimeout(hideTimer);
      positionMainPopover(card);
      popover.classList.add('main-popover--visible');
    };
    const hideSoon = () => {
      if (card.classList.contains('main-card--pinned')) return;
      hideTimer = setTimeout(() => popover.classList.remove('main-popover--visible'), 80);
    };

    card.addEventListener('mouseenter', show);
    card.addEventListener('mouseleave', hideSoon);
    popover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popover.addEventListener('mouseleave', hideSoon);

    card.addEventListener('click', (e) => {
      // popover 内のジャンプ要素クリックは各ハンドラに委譲
      if (e.target.closest('[data-sub-jump]')) return;
      if (e.target.closest('[data-lh-jump]')) return;
      e.preventDefault();
      const main = card.dataset.mainCard;
      if (!main) return;
      // main タブを切替えて Failed Audits へスクロール (findings のみ差分描画)
      state.findingsMainTab = main;
      state.findingsSubTab = 'all';
      closeAllMainPopovers();
      refreshFindings(() => {
        // re-render 後、findings セクションを画面上部に寄せる
        setTimeout(() => {
          const el = document.querySelector('.findings');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      });
    });
  }
  // スクロール/リサイズ時は pin & 表示を外す
  let scrollCloseRaf = null;
  const closePinsOnScroll = () => {
    if (scrollCloseRaf) return;
    scrollCloseRaf = requestAnimationFrame(() => {
      scrollCloseRaf = null;
      closeAllMainPopovers();
    });
  };
  window.addEventListener('scroll', closePinsOnScroll, { passive: true });
  window.addEventListener('resize', closePinsOnScroll, { passive: true });

  // Lighthouse popover 内のカテゴリクリックで詳細モーダル
  for (const item of document.querySelectorAll('[data-lh-jump]')) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllMainPopovers();
      openLighthouseDetailModal(item.dataset.lhJump);
    });
  }

  // popover 内のサブカテゴリをクリックで該当セクションに移動
  for (const item of document.querySelectorAll('[data-sub-jump]')) {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cat = item.dataset.subJump;
      // popover を閉じる
      closeAllMainPopovers();
      const scrollToCat = () => document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (state.findingsTab !== 'category') {
        state.findingsTab = 'category';
        refreshFindings(() => setTimeout(scrollToCat, 50));
      } else {
        scrollToCat();
      }
    });
  }


  // Main header 内のページ編集ボタン (管理者)
  const editPageBtn = document.getElementById('edit-page-btn');
  if (editPageBtn) {
    editPageBtn.addEventListener('click', () => {
      openEditPageModal(editPageBtn.dataset.domainId, editPageBtn.dataset.pageId);
    });
  }
  // Main header 内の再クロールボタン
  const recrawlBtn = document.getElementById('recrawl-btn');
  if (recrawlBtn) {
    recrawlBtn.addEventListener('click', () => {
      triggerCrawl(recrawlBtn.dataset.domainId, recrawlBtn.dataset.pageId, recrawlBtn.dataset.pageName);
    });
  }
  // 休止中バナーの再開ボタン
  const pausedResumeBtn = document.getElementById('paused-banner-resume-btn');
  if (pausedResumeBtn) {
    pausedResumeBtn.addEventListener('click', () => {
      resumeTarget({ kind: pausedResumeBtn.dataset.resumeKind, id: pausedResumeBtn.dataset.resumeId });
    });
  }

  const priorityBtn = document.getElementById('priority-run-btn');
  if (priorityBtn) {
    priorityBtn.addEventListener('click', () => requestPriorityRecommend(priorityBtn));
  }
}

// Failed Audits (findings-region) 内のイベントバインド。root を渡すことで
// 初回はページ全体 (document)、タブ切替時は #findings-region だけを対象にできる。
function bindFindingsEvents(root) {
  // 手動ステータス変更 (除外/NG/OK/検知に戻す) — 管理者
  for (const btn of root.querySelectorAll('[data-set-status]')) {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ruleId = btn.dataset.ruleId;
      const status = btn.dataset.setStatus;
      btn.disabled = true;
      try {
        await postJson('/api/overrides', {
          domainId: state.currentDomainId,
          pageId: state.currentPageId,
          device: state.currentDevice,
          ruleId,
          status,
        });
        state.fullReports?.clear?.();   // 詳細キャッシュを破棄して再取得
        await reloadConfigAndReruns();   // スコア/サイドバー/詳細を再描画
      } catch (err) {
        showToast({ id: `ov-${Date.now()}`, status: 'error', message: `ステータス更新失敗: ${err.message}` });
        btn.disabled = false;
      }
    });
  }
  // 重大度フィルタ chip (show/hide のみ、再描画しない)
  for (const chip of root.querySelectorAll('[data-sev-toggle]')) {
    chip.addEventListener('click', () => {
      const k = chip.dataset.sevToggle;
      state.severityFilter[k] = !state.severityFilter[k];
      chip.classList.toggle('sev-chip--off', !state.severityFilter[k]);
      applyFilters();
    });
  }
  // 重要度順/カテゴリ順・メイン/サブタブは findings-region のみ差分描画 (再取得なし)
  for (const tab of root.querySelectorAll('[data-findings-tab]')) {
    tab.addEventListener('click', () => {
      state.findingsTab = tab.dataset.findingsTab;
      refreshFindings();
    });
  }
  for (const tab of root.querySelectorAll('[data-findings-main]')) {
    tab.addEventListener('click', () => {
      state.findingsMainTab = tab.dataset.findingsMain;
      state.findingsSubTab = 'all';  // main 切替時は sub をリセット
      refreshFindings();
    });
  }
  for (const tab of root.querySelectorAll('[data-findings-sub]')) {
    tab.addEventListener('click', () => {
      state.findingsSubTab = tab.dataset.findingsSub;
      refreshFindings();
    });
  }

  for (const btn of root.querySelectorAll('.ai-suggest-btn')) {
    btn.addEventListener('click', () => requestAiSuggestion(btn));
  }

  for (const btn of root.querySelectorAll('[data-cross-view]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCrossViewModal(btn.dataset.crossView);
    });
  }

  for (const btn of root.querySelectorAll('.offender__locate-btn')) {
    btn.addEventListener('click', () => {
      const rect = {
        x: Number(btn.dataset.locateX),
        y: Number(btn.dataset.locateY),
        w: Number(btn.dataset.locateW),
        h: Number(btn.dataset.locateH),
      };
      openScreenshotModal(rect);
    });
  }
  for (const audit of root.querySelectorAll('.audit[data-audit-id]')) {
    const id = audit.dataset.auditId;
    if (state.aiCache.has(id)) {
      const payload = state.aiCache.get(id);
      const slot = audit.querySelector(`[data-audit-slot="${CSS.escape(id)}"]`);
      const btn = audit.querySelector('.ai-suggest-btn');
      if (slot) renderAiSuggestion(slot, payload);
      if (btn) btn.remove();
    }
  }
  if (!state.aiEnabled) {
    for (const btn of root.querySelectorAll('.ai-suggest-btn')) btn.remove();
  }
}

async function requestAiSuggestion(btn) {
  const audit = btn.closest('.audit');
  const id = audit?.dataset.auditId;
  if (!audit || !id) return;
  const v = (state.currentViolations || []).find((x) => x.id === id && !x.passed);
  if (!v) return;
  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = `${ICON.bulb}<span>生成中…</span>`;
  const slot = audit.querySelector(`[data-audit-slot="${CSS.escape(id)}"]`);
  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rule: { id: v.id, name: v.name, category: v.category, severity: v.severity, message: v.message, fix: v.fix },
        offenders: v.offenders || [],
        siteName: state.currentSiteName || '',
        url: state.currentSiteUrl || '',
      }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    state.aiCache.set(id, payload);
    renderAiSuggestion(slot, payload);
    btn.remove();
    loadUsage();
  } catch (err) {
    if (slot) slot.innerHTML = `<div class="ai-suggest__card"><div class="ai-suggest__error">AI 提案の取得に失敗しました: ${escapeHtml(err.message)}</div></div>`;
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// --- クロール休止/再開 (管理者) --------------------------------------
// domain/page 共通の enabled フラグを PATCH で切り替える。
// enabled=false のときだけ pausedReason を保持し、再開時はサーバ側で null クリアされる。

function pauseTargetUrl({ kind, id }) {
  if (kind === 'domain') return `/api/domains/${encodeURIComponent(id)}`;
  const [did, pid] = id.split('/');
  return `/api/domains/${encodeURIComponent(did)}/pages/${encodeURIComponent(pid)}`;
}

function pauseTargetInfo({ kind, id }) {
  if (kind === 'domain') {
    const domain = state.config.domains.find((d) => d.id === id);
    return { label: domain?.name || id, enabled: domain?.enabled !== false, pausedReason: domain?.pausedReason || '' };
  }
  const [did, pid] = id.split('/');
  const domain = state.config.domains.find((d) => d.id === did);
  const page = domain?.pages.find((p) => p.id === pid);
  return {
    label: domain && page ? `${domain.name} / ${page.name}` : id,
    enabled: page?.enabled !== false,
    pausedReason: page?.pausedReason || '',
  };
}

async function resumeTarget(item) {
  try {
    await patchJson(pauseTargetUrl(item), { enabled: true });
    showToast({ id: `resume-${Date.now()}`, status: 'success', message: 'クロールを再開しました' });
    await reloadConfigAndReruns();
  } catch (err) {
    alert(`再開に失敗しました: ${err.message}`);
  }
}

function openPauseModal(item) {
  const info = pauseTargetInfo(item);
  const alreadyPaused = !info.enabled;
  const title = `クロールを休止 — ${escapeHtml(info.label)}`;
  const submitLabel = alreadyPaused ? '休止理由を保存' : '休止する';

  openModal(title, `
    <form id="pause-form">
      <div class="form-field">
        <label for="pause-reason">休止理由 (任意)</label>
        <textarea id="pause-reason" rows="3" placeholder="例: リニューアル中、契約終了予定 など">${escapeHtml(info.pausedReason)}</textarea>
      </div>
      <div class="form-error" id="pause-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="pause-submit">${submitLabel}</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('pause-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = document.getElementById('pause-reason').value.trim();
    const errorEl = document.getElementById('pause-error');
    const btn = document.getElementById('pause-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      await patchJson(pauseTargetUrl(item), { enabled: false, pausedReason: reason || null });
      closeModal();
      await reloadConfigAndReruns();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

// ページ名 / URL 編集 (管理者)。PATCH /api/domains/:d/pages/:p。
function openEditPageModal(domainId, pageId) {
  const domain = state.config.domains.find((d) => d.id === domainId);
  const page = domain?.pages.find((p) => p.id === pageId);
  if (!page) return;
  openModal('ページを編集', `
    <form id="edit-page-form">
      <div class="form-field">
        <label for="ep-name">ページ名</label>
        <input id="ep-name" name="name" required value="${escapeHtml(page.name)}">
      </div>
      <div class="form-field">
        <label for="ep-url">URL</label>
        <input id="ep-url" name="url" required value="${escapeHtml(page.url)}">
        <div class="form-field__hint">URL を変更しても過去のスコア履歴は保持されます (次回クロールから新 URL を評価)。</div>
      </div>
      <div class="form-error" id="ep-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="submit" class="btn btn--primary" id="ep-submit">保存</button>
      </div>
    </form>`);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-page-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('ep-name').value.trim();
    const url = document.getElementById('ep-url').value.trim();
    const errorEl = document.getElementById('ep-error');
    const btn = document.getElementById('ep-submit');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      await patchJson(`/api/domains/${encodeURIComponent(domainId)}/pages/${encodeURIComponent(pageId)}`, { name, url });
      closeModal();
      await reloadConfigAndReruns();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

// 担当者候補は、config 内のいずれかのページに既に設定済みの担当者から重複排除して集める。
function collectAssigneeCandidates() {
  const byId = new Map();
  for (const d of state.config?.domains || []) {
    for (const p of d.pages || []) {
      for (const a of p.assignees || []) {
        const id = Number(a.id);
        if (!byId.has(id)) byId.set(id, { id, name: a.name || String(a.id) });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

// 担当者エディタ (複数選択)。
function openAssigneeEditor(domainId, pageId) {
  const domain = state.config.domains.find((d) => d.id === domainId);
  const page = domain?.pages.find((p) => p.id === pageId);
  if (!page) return;
  const users = collectAssigneeCandidates();

  let selected = (page.assignees || []).map((a) => ({ id: Number(a.id), name: a.name || String(a.id) }));

  openModal(`担当者の設定 (${domain.name} / ${page.name})`, `
    <div class="assignee-editor">
      <div class="form-field">
        <label>担当者 <span class="form-field__hint">複数選択できます</span></label>
        <div class="assignee-chips" id="ae-chips"></div>
        <input id="ae-input" class="combobox__input" placeholder="名前で検索して追加…" autocomplete="off">
        <div class="combobox__list" id="ae-list" hidden></div>
      </div>
      <div class="form-error" id="ae-error" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="modal-cancel">キャンセル</button>
        <button type="button" class="btn btn--primary" id="ae-save">保存</button>
      </div>
    </div>`);

  const chipsEl = document.getElementById('ae-chips');
  const input = document.getElementById('ae-input');
  const listEl = document.getElementById('ae-list');

  const renderChips = () => {
    chipsEl.innerHTML = selected.length
      ? selected.map((a) => `<span class="assignee-chip">${escapeHtml(a.name)}<button type="button" class="assignee-chip__remove" data-remove="${a.id}" aria-label="外す">×</button></span>`).join('')
      : `<span class="assignee-chip assignee-chip--empty">未設定</span>`;
  };
  const renderList = () => {
    const q = input.value.trim().toLowerCase();
    const selIds = new Set(selected.map((a) => a.id));
    const cands = users.filter((u) => !selIds.has(u.id) && (!q || u.name.toLowerCase().includes(q))).slice(0, 50);
    listEl.innerHTML = cands.length
      ? cands.map((u) => `<button type="button" class="combobox__item" data-id="${u.id}">${escapeHtml(u.name)}</button>`).join('')
      : '<div class="combobox__empty">該当なし</div>';
    listEl.hidden = false;
  };
  renderChips();

  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    selected = selected.filter((a) => a.id !== Number(btn.dataset.remove));
    renderChips();
  });
  input.addEventListener('focus', renderList);
  input.addEventListener('input', renderList);
  listEl.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.combobox__item');
    if (!btn) return;
    e.preventDefault();
    const u = users.find((x) => String(x.id) === btn.dataset.id);
    if (u) { selected.push({ id: u.id, name: u.name }); input.value = ''; renderChips(); renderList(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { listEl.hidden = true; }, 150));

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('ae-save').addEventListener('click', async () => {
    const errorEl = document.getElementById('ae-error');
    const btn = document.getElementById('ae-save');
    errorEl.hidden = true;
    btn.disabled = true;
    try {
      await patchJson(`/api/domains/${encodeURIComponent(domainId)}/pages/${encodeURIComponent(pageId)}`,
        { assignees: selected.map((a) => ({ id: a.id, name: a.name })) });
      closeModal();
      await reloadConfigAndReruns();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });
}

async function openCrossViewModal(ruleId) {
  openModal(`横断ビュー: ${ruleId}`, `
    <div class="cross-view">
      <div class="cross-view__loading">
        <span class="spinner"></span>
        <span>最新 run のページを確認中…</span>
      </div>
    </div>
  `, { wide: true });
  try {
    const data = await fetchJson(`/api/cross-view?ruleId=${encodeURIComponent(ruleId)}`);
    const body = document.getElementById('modal-body');
    if (!body) return;
    if (!data.rows || data.rows.length === 0) {
      body.innerHTML = `<div class="cross-view"><div class="empty-state">該当データがありません。</div></div>`;
      return;
    }
    const failed = data.rows.filter((r) => !r.passed);
    const passed = data.rows.filter((r) => r.passed);
    const rowHtml = (r) => `
      <tr class="cross-row ${r.passed ? 'cross-row--passed' : 'cross-row--failed'}">
        <td class="cross-row__status">${r.passed ? ICON.check : ICON.x}</td>
        <td>
          <div class="cross-row__title">${escapeHtml(r.domainName)} / ${escapeHtml(r.pageName)}</div>
          <a class="cross-row__url" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.url)}</a>
        </td>
        <td class="cross-row__offenders">${r.passed ? '—' : (r.offendersTotal ?? 0)}</td>
        <td class="cross-row__score">${r.total ?? '—'}</td>
      </tr>`;
    body.innerHTML = `
      <div class="cross-view">
        <div class="cross-view__summary">
          <span class="cross-view__count cross-view__count--failed">${failed.length} 件失敗</span>
          <span class="cross-view__count cross-view__count--passed">${passed.length} 件 pass</span>
          <span class="cross-view__ts">snapshot: ${escapeHtml(data.timestamp || '')}</span>
        </div>
        <table class="cross-view__table">
          <thead><tr><th></th><th>ページ</th><th class="cross-view__offenders-th">該当数</th><th class="cross-view__score-th">総合</th></tr></thead>
          <tbody>
            ${failed.map(rowHtml).join('')}
            ${passed.map(rowHtml).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    const body = document.getElementById('modal-body');
    if (body) body.innerHTML = `<div class="cross-view"><div class="cross-view__error">取得失敗: ${escapeHtml(err.message)}</div></div>`;
  }
}

function openScreenshotModal(rect) {
  if (!state.currentScreenshot) return;
  const { url, dimensions } = state.currentScreenshot;
  const imgW = dimensions?.width || 1280;
  const imgH = dimensions?.height || 800;
  const dpr = dimensions?.dpr || 1;

  // scroll-to-rect: モーダル内で該当箇所が見えるよう中心に寄せる
  const html = `
    <div class="screenshot-modal">
      <div class="screenshot-modal__scroll" id="screenshot-scroll">
        <div class="screenshot-modal__canvas" style="width:${imgW}px;height:${imgH}px">
          <img src="${escapeHtml(url)}" alt="page screenshot"
               style="width:${imgW}px;height:${imgH}px;display:block" />
          <div class="screenshot-modal__rect"
               style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px"></div>
        </div>
      </div>
      <div class="screenshot-modal__hint">
        ${ICON.info}<span>ページサイズ ${imgW}×${imgH} / DPR ${dpr} — 赤枠が該当箇所</span>
      </div>
    </div>`;
  openModal('該当箇所プレビュー', html, { wide: true });

  // 該当箇所を中央にスクロール
  requestAnimationFrame(() => {
    const scroll = document.getElementById('screenshot-scroll');
    if (!scroll) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    scroll.scrollTo({
      left: Math.max(0, cx - scroll.clientWidth / 2),
      top: Math.max(0, cy - scroll.clientHeight / 2),
      behavior: 'instant',
    });
  });
}

async function requestPriorityRecommend(btn) {
  const panel = btn.closest('[data-priority-panel]');
  const slot = panel?.querySelector('[data-priority-slot]');
  if (!panel || !slot) return;
  const r = state.currentResult;
  const violations = state.currentViolations || [];
  if (!r || violations.length === 0) return;

  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = `${ICON.bulb}<span style="margin-left:6px">生成中…</span>`;
  slot.innerHTML = `<div class="priority-loading"><span class="spinner"></span><span>AI が優先順位を算定しています…</span></div>`;

  try {
    const body = {
      siteName: state.currentSiteName || '',
      url: state.currentSiteUrl || '',
      score: r.score?.total ?? null,
      threshold: r.site?.thresholds?.total ?? 80,
      weights: r.site?.weights ?? null,
      violations: violations.map((v) => ({
        id: v.id,
        name: v.name,
        category: v.category,
        severity: v.severity,
        weight: v.weight,
        passed: v.passed,
        offendersTotal: v.offendersTotal ?? (v.offenders ? v.offenders.length : 0),
        message: v.message,
      })),
    };
    const res = await fetch('/api/prioritize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    state.priorityCache.set(priorityKeyFor(r), payload);
    slot.innerHTML = renderPriorityContent(payload);
    btn.hidden = true;
    loadUsage();
  } catch (err) {
    slot.innerHTML = `<div class="priority-error">${ICON.triangle}<span>優先度の取得に失敗しました: ${escapeHtml(err.message)}</span></div>`;
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function renderMarkdown(src) {
  let s = String(src ?? '');
  s = s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  s = s.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, __, code) => `<pre><code>${code.trim()}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^##\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^#\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|\n)((?:- [^\n]+\n?)+)/g, (_, pre, block) => {
    const items = block.trim().split(/\n/).map((l) => l.replace(/^- /, ''));
    return `${pre}<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  });
  s = s.split(/\n{2,}/).map((p) => {
    if (/^<(h\d|pre|ul|ol|blockquote)/.test(p.trim())) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return s;
}

function renderAiSuggestion(slot, payload) {
  if (!slot) return;
  const cached = payload.cached ? '<span class="ai-suggest__badge">Cached</span>' : '<span class="ai-suggest__badge">AI</span>';
  slot.innerHTML = `
    <div class="ai-suggest__card">
      <div class="ai-suggest__header">
        <span>AI による修正提案</span>
        <span>${cached}${payload.model ? ` <code style="margin-left:6px">${escapeHtml(payload.model)}</code>` : ''}</span>
      </div>
      <div class="ai-suggest__body">${renderMarkdown(payload.suggestion)}</div>
    </div>`;
}

// --- Usage widget -------------------------------------------------------

function formatTokens(n) {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function formatCost(c) {
  if (c == null || c === 0) return '$0';
  return `$${c.toFixed(4)}`;
}

async function loadUsage() {
  try {
    const u = await fetchJson('/api/usage');
    const today = u.today || {};
    const month = u.thisMonth || {};
    const totals = u.totals || {};

    // 本日分をメイン表示
    document.getElementById('usage-calls').textContent = today.calls ?? 0;
    const tkToday = (today.inputTokens ?? 0) + (today.outputTokens ?? 0);
    document.getElementById('usage-tokens').textContent = formatTokens(tkToday);
    document.getElementById('usage-cost').textContent = formatCost(today.costUsd);
    document.getElementById('usage-updated').textContent = u.updatedAt
      ? `更新: ${formatDateShort(u.updatedAt)}`
      : 'データなし';

    // ツールチップ: 月次 / 累計
    const tkMonth = (month.inputTokens ?? 0) + (month.outputTokens ?? 0);
    const tkAll   = (totals.inputTokens ?? 0) + (totals.outputTokens ?? 0);
    const tooltip = document.getElementById('usage-tooltip');
    if (tooltip) {
      tooltip.innerHTML = `
        <div class="usage-tooltip__title">AI 利用実績</div>
        <table class="usage-tooltip__table">
          <thead><tr><th></th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
          <tbody>
            <tr><th>本日</th><td>${today.calls ?? 0}</td><td>${formatTokens(tkToday)}</td><td>${formatCost(today.costUsd)}</td></tr>
            <tr><th>今月</th><td>${month.calls ?? 0}</td><td>${formatTokens(tkMonth)}</td><td>${formatCost(month.costUsd)}</td></tr>
            <tr><th>累計</th><td>${totals.calls ?? 0}</td><td>${formatTokens(tkAll)}</td><td>${formatCost(totals.costUsd)}</td></tr>
          </tbody>
        </table>
        <div class="usage-tooltip__note">キャッシュヒットは fresh 扱いせず、トークン/コストに加算していません</div>
      `;
    }
  } catch (err) {
    document.getElementById('usage-calls').textContent = '–';
  }
}

// --- Reload ------------------------------------------------------------

async function reloadConfigAndReruns() {
  const [config, runsResp] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/runs'),
  ]);
  state.config = config;
  state.runs = runsResp.runs;
  state.byDomain = aggregate(state.runs, state.config);
  // 初期選択
  if (!state.currentDomainId || !state.config.domains.find((d) => d.id === state.currentDomainId)) {
    const firstDomain = state.config.domains[0];
    if (firstDomain) {
      state.currentDomainId = firstDomain.id;
      state.currentPageId = firstDomain.pages?.[0]?.id ?? null;
      state.expandedDomains.add(firstDomain.id);
    } else {
      state.currentDomainId = null;
      state.currentPageId = null;
    }
  } else if (!state.config.domains.find((d) => d.id === state.currentDomainId)?.pages.find((p) => p.id === state.currentPageId)) {
    // ページが消えた場合は最初のページへフォールバック
    const domain = state.config.domains.find((d) => d.id === state.currentDomainId);
    state.currentPageId = domain?.pages?.[0]?.id ?? null;
  }
  renderSidebar();
  await renderMain();
}

// --- Init ---------------------------------------------------------------

// --- Sidebar accordion --------------------------------------------------

const SIDEBAR_COLLAPSE_KEY = 'wqc.sidebar.collapsed.v1';

function readCollapsedSidebarSections() {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}

function writeCollapsedSidebarSections(set) {
  try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify([...set])); } catch {}
}

function restoreSidebarCollapseState() {
  const collapsed = readCollapsedSidebarSections();
  for (const section of document.querySelectorAll('[data-sidebar-section]')) {
    const key = section.dataset.sidebarSection;
    if (collapsed.has(key)) {
      section.classList.add('sidebar__section--collapsed');
      const btn = section.querySelector('[data-sidebar-toggle]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }
}

function toggleSidebarSection(key) {
  const section = document.querySelector(`[data-sidebar-section="${CSS.escape(key)}"]`);
  if (!section) return;
  const nowCollapsed = !section.classList.contains('sidebar__section--collapsed');
  section.classList.toggle('sidebar__section--collapsed', nowCollapsed);
  const btn = section.querySelector('[data-sidebar-toggle]');
  if (btn) btn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
  const collapsed = readCollapsedSidebarSections();
  if (nowCollapsed) collapsed.add(key); else collapsed.delete(key);
  writeCollapsedSidebarSections(collapsed);
}

// サイドバー幅のドラッグ変更。--sidebar-width を更新し、幅を localStorage に保存する。
// 初期値 (272px) を最小幅とし、それ以上に広げられる。
const SIDEBAR_MIN_WIDTH = 272;
const SIDEBAR_MAX_WIDTH = 560;
function setupSidebarResizer() {
  const handle = document.getElementById('sidebar-resizer');
  if (!handle) return;
  const root = document.documentElement;

  // 保存済みの幅を復元 (最小幅を下回らないようクランプ)
  const saved = Number(localStorage.getItem('wqc_sidebar_width'));
  if (Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH) {
    root.style.setProperty('--sidebar-width', `${Math.min(saved, SIDEBAR_MAX_WIDTH)}px`);
  }

  let startX = 0;
  let startWidth = 0;
  const onMove = (e) => {
    const dx = e.clientX - startX;
    const w = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + dx));
    root.style.setProperty('--sidebar-width', `${w}px`);
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('is-resizing-sidebar');
    const cur = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-width'), 10);
    if (Number.isFinite(cur)) localStorage.setItem('wqc_sidebar_width', String(cur));
  };
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    const sidebar = document.querySelector('.sidebar');
    startWidth = sidebar ? sidebar.getBoundingClientRect().width : SIDEBAR_MIN_WIDTH;
    document.body.classList.add('is-resizing-sidebar');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  // ダブルクリックで初期幅 (最小) にリセット
  handle.addEventListener('dblclick', () => {
    root.style.setProperty('--sidebar-width', `${SIDEBAR_MIN_WIDTH}px`);
    localStorage.removeItem('wqc_sidebar_width');
  });
}

function bindStaticEvents() {
  setupSidebarResizer();
  // ドキュメント外クリックで main カードの popover pin を解除 (一度だけ登録)
  // popover は body 直下なので popover 内クリックでは解除しない
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-main-card]') && !e.target.closest('.main-popover')) {
      closeAllMainPopovers();
    }
  });

  // AI 優先度レコメンド → 該当検知項目へのページ内ジャンプ。
  // 優先度リストは AI 生成後にも動的挿入されるため委譲で一度だけ登録する
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-jump-audit]');
    if (!item) return;
    e.preventDefault();
    jumpToAudit(item.dataset.jumpAudit);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const item = e.target.closest?.('[data-jump-audit]');
    if (item) jumpToAudit(item.dataset.jumpAudit);
  });

  // Sidebar accordion
  restoreSidebarCollapseState();
  for (const btn of document.querySelectorAll('[data-sidebar-toggle]')) {
    btn.addEventListener('click', () => toggleSidebarSection(btn.dataset.sidebarToggle));
  }

  // Filter toggles
  for (const el of document.querySelectorAll('#severity-filters input')) {
    el.addEventListener('change', applyFilters);
  }
  for (const el of document.querySelectorAll('#category-filters input[data-main-category]')) {
    el.addEventListener('change', () => handleMainCategoryToggle(el));
  }
  for (const el of document.querySelectorAll('#category-filters input[data-category]')) {
    el.addEventListener('change', () => {
      syncMainToggleFromSubs(el);
      applyFilters();
    });
  }
  // ブランドタイトルクリックでダッシュボード (TOP) へ
  const brandHome = document.getElementById('brand-home');
  if (brandHome) {
    const goHome = () => { state.view = 'dashboard'; renderSidebar(); renderMain(); };
    brandHome.addEventListener('click', goHome);
    brandHome.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
  }
  // Modal handling (必ず最初にバインドして、データロード失敗時でも閉じられるように)
  const addBtn = document.getElementById('add-domain-btn');
  if (addBtn) addBtn.addEventListener('click', openAddDomainModal);
  // 管理者モードのログイン/ログアウトはヘルプモーダル内に内包 (openHelpModal で bind)
  // スポット評価ボタン
  const spotBtn = document.getElementById('spot-crawl-btn');
  if (spotBtn) spotBtn.addEventListener('click', openSpotCrawlModal);
  const spotHistoryBtn = document.getElementById('spot-history-btn');
  if (spotHistoryBtn) spotHistoryBtn.addEventListener('click', openSpotHistoryModal);
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.addEventListener('click', openHelpModal);
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
  }
  // ESC でモーダル閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// --- App loader overlay -------------------------------------------------

function showAppLoader(message) {
  const el = document.getElementById('app-loader');
  if (!el) return;
  if (message) {
    const sub = document.getElementById('app-loader-sublabel');
    if (sub) sub.textContent = message;
  }
  el.classList.remove('app-loader--hidden');
}

function hideAppLoader() {
  const el = document.getElementById('app-loader');
  if (!el) return;
  el.classList.add('app-loader--hidden');
}

async function init() {
  // 静的イベントバインドは最優先
  bindStaticEvents();

  try {
    state.aiEnabled = (await fetchJson('/api/ai/status').catch(() => ({ enabled: false }))).enabled;
  } catch {}

  // 保持済みトークンが有効か確認して管理者状態を復元
  if (getAdminToken()) {
    try {
      const res = await fetch('/api/admin/status', { headers: authHeaders() });
      const j = await res.json().catch(() => ({}));
      state.isAdmin = !!j.admin;
      if (!state.isAdmin) setAdminToken(''); // 失効済みトークンは破棄
    } catch { state.isAdmin = false; }
  }
  applyAdminUi();

  // 副Title更新 (ルール件数)
  try {
    const { deterministic, ai } = await fetchJson('/api/rules');
    const sub = document.getElementById('sidebar-subtitle');
    if (sub) sub.textContent = state.aiEnabled
      ? `${deterministic} + ${ai} rules (AI)`
      : `${deterministic} rules`;
  } catch {}

  try {
    await reloadConfigAndReruns();
  } catch (err) {
    document.getElementById('main').innerHTML = `<div class="empty-state">API エラー: ${escapeHtml(err.message)}</div>`;
    hideAppLoader();
    return;
  }
  // リロード前に走っていたクロールジョブがサーバに残っていれば watching を再開
  await resumeRunningCrawls();
  loadUsage();
  hideAppLoader();

  // Usage auto-refresh every 30s
  setInterval(loadUsage, 30000);
}

// サーバ側の crawlJobs Map を参照して running / queued ジョブを resume watching
// (ページリロードで activeJobs / toast を失ってもサーバのクロールは続いているため)
async function resumeRunningCrawls() {
  try {
    const resp = await fetchJson('/api/crawl/status');
    const jobs = Array.isArray(resp?.jobs) ? resp.jobs : [];
    for (const j of jobs) {
      if (j.status !== 'running' && j.status !== 'queued') continue;
      const jobId = j.id || j.targetId;
      const displayName = j.targetName || jobId;
      if (activeJobs.has(jobId)) continue;
      startWatchingJob(jobId, displayName);
    }
  } catch (err) {
    // 失敗しても致命ではない。ログだけ残してサイレントに続行
    console.warn('resumeRunningCrawls failed:', err.message);
  }
}

init();
