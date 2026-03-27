import "server-only";

import {
  fetchPricesFromUrl,
  resolveMercadoLivreFetchUrl,
  type FetchMlPriceInput,
} from "@/lib/ml-price";
import { runTestMlImport } from "@/lib/ml-test/pipeline";
import { extractMlItemIdFromUrl } from "@/services/mercadolivre/parser";
import { buildNormalizedFromTestImport } from "@/services/mercadolivre/pdp-import-mapper";
import { mapMlNormalizedToDrafts } from "@/services/mercadolivre/mapper";

/**
 * Mesmo modelo da importação (PDP HTML → normalizado → mapMlNormalizedToDrafts).
 * Se o pipeline falhar, usa `fetchPricesFromUrl` como contingência (listing_gone / preço legado).
 */
export type MlPricesLikeImportResult =
  | { kind: "ok"; price: number; promo_price: number | null; is_offer: boolean; off_percent: number }
  | { kind: "listing_gone" }
  | { kind: "unreadable" }
  | { kind: "blocked" }
  | { kind: "http_error"; status: number };

function packFromLegacyOk(ml: { kind: "ok"; price: number; promoPrice: number | null }): Extract<
  MlPricesLikeImportResult,
  { kind: "ok" }
> {
  const { price, promoPrice: promo } = ml;
  const is_offer = promo != null && promo < price;
  const off_percent = is_offer
    ? Math.min(100, Math.max(0, Math.round((1 - promo! / price) * 100)))
    : 0;
  return { kind: "ok", price, promo_price: promo, is_offer, off_percent };
}

function resolveFetchUrl(input: FetchMlPriceInput): string {
  return typeof input === "string" ? input : resolveMercadoLivreFetchUrl(input.sourceUrl, input.affiliateUrl);
}

function resolveExternalIdForNorm(fetchUrl: string, hint?: string | null): string {
  try {
    return extractMlItemIdFromUrl(fetchUrl);
  } catch {
    const h = String(hint ?? "").trim().toUpperCase();
    if (/^MLB\d{6,}$/.test(h)) return h;
    const m = fetchUrl.match(/\/p\/(MLB\d{6,})\b/i);
    if (m?.[1]) return m[1].toUpperCase();
    return "MLB0000000000";
  }
}

export async function fetchMlPricesLikeImport(
  input: FetchMlPriceInput,
  opts?: { externalIdHint?: string | null },
): Promise<MlPricesLikeImportResult> {
  const fetchUrl = resolveFetchUrl(input);
  if (!String(fetchUrl || "").trim()) {
    return { kind: "unreadable" };
  }

  try {
    const result = await runTestMlImport(fetchUrl, "auto");
    const idForNorm = resolveExternalIdForNorm(fetchUrl, opts?.externalIdHint);
    const normalized = buildNormalizedFromTestImport(result, idForNorm, fetchUrl);

    let fallbackPrice: { price: number; promo_price: number | null } | null = null;
    if (
      normalized.price_current == null ||
      !Number.isFinite(normalized.price_current) ||
      normalized.price_current <= 0
    ) {
      const ml = await fetchPricesFromUrl(input);
      if (ml.kind === "listing_gone") return { kind: "listing_gone" };
      if (ml.kind === "ok") {
        fallbackPrice = { price: ml.price, promo_price: ml.promoPrice };
      }
    }

    const { productDraft } = mapMlNormalizedToDrafts({ normalized, fallbackPrice });
    return {
      kind: "ok",
      price: productDraft.price,
      promo_price: productDraft.promo_price,
      is_offer: productDraft.is_offer,
      off_percent: productDraft.off_percent,
    };
  } catch {
    const ml = await fetchPricesFromUrl(input);
    if (ml.kind === "ok") return packFromLegacyOk(ml);
    return ml;
  }
}
