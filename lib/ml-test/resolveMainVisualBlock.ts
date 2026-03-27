import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

export type MainVisualBlockPick = {
  id: string;
  selector: string;
  reason: string;
  score: number;
  el: Cheerio<Element>;
};

/** Contexto de vitrine / recomendação / busca — nunca é buy box principal */
const EXCLUDE_CLASS_OR_ID =
  /other-seller|outros-vendedor|ui-pdp-carousel|polyreco|reco-|recommend|search-ui|cross-sell|compare-prices|compare__|vitrine|who-viewed|quem-viu|ui-pdp-sidebar/i;

/**
 * Blocos “paralelos” (melhor preço, comparar, outro vendedor) dentro da PDP.
 * O texto costuma aparecer no próprio row ou no pai próximo.
 */
const SECONDARY_OFFER_TEXT =
  /melhor\s+pre[cç]o|menor\s+pre[cç]o|outro\s+vendedor|outros\s+vendedores|compare\s+(os\s+)?pre[cç]os|mais\s+ofertas|ver\s+mais\s+ofertas|ofertas\s+do\s+vendedor|comparar\s+pre[cç]os/i;

const SECONDARY_CLASS_BLOB =
  /poly-compare|ui-pdp-compare|compare__|other-seller|outros-vendedores|best-price|price-comparison|ui-pdp-bookmark|seller-experiment|ui-pdp-seller/i;

function ancestorClassChain($: CheerioAPI, $el: Cheerio<Element>, depth: number): string {
  const parts: string[] = [];
  let $cur: Cheerio<Element> | null = $el;
  for (let i = 0; i < depth && $cur && $cur.length; i++) {
    const id = $cur.attr("id");
    const cls = ($cur.attr("class") || "").trim().split(/\s+/).slice(0, 3).join(".");
    const tag = ($cur[0] as Element)?.name || "div";
    if (id) parts.push(`${tag}#${id}`);
    else if (cls) parts.push(`${tag}.${cls}`);
    else parts.push(tag);
    $cur = $cur.parent() as Cheerio<Element>;
  }
  return parts.join(" < ");
}

function isExcludedPriceContext($: CheerioAPI, $el: Cheerio<Element>): boolean {
  const chain = ancestorClassChain($, $el, 16);
  if (EXCLUDE_CLASS_OR_ID.test(chain)) return true;
  return $el.parents().toArray().some((n) => {
    const id = ((n as Element).attribs?.id || "").toLowerCase();
    const c = ((n as Element).attribs?.class || "").toLowerCase();
    return EXCLUDE_CLASS_OR_ID.test(`${id} ${c}`);
  });
}

/**
 * “Melhor preço”, comparador, outro vendedor, etc. — não é o preço principal do anúncio.
 */
export function isSecondaryOfferPriceBlock($: CheerioAPI, $el: Cheerio<Element>): boolean {
  if (isExcludedPriceContext($, $el)) return true;
  const raw = $el.text().replace(/\s+/g, " ").slice(0, 1400);
  if (SECONDARY_OFFER_TEXT.test(raw.toLowerCase())) return true;
  const blob = $el
    .parents()
    .addBack()
    .toArray()
    .map((n) => `${(n as Element).attribs?.id || ""} ${(n as Element).attribs?.class || ""}`)
    .join(" ");
  if (SECONDARY_CLASS_BLOB.test(blob)) return true;
  return false;
}

function isMainPdpColumn($: CheerioAPI, $el: Cheerio<Element>): boolean {
  return (
    $el.closest(
      ".ui-pdp-main, .ui-pdp-container__main, .ui-pdp-layout__main, [class*='ui-pdp-layout__main'], .ui-pdp-container__col--primary, .ui-pdp-container__col--primary-top",
    ).length > 0
  );
}

function scoreBlockElement($: CheerioAPI, $el: Cheerio<Element>, docOrderIndex: number): number {
  if (isSecondaryOfferPriceBlock($, $el)) return -10_000;

  let s = 0;
  if (isMainPdpColumn($, $el)) s += 200;
  if ($el.closest(".ui-pdp-container__row--price").length || $el.is(".ui-pdp-container__row--price")) s += 100;
  if ($el.find(".andes-money-amount").length) s += 50;
  if ($("h1").length && $el.closest("#root-app, main, .ui-pdp").length) s += 30;
  /** Primeiro bloco de preço na coluna principal costuma ser o do produto */
  if (docOrderIndex === 0) s += 40;
  if ($el.closest(".ui-pdp-sidebar, .ui-pdp-container__col--secondary, aside").length) s -= 300;

  return s;
}

