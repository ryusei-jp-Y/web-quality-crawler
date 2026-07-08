import { chromium, devices } from 'playwright';
import { load } from 'cheerio';
import { logger } from './logger.js';

// フルページスクショの高さ上限 (px)。極端に長いページはビットマップ確保で
// メモリ/時間が膨らむため上限でクリップする。スクショは検知ルール実行後に生成され
// UI の赤枠プレビュー背景にのみ使うため、クリップしても検知精度には影響しない。
// 通常の LP は 1〜2 万 px 程度なので、大半のページは現状と同じフルページのまま。
const SCREENSHOT_MAX_HEIGHT = Number(process.env.SCREENSHOT_MAX_HEIGHT ?? 20000);
// スクショ単体のハング防止バックストップ (worker 15 分タイムアウトより十分手前)。
const SCREENSHOT_TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS ?? 60000);

const DEVICE_PROFILES = {
  pc: {
    userAgent: 'WebQualityCrawler/1.0',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  sp: {
    // Playwright 組み込みの iPhone 13 プロファイルをベースに UA を上書き
    ...devices['iPhone 13'],
    userAgent: (devices['iPhone 13']?.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15')
      + ' WebQualityCrawler/1.0',
  },
};

export async function fetchPage(url, timeout = 30000, opts = {}) {
  const device = opts.device || 'pc';
  const skipLinkCheck = !!opts.skipLinkCheck;
  const profile = DEVICE_PROFILES[device] || DEVICE_PROFILES.pc;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  let closedByFinally = false;

  try {
    const context = await browser.newContext({
      ...profile,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    // Core Web Vitals 計測用 — navigation 前に仕込む
    await page.addInitScript(() => {
      window.__cwv__ = { lcp: 0, cls: 0, tbt: 0 };
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) window.__cwv__.lcp = last.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) { /* noop */ }
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) window.__cwv__.cls += e.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) { /* noop */ }
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__cwv__.tbt += Math.max(0, e.duration - 50);
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch (e) { /* noop */ }
    });

    // networkidle は分析スクリプト等で永遠に待つことがあるため load を採用
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    const statusCode = response?.status() ?? 0;

    // LCP / CLS を拾うために短時間待機
    const cwvSettle = Number(process.env.CWV_SETTLE_MS ?? 1500);
    await page.waitForTimeout(cwvSettle);

    // レンダリング後HTML（最終評価対象）
    const html = await page.content();
    const title = await page.title();
    const finalUrl = page.url();

    // サイズ計測
    const rawHtmlBytes = Buffer.byteLength(html, 'utf-8');
    const bodyIdx = html.search(/<body\b/i);
    const bodyStartOffset = bodyIdx >= 0 ? Buffer.byteLength(html.slice(0, bodyIdx), 'utf-8') : rawHtmlBytes;

    // head内インラインサイズ計測 (<style> と src無し<script> のみ)
    const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    let headInlineBytes = 0;
    if (headMatch) {
      const headContent = headMatch[1];
      const inlineStyles = headContent.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
      const inlineScripts = headContent.match(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
      headInlineBytes = [...inlineStyles, ...inlineScripts].reduce(
        (sum, s) => sum + Buffer.byteLength(s, 'utf-8'),
        0,
      );
    }

    // CSS擬似要素のテキスト内容を抽出
    const pseudoTexts = await page.evaluate(() => {
      const results = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        for (const pseudo of ['::before', '::after']) {
          const content = window.getComputedStyle(el, pseudo).getPropertyValue('content');
          if (content && content !== 'none' && content !== 'normal' && content !== '""' && content !== "''") {
            const cleaned = content.replace(/^["']|["']$/g, '');
            if (cleaned.length >= 2 && !/^[\s•·‐\-—→←↑↓▲▼◀▶★☆♦♢]+$/.test(cleaned)) {
              results.push({ tag: el.tagName.toLowerCase(), pseudo, text: cleaned.slice(0, 100) });
            }
          }
        }
      }
      return results;
    });

    // クリック可能なdiv/span(role=button以外)
    const clickableNonButtons = await page.evaluate(() => {
      const candidates = document.querySelectorAll('div, span');
      const results = [];
      for (const el of candidates) {
        const hasOnclick = el.hasAttribute('onclick');
        const hasRoleButton = el.getAttribute('role') === 'button';
        if (hasOnclick && !hasRoleButton) {
          results.push({ tag: el.tagName.toLowerCase(), hasRole: el.hasAttribute('role') });
        }
      }
      return results;
    });

    // body内テキスト量
    const bodyTextLength = await page.evaluate(() => {
      return (document.body?.innerText || '').trim().length;
    });

    // ページコンテンツのハッシュ (前回クロールとの差分検出に使う)。
    // body innerText を正規化して安定したハッシュを算出。動的な日時表示等の
    // ノイズを減らすため空白圧縮 + 数字塊を一部マスクする (将来調整可能)。
    const pageHash = await page.evaluate(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      // 空のページや極端に短いものはハッシュ算出をスキップ
      if (text.length < 50) return null;
      // 簡易な FNV-1a 32bit ハッシュ + 4 文字ロール (Node 側でさらに sha1 する)
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return { value: h.toString(16), length: text.length };
    });

    // Visual / layout データ収集 (contrast / image size / font / heading size 等で使用)
    // ページ 1 回の evaluate に集約して round-trip を抑える。
    const visualData = await page.evaluate(() => {
      const TEXT_SAMPLE_LIMIT = 100;
      const rgbToArr = (s) => {
        const m = String(s).match(/\d+(?:\.\d+)?/g);
        if (!m) return null;
        const [r, g, b, a] = m.map(Number);
        return { r, g, b, a: a ?? 1 };
      };
      const isVisible = (el) => {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const hasText = (el) => (el.textContent || '').trim().length > 0;
      // テキストを持つリーフ要素 (子に block がなく直接テキストを含む) を対象
      const isLeafText = (el) => {
        if (!hasText(el)) return false;
        for (const c of el.children) {
          if ((c.textContent || '').trim().length > 0) return false;
        }
        return true;
      };

      // テキストサンプル (contrast / font 用)
      const textSamples = [];
      const allText = document.querySelectorAll('p, li, span, a, button, h1, h2, h3, h4, h5, h6, td, dd, dt, label');
      for (const el of allText) {
        if (textSamples.length >= TEXT_SAMPLE_LIMIT) break;
        if (!isLeafText(el) || !isVisible(el)) continue;
        const cs = window.getComputedStyle(el);
        // background は祖先まで遡って不透明な色を見つける
        let bg = cs.backgroundColor;
        let node = el;
        while (node && (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
          node = node.parentElement;
          if (!node) { bg = 'rgb(255, 255, 255)'; break; }
          bg = window.getComputedStyle(node).backgroundColor;
        }
        textSamples.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 80),
          color: cs.color,
          bgColor: bg,
          fontSize: parseFloat(cs.fontSize) || 0,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          fontFamily: cs.fontFamily,
        });
      }

      // 見出し (heading-visual-hierarchy 用) — DOM 順
      const headings = [];
      for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        if (!isVisible(el)) continue;
        const cs = window.getComputedStyle(el);
        headings.push({
          level: Number(el.tagName.substring(1)),
          text: (el.textContent || '').trim().slice(0, 80),
          fontSize: parseFloat(cs.fontSize) || 0,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
        });
      }

      // 画像 (image-quality / logo / 著作権 用)
      const images = [];
      for (const el of document.querySelectorAll('img')) {
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        images.push({
          src: el.currentSrc || el.src || '',
          alt: el.getAttribute('alt') || '',
          className: el.className || '',
          id: el.id || '',
          displayedWidth: Math.round(rect.width),
          displayedHeight: Math.round(rect.height),
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          transform: cs.transform,
          filter: cs.filter,
          opacity: cs.opacity,
          visible: rect.width > 0 && rect.height > 0,
        });
      }

      // background-image を使う要素 (著作権チェック用)
      const backgroundImages = [];
      for (const el of document.querySelectorAll('*')) {
        const cs = window.getComputedStyle(el);
        const bg = cs.backgroundImage;
        if (bg && bg !== 'none' && /url\(/i.test(bg)) {
          const urls = [...bg.matchAll(/url\(["']?(.+?)["']?\)/g)].map((m) => m[1]);
          for (const u of urls) {
            backgroundImages.push({ selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/)[0] : ''), url: u });
            if (backgroundImages.length >= 40) break;
          }
        }
        if (backgroundImages.length >= 40) break;
      }

      // ページ寸法 (cta-placement 用)
      const pageMetrics = {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        bodyTextLength: (document.body?.innerText || '').trim().length,
      };

      return { textSamples, headings, images, backgroundImages, pageMetrics };
    });

    // Core Web Vitals + navigation timing
    const webVitals = await page.evaluate(() => {
      const c = window.__cwv__ || {};
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        lcp: Number.isFinite(c.lcp) && c.lcp > 0 ? c.lcp : null,
        cls: Number.isFinite(c.cls) ? c.cls : 0,
        tbt: Number.isFinite(c.tbt) ? c.tbt : 0,
        fcp: fcp ? fcp.startTime : null,
        ttfb: nav ? nav.responseStart : null,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        loadEvent: nav ? nav.loadEventEnd : null,
        transferSize: nav ? nav.transferSize : null,
      };
    });

    // 追加リソース取得
    const origin = new URL(finalUrl).origin;
    const [llmsTxt, robotsTxt] = await Promise.all([
      fetchAuxFile(`${origin}/llms.txt`),
      fetchAuxFile(`${origin}/robots.txt`),
    ]);

    // リンク検査 — a[href] を抽出して HEAD 検査 (device 非依存なので SP ではスキップ可能)
    const linkCheck = skipLinkCheck ? null : await checkLinks(page, finalUrl);

    const $ = load(html);

    return {
      url: finalUrl,
      statusCode,
      html,
      title,
      $,
      rawHtmlBytes,
      bodyStartOffset,
      headInlineBytes,
      bodyTextLength,
      pseudoTexts,
      clickableNonButtons,
      llmsTxt,
      robotsTxt,
      webVitals,
      visualData,
      pageHash,
      linkCheck,
      device,
      _playwright: {
        async resolveBboxes(selectors) {
          const out = {};
          for (const sel of selectors) {
            if (!sel) continue;
            try {
              const box = await page.locator(sel).first().boundingBox({ timeout: 500 });
              if (box) out[sel] = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
            } catch (_e) { /* selector resolution failure → skip */ }
          }
          return out;
        },
        async captureScreenshot(destPath, { fullPage = true, quality = 80, maxHeight = SCREENSHOT_MAX_HEIGHT } = {}) {
          // 拡張子に応じて type を切替。JPEG は PNG の ~5-7 分の 1 のサイズで
          // 表示用途に十分な画質を維持できる。
          const isJpeg = /\.(jpe?g)$/i.test(destPath);
          const base = isJpeg ? { type: 'jpeg', quality } : {};

          // 極端に長いページは fullPage 撮影でビットマップ確保 (幅×高さ×4byte) が
          // 青天井になり、メモリ/時間が膨らむ。高さが上限を超える場合のみ、ビューポート
          // 高さを上限にリサイズして先頭 maxHeight px を撮影する。
          // (Playwright の clip はビューポート外を撮れないため viewport リサイズ方式を採用)
          // 撮影はルール実行・bbox 解決の後・ページ close の直前に行うため、ここでの
          // リサイズが検知やオフェンダー座標に影響することはない (幅は変えず高さのみ)。
          let clippedHeight = null;
          if (fullPage && maxHeight > 0) {
            const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            if (pageHeight > maxHeight) {
              const vp = page.viewportSize() || { width: 1280, height: 720 };
              await page.setViewportSize({ width: vp.width, height: maxHeight });
              await page.screenshot({ path: destPath, fullPage: false, timeout: SCREENSHOT_TIMEOUT_MS, ...base });
              clippedHeight = maxHeight;
              logger.info(`[screenshot] height ${pageHeight} > ${maxHeight}px → viewport-resize clip (${destPath})`);
              return { clippedHeight };
            }
          }
          await page.screenshot({ path: destPath, fullPage, timeout: SCREENSHOT_TIMEOUT_MS, ...base });
          return { clippedHeight };
        },
        async getPageDimensions() {
          return page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            dpr: window.devicePixelRatio,
          }));
        },
        async close() {
          if (closedByFinally) return;
          closedByFinally = true;
          await browser.close();
        },
      },
    };
  } catch (err) {
    closedByFinally = true;
    await browser.close();
    throw err;
  }
}

