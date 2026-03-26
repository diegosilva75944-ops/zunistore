import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type {
  ChosenBlockInfo,
  IgnoredCandidateEntry,
  PriceCandidate,
  PriceConfidence,
  PriceDataSource,
  PricingDisplayMode,
  ResolvePreviewPricingResult,
} from "./types";
import { clampPercent, roundMoney } from "./normalize";

function detectInstallment(text: string): boolean {
  return /(\d+\s*x\s*)|parcelad|sem juros|juros|parcela/i.test(text);
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

function isRecoCarousel($: CheerioAPI, el: Cheerio<Element>): boolean {
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

function pickWinningBlock($: CheerioAPI): { el: Cheerio<Element>; selector: string } | null {
  const order = [".ui-pdp-container__row--price", ".ui-pdp-price__main-container", ".ui-pdp-price"];
  for (const sel of order) {
    const el = $(sel).first();
    if (el.length && !isRecoCarousel($, el as Cheerio<Element>)) {
      return { el: el as Cheerio<Element>, selector: sel };
    }
  }
  return null;
}

function snippetOf($: CheerioAPI, $el: Cheerio<Element>, maxLen: number): string {
  const t = $el.text().replace(/\s+/g, " ").trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function stripNoiseFromPriceBlock($: CheerioAPI, $root: Cheerio<Element>): Cheerio<Element> {
  const $b = $root.clone();
  $b.find(".poly-price__installments").remove();
  $b.find(".ui-pdp-price__second-line").each((_, e) => {
    const t = $(e).text();
    if (detectInstallment(t)) $(e).remove();
  });
  $b.find("[class*='reco'], [class*='carousel']").each((_, e) => {
    const c = ($(e).attr("class") || "").toLowerCase();
    if (c.includes("reco") || c.includes("carousel")) $(e).remove();
  });
  return $b as Cheerio<Element>;
}

function isPreviousMoneyNode($: CheerioAPI, $el: Cheerio<Element>): boolean {
  if ($el.hasClass("andes-money-amount--previous")) return true;
  if ($el.closest(".andes-money-amount--previous").length) return true;
  if ($el.closest(".ui-pdp-price__original-value").length) return true;
  const $s = $el.closest("s");
  if ($s.length) {
    if ($s.find(".andes-money-amount--previous").length) return true;
    const aria = $s.attr("aria-label");
    if (aria && /Antes:/i.test(aria)) return true;
  }
  return false;
}

function collectVisiblePreviousInBlock($: CheerioAPI, $scope: Cheerio<Element>): number[] {
  const out: number[] = [];
  $scope.find(".andes-money-amount--previous").each((_, el) => {
    const n = parseAndesMoney($, $(el) as Cheerio<Element>);
    if (n != null) out.push(n);
  });
  $scope.find(".ui-pdp-price__original-value").each((_, el) => {
    const n = parseAndesMoney($, $(el) as Cheerio<Element>);
    if (n != null) out.push(n);
  });
  $scope.find("s[aria-label]").each((_, el) => {
    const antes = parseAntesAria($(el).attr("aria-label"));
    if (antes != null) out.push(antes);
  });
  return [...new Set(out.filter((n) => Number.isFinite(n) && n > 0))];
}

function collectVisibleCurrentAndesInBlock($: CheerioAPI, $scope: Cheerio<Element>): number[] {
  const out: number[] = [];
  $scope.find(".andes-money-amount").each((_, el) => {
    const $el = $(el as unknown as Element);
    if (isPreviousMoneyNode($, $el)) return;
    const n = parseAndesMoney($, $el);
    if (n != null) out.push(n);
  });
  return [...new Set(out.filter((n) => Number.isFinite(n) && n > 0))];
}

function metaPriceInBlock($: CheerioAPI, $block: Cheerio<Element>): number | null {
  let best: number | null = null;
  $block.find('meta[itemprop="price"]').each((_, el) => {
    const content = (el as unknown as Element).attribs?.content;
    if (!content) return;
    const n = Number(String(content).replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      best = roundMoney(n);
    }
  });
  return best;
}

/** Meta de oferta costuma estar no &lt;head&gt;; só como apoio ao preço atual quando o bloco não tem andes. */
function metaPriceInDocument($: CheerioAPI): number | null {
  let best: number | null = null;
  $('meta[itemprop="price"]').each((_, el) => {
    const content = (el as unknown as Element).attribs?.content;
    if (!content) return;
    const n = Number(String(content).replace(",", "."));
    if (Number.isFinite(n) && n > 0) best = roundMoney(n);
  });
  return best;
}

function pickInstallmentFromCandidates(
  candidates: PriceCandidate[],
): { installmentPrice: number | null; installments: number | null } {
  const inst = candidates.find((c) => c.isInstallment);
  if (!inst) return { installmentPrice: null, installments: null };
  const installmentPrice = roundMoney(inst.value);
  const m = inst.nearText.match(/(\d+)\s*x/i) || inst.rawText.match(/(\d+)\s*x/i);
  const installments = m ? parseInt(m[1], 10) : null;
  return {
    installmentPrice,
    installments: installments != null && Number.isFinite(installments) ? installments : null,
  };
}

function fallbackSinglePriceFromCandidates(candidates: PriceCandidate[]): {
  currentPrice: number | null;
  confidence: PriceConfidence;
} {
  const valid = candidates.filter((c) => c.value > 0 && Number.isFinite(c.value));
  if (!valid.length) return { currentPrice: null, confidence: "low" };

  const pool = valid.filter((c) => !c.isInstallment && !c.isShipping && !c.isRecommendation);
  const main = pool.filter((c) => c.fromMainBlock);
  const use = main.length ? main : pool;
  if (!use.length) return { currentPrice: null, confidence: "low" };

  const currents = use.filter((c) => c.isCurrentCandidate && !c.isOriginalCandidate);
  if (currents.length) {
    const vals = [...new Set(currents.map((c) => c.value))].sort((a, b) => a - b);
    return {
      currentPrice: roundMoney(vals[0]),
      confidence: main.length ? "medium" : "low",
    };
  }

  const nums = [...new Set(use.map((c) => c.value))].sort((a, b) => a - b);
  if (nums.length === 1) return { currentPrice: roundMoney(nums[0]), confidence: main.length ? "medium" : "low" };
  /** Nunca emparelhar max/min global: um único valor conservador (menor) como preço exibido, sem “original”. */
  return { currentPrice: roundMoney(nums[0]), confidence: "low" };
}

function buildIgnoredList(
  candidates: PriceCandidate[],
  usedIndices: Set<number>,
  reasons: Map<number, string>,
): IgnoredCandidateEntry[] {
  const out: IgnoredCandidateEntry[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (usedIndices.has(i)) continue;
    const c = candidates[i];
    const reason =
      reasons.get(i) ||
      (c.isInstallment ? "parcelamento / linha secundária — não usado como preço principal" :
      c.isRecommendation ? "contexto de vitrine/recomendação" :
      !c.fromMainBlock ? "fora do bloco principal vencedor — não compõe a UI final" :
      c.isOriginalCandidate && c.source !== "andes_dom" && c.source !== "aria" ?
        "candidato a ‘original’ só em meta/json — sem par visível no bloco vencedor" :
      "não selecionado para exibição após resolução pelo bloco principal");
    out.push({ index: i, value: c.value, source: c.source, reason });
  }
  return out;
}

function computeUsedIndices(
  candidates: PriceCandidate[],
  currentPrice: number | null,
  originalPrice: number | null,
  opts: { usedMetaHeadForCurrent?: boolean },
): Set<number> {
  const used = new Set<number>();
  const tol = 0.02;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.isInstallment || c.isRecommendation) continue;
    if (currentPrice != null && Math.abs(c.value - currentPrice) <= tol) {
      if (c.source === "json_ld") continue;
      if (c.source === "meta" && !c.fromMainBlock && !opts.usedMetaHeadForCurrent) continue;
      if (c.isOriginalCandidate && !c.isCurrentCandidate && originalPrice == null) continue;
      used.add(i);
    }
  }
  if (originalPrice != null) {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (
        Math.abs(c.value - originalPrice) <= tol &&
        (c.source === "andes_dom" || c.source === "aria") &&
        c.isOriginalCandidate
      ) {
        used.add(i);
      }
    }
  }
  return used;
}

