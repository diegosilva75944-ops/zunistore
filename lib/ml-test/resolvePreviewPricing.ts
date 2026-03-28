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
  UsedCandidateEntry,
} from "./types";
import {
  detectSecondaryPriceLineText,
  discountPercentFromPair,
  parsePriceEmOutrosMeiosLine,
  roundMoney,
} from "./normalize";
import { parseAndesMoneyCheerio } from "./parseAndesMoney";
import { resolveMainVisualBlock } from "./resolveMainVisualBlock";

function parseAntesAria(aria: string | undefined): number | null {
  if (!aria) return null;
  const m = aria.match(/Antes:\s*([\d.]+)\s*reais(?:\s*com\s*(\d+)\s*centavos?)?/i);
  if (!m) return null;
  const reais = Number(String(m[1]).replace(/\./g, ""));
  const cent = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(reais)) return null;
  return roundMoney(reais + cent / 100);
}

function snippetOf($: CheerioAPI, $el: Cheerio<Element>, maxLen: number): string {
  const t = $el.text().replace(/\s+/g, " ").trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function stripNoiseFromPriceBlock($: CheerioAPI, $root: Cheerio<Element>): Cheerio<Element> {
  const $b = $root.clone();
  $b.find(".poly-price__installments").remove();
  /** Comparadores / bookmarks dentro do row podem injetar segundo preço falso */
  $b.find(
    '[class*="poly-compare"], [class*="ui-pdp-compare"], .ui-pdp-bookmark, [class*="compare-prices"]',
  ).remove();
  $b.find(".ui-pdp-price__second-line").each((_, e) => {
    const t = $(e).text();
    if (detectSecondaryPriceLineText(t)) $(e).remove();
  });
  /** “10x R$ … sem juros” fica em subtitles, não na second-line — evita min() pegar a parcela. */
  $b.find(".ui-pdp-price__subtitles").each((_, e) => {
    const t = $(e).text();
    if (detectSecondaryPriceLineText(t)) $(e).remove();
  });
  $b.find("[class*='reco'], [class*='carousel']").each((_, e) => {
    const c = ($(e).attr("class") || "").toLowerCase();
    if (c.includes("reco") || c.includes("carousel")) $(e).remove();
  });
  return $b as Cheerio<Element>;
}

/** Subtitles/second-line: preço explícito antes de “em outros meios” (fora do Pix). */
function extractOutrosMeiosPriceFromBlock($: CheerioAPI, $rawBlock: Cheerio<Element>): number | null {
  let best: number | null = null;
  const tryText = (raw: string) => {
    const n = parsePriceEmOutrosMeiosLine(raw);
    if (n != null && (best == null || n > best)) best = n;
  };
  $rawBlock.find(".ui-pdp-price__subtitles, .ui-pdp-price__second-line").each((_, el) => {
    tryText($(el as unknown as Element).text());
  });
  tryText($rawBlock.text());
  return best;
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
    const n = parseAndesMoneyCheerio($, $(el) as Cheerio<Element>);
    if (n != null) out.push(n);
  });
  $scope.find(".ui-pdp-price__original-value").each((_, el) => {
    const n = parseAndesMoneyCheerio($, $(el) as Cheerio<Element>);
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
    if ($el.closest(".ui-pdp-price__subtitles").length) return;
    const n = parseAndesMoneyCheerio($, $el);
    if (n != null) out.push(n);
  });
  return [...new Set(out.filter((n) => Number.isFinite(n) && n > 0))];
}

/**
 * Somente dentro do bloco vencedor (DOM clonado e limpo).
 * Com riscado: original = max(previous), atual = max(current abaixo do original).
 * Sem riscado: dois valores muito próximos (&lt;25%) → preço único = maior; senão desconto menor/maior;
 * três+ valores → max=original e max(abaixo do max)=atual.
 */
