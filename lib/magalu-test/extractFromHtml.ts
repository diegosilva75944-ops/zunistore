import "server-only";

import * as cheerio from "cheerio";
import type { TestMagaluImportResult } from "./types";
import type { PriceCandidate, PricingPreview } from "@/lib/ml-test/types";

function brlTextToNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(/R\$/gi, "");
  if (!s) return null;
  // 1.234,56 ou 899,00
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 && n < 50_000_000 ? n : null;
}

/** Preços hidratados na página (Magalu): "price" = vitrine/de, "bestPrice" = melhor (ex.: Pix). */
function parseEmbeddedMagaluPriceBlock(html: string): {
  listFromBlock: number | null;
  bestPrice: number | null;
  fullPrice: number | null;
} | null {
  const re =
    /"price"\s*:\s*\{\s*"paymentMethodDescription"\s*:\s*"[^"]*"\s*,\s*"price"\s*:\s*"(\d+(?:\.\d+)?)"\s*,\s*"fullPrice"\s*:\s*"(\d+(?:\.\d+)?)"\s*,\s*"bestPrice"\s*:\s*"(\d+(?:\.\d+)?)"/;
  const m = html.match(re);
  if (!m) return null;
  const listFromBlock = Number(m[1]);
  const fullPrice = Number(m[2]);
  const bestPrice = Number(m[3]);
  if (!Number.isFinite(bestPrice) || bestPrice <= 0) return null;
  return {
    listFromBlock: Number.isFinite(listFromBlock) && listFromBlock > 0 ? listFromBlock : null,
    bestPrice,
    fullPrice: Number.isFinite(fullPrice) && fullPrice > 0 ? fullPrice : null,
  };
}

const PAYMENT_OR_UI_IMG_RE =
  /payment-types|footer\/payment|\/payment\/|bandeira|formas[_-]?de[_-]?pagamento|favicon|apple-touch|\/img\/favicon|\/flags\/|cart[aã]o|visa\.svg|mastercard|elo\.svg|hipercard|amex|american-express|luizacred|pix[_-]?icon|parcelamento|luizacred/i;

function magaluImageAreaFromUrl(url: string): number {
  const m = url.match(/a-static\.mlcdn\.com\.br\/(\d+)x(\d+)\//i);
  if (!m) return 0;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 0;
  return w * h;
}

function imageFileKey(url: string): string {
  const path = url.split("?")[0];
  const seg = path.split("/").pop() || path;
  return seg.replace(/^\d+x\d+-/, "");
}

function isMagaluProductImageUrl(url: string, productId: string): boolean {
  const u = url.split("?")[0].trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (/\{w\}|\{h\}/i.test(u)) return false;
  if (PAYMENT_OR_UI_IMG_RE.test(u)) return false;
  if (/wx\.mlcdn\.com\.br/i.test(u)) return false;
  if (/\.svg(\?|$)/i.test(u)) return false;

  if (/a-static\.mlcdn\.com\.br/i.test(u)) {
    if (!/\/magazineluiza\/\d+\//i.test(u)) return false;
    if (productId && !u.includes(`/magazineluiza/${productId}/`)) return false;
    return /\.(jpe?g|png|webp)(\?|$)/i.test(u);
  }

  return false;
}

function collectPricesFromText(html: string): number[] {
  const re = /R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = brlTextToNumber(m[0]);
    if (n != null) out.push(n);
  }
  return out;
}

function walkJsonLd(node: unknown, products: Record<string, unknown>[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const x of node) walkJsonLd(x, products);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  const types = Array.isArray(t) ? t.map(String) : t != null ? [String(t)] : [];
  if (types.some((x) => x.toLowerCase() === "product")) {
    products.push(o);
  }
  for (const v of Object.values(o)) walkJsonLd(v, products);
}

function parseOfferPrice(offer: unknown): { current: number | null; original: number | null } {
  if (offer == null) return { current: null, original: null };
  const pick = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string") return brlTextToNumber(v);
    return null;
  };

  if (Array.isArray(offer)) {
    let current: number | null = null;
    let original: number | null = null;
    for (const item of offer) {
      const one = parseOfferPrice(item);
      if (one.current != null) current = one.current;
      if (one.original != null) original = one.original;
    }
    return { current, original };
  }

  if (typeof offer !== "object") return { current: null, original: null };
  const o = offer as Record<string, unknown>;
  let current: number | null = null;
  let original: number | null = null;

  if (o.price != null && typeof o.price !== "object") current = pick(o.price);
  const low = o.lowPrice;
  const high = o.highPrice;
  if (typeof low === "object" && low != null && "price" in (low as object)) {
    current = pick((low as { price?: unknown }).price);
  } else if (low != null && typeof low !== "object") current = pick(low);
  if (typeof high === "object" && high != null && "price" in (high as object)) {
    original = pick((high as { price?: unknown }).price);
  } else if (high != null && typeof high !== "object") original = pick(high);

  const offers = o.offers;
  if (offers && typeof offers === "object") {
    const off = offers as Record<string, unknown>;
    if (off["@type"] === "AggregateOffer" || off["@type"] === "Offer") {
      const p = pick(off.price ?? off.lowPrice);
      if (p != null) current = p;
      const hp = pick(off.highPrice);
      if (hp != null) original = hp;
    }
  }

  return { current, original };
}

