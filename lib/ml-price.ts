/**
 * Extração de preços da página do Mercado Livre — mesma lógica da extensão (content_script + popup).
 * Ordem: 1) JSON-LD (Product/offers)  2) DOM-like (meta, aria, classes ML)  3) findPromoAndPrice (regex R$).
 *
 * PDP (buy box): o ML renderiza valores em `.andes-money-amount` com `.andes-money-amount__fraction`
 * e `.andes-money-amount__cents` (às vezes `andes-money-amount__cents--superscript-36`). No HTML do
 * fetch/SSR esses spans podem divergir do preço que o usuário vê após hidratação. O mesmo bloco
 * costuma ter `aria-label="N reais com NN centavos"` (ou `Antes: …`) no elemento acessível — essa
 * string costuma ser a fonte correta; por isso priorizamos `extractAriaLabelPriceSequenceFromFragment`
 * dentro de `ui-pdp-price__main-container` / `ui-pdp-container__row--price` antes de parear fraction+cents.
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
 * HTML do ML costuma ter "Outros vendedores" depois do buy box; tudo após a primeira
 * tag com classe *other-sellers* pode trazer preços paralelos — não entra no parse.
 * (Evita cortar no meio de script/string que mencione a palavra sem ser classe.)
 */
function sliceHtmlBeforeOtherSellers(html: string): string {
  const re =
    /<[a-z][a-z0-9]*[^>]*\bclass\s*=\s*["'][^"']*\bother-sellers\b[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  let first: number | null = null;
  while ((m = re.exec(html)) !== null) {
    if (first === null || m.index < first) first = m.index;
  }
  if (first === null) return html;
  return html.slice(0, first);
}

/** Remove tags aninhadas com classe *other-sellers* (div, section, article, aside). */
function stripBalancedBlockByTag(
  html: string,
  tagName: string,
): string {
  const openNeedle = new RegExp(
    `<${tagName}[^>]*\\bclass=["'][^"']*\\bother-sellers\\b[^"']*["'][^>]*>`,
    "i",
  );
  const openTag = `<${tagName.toLowerCase()}`;
  const closeTag = `</${tagName.toLowerCase()}>`;
  let out = html;
  let guard = 0;
  while (guard++ < 80) {
    const match = openNeedle.exec(out);
    if (!match) break;
    const start = match.index;
    let depth = 1;
    let i = start + match[0].length;
    while (i < out.length && depth > 0) {
      const nextOpen = out.toLowerCase().indexOf(openTag, i);
      const nextClose = out.toLowerCase().indexOf(closeTag, i);
      if (nextClose === -1) {
        out = out.slice(0, start) + out.slice(start + match[0].length);
        break;
      }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        i = nextOpen + openTag.length;
      } else {
        depth -= 1;
        i = nextClose + closeTag.length;
      }
    }
    if (depth === 0) {
      out = out.slice(0, start) + out.slice(i);
    }
  }
  return out;
}

/** Remove seção "outros vendedores" (vários formatos de tag no ML). */
function stripOtherSellersBlocks(html: string): string {
  let out = html;
  for (const tag of ["div", "section", "article", "aside"] as const) {
    out = stripBalancedBlockByTag(out, tag);
  }
  return out;
}

/**
 * O HTML do ML (fetch) inclui bundles JS com strings como "ui-pdp-container__row--price".
 * Regex/indexOf nesses trechos gera pares de preço falsos. JSON-LD fica em &lt;script&gt; e é
 * tratado à parte em extractFromJsonLd — aqui só queremos markup real.
 * Vários &lt;script&gt; seguidos exigem várias passadas.
 */
function stripScriptsAndStyles(html: string): string {
  let out = html;
  let prev = "";
  let guard = 0;
  while (out !== prev && guard++ < 200) {
    prev = out;
    out = out
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");
  }
  return out;
}

/** JSON embutido no HTML (estado / outras ofertas) traz "price" de outro vendedor — não é o PDP. */
function stripMlBuyingOptionsJson(html: string): string {
  return html.replace(
    /\{"buying_option_id"\s*:\s*"CHEAPER"[\s\S]*?"price"\s*:\s*[\d.]+[^}]*\}/gi,
    "{}",
  );
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

