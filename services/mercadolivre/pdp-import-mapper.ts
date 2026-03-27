import "server-only";

import type { TestMlImportResult } from "@/lib/ml-test/types";
import type { NormalizedMlListing } from "@/services/mercadolivre/normalizer";

/**
 * Converte o resultado do pipeline de importação HTML (mesmo do teste admin)
 * para o modelo normalizado usado em persistência / product_external_listings.
 */
export function buildNormalizedFromTestImport(
  r: TestMlImportResult,
  externalId: string,
  canonicalPermalink: string,
): NormalizedMlListing {
  const p = r.pricing;
  const current = p.currentPrice;
  if (current == null || !Number.isFinite(current) || current <= 0) {
    throw new Error("Não foi possível obter o preço principal na página do Mercado Livre.");
  }
  const original =
    p.hasDiscount && p.originalPrice != null && p.originalPrice > current ? p.originalPrice : null;
  const isPromo = original != null;
  const discountPercent =
    isPromo && original != null && original > 0
      ? Math.min(100, Math.max(0, Math.round((1 - current / original) * 100)))
      : null;

  const title = (r.title || "").trim() || "Produto";
  const images = Array.isArray(r.images)
    ? r.images.filter((u) => typeof u === "string" && u.startsWith("http"))
    : [];

  return {
    origin: "mercadolivre",
    origin_tipo: "public_listing",
    external_id: externalId.trim().toUpperCase(),
    external_permalink: canonicalPermalink,
    external_status: "active",
    external_active: true,
    seller_id: null,
    seller_nickname: null,
    external_category_id: null,
    currency: "BRL",
    title,
    price_current: current,
    price_original: original,
    is_promo: isPromo,
    discount_percent: discountPercent,
    thumbnail: images[0] ?? null,
    images,
    description_plain: r.fullDescription || "",
    attributes: [],
    brand: null,
    model: null,
    gtin: null,
    rating: r.rating ?? null,
    reviews_count: r.reviewsCount ?? null,
    raw_item: { source: "pdp_html", pricing: p },
    raw_description: null,
  };
}
