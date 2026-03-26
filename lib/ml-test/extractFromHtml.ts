import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { ExtractFromHtmlOutput, PriceCandidate } from "./types";
import { extractGalleryImages } from "./extractImages";
import { extractFullDescription, makeShortDescription } from "./extractDescriptions";
import { parseBRLFromSnippet, roundMoney } from "./normalize";

function stripScriptsStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function nearText($: CheerioAPI, el: Cheerio<Element>): string {
  const p = $(el).parent();
  const t = p.text().replace(/\s+/g, " ").trim();
  return t.slice(0, 220);
}

function isInOtherSellers($: CheerioAPI, el: Cheerio<Element>): boolean {
  const cls = $(el).parents().toArray().some((n) => {
    const c = (n as Element).attribs?.class || "";
    return /other-sellers|outros-vendedores/i.test(c);
  });
  return cls;
}

function isRecommendationContext(text: string, $: CheerioAPI, el: Cheerio<Element>): boolean {
  const low = text.toLowerCase();
  if (/quem viu|recomend|também|relacionad|vitrine/i.test(low)) return true;
  return $(el).parents().toArray().some((n) => {
    const c = ((n as Element).attribs?.class || "").toLowerCase();
    return (
      c.includes("carousel") ||
      c.includes("reco") ||
      c.includes("recommend") ||
      c.includes("search-ui")
    );
  });
}

function detectInstallment(text: string): boolean {
  return /(\d+\s*x\s*)|parcelad|sem juros|juros|parcela/i.test(text);
}

function detectShipping(text: string): boolean {
  return /frete|entrega|envio|retira/i.test(text);
}

function parseAndesMoney($: CheerioAPI, el: Cheerio<Element>): number | null {
  const fraction = el.find(".andes-money-amount__fraction").first().text().trim();
  const cents = el.find(".andes-money-amount__cents").first().text().trim();
  if (!fraction) return null;
  const fs = fraction.replace(/\./g, "");
  const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
  const n = parseFloat(`${fs}.${dec}`);
  return Number.isFinite(n) && n > 0 ? roundMoney(n) : null;
}

function parseAntesAria(aria: string | undefined): number | null {
  if (!aria) return null;
  const m = aria.match(/Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/i);
  if (!m) return null;
  const reais = Number(String(m[1]).replace(/\./g, ""));
  const cent = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(reais)) return null;
  return roundMoney(reais + cent / 100);
}

function fromMainPriceBlock($: CheerioAPI, el: Cheerio<Element>): boolean {
  return (
    $(el).closest(".ui-pdp-container__row--price").length > 0 ||
    $(el).closest(".ui-pdp-price__main-container").length > 0 ||
    $(el).closest(".ui-pdp-price").length > 0 ||
    $(el).closest(".poly-component__price").length > 0
  );
}

function extractJsonLdProduct(html: string): {
  title: string | null;
  description: string | null;
  image: string | string[] | null;
  price: number | null;
  highPrice: number | null;
  lowPrice: number | null;
} | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const list = Array.isArray(data) ? data : [data];
    for (const node of list) {
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const type = o["@type"];
      const isProduct =
        type === "Product" ||
        (Array.isArray(type) && (type as string[]).includes("Product"));
      if (!isProduct) continue;
      const name = typeof o.name === "string" ? o.name : null;
      const desc = typeof o.description === "string" ? o.description : null;
      const image = o.image as string | string[] | null | undefined;
      const offers = o.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      let price: number | null = null;
      let highPrice: number | null = null;
      let lowPrice: number | null = null;
      if (offer && typeof offer === "object") {
        const off = offer as Record<string, unknown>;
        const p = off.price != null ? Number(off.price) : NaN;
        const h = off.highPrice != null ? Number(off.highPrice) : NaN;
        const l = off.lowPrice != null ? Number(off.lowPrice) : NaN;
        if (Number.isFinite(p) && p > 0) price = p;
        if (Number.isFinite(h) && h > 0) highPrice = h;
        if (Number.isFinite(l) && l > 0) lowPrice = l;
      }
      return {
        title: name,
        description: desc,
        image: image ?? null,
        price,
        highPrice,
        lowPrice,
      };
    }
  }
  return null;
}