export function resolvePreviewPricing(
  html: string,
  candidates: PriceCandidate[],
  sourceLayer: PriceDataSource,
): ResolvePreviewPricingResult {
  const $ = load(html);
  const notes: string[] = [];
  const chosenSignals: Record<string, unknown> = { layer: sourceLayer };

  const reasonOverride = new Map<number, string>();
  let usedMetaHeadForCurrent = false;

  const blockPick = pickWinningBlock($);
  let chosenBlock: ChosenBlockInfo | null = null;
  let currentPrice: number | null = null;
  let originalPrice: number | null = null;
  let displayMode: PricingDisplayMode = "unknown";
  let confidence: PriceConfidence = "low";

  const { installmentPrice, installments } = pickInstallmentFromCandidates(candidates);

  if (!blockPick) {
    notes.push("Bloco principal (.ui-pdp-*) não encontrado — fallback por candidatos (sem par max/min global).");
    const fb = fallbackSinglePriceFromCandidates(candidates);
    currentPrice = fb.currentPrice;
    confidence = fb.confidence;
    displayMode = currentPrice != null ? "single_price" : "unknown";
    chosenSignals.fallback = "no_winning_block";
    const usedIndices = computeUsedIndices(candidates, currentPrice, null, {});
    const ignored = buildIgnoredList(candidates, usedIndices, reasonOverride);
    const discountPercent =
      originalPrice != null && currentPrice != null && originalPrice > currentPrice ?
        clampPercent((1 - currentPrice / originalPrice) * 100)
      : null;
    return {
      pricing: {
        currentPrice,
        originalPrice: null,
        discountPercent,
        hasDiscount: false,
        displayMode,
        installmentPrice,
        installments,
        confidence,
        source: sourceLayer,
      },
      chosenBlock: null,
      chosenSignals,
      ignoredCandidates: ignored,
    };
  }

  const $rawBlock = blockPick.el;
  const $block = stripNoiseFromPriceBlock($, $rawBlock);
  const previousVals = collectVisiblePreviousInBlock($, $block);
  const currentAndes = collectVisibleCurrentAndesInBlock($, $block);
  const metaInBlock = metaPriceInBlock($, $rawBlock);

  chosenSignals.metaPriceInBlock = metaInBlock;
  chosenSignals.previousDom = previousVals;
  chosenSignals.currentAndesDom = currentAndes;

  const hasStrikethroughPrevious = previousVals.length > 0;

  let domCurrent: number | null = null;
  if (currentAndes.length === 1) {
    domCurrent = currentAndes[0];
  } else if (currentAndes.length > 1) {
    /** Após remover parcelas, múltiplos valores: priorizar o maior (preço principal; evita confundir com fragmentos). */
    domCurrent = roundMoney(Math.max(...currentAndes));
    notes.push("Múltiplos valores andes no bloco após limpeza — usando o maior como atual.");
  }

  if (metaInBlock != null) {
    if (domCurrent == null) {
      domCurrent = metaInBlock;
      notes.push("Preço atual do meta[itemprop=price] dentro do bloco (sem andes isolado).");
    } else if (Math.abs(domCurrent - metaInBlock) > 0.02) {
      notes.push("Meta no bloco difere do andes — priorizando DOM andes.");
    }
  }

  if (domCurrent == null) {
    const headMeta = metaPriceInDocument($);
    if (headMeta != null) {
      domCurrent = headMeta;
      usedMetaHeadForCurrent = true;
      notes.push("Fallback: meta[itemprop=price] no documento (bloco sem andes explícito).");
    }
  }

  if (hasStrikethroughPrevious && domCurrent != null) {
    const prevMax = roundMoney(Math.max(...previousVals));
    if (prevMax > domCurrent) {
      originalPrice = prevMax;
      currentPrice = domCurrent;
      displayMode = "discounted_price";
      confidence = "high";
    } else {
      originalPrice = null;
      currentPrice = domCurrent;
      displayMode = "single_price";
      confidence = "high";
      notes.push("Preço ‘anterior’ no DOM não é maior que o atual — tratando como preço único.");
    }
  } else if (domCurrent != null) {
    originalPrice = null;
    currentPrice = domCurrent;
    displayMode = "single_price";
    confidence = "high";
    candidates.forEach((c, i) => {
      if (c.isOriginalCandidate && c.source !== "andes_dom" && c.source !== "aria") {
        reasonOverride.set(i, "‘original’ só em JSON-LD/meta — sem preço riscado visível no bloco vencedor");
      }
    });
  } else {
    notes.push("Sem preço visível claro no bloco — fallback conservador.");
    const fb = fallbackSinglePriceFromCandidates(candidates);
    currentPrice = fb.currentPrice;
    confidence = fb.confidence;
    displayMode = currentPrice != null ? "single_price" : "unknown";
    chosenSignals.fallback = "block_empty";
  }

  chosenBlock = {
    selector: blockPick.selector,
    snippet: snippetOf($, $rawBlock, 420),
    hasStrikethroughPrevious: hasStrikethroughPrevious,
    previousInBlockCount: previousVals.length,
    currentInBlockCount: currentAndes.length,
    notes,
  };
  chosenSignals.winningSelector = blockPick.selector;
  chosenSignals.usedMetaHeadForCurrent = usedMetaHeadForCurrent;

  const hasDiscount =
    originalPrice != null && currentPrice != null && originalPrice > currentPrice;
  const discountPercent =
    hasDiscount && currentPrice != null && originalPrice != null ?
      clampPercent((1 - currentPrice / originalPrice) * 100)
    : null;

  if (!hasDiscount) {
    originalPrice = null;
  }

  const usedIndices = computeUsedIndices(candidates, currentPrice, originalPrice, {
    usedMetaHeadForCurrent,
  });
  const ignoredCandidates = buildIgnoredList(candidates, usedIndices, reasonOverride);

  return {
    pricing: {
      currentPrice,
      originalPrice: hasDiscount ? originalPrice : null,
      discountPercent: hasDiscount ? discountPercent : null,
      hasDiscount,
      displayMode: hasDiscount ? "discounted_price" : displayMode,
      installmentPrice,
      installments,
      confidence,
      source: sourceLayer,
    },
    chosenBlock,
    chosenSignals,
    ignoredCandidates,
  };
}