/**
 * Parseia aria-label de preço do ML: "35 reais com 72 centavos" ou "Antes: 1.234 reais com 56 centavos".
 * Os nós com `.andes-money-amount__fraction` / `__cents` no HTML do fetch podem refletir valores SSR
 * diferentes do anunciado ao leitor de tela; o `aria-label` costuma ser a fonte correta quando presente.
 */
export function parseMlAriaLabelReaisCentavos(label: string): number | null {
  const s = String(label ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return null;

  let m = s.match(/^Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?$/i);
  if (m) {
    const reais = Number(String(m[1]).replace(/\./g, ""));
    const centavos = m[2] ? Number(m[2]) : 0;
    if (Number.isFinite(reais) && Number.isFinite(centavos)) {
      const v = reais + centavos / 100;
      return v > 0 ? v : null;
    }
  }

  m = s.match(/^([\d.]+)\s*reais\s*com\s*(\d+)\s*centavos?$/i);
  if (m) {
    const reais = Number(String(m[1]).replace(/\./g, ""));
    const centavos = Number(m[2]);
    if (Number.isFinite(reais) && Number.isFinite(centavos)) {
      const v = reais + centavos / 100;
      return v > 0 ? v : null;
    }
  }

  return null;
}

/** Ignora ruído tipo frete "2 reais com 82 centavos" no mesmo documento. */
const MIN_ARIA_PLAUSIBLE_PRICE_BRL = 3;

/**
 * Ordem de aparição no HTML: 1º = preço normal (de), 2º = promocional quando menor que o 1º.
 */
export function extractAriaLabelPriceSequenceFromFragment(fragment: string): number[] {
  const re = /aria-label=["']([^"']+)["']/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    const v = parseMlAriaLabelReaisCentavos(m[1]);
    if (v != null && v >= MIN_ARIA_PLAUSIBLE_PRICE_BRL) {
      if (out.length === 0 || Math.abs(out[out.length - 1] - v) > 0.009) {
        out.push(v);
      }
    }
    if (out.length >= 3) break;
  }
  return out;
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
/** `htmlRaw` deve vir de sanitizeMlHtmlForPrice (evita ruído de buy-box / sticky). */
function extractPricesFromMlDomLike(htmlRaw: string): { price: number; promoPrice: number | null } | null {
  const htmlToParse = sliceHtmlBeforeOtherSellers(
    stripMlBuyingOptionsJson(stripScriptsAndStyles(htmlRaw)),
  );
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

  const lower = htmlToParse.toLowerCase();

  // ui-pdp-price__main-container ANTES de ui-pdp-container__row--price: no fetch HTML o
  // row--price pode trazer só um valor (ex.: JSON/catalogo) e retornar cedo, impedindo
  // de ler o bloco principal onde estão "de" + promocional (fraction+cents em ordem).
  const mainIdx = lower.indexOf("ui-pdp-price__main-container");
  if (mainIdx !== -1) {
    const mainBlock = htmlToParse.slice(mainIdx, mainIdx + 20000);

    // Prioridade: aria-label "X reais com Y centavos" (acessibilidade) — os spans fraction/cents
    // no SSR podem divergir (ex.: 30,64 visível vs 35,72 no aria).
    const ariaMain = extractAriaLabelPriceSequenceFromFragment(mainBlock);
    if (ariaMain.length >= 1) {
      const price = ariaMain[0];
      const promoLine = ariaMain[1];
      const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
      return { price, promoPrice };
    }

    const mainAmounts: number[] = [];
    const pairSeqRe =
      /andes-money-amount__fraction[^>]*>([\d.]+)<\/[^>]*>[\s\S]{0,800}?andes-money-amount__cents[^>]*>(\d{1,2})<\/[^>]*>/gi;

    for (const m of mainBlock.matchAll(pairSeqRe)) {
      const fractionStr = (m[1] || "").replace(/\./g, "");
      const centsStr = (m[2] || "00").padStart(2, "0");
      if (!fractionStr) continue;

      const n = parseFloat(`${fractionStr}.${centsStr}`);
      if (Number.isFinite(n) && n > 0) mainAmounts.push(n);
      if (mainAmounts.length >= 3) break;
    }

    if (mainAmounts.length >= 1) {
      const price = mainAmounts[0];
      const promoLine = mainAmounts[1];
      const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
      return { price, promoPrice };
    }
  }

  // ui-pdp-container__row--price: fallback quando não há main-container no HTML cru.
  const priceRowIdx = lower.indexOf("ui-pdp-container__row--price");
  if (priceRowIdx !== -1) {
    const block = htmlToParse.slice(priceRowIdx, priceRowIdx + 20000);

    const ariaRow = extractAriaLabelPriceSequenceFromFragment(block);

    if (ariaRow.length >= 1) {
      const price = ariaRow[0];
      const promoLine = ariaRow[1];
      const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
      domPrice = price;
      domPromoPrice = promoPrice;
    }

    if (domPrice == null) {
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

      const pair = pairTwoMeaningfulPrices(amounts);
      if (pair) {
        domPrice = pair.price;
        domPromoPrice = pair.promoPrice;
      }
    }
  }

  if (domPrice != null) {
    return { price: domPrice, promoPrice: domPromoPrice ?? null };
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

export function extractPricesFromHtml(html: string): {
  price: number | null;
  promoPrice: number | null;
} {
  const htmlSan = sanitizeMlHtmlForPrice(html);
  const htmlMain = sliceHtmlBeforeOtherSellers(htmlSan);
  const htmlDom = stripMlBuyingOptionsJson(stripScriptsAndStyles(htmlMain));
  const json = extractFromJsonLd(html);

  /** 1) Varredura do HTML do buy box: preço “de” + promocional (aria, fraction/cents, meta, second-line…). */
  const domFromMarkup = extractPricesFromMlDomLike(htmlSan);
  if (
    domFromMarkup != null &&
    domFromMarkup.price != null &&
    Number.isFinite(domFromMarkup.price) &&
    domFromMarkup.price > 0
  ) {
    return {
      price: domFromMarkup.price,
      promoPrice: domFromMarkup.promoPrice ?? null,
    };
  }

  /** 2) JSON-LD + faixa “Antes:” no HTML (oferta no schema vs preço tachado no markup). */
  const lower = htmlDom.toLowerCase();
  const rowIdx = lower.indexOf("ui-pdp-container__row--price");
  const priceRowSlice =
    rowIdx !== -1 ? htmlDom.slice(rowIdx, rowIdx + 30000) : htmlDom;
  const antes = extractAntesPriceFromAria(priceRowSlice);
  if (json?.price != null && antes != null && antes > json.price) {
    return { price: antes, promoPrice: json.price };
  }

  /** 3) JSON-LD com ajuste fino via markup parcial (quando o buy box não fechou par completo). */
  if (json) {
    const dom = domFromMarkup;
    if (
      dom &&
      dom.price != null &&
      dom.promoPrice != null &&
      dom.price > dom.promoPrice
    ) {
      if (json.promoPrice != null) {
        const schemaMatchesDom =
          Math.abs(json.price - dom.price) < 0.02 &&
          Math.abs(json.promoPrice - dom.promoPrice) < 0.02;
        return schemaMatchesDom ? json : { price: dom.price, promoPrice: dom.promoPrice };
      }
      if (json.price != null) {
        const jsonNearPromo = Math.abs(json.price - dom.promoPrice) < 0.02;
        if (jsonNearPromo) {
          return { price: dom.price, promoPrice: json.price };
        }
        return { price: dom.price, promoPrice: dom.promoPrice };
      }
    }

    if (json.promoPrice != null) return json;

    if (json.price != null) {
      const textPrices = findPromoAndPrice(htmlToVisibleText(htmlMain));
      if (
        textPrices.price != null &&
        textPrices.promoPrice != null &&
        textPrices.price > textPrices.promoPrice &&
        Math.abs(textPrices.promoPrice - json.price) < 0.02
      ) {
        return { price: textPrices.price, promoPrice: textPrices.promoPrice };
      }
    }

    return json;
  }

  if (domFromMarkup) return domFromMarkup;

  const fromRegex = findPromoAndPrice(htmlToVisibleText(htmlMain));
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
    const initial = extractPricesFromHtml(html);

    if (!initial || !initial.price || !Number.isFinite(initial.price) || initial.price <= 0) return null;

    // O HTML do fetch costuma ser SSR: os mesmos seletores do PDP podem trazer valores
    // diferentes dos que o React hidrata depois — a importação vê o DOM pós-hidratação.
    // Por isso, quando o Playwright está disponível, usamos o DOM renderizado (como na extensão).
    const rendered = await fetchPricesFromUrlWithPlaywright(url);
    if (rendered && rendered.price > 0 && Number.isFinite(rendered.price)) {
      return rendered;
    }

    return { price: initial.price, promoPrice: initial.promoPrice };
  } catch {
    return null;
  }
}

async function fetchPricesFromUrlWithPlaywright(url: string): Promise<{
  price: number;
  promoPrice: number | null;
} | null> {
  try {
    const { chromium } = await import("playwright");
    const userAgent = (ML_FETCH_HEADERS["User-Agent"] as string) || undefined;

    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});

    // Aceita banner de cookies quando existir.
    try {
      const btn = page.locator('button[data-testid="action:understood-button"]');
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
      }
    } catch {
      // ignore
    }

    // Espera por algum elemento de preço (varia por layout).
    await page
      .waitForSelector(
        ".ui-pdp-container__row--price, .ui-pdp-price__main-container, .ui-pdp-price",
        { timeout: 20000 },
      )
      .catch(() => {});

    // Preços no buy box costumam atualizar após hidratação e chamadas de rede (SSR ≠ valor final).
    await new Promise((r) => setTimeout(r, 4000));

    const data = await page.evaluate(() => {
      const parseAndesMoney = (el: Element | null): number | null => {
        if (!el) return null;
        const fraction = el.querySelector(".andes-money-amount__fraction")?.textContent?.trim();
        const cents = el.querySelector(".andes-money-amount__cents")?.textContent?.trim();
        if (!fraction) return null;
        const fractionNum = fraction.replace(/\./g, "");
        const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
        const n = parseFloat(`${fractionNum}.${dec}`);
        return Number.isFinite(n) && n > 0 ? n : null;
      };

      const isInsideOtherSellers = (el: Element | null) => {
        if (!el || typeof el.closest !== "function") return false;
        try {
          return !!el.closest("[class*='other-sellers']");
        } catch {
          return false;
        }
      };

      const firstNotInOtherSellers = (selector: string): Element | null => {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const n of nodes) {
          if (!isInsideOtherSellers(n)) return n;
        }
        return null;
      };

      const priceRow =
        firstNotInOtherSellers(".ui-pdp-container__row--price, .ui-pdp-container__row.ui-pdp-container__row--price") ||
        null;

      const mainContainer =
        firstNotInOtherSellers(".ui-pdp-price__main-container") || firstNotInOtherSellers(".ui-pdp-price");

      const parseAndesMoneyFromFractionCents = (fracEl: Element, centsEl: Element): number | null => {
        const fraction = fracEl.textContent?.trim();
        const cents = centsEl.textContent?.trim();
        if (!fraction) return null;
        const fractionNum = fraction.replace(/\./g, "");
        const dec = cents && /^\d{1,2}$/.test(cents) ? cents.padStart(2, "0") : "00";
        const n = parseFloat(`${fractionNum}.${dec}`);
        return Number.isFinite(n) && n > 0 ? n : null;
      };

      const filterTopLevelAndesMoney = (container: Element): Element[] => {
        const all = Array.from(container.querySelectorAll(".andes-money-amount"));
        return all.filter((el: Element) => {
          let p: Element | null = el.parentElement;
          while (p && container.contains(p)) {
            if (p !== container && p.classList.contains("andes-money-amount")) return false;
            p = p.parentElement;
          }
          return true;
        });
      };

      const parseAriaLabelReaisCentavos = (label: string): number | null => {
        const s = String(label ?? "")
          .trim()
          .replace(/\s+/g, " ");
        if (!s) return null;
        let m = s.match(/^Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?$/i);
        if (m) {
          const reais = Number(String(m[1]).replace(/\./g, ""));
          const centavos = m[2] ? Number(m[2]) : 0;
          if (Number.isFinite(reais) && Number.isFinite(centavos)) {
            const v = reais + centavos / 100;
            return Number.isFinite(v) && v > 0 ? v : null;
          }
        }
        m = s.match(/^([\d.]+)\s*reais\s*com\s*(\d+)\s*centavos?$/i);
        if (m) {
          const reais = Number(String(m[1]).replace(/\./g, ""));
          const centavos = Number(m[2]);
          if (Number.isFinite(reais) && Number.isFinite(centavos)) {
            const v = reais + centavos / 100;
            return Number.isFinite(v) && v > 0 ? v : null;
          }
        }
        return null;
      };

      const collectAriaLabelPricesFromContainer = (container: Element): number[] => {
        const MIN = 3;
        const seq: number[] = [];
        const nodes = container.querySelectorAll("[aria-label]");
        for (const el of nodes) {
          const label = el.getAttribute("aria-label");
          if (!label) continue;
          const v = parseAriaLabelReaisCentavos(label);
          if (v != null && v >= MIN) {
            if (seq.length === 0 || Math.abs(seq[seq.length - 1] - v) > 0.009) {
              seq.push(v);
            }
          }
          if (seq.length >= 3) break;
        }
        return seq;
      };

      const collectAmountsFromPriceBlock = (container: Element): number[] => {
        const topLevel = filterTopLevelAndesMoney(container);
        const amounts: number[] = [];
        for (const el of topLevel) {
          const n = parseAndesMoney(el);
          if (n != null && n > 0) amounts.push(n);
          if (amounts.length >= 3) break;
        }
        if (amounts.length > 0) return amounts;

        const fractions = Array.from(container.querySelectorAll(".andes-money-amount__fraction"));
        for (const f of fractions) {
          if (isInsideOtherSellers(f)) continue;
          const parent = f.closest(".andes-money-amount");
          if (parent) {
            const n = parseAndesMoney(parent);
            if (n != null && n > 0) amounts.push(n);
          } else {
            const next = f.nextElementSibling;
            if (next?.classList.contains("andes-money-amount__cents")) {
              const n = parseAndesMoneyFromFractionCents(f, next);
              if (n != null && n > 0) amounts.push(n);
            }
          }
          if (amounts.length >= 3) break;
        }
        return amounts;
      };

      // main-container antes de row--price (igual extractPricesFromMlDomLike / extensão).
      if (mainContainer) {
        const ar = collectAriaLabelPricesFromContainer(mainContainer);
        if (ar.length >= 1) {
          const line1 = ar[0];
          const promoLine = ar[1];
          const promoPrice = promoLine != null && promoLine < line1 ? promoLine : null;
          return { price: line1, promoPrice };
        }
        const amounts = collectAmountsFromPriceBlock(mainContainer);
        const line1 = amounts[0];
        if (line1 != null) {
          const promoLine = amounts[1];
          const promoPrice = promoLine != null && promoLine < line1 ? promoLine : null;
          return { price: line1, promoPrice };
        }
      }

      if (priceRow) {
        const ar = collectAriaLabelPricesFromContainer(priceRow);
        if (ar.length >= 1) {
          const price = ar[0];
          const promoLine = ar[1];
          const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
          return { price, promoPrice };
        }
        const amounts = collectAmountsFromPriceBlock(priceRow);
        const price = amounts[0];
        const promoLine = amounts[1];
        if (price != null) {
          const promoPrice = promoLine != null && promoLine < price ? promoLine : null;
          return { price, promoPrice };
        }
      }

      return null;
    });

    await browser.close().catch(() => {});

    if (!data || !data.price || !Number.isFinite(data.price) || data.price <= 0) return null;
    return { price: data.price, promoPrice: data.promoPrice ?? null };
  } catch {
    return null;
  }
}
