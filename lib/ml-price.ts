/**
 * Extração de preços da página do Mercado Livre — alinhada à extensão (content_script + popup).
 * Ordem no HTML: 1) poly-component__price (afiliado: 1º normal, 2º promo)  2) JSON-LD  3) DOM ML  4) regex R$.
 */

function parseBRL(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d\.]+,\d{2})/);
  if (!m) return null;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Perfil social / HTML compacto: R$ 999, R$ 1.199, R$ 1.199,90 */
function parseBRLFlexible(text: string): number | null {
  const m = String(text || "").match(/R\$\s*([\d\.]+)(?:,(\d{1,2}))?/i);
  if (!m) return null;
  const intPart = m[1].replace(/\./g, "");
  const dec = m[2] != null ? m[2].padEnd(2, "0").slice(0, 2) : "00";
  const n = parseFloat(`${intPart}.${dec}`);
  return Number.isFinite(n) && n > 0 ? n : null;
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

/** Remove seção "outros vendedores" (preços paralelos que não são do anúncio principal). */
function stripOtherSellersBlocks(html: string): string {
  let out = html;
  let guard = 0;
  while (guard++ < 80) {
    const match = /<div[^>]*\bclass=["'][^"']*\bother-sellers\b[^"']*["'][^>]*>/i.exec(out);
    if (!match) break;
    const start = match.index;
    let depth = 1;
    let i = start + match[0].length;
    while (i < out.length && depth > 0) {
      const nextOpen = out.indexOf("<div", i);
      const nextClose = out.indexOf("</div>", i);
      if (nextClose === -1) {
        out = out.slice(0, start) + out.slice(start + match[0].length);
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + 4;
      } else {
        depth -= 1;
        i = nextClose + 6;
      }
    }
    if (depth === 0) {
      out = out.slice(0, start) + out.slice(i);
    }
  }
  return out;
}

/** Remove blocos de buy-box/sticky que duplicam preços no HTML (mantém os mesmos critérios já usados no sync). */
function sanitizeMlHtmlForPrice(html: string): string {
  return stripOtherSellersBlocks(html)
    .replace(
      /<[^>]*class=["'][^"']*ui-pdp-buy-box-offers__desktop[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(
      /<[^>]*class=["'][^"']*ui-pdp-buybox-offers-wrapper[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(
      /<div[^>]*class=["'][^"']*ui-pdp--sticky-wrapper[^"']*ui-pdp--sticky-wrapper-right[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(
      /<li[^>]*class=["'][^"']*ui-pdp-buy-box-offers__offer-list-item[^"']*["'][^>]*>[\s\S]*?<\/li>/gi,
      "",
    );
}

/** "Antes: 499 reais com 90 centavos" dentro do próprio HTML (ex.: aria-label da faixa de preço). */
function extractAntesPriceFromAria(fragment: string): number | null {
  const m = fragment.match(
    /aria-label=["']Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?["']/i,
  );
  if (!m) return null;
  const reais = Number(String(m[1] ?? "").replace(/\./g, ""));
  const centavos = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(reais) || !Number.isFinite(centavos)) return null;
  const v = reais + centavos / 100;
  return v > 0 ? v : null;
}

/** Evita tratar parcelamento (ex.: "10x" de R$ 10,00) como "2º preço" do produto. */
function pairTwoMeaningfulPrices(sortedDesc: number[]): { price: number; promoPrice: number | null } | null {
  const uniq = [...new Set(sortedDesc)].sort((a, b) => b - a);
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return { price: uniq[0], promoPrice: null };
  const a0 = uniq[0];
  const a1 = uniq[1];
  const plausiblePair = a1 >= a0 * 0.12 || (a1 >= 50 && a0 > 100);
  if (plausiblePair && a0 > a1) return { price: a0, promoPrice: a1 };
  return { price: a0, promoPrice: null };
}

/**
 * Replica extractPricesFromMlDom da extensão (content_script) usando regex no HTML.
 * 1) Preço original: .ui-pdp-price__original-value ou .andes-money-amount--previous (parseAndesMoney ou aria-label)
 * 2) Preço promo: meta[itemprop="price"]
 * 3) Promo se null: .ui-pdp-price__second-line .andes-money-amount (não --previous)
 * 4) Promo se null: [itemprop="offers"] .andes-money-amount
 */
/** `htmlToParse` deve vir de sanitizeMlHtmlForPrice (evita ruído de buy-box / sticky). */
function extractPricesFromMlDomLike(htmlToParse: string): { price: number; promoPrice: number | null } | null {
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
    const blockMatch = htmlToParse.match(
      /ui-pdp-price__second-line[\s\S]{0,8000}?itemprop=["']offers["'][\s\S]{0,5000}?andes-money-amount__fraction[^>]*data-andes-money-amount-fraction[^>]*>\s*([^<]+?)\s*</i,
    );
    if (!blockMatch) return null;
    const fraction = parseNumberLikeMl(blockMatch[1] ?? "");
    if (fraction == null) return null;

    const centsMatch = htmlToParse.match(
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
    }

    // Ordem no HTML nem sempre coincide com a ordem no DOM (navegador). Para o mesmo
    // bloco, o par "normal + oferta" costuma ser o maior e o menor valor relevantes;
    // valores muito pequenos (ex.: parcela "10x") são descartados por plausibilidade.
    const pair = pairTwoMeaningfulPrices(amounts);
    if (pair) {
      domPrice = pair.price;
      domPromoPrice = pair.promoPrice;
    }
  }

  // Igual à importação (extensão): se achou preço pelo container principal,
  // não deve cair em fallbacks globais (meta/offers) que misturam outras ofertas.
  if (domPrice != null) {
    return { price: domPrice, promoPrice: domPromoPrice ?? null };
  }

  // Prioridade: ui-pdp-price__main-container (quando existir, tenta 3 linhas em ordem).
  // 1ª linha: preço normal (price)
  // 2ª linha: promo (quando existir); 3ª costuma ser cartão/parcelas.
  const startIdx = lower.indexOf("ui-pdp-price__main-container");
  if (startIdx !== -1) {
    // Em HTML bruto (server-side), o bloco pode ser maior; aumentamos a janela.
    const mainBlock = htmlToParse.slice(startIdx, startIdx + 20000);

    const amounts: number[] = [];
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
    }

    const pairMain = pairTwoMeaningfulPrices(amounts);
    if (pairMain) return pairMain;
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
    const previousBlock = htmlToParse.match(
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

  // Fallback (importação/extensão):
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

  return null;
}

/** Meta global (head) — às vezes o único preço estável no HTML bruto do servidor. */
function extractMetaItempropPrice(html: string): number | null {
  const m =
    html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i) ??
    html.match(/<meta[^>]+content=["']([\d.,]+)["'][^>]+itemprop=["']price["']/i);
  if (!m) return null;
  const n = Number(String(m[1] ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Replica findPromoAndPrice da extensão (popup): regex (de )?R$ X,XX no texto */
function findPromoAndPrice(html: string): { price: number | null; promoPrice: number | null } {
  const snippet = html.slice(0, 450_000);
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
        return { price: p, promoPrice: null };
      }
    }
  }
  return null;
}

function htmlToVisibleText(html: string): string {
  // Aproxima `document.body.innerText` usado na extensão, evitando regex em HTML cru.
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** "1.199" (milhar BR) ou "999" → número */
function parseMlMoneyFraction(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valores monetários do primeiro `poly-component__price` na ordem do HTML (1º = normal, 2º = promocional).
 * Cada `andes-money-amount__fraction` conta; centavos no mesmo trecho até o próximo fraction são somados.
 */
function extractOrderedPolyMoneyAmounts(block: string): number[] {
  const out: number[] = [];
  const fractionRe = /andes-money-amount__fraction[^>]*>([\d.]+)<\/[^>]*>/gi;
  const matches: { index: number; fraction: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fractionRe.exec(block)) !== null) {
    matches.push({ index: m.index, fraction: m[1] ?? "" });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : block.length;
    const segment = block.slice(start, Math.min(end, start + 900));
    const cents = segment.match(/andes-money-amount__cents[^>]*>(\d{1,2})</i);
    const frac = matches[i].fraction;
    let n: number | null;
    if (cents?.[1]) {
      const fs = frac.replace(/\./g, "");
      n = parseFloat(`${fs}.${cents[1].padStart(2, "0")}`);
    } else {
      n = parseMlMoneyFraction(frac);
    }
    if (n != null && n > 0 && Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Bloco de preço em páginas com link de afiliado (poly-component), inclusive perfil social (meli.la).
 * Só o primeiro card: até o próximo `poly-component__price` — evita “Quem viu também comprou”.
 * Regra de sync (como aparece na tela):
 * - Se existir um preço riscado (normal anterior) + um preço atual no mesmo card, usar ambos.
 * - Se existir apenas um preço, é apenas preço normal.
 * Parcelas (`poly-price__installments`) são ignoradas.
 */
function extractPricesFromPolyComponent(html: string): {
  price: number;
  promoPrice: number | null;
} | null {
  const lower = html.toLowerCase();
  const idx = lower.indexOf("poly-component__price");
  if (idx === -1) return null;
  const nextPoly = lower.indexOf("poly-component__price", idx + 30);
  const blockEnd =
    nextPoly === -1 ? idx + 14_000 : Math.min(nextPoly, idx + 14_000);
  let block = html.slice(idx, blockEnd);

  const instIdx = block.toLowerCase().indexOf("poly-price__installments");
  if (instIdx !== -1) {
    block = block.slice(0, instIdx);
  }

  // 1) Preferir exatamente os dois slots do card: riscado (previous) e atual (current).
  const bLower = block.toLowerCase();
  const prevIdx = bLower.indexOf("andes-money-amount--previous");
  const curIdx = bLower.indexOf("poly-price__current");

  if (prevIdx !== -1) {
    const prevSlice = block.slice(prevIdx, Math.min(block.length, prevIdx + 2200));
    const prevAmounts = extractOrderedPolyMoneyAmounts(prevSlice);
    const prev = prevAmounts[0] ?? null;

    // current pode vir antes ou depois; se existir, pegamos o primeiro valor dentro dele
    if (curIdx !== -1) {
      const curSlice = block.slice(curIdx, Math.min(block.length, curIdx + 2600));
      const curAmounts = extractOrderedPolyMoneyAmounts(curSlice);
      const cur = curAmounts[0] ?? null;
      if (prev != null && cur != null && cur !== prev) {
        return { price: prev, promoPrice: cur };
      }
      if (prev != null) return { price: prev, promoPrice: null };
    }

    if (prev != null) return { price: prev, promoPrice: null };
  }

  if (curIdx !== -1) {
    const curSlice = block.slice(curIdx, Math.min(block.length, curIdx + 2600));
    const curAmounts = extractOrderedPolyMoneyAmounts(curSlice);
    const cur = curAmounts[0] ?? null;
    if (cur != null) return { price: cur, promoPrice: null };
  }

  // 2) Fallback: 1º/2º valores monetários no bloco (já sem parcelas)
  const amounts = extractOrderedPolyMoneyAmounts(block);
  if (amounts.length >= 1) {
    const promo = amounts.length >= 2 && amounts[1] !== amounts[0] ? amounts[1] : null;
    return { price: amounts[0], promoPrice: promo };
  }

  // 3) Último fallback: texto visível
  const vis = htmlToVisibleText(block);
  const re = /R\$\s*[\d\.]+(?:,\d{1,2})?/gi;
  const fromText: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(vis)) !== null) {
    const n = parseBRLFlexible(mm[0]);
    if (n != null && n > 0) fromText.push(n);
  }
  if (fromText.length === 0) return null;
  const p1 = fromText[0];
  const p2 = fromText.length >= 2 ? fromText[1] : null;
  return { price: p1, promoPrice: p2 != null && p2 !== p1 ? p2 : null };
}

export function extractPricesFromHtml(html: string): {
  price: number | null;
  promoPrice: number | null;
} {
  const poly = extractPricesFromPolyComponent(html);
  if (poly != null && poly.price > 0) {
    return { price: poly.price, promoPrice: poly.promoPrice };
  }

  const htmlSan = sanitizeMlHtmlForPrice(html);
  const json = extractFromJsonLd(html);

  // Alinha com a página real: JSON-LD costuma trazer o preço atual (oferta); o "Antes:"
  // no bloco de preço é o preço normal. Isso estabiliza o sync quando a ordem dos
  // .andes-money-amount no HTML difere da ordem no DOM do navegador.
  const lower = htmlSan.toLowerCase();
  const rowIdx = lower.indexOf("ui-pdp-container__row--price");
  const priceRowSlice =
    rowIdx !== -1 ? htmlSan.slice(rowIdx, rowIdx + 30000) : htmlSan;
  const antes = extractAntesPriceFromAria(priceRowSlice);
  if (json?.price != null && antes != null && antes > json.price) {
    return { price: antes, promoPrice: json.price };
  }

  // Replica o fluxo da importação (extensão/popup):
  // - tenta JSON-LD; se tiver, ajusta com DOM (quando DOM trouxer price+promo, ou quando DOM.price > json.price)
  // - se JSON-LD não trouxer promo, tenta regex em texto visível (innerText-like)
  // - se não houver JSON-LD, cai para DOM e depois regex.
  if (json) {
    const dom = extractPricesFromMlDomLike(htmlSan);
    if (dom && dom.price != null && dom.promoPrice != null) {
      return dom;
    }
    if (dom && dom.price != null && json.price != null && dom.price > json.price) {
      return { price: dom.price, promoPrice: json.price };
    }
    if (json.price != null && json.promoPrice == null) {
      const textPrices = findPromoAndPrice(htmlToVisibleText(htmlSan));
      if (textPrices.price != null && textPrices.promoPrice != null) {
        return { price: textPrices.price, promoPrice: textPrices.promoPrice };
      }
    }
    return json;
  }

  const dom = extractPricesFromMlDomLike(htmlSan);
  if (dom) return dom;

  const fromRegex = findPromoAndPrice(htmlToVisibleText(htmlSan));
  if (fromRegex.price != null && fromRegex.price > 0) {
    return { price: fromRegex.price, promoPrice: fromRegex.promoPrice };
  }

  // Fallback: só remove "outros vendedores". O sanitizeMlHtmlForPrice também remove buy-box/sticky;
  // em alguns HTMLs servidos ao fetch, o preço principal só aparece nesses blocos — sem isso o sync falhava.
  const htmlMinimal = stripOtherSellersBlocks(html);
  const metaOnly = extractMetaItempropPrice(htmlMinimal);
  if (metaOnly != null) {
    return { price: metaOnly, promoPrice: null };
  }
  const domLoose = extractPricesFromMlDomLike(htmlMinimal);
  if (domLoose) return domLoose;
  const fromLoose = findPromoAndPrice(htmlToVisibleText(htmlMinimal));
  if (fromLoose.price != null && fromLoose.price > 0) {
    return { price: fromLoose.price, promoPrice: fromLoose.promoPrice };
  }

  return { price: null, promoPrice: null };
}

const ML_FETCH_HEADERS: Record<string, string> = {
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
};

/** Segunda tentativa: HTML costuma ser mais simples e menos sujeito a tela de login. */
const ML_MOBILE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Referer: "https://www.mercadolivre.com.br/",
};

/**
 * URLs com dezenas de query params (afiliado / reco) costumam fazer o ML responder com
 * página de login, erro genérico ou HTML sem PDP. Para sync no servidor, usar só origem+path do catálogo.
 * Com `keepSearch: true` (link de afiliado do cadastro), mantém query para o ML devolver `poly-component__price`.
 */
export function normalizeMercadoLivreProductUrl(
  url: string,
  opts?: { keepSearch?: boolean },
): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!host.includes("mercadolivre.com") && !host.includes("mercadolibre.com")) {
      return raw;
    }
    if (opts?.keepSearch) {
      return `${u.origin}${u.pathname}${u.search}`;
    }
    if (/\/p\/MLB\d+/i.test(u.pathname)) {
      return `${u.origin}${u.pathname}`;
    }
    if (/\/MLB-?\d{6,}/i.test(u.pathname)) {
      return `${u.origin}${u.pathname}`;
    }
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}

/** Prioriza `affiliate_url` (HTML com poly-component; meli.la redireciona para ML). Senão `source_url`. */
export function resolveMercadoLivreFetchUrl(
  sourceUrl: string | null | undefined,
  affiliateUrl: string | null | undefined,
): string {
  const aff = String(affiliateUrl ?? "").trim();
  const src = String(sourceUrl ?? "").trim();
  if (aff) {
    try {
      const h = new URL(aff).hostname.toLowerCase();
      if (h === "meli.la" || h.endsWith(".meli.la")) {
        return aff;
      }
    } catch {
      /* ignore */
    }
    return normalizeMercadoLivreProductUrl(aff, { keepSearch: true });
  }
  if (src) {
    return normalizeMercadoLivreProductUrl(src, { keepSearch: false });
  }
  return "";
}

/** String = URL já escolhida; objeto = prioriza afiliado no servidor. */
export type FetchMlPriceInput =
  | string
  | { sourceUrl?: string | null; affiliateUrl?: string | null };

const ML_FETCH_TIMEOUT_MS = 45_000;

/** Resultado da busca de preço no ML (não confundir “sem preço legível” com “anúncio removido”). */
export type FetchMlPriceResult =
  | { kind: "ok"; price: number; promoPrice: number | null }
  | { kind: "listing_gone" }
  | { kind: "unreadable" }
  | { kind: "blocked" }
  | { kind: "http_error"; status: number };

/** ML devolve login, cookie gate ou “ocorreu um erro” para fetch sem sessão / URL “sujo”. */
function looksLikeMlBlockedOrChallenge(html: string): boolean {
  const s = html.slice(0, 320_000).toLowerCase();
  if (
    /ui-pdp-price__main-container|poly-component__price|perfil\s+social|andes-money-amount__fraction|schema\.org\/product|"@type"\s*:\s*"product"/i.test(
      s,
    )
  ) {
    return false;
  }
  return (
    /para continuar,?\s*acesse\s+sua\s+conta/i.test(s) ||
    (/\bsou\s+novo\b/i.test(s) && /\bj[aá]\s+tenho\s+conta\b/i.test(s)) ||
    /ocorreu um erro\.?\s*por favor,?\s*tente novamente/i.test(s) ||
    /entre\s+com\s+sua\s+conta|fa[cç]a\s+login/i.test(s)
  );
}

function looksLikeMlListingMissing(html: string): boolean {
  const sample = html.slice(0, 450_000).toLowerCase();
  return (
    /não encontramos esta página|nao encontramos esta pagina/i.test(sample) ||
    /esta página não existe|esta pagina nao existe/i.test(sample) ||
    /não está mais disponível|nao esta mais disponivel/i.test(sample) ||
    /este produto não está mais disponível|este produto nao esta mais disponivel/i.test(sample) ||
    /produto não encontrado|produto nao encontrado/i.test(sample) ||
    /ops!\s*[^<]{0,80}(não encontramos|erro)/i.test(sample)
  );
}

function packOk(price: number, promoPrice: number | null): FetchMlPriceResult {
  const promoNorm =
    promoPrice != null && Number.isFinite(promoPrice) && promoPrice > 0 ? promoPrice : null;
  return { kind: "ok", price, promoPrice: promoNorm };
}

async function fetchMlHtmlOnce(
  fetchUrl: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(fetchUrl, {
    cache: "no-store",
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(ML_FETCH_TIMEOUT_MS),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function fetchPricesFromUrl(input: FetchMlPriceInput): Promise<FetchMlPriceResult> {
  const fetchUrl =
    typeof input === "string"
      ? normalizeMercadoLivreProductUrl(input)
      : resolveMercadoLivreFetchUrl(input.sourceUrl, input.affiliateUrl);
  if (!fetchUrl) {
    return { kind: "unreadable" };
  }
  try {
    const first = await fetchMlHtmlOnce(fetchUrl, ML_FETCH_HEADERS);
    if (!first.ok) {
      if (first.status === 404 || first.status === 410) {
        return { kind: "listing_gone" };
      }
      return { kind: "http_error", status: first.status };
    }

    let html = first.text;
    let triedMobile = false;

    if (looksLikeMlBlockedOrChallenge(html)) {
      triedMobile = true;
      const second = await fetchMlHtmlOnce(fetchUrl, ML_MOBILE_HEADERS);
      if (second.ok && !looksLikeMlBlockedOrChallenge(second.text)) {
        html = second.text;
      } else {
        return { kind: "blocked" };
      }
    }

    let { price, promoPrice } = extractPricesFromHtml(html);

    if (price != null && Number.isFinite(price) && price > 0) {
      return packOk(price, promoPrice);
    }

    if (looksLikeMlListingMissing(html)) {
      return { kind: "listing_gone" };
    }

    if (!triedMobile) {
      const mobile = await fetchMlHtmlOnce(fetchUrl, ML_MOBILE_HEADERS);
      if (mobile.ok && !looksLikeMlBlockedOrChallenge(mobile.text)) {
        ({ price, promoPrice } = extractPricesFromHtml(mobile.text));
        if (price != null && Number.isFinite(price) && price > 0) {
          return packOk(price, promoPrice);
        }
        if (looksLikeMlListingMissing(mobile.text)) {
          return { kind: "listing_gone" };
        }
      }
    }

    return { kind: "unreadable" };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(
        `Tempo esgotado (${ML_FETCH_TIMEOUT_MS / 1000}s) ao buscar a página do Mercado Livre.`,
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}