function buildPricing(
  current: number | null,
  original: number | null,
  steps: string[],
  candidateSource: "json_ld" | "regex" | "hydration",
): { pricing: PricingPreview; candidates: PriceCandidate[] } {
  const candidates: PriceCandidate[] = [];
  if (current != null) {
    candidates.push({
      value: current,
      rawText: String(current),
      nearText: "magalu",
      source: candidateSource,
      fromMainBlock: true,
      isInstallment: false,
      isShipping: false,
      isRecommendation: false,
      isOriginalCandidate: false,
      isCurrentCandidate: true,
    });
  }
  if (original != null && current != null && original > current) {
    candidates.push({
      value: original,
      rawText: String(original),
      nearText: "magalu-list",
      source: candidateSource,
      fromMainBlock: true,
      isInstallment: false,
      isShipping: false,
      isRecommendation: false,
      isOriginalCandidate: true,
      isCurrentCandidate: false,
    });
  }

  let list = original != null && current != null && original > current ? original : current;
  let sell = current;
  if (sell == null && list != null) {
    sell = list;
    list = null;
  }

  const hasDiscount = list != null && sell != null && list > sell;
  const discountPercent =
    hasDiscount && list != null && sell != null && list > 0
      ? Math.min(100, Math.max(0, Math.round((1 - sell / list) * 100)))
      : null;

  const pricing: PricingPreview = {
    currentPrice: sell,
    originalPrice: hasDiscount ? list : null,
    discountPercent,
    hasDiscount: !!hasDiscount,
    displayMode: hasDiscount ? "discounted_price" : sell != null ? "single_price" : "unknown",
    installmentPrice: null,
    installments: null,
    confidence:
      candidateSource === "hydration" || (candidateSource === "json_ld" && current != null) ?
        "high"
      : current != null ? "medium"
      : "low",
    source: "html",
  };

  if (pricing.currentPrice == null) {
    steps.push("Preço: não encontrado em JSON-LD; tentativa por regex no HTML.");
  } else {
    steps.push(`Preço principal: ${pricing.currentPrice} (Magalu)`);
  }

  return { pricing, candidates };
}

export type MagaluHtmlExtract = {
  data: Omit<TestMagaluImportResult, "debug">;
  candidates: PriceCandidate[];
  extractionSteps: string[];
};