export function extractFromHtml(html: string, label: string): ExtractFromHtmlOutput {
  const steps: string[] = [`[${label}] Parse HTML (${html.length} chars)`];
  const rawSignals: Record<string, unknown> = {};

  const $ = load(html);

  const title =
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    null;

  const jsonLd = extractJsonLdProduct(html);
  rawSignals.jsonLd = jsonLd;

  const fullDescDom = extractFullDescription($);
  const fullDesc = jsonLd?.description?.trim() || fullDescDom;
  const shortDescription = makeShortDescription(fullDesc, title);
  const images = extractGalleryImages($);

  const candidates: PriceCandidate[] = [];

  if (jsonLd) {
    steps.push(`[${label}] JSON-LD Product encontrado`);
    if (jsonLd.highPrice != null && jsonLd.lowPrice != null && jsonLd.highPrice > jsonLd.lowPrice) {
      candidates.push({
        value: roundMoney(jsonLd.highPrice),
        rawText: `highPrice:${jsonLd.highPrice}`,
        nearText: "json-ld offers",
        source: "json_ld",
        fromMainBlock: true,
        isInstallment: false,
        isShipping: false,
        isRecommendation: false,
        isOriginalCandidate: true,
        isCurrentCandidate: false,
      });
      candidates.push({
        value: roundMoney(jsonLd.lowPrice),
        rawText: `lowPrice:${jsonLd.lowPrice}`,
        nearText: "json-ld offers",
        source: "json_ld",
        fromMainBlock: true,
        isInstallment: false,
        isShipping: false,
        isRecommendation: false,
        isOriginalCandidate: false,
        isCurrentCandidate: true,
      });
    } else if (jsonLd.price != null) {
      candidates.push({
        value: roundMoney(jsonLd.price),
        rawText: `price:${jsonLd.price}`,
        nearText: "json-ld offers",
        source: "json_ld",
        fromMainBlock: true,
        isInstallment: false,
        isShipping: false,
        isRecommendation: false,
        isOriginalCandidate: false,
        isCurrentCandidate: true,
      });
    }
  }

  $('meta[itemprop="price"]').each((_, el) => {
    const content = (el as unknown as Element).attribs?.content;
    if (!content) return;
    const n = Number(String(content).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    candidates.push({
      value: roundMoney(n),
      rawText: `meta price=${content}`,
      nearText: "meta[itemprop=price]",
      source: "meta",
      fromMainBlock: true,
      isInstallment: false,
      isShipping: false,
      isRecommendation: false,
      isOriginalCandidate: false,
      isCurrentCandidate: true,
    });
  });

  $("s[aria-label], .andes-money-amount--previous, .ui-pdp-price__original-value").each((_, el) => {
    const $el = $(el);
    const aria = $el.attr("aria-label");
    const antes = parseAntesAria(aria);
    if (antes != null) {
      candidates.push({
        value: antes,
        rawText: aria || "",
        nearText: nearText($, $el),
        source: "aria",
        fromMainBlock: fromMainPriceBlock($, $el),
        isInstallment: false,
        isShipping: false,
        isRecommendation: false,
        isOriginalCandidate: true,
        isCurrentCandidate: false,
      });
      return;
    }
    const n = parseAndesMoney($, $el as Cheerio<Element>);
    if (n != null && $el.is(".andes-money-amount--previous, .ui-pdp-price__original-value, s")) {
      candidates.push({
        value: n,
        rawText: $el.text().replace(/\s+/g, " ").trim(),
        nearText: nearText($, $el as Cheerio<Element>),
        source: "andes_dom",
        fromMainBlock: fromMainPriceBlock($, $el as Cheerio<Element>),
        isInstallment: false,
        isShipping: false,
        isRecommendation: isRecommendationContext($el.text(), $, $el as Cheerio<Element>),
        isOriginalCandidate: true,
        isCurrentCandidate: false,
      });
    }
  });

  $(".andes-money-amount").each((_, el) => {
    const $el = $(el);
    if (isInOtherSellers($, $el as Cheerio<Element>)) return;
    const txt = $el.text().replace(/\s+/g, " ").trim();
    const nt = nearText($, $el as Cheerio<Element>);
    const inst = detectInstallment(nt + " " + txt);
    const ship = detectShipping(nt + " " + txt);
    const reco =
      isRecommendationContext(nt, $, $el as Cheerio<Element>) &&
      !$el.closest(".ui-pdp-container__row--price, .poly-component__price").length;

    const n = parseAndesMoney($, $el as Cheerio<Element>);
    if (n == null) return;
    const isPrev =
      $el.hasClass("andes-money-amount--previous") ||
      $el.closest(".andes-money-amount--previous").length > 0;

    candidates.push({
      value: n,
      rawText: txt,
      nearText: nt,
      source: "andes_dom",
      fromMainBlock: fromMainPriceBlock($, $el as Cheerio<Element>),
      isInstallment: inst,
      isShipping: ship,
      isRecommendation: reco,
      isOriginalCandidate: isPrev,
      isCurrentCandidate: !isPrev && $el.closest('[itemprop="offers"]').length > 0,
    });
  });

  const visible = stripScriptsStyles(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const re = /R\$\s*[\d.]+\s*,\s*\d{2}/gi;
  let mm: RegExpExecArray | null;
  let count = 0;
  while ((mm = re.exec(visible)) !== null && count < 12) {
    const snippet = visible.slice(Math.max(0, mm.index - 60), mm.index + 40);
    if (detectInstallment(snippet) || detectShipping(snippet)) continue;
    const val = parseBRLFromSnippet(mm[0]);
    if (val == null) continue;
    candidates.push({
      value: val,
      rawText: mm[0],
      nearText: snippet,
      source: "regex",
      fromMainBlock: /ui-pdp|andes-money/i.test(snippet),
      isInstallment: detectInstallment(snippet),
      isShipping: detectShipping(snippet),
      isRecommendation: /recomend|vitrine/i.test(snippet),
      isOriginalCandidate: /antes|de\s+R\$|original|previous/i.test(snippet),
      isCurrentCandidate: /por\s+R\$|hoje|à vista/i.test(snippet) || !/antes/i.test(snippet),
    });
    count += 1;
  }

  rawSignals.candidateCount = candidates.length;
  steps.push(`[${label}] Candidatos de preço: ${candidates.length}`);

  const imagesFromJson =
    jsonLd?.image ?
      (Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image]).filter(
        (u): u is string => typeof u === "string" && u.startsWith("http"),
      )
    : [];
  const imagesOut = images.length > 0 ? images : imagesFromJson;

  return {
    title: jsonLd?.title || title,
    fullDescription: fullDesc,
    shortDescription,
    images: imagesOut,
    candidates,
    extractionSteps: steps,
    rawSignals,
  };
}