/**
 * Coluna principal da PDP (título + galeria + preço principal).
 */
function mainColumnRoot($: CheerioAPI): Cheerio<Element> | null {
  const sel = [
    ".ui-pdp-main",
    ".ui-pdp-container__col--primary",
    ".ui-pdp-container__col--primary-top",
    ".ui-pdp-layout__main",
    "[class*='ui-pdp-layout__main']",
    ".ui-pdp-container__main",
  ];
  for (const s of sel) {
    const $m = $(s).first();
    if ($m.length) return $m as Cheerio<Element>;
  }
  return null;
}

/**
 * Escolhe o bloco de preço do **buy box** visível: prioriza o primeiro `.ui-pdp-container__row--price`
 * dentro da coluna principal que **não** seja oferta secundária (melhor preço, comparar, outro vendedor).
 */
export function resolveMainVisualBlock($: CheerioAPI): MainVisualBlockPick | null {
  const $main = mainColumnRoot($);

  if ($main?.length) {
    const $rows = $main.find(".ui-pdp-container__row--price");
    for (let i = 0; i < $rows.length; i++) {
      const $row = $($rows[i]) as Cheerio<Element>;
      if (isSecondaryOfferPriceBlock($, $row)) continue;
      const sc = scoreBlockElement($, $row, i);
      const id = $row.attr("id")?.trim() || `ml-price-main-col-row-${i}`;
      return {
        id,
        selector: ".ui-pdp-container__row--price",
        reason: `primeiro row--price na coluna principal (.ui-pdp-main / primary) que não é oferta secundária (índice ${i} no main); score=${sc}`,
        score: sc,
        el: $row,
      };
    }

    const $mainContainer = $main.find(".ui-pdp-price__main-container").first();
    if ($mainContainer.length && !isSecondaryOfferPriceBlock($, $mainContainer as Cheerio<Element>)) {
      const sc = scoreBlockElement($, $mainContainer as Cheerio<Element>, 0);
      return {
        id: $mainContainer.attr("id")?.trim() || "ml-price-main-container",
        selector: ".ui-pdp-price__main-container",
        reason: `container principal de preço dentro da coluna principal (sem row--price dedicado); score=${sc}`,
        score: sc,
        el: $mainContainer as Cheerio<Element>,
      };
    }
  }

  /** Fallback: todos os row--price da página, ignorando secundários; desempate = menor índice no DOM + maior score */
  type Cand = { el: Cheerio<Element>; selector: string; docOrderIndex: number };
  const list: Cand[] = [];
  $(".ui-pdp-container__row--price").each((i, el) => {
    const $e = $(el) as Cheerio<Element>;
    if (isSecondaryOfferPriceBlock($, $e)) return;
    list.push({ el: $e, selector: ".ui-pdp-container__row--price", docOrderIndex: i });
  });

  if (!list.length) {
    $(".ui-pdp-price__main-container").each((i, el) => {
      const $e = $(el) as Cheerio<Element>;
      if (isSecondaryOfferPriceBlock($, $e)) return;
      list.push({ el: $e, selector: ".ui-pdp-price__main-container", docOrderIndex: i });
    });
  }

  if (!list.length) {
    $(".ui-pdp-price").each((i, el) => {
      const $e = $(el) as Cheerio<Element>;
      if (isSecondaryOfferPriceBlock($, $e)) return;
      list.push({ el: $e, selector: ".ui-pdp-price", docOrderIndex: i });
    });
  }

  if (!list.length) return null;

  const scored = list.map((c) => ({
    ...c,
    sc: scoreBlockElement($, c.el, c.docOrderIndex),
  }));

  scored.sort((a, b) => {
    if (b.sc !== a.sc) return b.sc - a.sc;
    const ma = isMainPdpColumn($, a.el) ? 1 : 0;
    const mb = isMainPdpColumn($, b.el) ? 1 : 0;
    if (mb !== ma) return mb - ma;
    return a.docOrderIndex - b.docOrderIndex;
  });

  const best = scored[0];
  if (best.sc < 0) return null;

  const id =
    best.el.attr("id")?.trim() ||
    `ml-price-${best.selector.replace(/[^a-z0-9]/gi, "-")}-${best.docOrderIndex}`;

  return {
    id,
    selector: best.selector,
    reason: `melhor candidato global após filtrar ofertas secundárias; docOrder=${best.docOrderIndex}; score=${best.sc}`,
    score: best.sc,
    el: best.el,
  };
}

export function blockElementFingerprint($: CheerioAPI, $el: Cheerio<Element>): string {
  return ancestorClassChain($, $el, 8);
}
