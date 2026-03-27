import type { CheerioAPI } from "cheerio";

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

export function extractFullDescription($: CheerioAPI): string {
  const root = pickDescriptionRoot($);

  if (!root.length) {
    const p = $('p[data-testid="content"].ui-pdp-description__content').first();
    if (p.length) return normalizeBlock(p.text());
    const any = $('[data-testid="content"].ui-pdp-description__content').first();
    if (any.length) return normalizeBlock(any.text());
    return "";
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

export function makeShortDescription(full: string, title: string | null, maxLen = 320): string {
  const base = full.trim() || (title || "").trim();
  if (!base) return "";
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const last = cut.lastIndexOf(" ");
  return (last > 40 ? cut.slice(0, last) : cut).trim() + "…";
}
