import "server-only";

import type { ExternalListingOrigin, NormalizedMlListing } from "./normalizer";
import { slugify } from "@/lib/slug";

export type MlToInternalProductDraft = {
  title: string;
  description: string;
  description_detail: string;
  images: string[];
  price: number;
  promo_price: number | null;
  is_offer: boolean;
  off_percent: number;
  rating: number | null;
  reviews_count: number | null;
  affiliate_code: string;
  affiliate_url: string;
  source_url: string;
  last_seen_at: string;
  is_active: boolean;
};

export type MlExternalListingDraft = {
  origin: ExternalListingOrigin;
  origin_tipo: "public_listing";
  external_id: string;
  external_permalink: string;
  seller_id: string | null;
  seller_nickname: string | null;
  external_category_id: string | null;
  external_category_name: string | null;
  external_currency: string | null;
  external_price_current: number | null;
  external_price_original: number | null;
  external_is_promo: boolean | null;
  external_discount_percent: number | null;
  external_brand: string | null;
  external_model: string | null;
  external_gtin: string | null;
  external_attributes: unknown;
  external_payload: unknown;
  external_thumbnail: string | null;
  external_main_image: string | null;
  external_images: string[];
  import_mode: "admin_internal";
  external_status: string | null;
  external_active: boolean;
  last_synced_at: string;
};

function clampOffPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function buildShortDescription(n: NormalizedMlListing, categoryName?: string | null): string {
  const parts: string[] = [];
  if (n.brand) parts.push(`Marca: ${n.brand}`);
  if (n.model) parts.push(`Modelo: ${n.model}`);
  if (n.gtin) parts.push(`GTIN/EAN: ${n.gtin}`);
  if (categoryName) parts.push(`Categoria: ${categoryName}`);
  // padrão do projeto: '|' vira quebra de linha na página
  return parts.join(" | ");
}

export function mapMlNormalizedToDrafts(opts: {
  normalized: NormalizedMlListing;
  /** Nome/breadcrumb externo (opcional, vindo de /categories/{id}). */
  externalCategoryName?: string | null;
  /** Breadcrumb externo (opcional). */
  externalCategoryPath?: string[];
  /** Preço “corrigido” por fallback (se a API não trouxe). */
  fallbackPrice?: { price: number; promo_price: number | null } | null;
  /** Import PDP + link de afiliado (substitui permalink ML no botão Comprar). */
  affiliateUrlOverride?: string;
  sourceUrlOverride?: string;
  affiliateCodeOverride?: string;
  /** Texto curto e longo vindos da PDP (substituem heurística marca/modelo). */
  descriptionShortOverride?: string;
  descriptionDetailOverride?: string;
}) {
  const n = opts.normalized;
  const now = new Date().toISOString();

  /**
   * Semântica alinhada à API ML e ao resolvePreviewPricing (import HTML):
   * - `price_current` = valor a pagar hoje (geralmente o menor em promoção)
   * - `price_original` = “de / riscado” quando maior que o atual
   * No produto interno: `price` = de vitrine (maior), `promo_price` = valor atual (menor).
   */
  let listPrice: number;
  let sellPrice: number | null;
  let isOffer: boolean;
  let offPercent: number;

  const fb = opts.fallbackPrice;
  if (fb != null && fb.price != null && Number.isFinite(fb.price) && fb.price > 0) {
    listPrice = fb.price;
    const prom = fb.promo_price;
    if (prom != null && Number.isFinite(prom) && prom > 0 && prom < listPrice) {
      sellPrice = prom;
      isOffer = true;
      offPercent = clampOffPercent((1 - prom / listPrice) * 100);
    } else {
      sellPrice = null;
      isOffer = false;
      offPercent = 0;
    }
  } else {
    const sell = n.price_current;
    if (sell == null || !Number.isFinite(sell) || sell <= 0) {
      throw new Error("Não foi possível obter um preço público válido para o anúncio.");
    }
    const list = n.price_original;
    if (list != null && Number.isFinite(list) && list > sell) {
      listPrice = list;
      sellPrice = sell;
      isOffer = true;
      offPercent = clampOffPercent((1 - sell / list) * 100);
    } else {
      listPrice = sell;
      sellPrice = null;
      isOffer = false;
      offPercent = 0;
    }
  }

  const categoryName = opts.externalCategoryName ?? null;
  const shortDesc =
    opts.descriptionShortOverride?.trim() || buildShortDescription(n, categoryName);
  const descriptionDetail =
    opts.descriptionDetailOverride?.trim() ?? n.description_plain ?? "";

  const defaultPermalink = n.external_permalink || `https://www.mercadolivre.com.br/p/${n.external_id}`;
  const affiliateUrl = opts.affiliateUrlOverride?.trim() || defaultPermalink;
  const sourceUrl = opts.sourceUrlOverride?.trim() || defaultPermalink;

  const productDraft: MlToInternalProductDraft = {
    title: n.title,
    description: shortDesc,
    description_detail: descriptionDetail,
    images: Array.isArray(n.images) && n.images.length ? n.images : (n.thumbnail ? [n.thumbnail] : []),
    price: listPrice,
    promo_price: sellPrice,
    is_offer: isOffer,
    off_percent: offPercent,
    rating: n.rating ?? null,
    reviews_count: n.reviews_count ?? null,
    affiliate_code:
      opts.affiliateCodeOverride?.trim() ||
      (n.origin === "magazinevoce" ? "magalu_ext" : "ml_public"),
    affiliate_url: affiliateUrl,
    source_url: sourceUrl,
    last_seen_at: now,
    is_active: n.external_active,
  };

  const externalDraft: MlExternalListingDraft = {
    origin: n.origin,
    origin_tipo: "public_listing",
    external_id: n.external_id,
    /** URL canônica do anúncio; o link de afiliado fica em products.affiliate_url */
    external_permalink: defaultPermalink,
    seller_id: n.seller_id,
    seller_nickname: n.seller_nickname,
    external_category_id: n.external_category_id,
    external_category_name: categoryName,
    external_currency: n.currency,
    external_price_current: n.price_current,
    external_price_original: n.price_original,
    external_is_promo: n.is_promo,
    external_discount_percent: n.discount_percent,
    external_brand: n.brand,
    external_model: n.model,
    external_gtin: n.gtin,
    external_attributes: n.attributes,
    external_payload: { item: n.raw_item, description: n.raw_description },
    external_thumbnail: n.thumbnail,
    external_main_image: n.images?.[0] ?? n.thumbnail,
    external_images: n.images ?? [],
    import_mode: "admin_internal",
    external_status: n.external_status,
    external_active: n.external_active,
    last_synced_at: now,
  };

  const suggestedSlugBase = slugify(n.title) || "produto";

  return { productDraft, externalDraft, suggestedSlugBase, externalCategoryPath: opts.externalCategoryPath ?? [] };
}

