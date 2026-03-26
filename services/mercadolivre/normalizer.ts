import "server-only";

export type MlItemLike = {
  id: string;
  title?: string | null;
  permalink?: string | null;
  status?: string | null;
  seller_id?: string | number | null;
  category_id?: string | null;
  currency_id?: string | null;
  price?: number | null;
  base_price?: number | null;
  original_price?: number | null;
  pictures?: { url?: string | null; secure_url?: string | null }[] | null;
  thumbnail?: string | null;
  attributes?: { id?: string; name?: string; value_name?: string | null }[] | null;
};

export type MlDescriptionLike = {
  plain_text?: string | null;
  text?: string | null;
  last_updated?: string | null;
} | null;

export type NormalizedMlListing = {
  origin: "mercadolivre";
  origin_tipo: "public_listing";
  external_id: string;
  external_permalink: string | null;
  external_status: string | null;
  external_active: boolean;

  seller_id: string | null;
  seller_nickname: string | null;

  external_category_id: string | null;
  currency: string | null;

  title: string;
  price_current: number | null;
  price_original: number | null;
  is_promo: boolean | null;
  discount_percent: number | null;

  thumbnail: string | null;
  images: string[];

  description_plain: string;
  attributes: { id?: string; name?: string; value_name?: string | null }[];

  brand: string | null;
  model: string | null;
  gtin: string | null;

  raw_item: unknown;
  raw_description: unknown;
};

function pickAttr(attrs: { id?: string; value_name?: string | null }[], id: string): string | null {
  const found = attrs.find((a) => (a.id || "").toUpperCase() === id.toUpperCase());
  const v = found?.value_name;
  return v != null && String(v).trim() ? String(v).trim() : null;
}

export function normalizeMlPublicListing(input: {
  item: MlItemLike;
  description?: MlDescriptionLike;
}): NormalizedMlListing {
  const item = input.item;
  const desc = input.description ?? null;

  const externalId = String(item.id || "").trim().toUpperCase();
  const title = String(item.title || "").trim();

  const status = item.status != null ? String(item.status).trim() : null;
  const active = status ? status === "active" : true;

  const sellerId =
    item.seller_id == null ? null : String(item.seller_id).trim();

  const currency = item.currency_id != null ? String(item.currency_id).trim() : null;

  // Preços públicos
  const current =
    item.price != null && Number.isFinite(item.price) && item.price > 0
      ? Number(item.price)
      : null;

  // Alguns anúncios expõem `original_price`; outros expõem `base_price`.
  const originalCandidate =
    item.original_price != null && Number.isFinite(item.original_price) && item.original_price > 0
      ? Number(item.original_price)
      : item.base_price != null && Number.isFinite(item.base_price) && item.base_price > 0
        ? Number(item.base_price)
        : null;

  const priceOriginal =
    current != null && originalCandidate != null && originalCandidate > current
      ? originalCandidate
      : null;

  const isPromo =
    current != null && priceOriginal != null ? current < priceOriginal : null;

  const discountPercent =
    current != null && priceOriginal != null && priceOriginal > 0 && current < priceOriginal
      ? Math.min(100, Math.max(0, Math.round((1 - current / priceOriginal) * 100)))
      : null;

  const pics = Array.isArray(item.pictures) ? item.pictures : [];
  const images = pics
    .map((p) => p?.secure_url || p?.url)
    .filter((u): u is string => typeof u === "string" && u.startsWith("http"));

  const thumbnail =
    item.thumbnail && String(item.thumbnail).startsWith("http")
      ? String(item.thumbnail)
      : images[0] ?? null;

  const attributes = Array.isArray(item.attributes) ? item.attributes : [];
  const brand = pickAttr(attributes, "BRAND");
  const model = pickAttr(attributes, "MODEL");
  const gtin = pickAttr(attributes, "GTIN") ?? pickAttr(attributes, "EAN");

  const descriptionPlain =
    (desc?.plain_text && String(desc.plain_text).trim()) ||
    (desc?.text && String(desc.text).trim()) ||
    "";

  return {
    origin: "mercadolivre",
    origin_tipo: "public_listing",
    external_id: externalId,
    external_permalink: item.permalink ? String(item.permalink) : null,
    external_status: status,
    external_active: active,

    seller_id: sellerId,
    seller_nickname: null, // preenchido por search (quando disponível)

    external_category_id: item.category_id ? String(item.category_id) : null,
    currency,

    title,
    price_current: current,
    price_original: priceOriginal,
    is_promo: isPromo,
    discount_percent: discountPercent,

    thumbnail,
    images,

    description_plain: descriptionPlain,
    attributes,

    brand,
    model,
    gtin,

    raw_item: item,
    raw_description: desc,
  };
}

