import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { parseBRLFromSnippet, roundMoney } from "./normalize";

/**
 * Número BR no texto do ML: milhar com "." e decimal com "," (ex.: "1.589,12").
 */
export function parseNumberLikeMlBr(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : null;
}

/**
 * Converte par fraction + cents do componente andes-money (HTML ou texto bruto).
 * Corrige: "589,12" num único span; "58912" sem span de centavos (colado).
 */
export function parseAndesFractionCentsToNumber(rawFraction: string, cents: string): number | null {
  const frac = String(rawFraction ?? "").trim();
  const c = String(cents ?? "").trim();

  if (!frac) return null;

  if (frac.includes(",")) {
    const n = parseNumberLikeMlBr(frac);
    return n != null && n > 0 ? roundMoney(n) : null;
  }

  const fs = frac.replace(/\./g, "");
  const dec = c && /^\d{1,2}$/.test(c) ? c.padStart(2, "0") : "00";
  let n = parseFloat(`${fs}.${dec}`);

  if (!Number.isFinite(n) || n <= 0) return null;

  // Sem centavos no 2º span: ML às vezes cola "589" e "12" como "58912" na fração
  if (c === "" && /^\d{5}$/.test(fs)) {
    const alt = parseFloat(`${fs.slice(0, 3)}.${fs.slice(3)}`);
    if (Number.isFinite(alt) && alt > 0 && alt < n / 5) n = alt;
  }

  return roundMoney(n);
}

/**
 * Parse do nó .andes-money (mesma regra para import HTML e resolvePreviewPricing).
 */
export function parseAndesMoneyCheerio($: CheerioAPI, $el: Cheerio<Element>): number | null {
  const fraction = $el.find(".andes-money-amount__fraction").first().text().trim();
  const cents = $el.find(".andes-money-amount__cents").first().text().trim();
  const fullText = $el.text().replace(/\s+/g, " ").trim();

  if (!fraction && !fullText) return null;

  let n = parseAndesFractionCentsToNumber(fraction, cents);

  const fromSnippet = parseBRLFromSnippet(fullText);
  if (fromSnippet != null && n != null && fromSnippet > 0) {
    if (n >= 1000 && fromSnippet < n / 5) n = fromSnippet;
  } else if (fromSnippet != null && fromSnippet > 0 && (n == null || !Number.isFinite(n) || n <= 0)) {
    n = fromSnippet;
  }

  return n != null && Number.isFinite(n) && n > 0 ? roundMoney(n) : null;
}
