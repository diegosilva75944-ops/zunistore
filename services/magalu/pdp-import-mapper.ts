import "server-only";

import type { TestMagaluImportResult } from "@/lib/magalu-test/types";
import type { NormalizedMlListing } from "@/services/mercadolivre/normalizer";

export function buildNormalizedFromMagaluImport(
  r: TestMagaluImportResult,
  externalId: string,
  canonicalPermalink: string,
): NormalizedMlListing {
  const p = r.pricing;
  const current = p.currentPrice;
  if (current == null || !Number.isFinite(current) || current <= 0) {
    throw new Error("Não foi possível obter o preço principal na página do Magazine Luiza / Magazine Você.");
  }
  const original =
    p.originalPrice != null && Number.isFinite(p.originalPrice) && p.originalPrice > current
      ? p.originalPrice
      : null;
  const isPromo = original != null;
  const discountPercent =
    isPromo && original != null && original > 0
      ? Math.min(100, Math.max(0, Math.round((1 - current / original) * 100)))
      : null;

  const title = (r.title || "").trim() || "Produto";
  const images = Array.isArray(r.images)
    ? r.images.filter((u) => typeof u === "string" && u.startsWith("http"))
    : [];

  const attrs = Object.entries(r.specs || {}).map(([id, value]) => ({
    id: id.slice(0, 120),
    name: id,
    value_name: value,
  }));

  return {
    origin: "magazinevoce",
    origin_tipo: "public_listing",
    external_id: externalId.trim(),
    external_permalink: canonicalPermalink.trim(),
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
    attributes: attrs,
    brand: r.specs?.Marca?.trim() || null,
    model: r.specs?.Modelo?.trim() || null,
    gtin: null,
    rating: r.rating ?? null,
    reviews_count: r.reviewsCount ?? null,
    raw_item: { source: "magalu_pdp_html", specs: r.specs, pricing: p },
    raw_description: null,
  };
}
