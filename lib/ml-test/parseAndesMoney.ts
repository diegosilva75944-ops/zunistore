import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import { parseBRLFromSnippet, roundMoney } from "./normalize";

/**
 * ML às vezes cola reais+centavos num único inteiro (ex.: 49937 = R$ 499,37) quando o DOM não separa
 * fração/centavos ou o span de centavos vem "00". Evita gravar ~R$ 50 mil no lugar de ~R$ 500.
 * Só ajusta inteiros de 5 dígitos, não múltiplos de 100, na faixa típica de produto.
 */
export function normalizeSuspiciousGluedBrlInteger(n: number): number {
  if (!Number.isFinite(n) || n !== Math.floor(n)) return n;
  if (n < 10_000 || n > 99_999) return n;
  if (n % 100 === 0) return n;
  const alt = roundMoney(n / 100);
  if (alt >= 5 && alt <= 25_000) return alt;
  return n;
}

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

  /** Fração "49937" + centavos "00" / vazio → 499,37 (não 49937,00). */
  if (!frac.includes(",") && /^\d{5}$/.test(fs) && (c === "" || c === "0" || c === "00")) {
    const glued = parseFloat(`${fs.slice(0, -2)}.${fs.slice(-2)}`);
    if (Number.isFinite(glued) && glued > 0 && glued < n && glued >= 5) {
      n = glued;
    }
  }

  return roundMoney(normalizeSuspiciousGluedBrlInteger(n));
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

  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return roundMoney(normalizeSuspiciousGluedBrlInteger(n));
}
