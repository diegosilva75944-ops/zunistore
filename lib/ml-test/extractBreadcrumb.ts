import type { CheerioAPI } from "cheerio";

/**
 * Breadcrumb típico da PDP (andes-breadcrumb / nav).
 */
export function extractMlCategoryBreadcrumb($: CheerioAPI): {
  categoryPath: string[];
  categoryName: string;
} {
  const parts: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return;
    if (/^Mercado\s+Livre$/i.test(t) || /^Início$/i.test(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    parts.push(t);
  };

  $("nav[aria-label*='aqui'] ol li, .andes-breadcrumb li, .ui-breadcrumb__item").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a").first();
    push(link.length ? link.text() : $el.text());
  });

  if (parts.length === 0) {
    $("nav ol li a").each((_, el) => {
      push($(el).text());
    });
  }

  const categoryName = parts.length ? parts[parts.length - 1] : "";
  const categoryPath = parts.length > 1 ? parts.slice(0, -1) : [];
  return { categoryPath, categoryName };
}
