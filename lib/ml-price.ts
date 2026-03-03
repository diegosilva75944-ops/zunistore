/**
 * Extração de preços da página do Mercado Livre — mesma lógica da extensão (content_script + popup).
 * Ordem: 1) JSON-LD (Product/offers)  2) DOM-like (meta, aria, classes ML)  3) findPromoAndPrice (regex R$).
 */

function parseBRL(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Simula parseAndesMoney da extensão: fraction (ex: 1.234) + cents (ex: 56) -> número */
function parseAndesMoneyFromHtml(block: string): number | null {
  const fractionMatch = block.match(/andes-money-amount__fraction[^>]*>([\d.]+)</i);
  if (!fractionMatch) return null;
  const fractionStr = fractionMatch[1].replace(/\./g, "");
  const centsMatch = block.match(/andes-money-amount__cents[^>]*>(\d{1,2})</i);
  const centsStr = centsMatch && centsMatch[1] ? centsMatch[1].padStart(2, "0") : "00";
  const n = parseFloat(`${fractionStr}.${centsStr}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Replica extractPricesFromMlDom da extensão (content_script) usando regex no HTML.
 * 1) Preço original: .ui-pdp-price__original-value ou .andes-money-amount--previous (parseAndesMoney ou aria-label)
 * 2) Preço promo: meta[itemprop="price"]
 * 3) Promo se null: .ui-pdp-price__second-line .andes-money-amount (não --previous)
 * 4) Promo se null: [itemprop="offers"] .andes-money-amount
 */
function extractPricesFromMlDomLike(html: string): { price: number; promoPrice: number | null } | null {
  let originalPrice: number | null = null;
  let promoPrice: number | null = null;

  // Original: aria-label="Antes: N reais (com N centavos)" (igual à extensão)
  const ariaMatch = html.match(/aria-label="Antes:\s*(\d+)\s*reais?\s*(?:com\s*)?(\d+)?\s*centavos?"/i);
  if (ariaMatch) {
    const reais = parseInt(ariaMatch[1], 10);
    const centavos = ariaMatch[2] ? parseInt(ariaMatch[2], 10) : 0;
    originalPrice = reais + centavos / 100;
  }

  // Original: bloco com andes-money-amount--previous ou ui-pdp-price__original-value (parseAndesMoney)
  if (originalPrice == null) {
    const previousBlock = html.match(
      /(?:andes-money-amount--previous|ui-pdp-price__original-value)[^>]*(?:>|[\s\S]{0,800}?)([\s\S]{0,500})/i,
    );
    if (previousBlock) {
      const parsed = parseAndesMoneyFromHtml(previousBlock[1]);
      if (parsed != null) originalPrice = parsed;
    }
  }

  // Promo: meta itemprop="price" (igual à extensão)
  const metaMatch = html.match(/<meta[^>]+itemprop="price"[^>]+content="([\d.]+)"/i);
  if (metaMatch) promoPrice = parseFloat(metaMatch[1]);

  // Promo se null: .ui-pdp-price__second-line (segundo preço é o atual; primeiro pode ser "previous")
  if (promoPrice == null) {
    const secondLineBlock = html.match(/ui-pdp-price__second-line[\s\S]{0,600}?andes-money-amount__fraction[^>]*>([\d.]+)[\s\S]{0,200}?andes-money-amount__cents[^>]*>(\d{1,2})/i);
    if (secondLineBlock) {
      const frac = secondLineBlock[1].replace(/\./g, "");
      const cents = (secondLineBlock[2] || "00").padStart(2, "0");
      const n = parseFloat(`${frac}.${cents}`);
      if (Number.isFinite(n) && n > 0) promoPrice = n;
    }
    if (promoPrice == null) {
      const secondLineAlt = html.match(/ui-pdp-price__second-line[\s\S]*?andes-money-amount(?!.*--previous)[\s\S]{0,400}?andes-money-amount__fraction[^>]*>([\d.]+)/i);
      if (secondLineAlt) {
        const n = parseFloat(secondLineAlt[1].replace(/\./g, ""));
        if (Number.isFinite(n) && n > 0) promoPrice = n;
      }
    }
  }

  // Promo se null: [itemprop="offers"] .andes-money-amount
  if (promoPrice == null) {
    const offersBlock = html.match(/itemprop="offers"[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([\d.]+)/i);
    if (offersBlock) {
      const n = parseFloat(offersBlock[1].replace(/\./g, ""));
      if (Number.isFinite(n) && n > 0) promoPrice = n;
    }
  }

  if (originalPrice != null && promoPrice != null && promoPrice < originalPrice) {
    return { price: originalPrice, promoPrice };
  }
  if (originalPrice != null && promoPrice == null) {
    return { price: originalPrice, promoPrice: null };
  }
  if (promoPrice != null && originalPrice == null) {
    return { price: promoPrice, promoPrice: null };
  }
  return null;
}

/** Replica findPromoAndPrice da extensão (popup): regex (de )?R$ X,XX no texto */
function findPromoAndPrice(html: string): { price: number | null; promoPrice: number | null } {
  const snippet = html.slice(0, 50000);
  const re = /(de\s*)?(R\$\s*[\d\.]+,\d{2})/gi;
  const found: { n: number; isOld: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet)) !== null) {
    const isOld = !!m[1];
    const n = parseBRL(m[2]);
    if (n != null) found.push({ n, isOld });
    if (found.length >= 10) break;
  }
  const olds = found.filter((x) => x.isOld).map((x) => x.n);
  const news = found.filter((x) => !x.isOld).map((x) => x.n);
  if (olds.length && news.length) {
    const price = Math.max(...olds);
    const promoPrice = Math.min(...news);
    if (promoPrice < price) return { price, promoPrice };
  }
  const nums = found.map((x) => x.n);
  if (nums.length >= 2) {
    const sorted = [...new Set(nums)].sort((a, b) => b - a);
    const price = sorted[0];
    const promoPrice = sorted[1];
    if (promoPrice < price) return { price, promoPrice };
    return { price, promoPrice: null };
  }
  if (nums.length === 1) return { price: nums[0], promoPrice: null };
  return { price: null, promoPrice: null };
}

/** JSON-LD: Product offers (highPrice/lowPrice ou price) — igual à extensão fromJsonLd */
function extractFromJsonLd(html: string): { price: number; promoPrice: number | null } | null {
  const scriptRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const arr = Array.isArray(data) ? data : [data];
    for (const obj of arr) {
      if (!obj || typeof obj !== "object") continue;
      const type = (obj as any)["@type"];
      const isProduct =
        type === "Product" ||
        (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;
      const offers = (obj as any).offers;
      if (!offers) continue;
      const single = !Array.isArray(offers) ? offers : offers[0];
      if (!single) continue;
      const high = single.highPrice != null ? Number(single.highPrice) : null;
      const low = single.lowPrice != null ? Number(single.lowPrice) : null;
      const p = single.price != null ? Number(single.price) : null;
      if (high != null && low != null && high > low && high > 0) {
        return { price: high, promoPrice: low };
      }
      if (p != null && p > 0) {
        // Igual extensão: se só tem price, tentar original no HTML; se original > price -> oferta
        const dom = extractPricesFromMlDomLike(html);
        if (dom && dom.price > p) return { price: dom.price, promoPrice: p };
        const regex = findPromoAndPrice(html);
        if (regex.price != null && regex.price > p) return { price: regex.price, promoPrice: p };
        return { price: p, promoPrice: null };
      }
    }
  }
  return null;
}

export function extractPricesFromHtml(html: string): {
  price: number | null;
  promoPrice: number | null;
} {
  // 1) JSON-LD (igual extensão: fromJsonLd)
  const fromJsonLd = extractFromJsonLd(html);
  if (fromJsonLd) return fromJsonLd;

  // 2) DOM-like: meta, aria, classes ML (igual extensão: extractPricesFromMlDom)
  const fromDom = extractPricesFromMlDomLike(html);
  if (fromDom) return fromDom;

  // 3) Regex R$ (igual extensão: findPromoAndPrice no body)
  const fromRegex = findPromoAndPrice(html);
  if (fromRegex.price != null && fromRegex.price > 0) {
    return { price: fromRegex.price, promoPrice: fromRegex.promoPrice };
  }

  return { price: null, promoPrice: null };
}

const ML_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://www.mercadolivre.com.br/",
  "sec-ch-ua":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
} as const;

export async function fetchPricesFromUrl(url: string): Promise<{
  price: number;
  promoPrice: number | null;
} | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: ML_FETCH_HEADERS,
    });
    if (!res.ok) return null;

    const html = await res.text();
    const { price, promoPrice } = extractPricesFromHtml(html);

    if (!price || !Number.isFinite(price) || price <= 0) return null;

    return { price, promoPrice };
  } catch {
    return null;
  }
}
