// Cheerio の element から selector / outerHTML snippet / 周辺テキストを抽出
// offenders の形式を全ルールで統一するためのヘルパ

const DEFAULT_SNIPPET_MAX = 200;
const DEFAULT_CONTEXT_MAX = 160;
const MAX_DEPTH = 8;

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {any} el - Cheerio DOM node
 * @param {object} [opts]
 * @returns {{ selector: string, snippet: string, context: string, tag: string }}
 */
export function describeElement($, el, opts = {}) {
  const snippetMax = opts.snippetMax ?? DEFAULT_SNIPPET_MAX;
  const contextMax = opts.contextMax ?? DEFAULT_CONTEXT_MAX;

  const $el = $(el);
  const tag = el?.name || '';

  // outerHTML を safe に取得 (属性は残しつつ子要素は省略)
  let snippet = '';
  try {
    // 子を削除したシャロー版
    const clone = $(el).clone();
    clone.empty();
    snippet = $.html(clone);
  } catch {
    snippet = `<${tag}>`;
  }
  if (snippet.length > snippetMax) snippet = snippet.slice(0, snippetMax) + '…';

  // 親のテキスト (context)
  let context = '';
  try {
    context = $el.parent().text().trim().replace(/\s+/g, ' ');
  } catch {
    context = '';
  }
  if (context.length > contextMax) context = context.slice(0, contextMax) + '…';

  return {
    selector: buildSelector($, el),
    snippet,
    context,
    tag,
  };
}

function buildSelector($, el) {
  const parts = [];
  let node = el;
  let depth = 0;
  while (
    node &&
    node.type === 'tag' &&
    node.name !== 'html' &&
    depth < MAX_DEPTH
  ) {
    const $node = $(node);
    let part = node.name;

    const id = $node.attr('id');
    if (id) {
      parts.unshift(`#${cssEscape(id)}`);
      break;
    }

    const classAttr = $node.attr('class');
    if (classAttr) {
      const first = classAttr.trim().split(/\s+/).filter(Boolean)[0];
      if (first) part += '.' + cssEscape(first);
    }

    const parent = node.parent;
    if (parent && Array.isArray(parent.children)) {
      const sameTag = parent.children.filter(
        (c) => c.type === 'tag' && c.name === node.name,
      );
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(node) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    node = parent;
    depth++;
  }
  if (node && node.type === 'tag' && depth >= MAX_DEPTH) {
    parts.unshift('…');
  }
  return parts.join(' > ') || '';
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_\-ぁ-んァ-ヶ一-龠]/g, (c) => `\\${c}`);
}

/**
 * elements 配列から offenders[] を作る (上限つき)
 */
export function describeElements($, elements, opts = {}) {
  const limit = opts.limit ?? 20;
  const list = elements.slice(0, limit).map((el) => describeElement($, el, opts));
  return {
    offenders: list,
    total: elements.length,
    truncated: elements.length > limit,
  };
}
