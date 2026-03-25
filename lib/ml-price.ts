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
  // Em algumas páginas, o ML renderiza um "buy box offers" que pode
  // conter valores duplicados (ou alternativos) do preço.
  // Para manter consistência com a importação/extensão, removemos
  // esse bloco da análise quando existir.
  const htmlToParse =
    html.includes("ui-pdp-buy-box-offers__desktop") || html.includes("ui-pdp-buybox-offers-wrapper")
      ? html
          // Remove blocks do ML que podem duplicar/alterar valores do preço.
          .replace(
            /<[^>]*class=["'][^"']*ui-pdp-buy-box-offers__desktop[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
            "",
          )
          .replace(
            /<[^>]*class=["'][^"']*ui-pdp-buybox-offers-wrapper[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
            "",
          )
      : html;

  let originalPrice: number | null = null;
  let promoPrice: number | null = null;
  // Candidatos a partir de blocos "de preço" renderizados pelo ML (DOM-like via regex).
  // Usamos como fallback, mas quando existir "original" (Antes: ...), o preço normal deve vir dele.
  let domPrice: number | null = null;
  let domPromoPrice: number | null = null;

  function parseNumberLikeMl(raw: string): number | null {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    // Remove separador de milhar "." e converte decimal "," -> "."
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function extractOriginalFromPricePart(): number | null {
    // Você mostrou o caso:
    // data-testid="price-part" ... aria-label="Antes: 369 reais" ...
    // Aqui extraímos do aria-label dentro do "price-part".
    const m = htmlToParse.match(
      /data-testid=["']price-part["'][\s\S]{0,1200}?aria-label=["']Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?["']/i,
    );
    if (!m) return null;
    const reais = Number(String(m[1] ?? "").replace(/\./g, ""));
    const centavos = m[2] ? Number(m[2]) : 0;
    if (!Number.isFinite(reais) || !Number.isFinite(centavos)) return null;
    const v = reais + centavos / 100;
    return v > 0 ? v : null;
  }

  function extractOfferFromSecondLine(): number | null {
    // Caso de oferta:
    // ui-pdp-price__second-line ... itemprop="offers" ... andes-money-amount__fraction[data-andes-money-amount-fraction] > VALOR
    // (às vezes tem também andes-money-amount__cents; quando existir, somamos fraction+cents)
    const blockMatch = html.match(
      /ui-pdp-price__second-line[\s\S]{0,8000}?itemprop=["']offers["'][\s\S]{0,5000}?andes-money-amount__fraction[^>]*data-andes-money-amount-fraction[^>]*>\s*([^<]+?)\s*</i,
    );
    if (!blockMatch) return null;
    const fraction = parseNumberLikeMl(blockMatch[1] ?? "");
    if (fraction == null) return null;

    const centsMatch = html.match(
      /ui-pdp-price__second-line[\s\S]{0,8000}?itemprop=["']offers["'][\s\S]{0,5000}?andes-money-amount__cents[^>]*>\s*(\d{1,2})\s*</i,
    );

    if (centsMatch?.[1]) {
      const cents = Number(centsMatch[1]);
      if (Number.isFinite(cents)) {
        // fraction pode vir sem centavos; tratamos como "reais"
        const combined = Math.floor(fraction) + cents / 100;
        return combined > 0 ? combined : null;
      }
    }

    return fraction;
  }

  // Preferir exatamente o bloco pedido: ui-pdp-container__row--price
  // onde 1ª linha = preço normal, 2ª linha = promo (se existir) e 3ª linha = cartão/parcelas.
  // Isso evita que o parser confunda parcelas (ex: 39,33) como promo.
  const lower = htmlToParse.toLowerCase();
  const priceRowIdx = lower.indexOf("ui-pdp-container__row--price");
  if (priceRowIdx !== -1) {
    const block = htmlToParse.slice(priceRowIdx, priceRowIdx + 20000);
    const amountRe =
      /andes-money-amount__fraction[^>]*>([\d.]+)[\s\S]{0,250}?andes-money-amount__cents[^>]*>(\d{1,2})/gi;

    const amounts: number[] = [];
    for (const m of block.matchAll(amountRe)) {
      const fractionStr = (m[1] || "").replace(/\./g, "");
      const centsStr = (m[2] || "00").padStart(2, "0");
      if (!fractionStr) continue;
      const n = parseFloat(`${fractionStr}.${centsStr}`);
      if (Number.isFinite(n) && n > 0) amounts.push(n);
      if (amounts.length >= 3) break;
    }

    // Modelo da extensão (content_script): usa a ordem DOM para
    // 1ª linha = preço normal, 2ª linha = promo (se existir).
    domPrice = amounts[0] ?? null;
    const promoLine = amounts[1] ?? null;
    domPromoPrice = promoLine != null && domPrice != null && promoLine < domPrice ? promoLine : null;
  }

  // Prioridade: ui-pdp-price__main-container (quando existir, tenta 3 linhas em ordem).
  // 1ª linha: preço normal (price)
  // 2ª e 3ª linha: preço promocional / no cartão (promoPrice = menor entre elas, quando for menor que line1)
  const startIdx = lower.indexOf("ui-pdp-price__main-container");
  if (startIdx !== -1) {
    // Em HTML bruto (server-side), o bloco pode ser maior que 3000 chars;
    // aumentamos a janela para capturar 1ª, 2ª e 3ª linha.
    const mainBlock = htmlToParse.slice(startIdx, startIdx + 20000);

    const amounts: number[] = [];
    // Captura blocos de `andes-money-amount` e lê fraction+cents dentro de cada bloco.
    // Depois filtramos os que contêm `--previous` (mesma lógica do content_script).
    const amountBlockRe =
      /<[^>]*class=["'][^"']*andes-money-amount[^"']*["'][^>]*>[\s\S]{0,600}?andes-money-amount__fraction[^>]*>([\d.]+)<\/[^>]*>[\s\S]{0,300}?andes-money-amount__cents[^>]*>(\d{1,2})<\/[^>]*>/gi;

    for (const m of mainBlock.matchAll(amountBlockRe)) {
      const blockStr = m[0] || "";
      if (blockStr.includes("andes-money-amount--previous") || blockStr.includes("--previous")) continue;

      const fractionStr = (m[1] || "").replace(/\./g, "");
      const centsStr = (m[2] || "00").padStart(2, "0");
      if (!fractionStr) continue;

      const n = parseFloat(`${fractionStr}.${centsStr}`);
      if (Number.isFinite(n) && n > 0) amounts.push(n);
      if (amounts.length >= 3) break;
    }

    const line1 = amounts[0];
    if (line1 != null) {
      // A 3ª linha pode trazer o valor da parcela no cartão (ex: "6x de R$39,33"),
      // então o preço promocional vem da 2ª linha.
      const promoLine = amounts[1];
      const promo = promoLine != null && promoLine < line1 ? promoLine : null;
      domPrice = line1;
      domPromoPrice = promo;
    }
  }

  // Original: aria-label="Antes: N reais (com N centavos)" (igual à extensão)
  originalPrice = extractOriginalFromPricePart();
  // Fallback: aria-label "Antes:" fora do price-part (casos variantes)
  if (originalPrice == null) {
    const ariaMatch = htmlToParse.match(
      /aria-label=["']Antes:\s*([\d.]+)\s*reais?\s*(?:com\s*)?(\d+)?\s*centavos?["']/i,
    );
    if (ariaMatch) {
      const reais = Number(String(ariaMatch[1] ?? "").replace(/\./g, ""));
      const centavos = ariaMatch[2] ? Number(ariaMatch[2]) : 0;
      if (Number.isFinite(reais) && Number.isFinite(centavos)) {
        originalPrice = reais + centavos / 100;
      }
    }
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

  // Promo (prioridade): oferta no "second-line" (itemprop="offers") com meta itemprop="price"
  // Ex.: ... ui-pdp-price__second-line ... <meta itemprop="price" content="359">
  promoPrice = extractOfferFromSecondLine();

  // Promo (fallback): meta itemprop="price" global (quando não achamos no second-line)
  if (promoPrice == null) {
    const metaMatch = htmlToParse.match(
      /<meta[^>]+itemprop="price"[^>]+content="([\d.]+)"/i,
    );
    if (metaMatch) {
      const n = Number(String(metaMatch[1] ?? "").trim().replace(",", "."));
      if (Number.isFinite(n) && n > 0) promoPrice = n;
    }
  }

  // Promo se null: .ui-pdp-price__second-line (segundo preço é o atual; primeiro pode ser "previous")
  if (promoPrice == null) {
    const secondLineBlock = htmlToParse.match(
      /ui-pdp-price__second-line[\s\S]{0,600}?andes-money-amount__fraction[^>]*>([\d.]+)[\s\S]{0,200}?andes-money-amount__cents[^>]*>(\d{1,2})/i,
    );
    if (secondLineBlock) {
      const frac = secondLineBlock[1].replace(/\./g, "");
      const cents = (secondLineBlock[2] || "00").padStart(2, "0");
      const n = parseFloat(`${frac}.${cents}`);
      if (Number.isFinite(n) && n > 0) promoPrice = n;
    }
    if (promoPrice == null) {
    const secondLineAlt = htmlToParse.match(
      /ui-pdp-price__second-line[\s\S]*?andes-money-amount(?!.*--previous)[\s\S]{0,400}?andes-money-amount__fraction[^>]*>([\d.]+)/i,
    );
      if (secondLineAlt) {
        const n = parseFloat(secondLineAlt[1].replace(/\./g, ""));
        if (Number.isFinite(n) && n > 0) promoPrice = n;
      }
    }
  }

  // Promo se null: [itemprop="offers"] .andes-money-amount
  if (promoPrice == null) {
    const offersBlock = htmlToParse.match(
      /itemprop="offers"[\s\S]{0,500}?andes-money-amount__fraction[^>]*>([\d.]+)/i,
    );
    if (offersBlock) {
      const n = parseFloat(offersBlock[1].replace(/\./g, ""));
      if (Number.isFinite(n) && n > 0) promoPrice = n;
    }
  }

  // Regra final (importação/extensão):
  // - Se existir "Antes: ...", o preço normal (price) deve vir desse original.
  // - A oferta (promoPrice) vem do preço atual detectado (meta/second-line/offers).
  if (originalPrice != null) {
    if (promoPrice != null && promoPrice < originalPrice) {
      return { price: originalPrice, promoPrice };
    }
    return { price: originalPrice, promoPrice: null };
  }

  // Sem "Antes": usa promoPrice como preço (quando disponível)
  if (promoPrice != null) {
    return { price: promoPrice, promoPrice: null };
  }

  // Fallback: usa candidatos DOM-like
  if (domPrice != null) {
    return { price: domPrice, promoPrice: domPromoPrice ?? null };
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
  // Prioridade semelhante ao fluxo da importação (extensão):
  // 1) DOM-like (ui-pdp-price__main-container com até 3 linhas)
  // 2) Se DOM não trouxer promo, comparar com JSON-LD
  // 3) Regex R$ como fallback
  const fromDom = extractPricesFromMlDomLike(html);
  if (fromDom && fromDom.price != null && fromDom.price > 0) {
    if (fromDom.promoPrice != null) return fromDom;

    // Se o DOM não conseguiu promo, usamos apenas o JSON-LD como fallback
    // para o campo "promoPrice" (não para o "price"), quando ele for menor.
    const fromJsonLd = extractFromJsonLd(html);
    if (
      fromJsonLd &&
      fromJsonLd.promoPrice != null &&
      Number.isFinite(fromJsonLd.promoPrice) &&
      fromJsonLd.promoPrice > 0 &&
      fromJsonLd.promoPrice < fromDom.price
    ) {
      return { price: fromDom.price, promoPrice: fromJsonLd.promoPrice };
    }

    return { price: fromDom.price, promoPrice: null };
  }

  const fromJsonLd = extractFromJsonLd(html);
  if (fromJsonLd) return fromJsonLd;

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
