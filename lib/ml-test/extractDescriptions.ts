import type { Cheerio, CheerioAPI } from "cheerio";

function normalizeBlock(s: string): string {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Entre duas fontes (DOM vs JSON-LD), usa a mais longa para maximizar texto útil na PDP. */
export function preferLongerText(a: string, b: string): string {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x) return y;
  if (!y) return x;
  return x.length >= y.length ? x : y;
}

function pickDescriptionRoot($: CheerioAPI) {
  const ordered = [
    ".ui-pdp-collapsable__container #description.ui-pdp-description",
    ".ui-pdp-collapsable__container #description",
    ".ui-pdp-collapsable__container .ui-pdp-description",
    "div#description.ui-pdp-description",
    "#description.ui-pdp-description",
    "#description",
    ".ui-pdp-description",
  ];
  for (const sel of ordered) {
    const el = $(sel).first();
    if (el.length) return el;
  }
  const parent = $('p[data-testid="content"].ui-pdp-description__content').parent().first();
  return parent.length ? parent : $("");
}

/**
 * Clona o nó da descrição e devolve HTML seguro (texto + imagens) para gravar em `description_detail`.
 * Remove scripts/iframes e normaliza `img` para HTTPS.
 */
function buildDescriptionHtmlFragment($: CheerioAPI, root: Cheerio<import("domhandler").AnyNode>): string {
  const node = root.clone();
  node.find("script,style,noscript,iframe,object,embed,form").remove();
  node.find("*").each((_, el) => {
    const $e = $(el);
    const attribs = ($e[0] as { attribs?: Record<string, string> } | undefined)?.attribs;
    if (!attribs) return;
    for (const attr of Object.keys(attribs)) {
      if (/^on/i.test(attr)) $e.removeAttr(attr);
    }
  });
  node.find("h2, h3").each((_, el) => {
    const $h = $(el);
    const t = $h.text().trim();
    if (/^descri[çc][aã]o$/i.test(t)) $h.remove();
  });
  node.find("img").each((_, img) => {
    const $img = $(img);
    let src = ($img.attr("src") || $img.attr("data-src") || "").trim();
    if (src.startsWith("//")) src = `https:${src}`;
    if (!/^https:\/\//i.test(src)) {
      $img.remove();
      return;
    }
    $img.attr("src", src);
    $img.removeAttr("data-src");
    $img.removeAttr("srcset");
    $img.removeAttr("sizes");
    $img.attr("loading", "lazy");
    $img.attr("decoding", "async");
    if (!$img.attr("alt")) $img.attr("alt", "");
  });
  node.find("a").each((_, a) => {
    const $a = $(a);
    const href = ($a.attr("href") || "").trim();
    if (!/^https:\/\//i.test(href)) {
      $a.replaceWith($a.contents());
    } else {
      $a.attr("rel", "nofollow noopener noreferrer");
      $a.attr("target", "_blank");
    }
  });
  return node.html()?.trim() ?? "";
}

export function extractFullDescription($: CheerioAPI): string {
  const root = pickDescriptionRoot($);

  if (!root.length) {
    const p = $('p[data-testid="content"].ui-pdp-description__content').first();
    if (p.length) return normalizeBlock(p.text());
    const any = $('[data-testid="content"].ui-pdp-description__content').first();
    if (any.length) return normalizeBlock(any.text());
    return "";
  }

  /** Se a descrição tiver imagens no DOM, preservar HTML (texto + img) em vez de só `.text()`. */
  if (root.find("img").length > 0) {
    const inner =
      root.find(".ui-pdp-description__content").first().length ?
        root.find(".ui-pdp-description__content").first()
      : root.find('[data-testid="content"]').first().length ?
        root.find('[data-testid="content"]').first()
      : root;
    const html = buildDescriptionHtmlFragment($, inner);
    if (html.length >= 10) return html;
  }

  const parts: string[] = [];
  const leafSel =
    'p.ui-pdp-description__content, p[data-testid="content"].ui-pdp-description__content, p[data-testid="content"], [data-testid="content"].ui-pdp-description__content';
  root.find(leafSel).each((_, el) => {
    const t = $(el).text().trim();
    if (t) parts.push(t);
  });
  if (parts.length) return normalizeBlock(parts.join("\n\n"));

  const single =
    root.find(".ui-pdp-description__content").first().length ?
      root.find(".ui-pdp-description__content").first()
    : root.find('[data-testid="content"]').first();
  if (single.length) {
    const t = single.text().trim();
    if (t.length >= 20) return normalizeBlock(t.replace(/^\s*Descrição\s*/i, ""));
  }

  const t = root.text().trim();
  return normalizeBlock(t.replace(/^\s*Descrição\s*/i, ""));
}

/**
 * Resumo em destaque na PDP (lista de specs: voltagem, potência, etc.).
 * ML usa `ui-pdp-highlighted-specs__features-list`; em algumas páginas aparece `ui-vpp-…`.
 */
export function extractShortDescriptionFromHighlightedSpecs($: CheerioAPI): string {
  const el = $(".ui-vpp-highlighted-specs__features-list, .ui-pdp-highlighted-specs__features-list").first();
  if (!el.length) return "";
  const parts: string[] = [];
  el.find("li").each((_, li) => {
    const t = $(li).text().replace(/\s+/g, " ").trim();
    if (t) parts.push(t);
  });
  if (parts.length) return normalizeBlock(parts.join("\n"));
  return normalizeBlock(el.text());
}

function stripTagsForShortDescription(htmlOrText: string): string {
  const s = String(htmlOrText ?? "");
  if (!s.includes("<")) return s;
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeShortDescription(full: string, title: string | null, maxLen = 320): string {
  const plain = stripTagsForShortDescription(full);
  const base = plain || (title || "").trim();
  if (!base) return "";
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const last = cut.lastIndexOf(" ");
  return (last > 40 ? cut.slice(0, last) : cut).trim() + "…";
}
