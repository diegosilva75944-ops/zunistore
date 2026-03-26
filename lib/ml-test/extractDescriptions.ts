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

export function extractFullDescription($: CheerioAPI): string {
  const root =
    $(".ui-pdp-collapsable__container #description").first().length ?
      $(".ui-pdp-collapsable__container #description").first()
    : $("#description.ui-pdp-description").first().length ?
      $("#description.ui-pdp-description").first()
    : $('p[data-testid="content"].ui-pdp-description__content').parent().first().length ?
      $('p[data-testid="content"].ui-pdp-description__content').parent().first()
    : $(".ui-pdp-description").first();

  if (!root.length) {
    const p = $('p[data-testid="content"].ui-pdp-description__content').first();
    if (p.length) return normalizeBlock(p.text());
    return "";
  }

  const parts: string[] = [];
  root.find('p[data-testid="content"], p.ui-pdp-description__content').each((_, el) => {
    const t = $(el).text().trim();
    if (t) parts.push(t);
  });
  if (parts.length) return normalizeBlock(parts.join("\n\n"));

  const t = root.text().trim();
  return normalizeBlock(t.replace(/^\s*Descrição\s*/i, ""));
}

export function makeShortDescription(full: string, title: string | null, maxLen = 320): string {
  const base = full.trim() || (title || "").trim();
  if (!base) return "";
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const last = cut.lastIndexOf(" ");
  return (last > 40 ? cut.slice(0, last) : cut).trim() + "…";
}
