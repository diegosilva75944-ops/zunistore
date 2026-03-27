import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

export type MainVisualBlockPick = {
  id: string;
  selector: string;
  reason: string;
  score: number;
  el: Cheerio<Element>;
};

const EXCLUDE_CLASS_OR_ID =
  /other-seller|outros-vendedor|ui-pdp-carousel|polyreco|reco-|recommend|search-ui|cross-sell|compare-prices|compare__|melhor.preço|best-price|price-per|per-unit|related|vitrine|who-viewed|quem-viu/i;

function ancestorClassChain($: CheerioAPI, $el: Cheerio<Element>, depth: number): string {
  const parts: string[] = [];
  let $cur: Cheerio<Element> | null = $el;
  for (let i = 0; i < depth && $cur && $cur.length; i++) {
    const id = $cur.attr("id");
    const cls = ($cur.attr("class") || "").trim().split(/\s+/).slice(0, 2).join(".");
    const tag = ($cur[0] as Element)?.name || "div";
    if (id) parts.push(`${tag}#${id}`);
    else if (cls) parts.push(`${tag}.${cls}`);
    else parts.push(tag);
    $cur = $cur.parent() as Cheerio<Element>;
  }
  return parts.join(" < ");
}

function isExcludedPriceContext($: CheerioAPI, $el: Cheerio<Element>): boolean {
  const chain = ancestorClassChain($, $el, 14);
  if (EXCLUDE_CLASS_OR_ID.test(chain)) return true;
  return $el.parents().toArray().some((n) => {
    const id = ((n as Element).attribs?.id || "").toLowerCase();
    const c = ((n as Element).attribs?.class || "").toLowerCase();
    const blob = `${id} ${c}`;
    return EXCLUDE_CLASS_OR_ID.test(blob);
  });
}

function isMainColumnContext($: CheerioAPI, $el: Cheerio<Element>): boolean {
  return (
    $el.closest(
      ".ui-pdp-main, .ui-pdp-container__main, .ui-pdp-layout__main, [class*='ui-pdp-layout__main'], .ui-pdp-container__col--primary",
    ).length > 0
  );
}

function hasBuyBoxNearby($: CheerioAPI, $el: Cheerio<Element>): boolean {
  const $scope = $el.closest(".ui-pdp-main, .ui-pdp-container, #root-app").first();
  if (!$scope.length) return false;
  const t = $scope.text();
  return (
    /comprar|adicionar ao carrinho|buy now|ir para o carrinho/i.test(t) &&
    $scope.find(
      '[class*="buy"], [class*="purchase"], button[type="submit"], .ui-pdp-actions, [data-testid*="buy"]',
    ).length > 0
  );
}

function scoreBlockElement($: CheerioAPI, $el: Cheerio<Element>, docOrderIndex: number): number {
  if (isExcludedPriceContext($, $el)) return -10_000;

  let s = 0;
  if (isMainColumnContext($, $el)) s += 180;
  if ($el.closest(".ui-pdp-container__row--price").length) s += 120;
  if ($el.find(".andes-money-amount, .ui-pdp-price").length) s += 60;
  if (hasBuyBoxNearby($, $el)) s += 90;
  if ($("h1").length && $el.closest("main, #root-app, .ui-pdp").length) s += 40;
  /** Primeiro bloco de preço no documento tende a ser o PDP principal */
  if (docOrderIndex === 0) s += 35;
  /** Penalizar sidebar / colunas secundárias */
  if ($el.closest(".ui-pdp-sidebar, .ui-pdp-container__col--secondary, aside").length) s -= 200;

  return s;
}

function describeReason(score: number, docOrderIndex: number): string {
  const parts: string[] = [];
  parts.push("closest to product buy box and title");
  if (docOrderIndex === 0) parts.push("first price row in document order");
  parts.push(`score=${score}`);
  return parts.join("; ");
}

/**
 * Escolhe o bloco visual principal de preço (buy box), evitando melhor preço, outros vendedores, vitrines e colunas secundárias.
 */
export function resolveMainVisualBlock($: CheerioAPI): MainVisualBlockPick | null {
  type Cand = { el: Cheerio<Element>; selector: string; docOrderIndex: number };
  const list: Cand[] = [];

  $(".ui-pdp-container__row--price").each((i, el) => {
    list.push({ el: $(el) as Cheerio<Element>, selector: ".ui-pdp-container__row--price", docOrderIndex: i });
  });

  if (!list.length) {
    $(".ui-pdp-price__main-container").each((i, el) => {
      list.push({
        el: $(el) as Cheerio<Element>,
        selector: ".ui-pdp-price__main-container",
        docOrderIndex: i,
      });
    });
  }

  if (!list.length) {
    $(".ui-pdp-price").each((i, el) => {
      if (isExcludedPriceContext($, $(el) as Cheerio<Element>)) return;
      list.push({ el: $(el) as Cheerio<Element>, selector: ".ui-pdp-price", docOrderIndex: i });
    });
  }

  let best: { pick: Cand; score: number } | null = null;
  for (const c of list) {
    const sc = scoreBlockElement($, c.el, c.docOrderIndex);
    if (sc < 0) continue;
    if (!best || sc > best.score) best = { pick: c, score: sc };
  }

  if (!best && list.length) {
    const fp = list.find((c) => !isExcludedPriceContext($, c.el)) ?? list[0];
    return {
      id: "ml-price-fallback-row",
      selector: fp.selector,
      reason:
        "fallback: primeira linha de preço disponível (nenhum bloco passou no score; uso conservador)",
      score: 1,
      el: fp.el,
    };
  }

  if (!best) return null;

  const id =
    best.pick.el.attr("id")?.trim() ||
    `ml-price-${best.pick.selector.replace(/[^a-z0-9]/gi, "-")}-${best.pick.docOrderIndex}`;

  return {
    id,
    selector: best.pick.selector,
    reason: describeReason(best.score, best.pick.docOrderIndex),
    score: best.score,
    el: best.pick.el,
  };
}

export function blockElementFingerprint($: CheerioAPI, $el: Cheerio<Element>): string {
  return ancestorClassChain($, $el, 8);
}