function resolvePricesFromBlockDom(
  $: CheerioAPI,
  $strippedBlock: Cheerio<Element>,
  notes: string[],
): { current: number | null; original: number | null; displayMode: PricingDisplayMode } {
  const prevVals = collectVisiblePreviousInBlock($, $strippedBlock);
  const curVals = collectVisibleCurrentAndesInBlock($, $strippedBlock);
  const uniqPrev = [...new Set(prevVals)].sort((a, b) => a - b);
  const uniqCur = [...new Set(curVals)].sort((a, b) => a - b);

  if (uniqPrev.length && uniqCur.length) {
    const original = roundMoney(Math.max(...uniqPrev));
    /**
     * Com riscado explícito, o “atual” correto costuma ser o **maior** entre os valores não-riscados
     * que ainda ficam abaixo do original — não o min(). Um segundo .andes-money menor (parcela mal
     * classificada, cupom, linha auxiliar) não pode vencer sobre o preço principal (ex.: 135 vs 150).
     */
    const belowOriginal = uniqCur.filter((c) => c < original - 0.005);
    const currentRaw =
      belowOriginal.length > 0 ? Math.max(...belowOriginal) : Math.min(...uniqCur);
    const current = roundMoney(currentRaw);
    if (original > current) {
      notes.push(
        "Par anterior (riscado) + atual no bloco: entre valores não-riscados abaixo do original, usa-se o maior (preço principal); original = max(riscados).",
      );
      return { current: current, original: original, displayMode: "discounted_price" };
    }
    notes.push("Valores de anterior não são maiores que o atual no bloco — tratando como preço único.");
    return { current: current, original: null, displayMode: "single_price" };
  }

  const allDistinct = [...new Set([...uniqPrev, ...uniqCur])].sort((a, b) => a - b);
  if (allDistinct.length >= 3) {
    const originalRaw = Math.max(...allDistinct);
    const below = allDistinct.filter((c) => c < originalRaw - 0.005);
    if (below.length) {
      const currentRaw = Math.max(...below);
      const original = roundMoney(originalRaw);
      const current = roundMoney(currentRaw);
      if (original > current) {
        notes.push(
          "Três+ valores no bloco sem riscado explícito: max=original, max(abaixo do max)=atual.",
        );
        return { current, original, displayMode: "discounted_price" };
      }
    }
  }
  if (allDistinct.length >= 2) {
    const low = allDistinct[0];
    const high = allDistinct[allDistinct.length - 1];
    if (high > low) {
      const ratio = high / low;
      if (ratio < 1.25) {
        notes.push(
          "Dois preços próximos sem riscado explícito: maior como preço único (evita valor menor espúrio).",
        );
        return { current: roundMoney(high), original: null, displayMode: "single_price" };
      }
      notes.push("Dois preços distintos no bloco (sem riscado explícito): menor=atual, maior=original.");
      return {
        current: roundMoney(low),
        original: roundMoney(high),
        displayMode: "discounted_price",
      };
    }
  }

  if (uniqCur.length === 1) {
    return { current: uniqCur[0], original: null, displayMode: "single_price" };
  }

  if (uniqCur.length > 1) {
    const low = Math.min(...uniqCur);
    const high = Math.max(...uniqCur);
    if (high > low) {
      const ratio = high / low;
      if (ratio < 1.25) {
        notes.push("Múltiplos andes próximos no bloco: maior como preço único.");
        return { current: roundMoney(high), original: null, displayMode: "single_price" };
      }
      notes.push("Múltiplos andes no bloco: menor=atual, maior=original.");
      return {
        current: roundMoney(low),
        original: roundMoney(high),
        displayMode: "discounted_price",
      };
    }
    return { current: roundMoney(low), original: null, displayMode: "single_price" };
  }

  return { current: null, original: null, displayMode: "unknown" };
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
      c.isBestPriceLabel ? "rótulo ‘melhor preço’ / oferta paralela — ignorado para UI principal" :
      c.isOtherSeller ? "bloco de outros vendedores — fora do buy box principal" :
      c.isCrossSell ? "cross-sell / carrossel — fora do buy box principal" :
      !c.fromMainBlock ? "fora do bloco principal vencedor — não compõe a UI final" :
      c.isOriginalCandidate && c.source !== "andes_dom" && c.source !== "aria" ?
        "candidato a ‘original’ só em meta/json — sem par visível no bloco vencedor" :
      "não selecionado para exibição após resolução pelo bloco principal");
    out.push({ index: i, value: c.value, source: c.source, reason });
  }
  return out;
}