export function scoreResolved(r: ResolvePreviewPricingResult): number {
  let s = 0;
  if (r.pricing.currentPrice != null) s += 4;
  if (r.pricing.hasDiscount && r.pricing.originalPrice != null) s += 3;
  if (r.pricing.confidence === "high") s += 3;
  else if (r.pricing.confidence === "medium") s += 2;
  else s += 1;
  if (r.pricing.displayMode !== "unknown") s += 2;
  if (r.chosenBlock != null) s += 2;
  return s;
}

function shiftIgnored(
  r: ResolvePreviewPricingResult,
  offset: number,
): ResolvePreviewPricingResult {
  if (offset <= 0) return r;
  return {
    ...r,
    ignoredCandidates: r.ignoredCandidates.map((e) => ({ ...e, index: e.index + offset })),
  };
}

export function mergeResolvedDisplay(
  a: ResolvePreviewPricingResult,
  b: ResolvePreviewPricingResult,
  bCandidateOffset = 0,
): ResolvePreviewPricingResult {
  if (b.pricing.currentPrice == null && a.pricing.currentPrice != null) {
    return { ...a, pricing: { ...a.pricing, source: "mixed" } };
  }
  if (a.pricing.currentPrice == null && b.pricing.currentPrice != null) {
    return {
      ...shiftIgnored(b, bCandidateOffset),
      pricing: { ...b.pricing, source: "mixed" },
    };
  }
  if (scoreResolved(b) > scoreResolved(a)) {
    return {
      ...shiftIgnored(b, bCandidateOffset),
      pricing: { ...b.pricing, source: "mixed" },
    };
  }
  return { ...a, pricing: { ...a.pricing, source: "mixed" } };
}

export function isWeakResolved(pricing: ResolvePreviewPricingResult["pricing"]): boolean {
  return pricing.currentPrice == null || (pricing.displayMode === "unknown" && pricing.confidence === "low");
}