export function extractMagaluFromHtml(html: string, finalUrl: string): MagaluHtmlExtract {
  const steps: string[] = ["Parse HTML (cheerio)"];
  const $ = cheerio.load(html);

  const productIdFromUrl = (() => {
    try {
      const m = new URL(finalUrl).pathname.match(/\/p\/(\d+)/i);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  })();

  const titleOg = $('meta[property="og:title"]').attr("content")?.trim() || null;
  const titleH1 = $("h1").first().text().replace(/\s+/g, " ").trim() || null;
  let title: string | null = titleOg || titleH1;

  const descOg = $('meta[property="og:description"]').attr("content")?.trim() || "";
  const descMeta = $('meta[name="description"]').attr("content")?.trim() || "";

  const imageCandidates: string[] = [];
  const pushImg = (raw: string | undefined | null) => {
    const u = raw?.trim();
    if (!u?.startsWith("http")) return;
    if (!isMagaluProductImageUrl(u, productIdFromUrl)) return;
    imageCandidates.push(u.split("?")[0]);
  };

  $('meta[property="og:image"]').each((_, el) => pushImg($(el).attr("content")));
  $("img[src]").each((_, el) => {
    const alt = ($(el).attr("alt") || "").toLowerCase();
    if (
      /cart[aã]o|visa|master|elo|hiper|amex|american express|parcela|boleto|pagamento|luizacred|diners/i.test(
        alt,
      )
    ) {
      return;
    }
    pushImg($(el).attr("src"));
  });

  const products: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const j = JSON.parse(raw) as unknown;
      walkJsonLd(j, products);
    } catch {
      /* ignore */
    }
  });

  let current: number | null = null;
  let original: number | null = null;
  let priceSource: "json_ld" | "regex" | "hydration" = "json_ld";
  let rating: number | null = null;
  let reviewsCount: number | null = null;
  let jsonDescription = "";

  const embedded = parseEmbeddedMagaluPriceBlock(html);
  if (embedded) {
    current = embedded.bestPrice;
    if (
      embedded.listFromBlock != null &&
      embedded.bestPrice != null &&
      embedded.listFromBlock > embedded.bestPrice
    ) {
      original = embedded.listFromBlock;
    }
    priceSource = "hydration";
    steps.push(
      `Preço (JSON embutido Magalu): melhor ${embedded.bestPrice}${
        embedded.listFromBlock != null ? ` · vitrine ${embedded.listFromBlock}` : ""
      }`,
    );
  }

  if (products.length) {
    steps.push(`JSON-LD: ${products.length} bloco(s) Product`);
    const p = products[0];
    const jsonName = typeof p.name === "string" ? p.name : null;
    if (jsonName && !title) title = jsonName.trim() || title;
    const img = p.image;
    if (Array.isArray(img)) {
      for (const x of img) {
        if (typeof x === "string") pushImg(x);
      }
    } else if (typeof img === "string") {
      pushImg(img);
    }
    if (typeof p.description === "string" && p.description.length > jsonDescription.length) {
      jsonDescription = p.description.trim();
    }
    const agg = p.aggregateRating as Record<string, unknown> | undefined;
    if (agg && typeof agg.ratingValue === "string") {
      const r = Number(String(agg.ratingValue).replace(",", "."));
      if (Number.isFinite(r)) rating = r;
    } else if (agg && typeof agg.ratingValue === "number" && Number.isFinite(agg.ratingValue)) {
      rating = agg.ratingValue;
    }
    if (agg && typeof agg.reviewCount === "string") {
      const n = parseInt(agg.reviewCount, 10);
      if (Number.isFinite(n)) reviewsCount = n;
    } else if (agg && typeof agg.reviewCount === "number") {
      reviewsCount = agg.reviewCount;
    }

    const off = parseOfferPrice(p.offers);
    if (current == null && off.current != null) {
      current = off.current;
      priceSource = "json_ld";
    }
    if (
      (original == null || original <= (current ?? 0)) &&
      off.original != null &&
      current != null &&
      off.original > current
    ) {
      original = off.original;
    }
  }

  if (current == null) {
    const fromBody = collectPricesFromText($.text());
    const sorted = [...new Set(fromBody)].sort((a, b) => a - b);
    if (sorted.length >= 2) {
      priceSource = "regex";
      current = sorted[0];
      original = sorted[sorted.length - 1];
      if (original != null && original <= current) original = null;
      steps.push(`Preço (regex texto): candidatos ${sorted.slice(0, 6).join(", ")}`);
    } else if (sorted.length === 1) {
      priceSource = "regex";
      current = sorted[0];
    }
  }

  const { pricing, candidates } = buildPricing(current, original, steps, priceSource);
  if (pricing.originalPrice != null && pricing.currentPrice != null) {
    steps.push(`Preço anterior (vitrine): ${pricing.originalPrice}`);
  }

  const byKey = new Map<string, { url: string; area: number }>();
  for (const imgUrl of imageCandidates) {
    const area = magaluImageAreaFromUrl(imgUrl);
    const key = imageFileKey(imgUrl);
    const prev = byKey.get(key);
    if (!prev || area > prev.area) byKey.set(key, { url: imgUrl, area });
  }
  const imagesList = [...byKey.values()]
    .sort((a, b) => b.area - a.area)
    .map((x) => x.url)
    .slice(0, 30);
  if (imagesList.length) {
    steps.push(`Imagens do produto (filtradas): ${imagesList.length}`);
  }

  const specs: Record<string, string> = {};
  $("table tr").each((_, row) => {
    const cells = $(row).find("th,td");
    if (cells.length >= 2) {
      const k = $(cells[0]).text().replace(/\s+/g, " ").trim();
      const v = $(cells[1]).text().replace(/\s+/g, " ").trim();
      if (k.length > 1 && v.length > 0 && k.length < 120) specs[k] = v;
    }
  });

  let fullDescription = jsonDescription;
  if (!fullDescription) {
    const article = $('[class*="description"], [id*="description"], section').filter((_, el) => {
      const t = $(el).text();
      return t.length > 200 && /informa(ç|c)ões|descri(ç|c)ão|produto/i.test(t);
    });
    if (article.length) {
      fullDescription = article.first().text().replace(/\s+/g, " ").trim().slice(0, 50_000);
    }
  }
  if (!fullDescription) {
    fullDescription = [descOg, descMeta].filter(Boolean).join("\n\n").slice(0, 20_000);
  }

  const shortDescription =
    [descOg.slice(0, 500), Object.entries(specs).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(" | ")]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 2000);

  const crumbs: string[] = [];
  $('nav a, [class*="breadcrumb"] a, li[itemprop="itemListElement"] a').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 1 && t.length < 80 && !crumbs.includes(t)) crumbs.push(t);
  });
  const crumbsTrim = crumbs.slice(0, 12);
  const categoryNameFromCrumbs = crumbsTrim[crumbsTrim.length - 1] || "";
  const categoryPathFinal =
    crumbsTrim.length > 0 ? crumbsTrim : categoryNameFromCrumbs ? [categoryNameFromCrumbs] : [];

  const data: Omit<TestMagaluImportResult, "debug"> = {
    title,
    shortDescription,
    fullDescription,
    images: imagesList,
    rating,
    reviewsCount,
    categoryPath: categoryPathFinal,
    categoryName: categoryNameFromCrumbs,
    productIdFromUrl,
    specs,
    pricing,
  };

  return { data, candidates, extractionSteps: steps };
}
