import { load } from "cheerio";

export type MercadoLivreExtractedPrices = {
  currentPrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  installmentInfo: string | null;
};

type PriceCandidate = {
  value: number;
  source: string;
  text: string;
};

export function parseBRL(value: string): number | null {
  const text = String(value || "").trim();
  const m = text.match(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const intPart = m[1].replace(/\./g, "");
  const dec = (m[2] ?? "00").padEnd(2, "0").slice(0, 2);
  const n = Number(`${intPart}.${dec}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isInstallmentText(text: string): boolean {
  return /(\d+\s*x\s*)?sem juros|parcelad|x\s*de\s*R\$/i.test(text);
}

export function isSecondaryPriceText(text: string): boolean {
  return /preço por|preco por|frete|cupom|por kg|por litro|por ml|por unidade/i.test(text);
}

export function extractDiscountPercent(text: string): number | null {
  const m = String(text || "").match(/(\d{1,2})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}

function firstNonEmpty(arr: (string | null | undefined)[]): string | null {
  for (const x of arr) {
    const s = String(x ?? "").trim();
    if (s) return s;
  }
  return null;
}

function fromStructuredData(html: string): MercadoLivreExtractedPrices | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of list) {
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      const type = obj["@type"];
      const isProduct =
        type === "Product" || (Array.isArray(type) && (type as unknown[]).includes("Product"));
      if (!isProduct) continue;

      const offers = obj.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (!offer || typeof offer !== "object") continue;

      const offerObj = offer as Record<string, unknown>;
      const price = typeof offerObj.price === "number" ? offerObj.price : Number(offerObj.price ?? NaN);
      const highPrice =
        typeof offerObj.highPrice === "number" ? offerObj.highPrice : Number(offerObj.highPrice ?? NaN);
      const lowPrice =
        typeof offerObj.lowPrice === "number" ? offerObj.lowPrice : Number(offerObj.lowPrice ?? NaN);

      let currentPrice: number | null = Number.isFinite(price) && price > 0 ? price : null;
      let originalPrice: number | null = null;

      if (Number.isFinite(highPrice) && Number.isFinite(lowPrice) && highPrice > lowPrice) {
        originalPrice = highPrice;
        currentPrice = lowPrice;
      }

      const discountPercent =
        currentPrice != null && originalPrice != null && originalPrice > currentPrice
          ? Math.round((1 - currentPrice / originalPrice) * 100)
          : null;

      return {
        currentPrice,
        originalPrice,
        discountPercent,
        installmentInfo: null,
      };
    }
  }
  return null;
}

function fromMainDom(html: string): MercadoLivreExtractedPrices | null {
  const $ = load(html);
  const block =
    $(".ui-pdp-container__row--price").first() ||
    $(".ui-pdp-price__main-container").first() ||
    $(".ui-pdp-price").first();

  const root = block.length ? block : $("body");
  const candidates: PriceCandidate[] = [];
  root.find("*").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || !/R\$/i.test(text)) return;
    if (isInstallmentText(text) || isSecondaryPriceText(text)) return;
    const n = parseBRL(text);
    if (n == null) return;
    const cls = ($(el).attr("class") || "").toLowerCase();
    const source = cls.includes("previous") || cls.includes("original")
      ? "dom-original"
      : "dom-current";
    candidates.push({ value: n, source, text });
  });
  console.log("[ml-price-extractor] dom-candidates", {
    count: candidates.length,
    preview: candidates.slice(0, 6).map((c) => ({ value: c.value, source: c.source, text: c.text.slice(0, 60) })),
  });

  const original = candidates.filter((c) => c.source === "dom-original").map((c) => c.value);
  const current = candidates.filter((c) => c.source === "dom-current").map((c) => c.value);

  let originalPrice: number | null = original.length ? Math.max(...original) : null;
  let currentPrice: number | null = current.length ? current[0] : null;

  if (currentPrice == null && candidates.length) currentPrice = candidates[0].value;
  if (originalPrice != null && currentPrice != null && originalPrice <= currentPrice) {
    originalPrice = null;
  }

  const installmentInfo = firstNonEmpty([
    $(".ui-pdp-price__second-line").first().text(),
    $(".poly-price__installments").first().text(),
  ]);

  if (currentPrice == null) return null;
  return {
    currentPrice,
    originalPrice,
    discountPercent:
      currentPrice != null && originalPrice != null && originalPrice > currentPrice
        ? Math.round((1 - currentPrice / originalPrice) * 100)
        : extractDiscountPercent(root.text()),
    installmentInfo,
  };
}

function fromVisibleText(html: string): MercadoLivreExtractedPrices | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const re = /R\$\s*[\d.]+(?:,\d{1,2})?/gi;
  const vals: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const snippet = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.index + 80));
    if (isInstallmentText(snippet) || isSecondaryPriceText(snippet)) continue;
    const n = parseBRL(m[0]);
    if (n != null) vals.push(n);
    if (vals.length >= 8) break;
  }
  if (!vals.length) return null;
  return {
    currentPrice: vals[0] ?? null,
    originalPrice: vals.length >= 2 && vals[1] > vals[0] ? vals[1] : null,
    discountPercent: null,
    installmentInfo: null,
  };
}

export function extractMercadoLivrePrices(html: string): MercadoLivreExtractedPrices {
  const structured = fromStructuredData(html);
  if (structured?.currentPrice != null) {
    console.log("[ml-price-extractor] strategy=json-ld", structured);
    return structured;
  }

  const dom = fromMainDom(html);
  if (dom?.currentPrice != null) {
    console.log("[ml-price-extractor] strategy=dom-main", dom);
    return dom;
  }

  const fallback = fromVisibleText(html);
  if (fallback?.currentPrice != null) {
    console.log("[ml-price-extractor] strategy=fallback-text", fallback);
    return fallback;
  }

  const none = { currentPrice: null, originalPrice: null, discountPercent: null, installmentInfo: null };
  console.log("[ml-price-extractor] strategy=none", none);
  return none;
}