function buildUsedList(candidates: PriceCandidate[], usedIndices: Set<number>): UsedCandidateEntry[] {
  const out: UsedCandidateEntry[] = [];
  const sorted = [...usedIndices].sort((a, b) => a - b);
  for (const i of sorted) {
    const c = candidates[i];
    if (!c) continue;
    out.push({
      index: i,
      value: c.value,
      source: c.source,
      reason: "alinhado ao preço final resolvido no bloco visual vencedor",
    });
  }
  return out;
}

function buildDiscardReasons(
  chosenBlock: ChosenBlockInfo | null,
  ignored: IgnoredCandidateEntry[],
  preamble: string[],
): string[] {
  const out = [...preamble];
  if (chosenBlock?.notes?.length) {
    for (const n of chosenBlock.notes) out.push(`resolver: ${n}`);
  }
  const cap = 48;
  for (let i = 0; i < Math.min(ignored.length, cap); i++) {
    const ig = ignored[i];
    out.push(`ignorado ${ig.value} (${ig.source}): ${ig.reason}`);
  }
  if (ignored.length > cap) {
    out.push(`… e mais ${ignored.length - cap} candidatos ignorados (ver tabela).`);
  }
  return out;
}

function computeUsedIndices(
  candidates: PriceCandidate[],
  currentPrice: number | null,
  originalPrice: number | null,
): Set<number> {
  const used = new Set<number>();
  const tol = 0.02;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.isInstallment || c.isRecommendation) continue;
    if (currentPrice != null && Math.abs(c.value - currentPrice) <= tol) {
      if (c.source === "json_ld" || c.source === "meta") continue;
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

  const blockPick = resolveMainVisualBlock($);
  let chosenBlock: ChosenBlockInfo | null = null;
  let currentPrice: number | null = null;
  let originalPrice: number | null = null;
  let displayMode: PricingDisplayMode = "unknown";
  let confidence: PriceConfidence = "low";

  const { installmentPrice, installments } = pickInstallmentFromCandidates(candidates);

  if (!blockPick) {
    notes.push(
      "Bloco principal não encontrado — preço final NÃO inferido por candidatos globais (evita min/max da página).",
    );
    chosenSignals.fallback = "no_winning_block";
    const usedIndices = new Set<number>();
    const ignored = buildIgnoredList(candidates, usedIndices, reasonOverride);
    const usedCandidates = buildUsedList(candidates, usedIndices);
    const discardReasons = buildDiscardReasons(null, ignored, [
      "Regra: sem bloco vencedor identificado, json_ld/meta/aria não definem preço de exibição.",
    ]);
    return {
      pricing: {
        currentPrice: null,
        originalPrice: null,
        discountPercent: null,
        hasDiscount: false,
        displayMode: "unknown",
        installmentPrice,
        installments,
        confidence: "low",
        source: sourceLayer,
      },
      chosenBlock: null,
      chosenSignals,
      usedCandidates,
      ignoredCandidates: ignored,
      discardReasons,
    };
  }

  const $rawBlock = blockPick.el;
  const $block = stripNoiseFromPriceBlock($, $rawBlock);
  const domResolved = resolvePricesFromBlockDom($, $block, notes);

  currentPrice = domResolved.current;
  originalPrice = domResolved.original;
  displayMode = domResolved.displayMode;

  const outrosMeios = extractOutrosMeiosPriceFromBlock($, $rawBlock);
  if (
    outrosMeios != null &&
    currentPrice != null &&
    outrosMeios > currentPrice + 0.005 &&
    (originalPrice == null || outrosMeios < originalPrice - 0.005)
  ) {
    notes.push(
      "Linha ‘em outros meios’: valor adotado como preço atual (não é parcela nem linha típica de cartão).",
    );
    currentPrice = outrosMeios;
    displayMode = originalPrice != null ? "discounted_price" : "single_price";
    chosenSignals.outrosMeiosPrice = outrosMeios;
  }

  if (currentPrice == null) {
    notes.push(
      "Não foi possível extrair preço andes do DOM do bloco vencedor — fallback global desativado (evita valores de outros blocos).",
    );
    chosenSignals.fallback = "no_price_in_winning_block_dom";
    originalPrice = null;
    displayMode = "unknown";
    confidence = "low";
    candidates.forEach((c, i) => {
      if (c.isOriginalCandidate && c.source !== "andes_dom" && c.source !== "aria") {
        reasonOverride.set(i, "‘original’ só em JSON-LD/meta — sem par visível no bloco vencedor");
      }
    });
  } else {
    confidence = "high";
    if (displayMode === "single_price") {
      candidates.forEach((c, i) => {
        if (c.isOriginalCandidate && c.source !== "andes_dom" && c.source !== "aria") {
          reasonOverride.set(i, "‘original’ só em JSON-LD/meta — sem correspondência visual no bloco vencedor");
        }
      });
    }
  }

  const prevInBlock = collectVisiblePreviousInBlock($, $block);
  const curInBlock = collectVisibleCurrentAndesInBlock($, $block);

  chosenBlock = {
    id: blockPick.id,
    selector: blockPick.selector,
    reason: blockPick.reason,
    score: blockPick.score,
    snippet: snippetOf($, $rawBlock, 420),
    hasStrikethroughPrevious: prevInBlock.length > 0,
    previousInBlockCount: prevInBlock.length,
    currentInBlockCount: curInBlock.length,
    notes,
  };
  chosenSignals.winningBlock = {
    id: blockPick.id,
    selector: blockPick.selector,
    reason: blockPick.reason,
    score: blockPick.score,
  };

  const hasDiscount =
    originalPrice != null && currentPrice != null && originalPrice > currentPrice;

  const discountPercent =
    hasDiscount && currentPrice != null && originalPrice != null ?
      discountPercentFromPair(currentPrice, originalPrice)
    : null;

  if (!hasDiscount) {
    originalPrice = null;
  }

  const usedIndices = computeUsedIndices(candidates, currentPrice, originalPrice);
  const ignoredCandidates = buildIgnoredList(candidates, usedIndices, reasonOverride);
  const usedCandidates = buildUsedList(candidates, usedIndices);

  const discardReasons = buildDiscardReasons(chosenBlock, ignoredCandidates, [
    `Bloco vencedor: ${blockPick.selector} (${blockPick.id})`,
    `Motivo da escolha do bloco: ${blockPick.reason}`,
    "Preço final = somente valores .andes-money visíveis no DOM deste bloco (após remover parcelas/widgets de comparar).",
  ]);

  return {
    pricing: {
      currentPrice,
      originalPrice: hasDiscount ? originalPrice : null,
      discountPercent: hasDiscount ? discountPercent : null,
      hasDiscount,
      displayMode: hasDiscount ? "discounted_price" : displayMode === "unknown" ? "unknown" : "single_price",
      installmentPrice,
      installments,
      confidence,
      source: sourceLayer,
    },
    chosenBlock,
    chosenSignals,
    usedCandidates,
    ignoredCandidates,
    discardReasons,
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

function shiftResolveResult(r: ResolvePreviewPricingResult, offset: number): ResolvePreviewPricingResult {
  if (offset <= 0) return r;
  return {
    ...r,
    ignoredCandidates: r.ignoredCandidates.map((e) => ({ ...e, index: e.index + offset })),
    usedCandidates: r.usedCandidates.map((e) => ({ ...e, index: e.index + offset })),
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
      ...shiftResolveResult(b, bCandidateOffset),
      pricing: { ...b.pricing, source: "mixed" },
    };
  }
  if (scoreResolved(b) > scoreResolved(a)) {
    return {
      ...shiftResolveResult(b, bCandidateOffset),
      pricing: { ...b.pricing, source: "mixed" },
    };
  }
  return { ...a, pricing: { ...a.pricing, source: "mixed" } };
}

export function isWeakResolved(pricing: ResolvePreviewPricingResult["pricing"]): boolean {
  return pricing.currentPrice == null || (pricing.displayMode === "unknown" && pricing.confidence === "low");
}
