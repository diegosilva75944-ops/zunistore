import type { PriceCandidate, PriceConfidence, PriceDataSource } from "./types";
import { clampPercent, roundMoney } from "./normalize";

export type ChosenPricing = {
  currentPrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  installmentPrice: number | null;
  installments: number | null;
  confidence: PriceConfidence;
  source: PriceDataSource;
};

function uniqSorted(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
}

/**
 * Escolhe par atual/original e confiança a partir dos candidatos classificados.
 */
export function chooseBestPrices(
  candidates: PriceCandidate[],
  sourceLayer: PriceDataSource,
): ChosenPricing {
  const valid = candidates.filter((c) => c.value > 0 && Number.isFinite(c.value));
  if (!valid.length) {
    return {
      currentPrice: null,
      originalPrice: null,
      discountPercent: null,
      installmentPrice: null,
      installments: null,
      confidence: "low",
      source: sourceLayer,
    };
  }

  const nonNoise = valid.filter((c) => !c.isInstallment && !c.isShipping && !c.isRecommendation);
  const pool = nonNoise.length ? nonNoise : valid;

  const originals = pool.filter((c) => c.isOriginalCandidate).map((c) => c.value);
  const currents = pool.filter((c) => c.isCurrentCandidate).map((c) => c.value);

  let originalPrice: number | null =
    originals.length ? roundMoney(Math.max(...originals)) : null;
  let currentPrice: number | null =
    currents.length ? roundMoney(Math.min(...currents)) : null;

  if (originalPrice != null && currentPrice != null) {
    if (originalPrice <= currentPrice) {
      const nums = uniqSorted(pool.map((c) => c.value));
      if (nums.length >= 2) {
        originalPrice = roundMoney(nums[nums.length - 1]);
        currentPrice = roundMoney(nums[0]);
      } else {
        originalPrice = null;
      }
    }
  }

  if (currentPrice == null && originalPrice == null) {
    const nums = uniqSorted(pool.map((c) => c.value));
    if (nums.length >= 2) {
      originalPrice = roundMoney(nums[nums.length - 1]);
      currentPrice = roundMoney(nums[0]);
    } else if (nums.length === 1) {
      currentPrice = roundMoney(nums[0]);
      originalPrice = null;
    }
  } else if (currentPrice == null && originalPrice != null) {
    currentPrice = originalPrice;
    originalPrice = null;
  } else if (originalPrice == null && currentPrice != null) {
    /* só um preço */
  }

  let installmentPrice: number | null = null;
  let installments: number | null = null;
  const inst = valid.find((c) => c.isInstallment);
  if (inst) {
    installmentPrice = roundMoney(inst.value);
    const m = inst.nearText.match(/(\d+)\s*x/i);
    if (m) installments = parseInt(m[1], 10);
  }

  let discountPercent: number | null = null;
  if (originalPrice != null && currentPrice != null && originalPrice > currentPrice) {
    discountPercent = clampPercent((1 - currentPrice / originalPrice) * 100);
  }

  let confidence: PriceConfidence = "low";
  const hasJson = pool.some((c) => c.source === "json_ld");
  const hasDom = pool.some((c) => c.source === "andes_dom" || c.source === "meta");
  const hasPair =
    originalPrice != null &&
    currentPrice != null &&
    originalPrice > (currentPrice ?? 0);

  if (hasPair && (hasJson || hasDom)) confidence = "high";
  else if (hasPair || hasJson) confidence = "medium";
  else if (currentPrice != null && (hasDom || hasJson)) confidence = "medium";
  else if (currentPrice != null) confidence = "low";

  return {
    currentPrice,
    originalPrice,
    discountPercent,
    installmentPrice,
    installments: installments != null && Number.isFinite(installments) ? installments : null,
    confidence,
    source: sourceLayer,
  };
}
