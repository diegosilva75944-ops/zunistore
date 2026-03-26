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

function parseAntesFromAriaLabel(ariaLabel: string | undefined | null): number | null {
  // Ex.: "Antes: 1000 reais com 70 centavos"
  const m = String(ariaLabel || "").match(
    /Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/i,
  );
  if (!m) return null;
  const reais = Number(String(m[1] ?? "").replace(/\./g, ""));
  const cents = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(reais) || !Number.isFinite(cents)) return null;
  const n = reais + cents / 100;
  return n > 0 ? n : null;
}

function parseReaisFromAriaLabel(ariaLabel: string | undefined | null): number | null {
  // Ex.: "720 reais com 90 centavos"
  const m = String(ariaLabel || "").match(/([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/i);
  if (!m) return null;
  const reais = Number(String(m[1] ?? "").replace(/\./g, ""));
  const cents = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(reais) || !Number.isFinite(cents)) return null;
  const n = reais + cents / 100;
  return n > 0 ? n : null;
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

  // 1) Extrações explícitas (usam exatamente os blocos que você mandou).
  // - Preço normal (Antes: ...): <s ... aria-label="Antes: ...">
  // - Preço promocional (offers + meta itemprop=price): <span ... itemprop="offers"><meta itemprop="price" content="...">
  const originalAria = $("s[aria-label]")
    .filter((_, el) => /^Antes:/i.test($(el).attr("aria-label") || ""))
    .first()
    .attr("aria-label");
  const originalPriceFromAria = parseAntesFromAriaLabel(originalAria);

  const promoMeta = $('[itemprop="offers"] meta[itemprop="price"]').first().attr("content");
  const promoFromMeta =
    promoMeta != null && promoMeta.trim()
      ? Math.round(Number(promoMeta) * 100) / 100
      : null;
  const promoFromMetaNorm =
    promoFromMeta != null && Number.isFinite(promoFromMeta) && promoFromMeta > 0 ? promoFromMeta : null;

  // Caso meta não exista, tenta aria-label do bloco de ofertas.
  const promoOffersAria = $('[itemprop="offers"][aria-label]').first().attr("aria-label");
  const promoFromAria = parseReaisFromAriaLabel(promoOffersAria);

  const installmentInfo = firstNonEmpty([
    $(".ui-pdp-price__second-line").first().text(),
    $(".poly-price__installments").first().text(),
  ]);

  // 2) Se conseguimos current e/ou original via blocos explícitos, usamos eles.
  let currentPrice: number | null = promoFromMetaNorm ?? promoFromAria ?? null;
  let originalPrice: number | null = originalPriceFromAria ?? null;

  // 3) Se faltou algo, cai para o fallback por "candidates" (texto + classes).
  const candidates: PriceCandidate[] = [];
  if (currentPrice == null || originalPrice == null) {
    root.find("*").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (!text || !/R\$/i.test(text)) return;
      if (isInstallmentText(text) || isSecondaryPriceText(text)) return;
      const n = parseBRL(text);
      if (n == null) return;
      const cls = ($(el).attr("class") || "").toLowerCase();
      const source =
        cls.includes("previous") || cls.includes("original") ? "dom-original" : "dom-current";
      candidates.push({ value: n, source, text });
    });
  }

  const original = candidates.filter((c) => c.source === "dom-original").map((c) => c.value);
  const current = candidates.filter((c) => c.source === "dom-current").map((c) => c.value);

  if (originalPrice == null && original.length) originalPrice = Math.max(...original);
  if (currentPrice == null && current.length) currentPrice = current[0];
  if (currentPrice == null && candidates.length) currentPrice = candidates[0].value;

  if (originalPrice != null && currentPrice != null && originalPrice <= currentPrice) {
    originalPrice = null;
  }

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
  const dom = fromMainDom(html);

  // Se JSON-LD trouxe só o preço atual (currentPrice) mas não trouxe "alto/antes"
  // (originalPrice), completamos com o DOM para suportar o sync/import da mesma
  // forma que a extensão.
  if (structured?.currentPrice != null) {
    if (structured.originalPrice == null && dom?.originalPrice != null) {
      console.log("[ml-price-extractor] strategy=json-ld+dom-merge", { structured, dom });
      return {
        ...structured,
        currentPrice: dom.currentPrice ?? structured.currentPrice,
        originalPrice: dom.originalPrice,
        discountPercent: dom.discountPercent ?? structured.discountPercent,
        installmentInfo: dom.installmentInfo ?? structured.installmentInfo,
      };
    }
    console.log("[ml-price-extractor] strategy=json-ld", structured);
    return structured;
  }

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