async function checkLinks(page, baseUrl) {
  const maxLinks = Number(process.env.LINK_CHECK_MAX ?? 60);
  const concurrency = Number(process.env.LINK_CHECK_CONCURRENCY ?? 6);
  const linkTimeoutMs = Number(process.env.LINK_CHECK_TIMEOUT_MS ?? 8000);

  const rawLinks = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      const rect = a.getBoundingClientRect();
      out.push({
        href,
        text: (a.textContent || '').trim().slice(0, 80),
        rect: rect.width > 0 || rect.height > 0 ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
      });
    }
    return out;
  });

  const base = new URL(baseUrl);
  const baseHost = base.host;
  const seen = new Map(); // absolute URL -> metadata
  for (const l of rawLinks) {
    let abs;
    try { abs = new URL(l.href, baseUrl).toString(); } catch { continue; }
    if (!/^https?:\/\//i.test(abs)) continue;
    if (!seen.has(abs)) {
      const isInternal = (() => { try { return new URL(abs).host === baseHost; } catch { return false; } })();
      seen.set(abs, { url: abs, text: l.text, isInternal, href: l.href });
    }
  }

  const all = [...seen.values()];
  const truncated = all.length > maxLinks;
  const links = all.slice(0, maxLinks);

  const check = async (entry) => {
    const start = Date.now();
    try {
      const r = await fetch(entry.url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(linkTimeoutMs),
      });
      // 一部サイトは HEAD を拒否する → 失敗時のみ GET で再確認
      if (r.status === 405 || r.status === 501) {
        const g = await fetch(entry.url, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(linkTimeoutMs),
        });
        return { ...entry, status: g.status, redirectTo: g.headers.get('location'), elapsedMs: Date.now() - start };
      }
      return { ...entry, status: r.status, redirectTo: r.headers.get('location'), elapsedMs: Date.now() - start };
    } catch (err) {
      return { ...entry, status: 0, error: err.name === 'TimeoutError' ? 'timeout' : err.message, elapsedMs: Date.now() - start };
    }
  };

  // 手作りワーカープール
  const results = new Array(links.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, links.length || 1) }, async () => {
    while (true) {
      const i = next++;
      if (i >= links.length) return;
      results[i] = await check(links[i]);
    }
  });
  await Promise.all(workers);

  // リダイレクトチェーン追跡 (ヒットした Location を辿る、最大 5 ホップ)
  const chains = [];
  for (const r of results) {
    if (r.status >= 300 && r.status < 400 && r.redirectTo) {
      const chain = [{ url: r.url, status: r.status }];
      let cur = r.redirectTo;
      for (let hop = 0; hop < 4; hop++) {
        let nextUrl;
        try { nextUrl = new URL(cur, r.url).toString(); } catch { break; }
        try {
          const res = await fetch(nextUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(linkTimeoutMs) });
          chain.push({ url: nextUrl, status: res.status });
          if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            cur = res.headers.get('location');
            continue;
          }
          break;
        } catch (err) {
          chain.push({ url: nextUrl, status: 0, error: err.message });
          break;
        }
      }
      if (chain.length > 1) chains.push({ start: r.url, text: r.text, chain });
    }
  }

  return {
    total: all.length,
    checked: links.length,
    truncated,
    results,
    redirectChains: chains,
  };
}

async function fetchAuxFile(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { exists: false, status: res.status, content: null, bytes: 0 };
    const content = await res.text();
    return { exists: true, status: res.status, content, bytes: Buffer.byteLength(content, 'utf-8') };
  } catch (err) {
    logger.debug(`fetchAuxFile ${url} failed: ${err.message}`);
    return { exists: false, status: 0, content: null, bytes: 0, error: err.message };
  }
}
