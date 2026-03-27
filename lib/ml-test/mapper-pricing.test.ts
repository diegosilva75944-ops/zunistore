import { describe, expect, it } from "vitest";
import { mapMlNormalizedToDrafts } from "@/services/mercadolivre/mapper";
import type { NormalizedMlListing } from "@/services/mercadolivre/normalizer";

function baseN(over: Partial<NormalizedMlListing>): NormalizedMlListing {
  return {
    origin: "mercadolivre",
    origin_tipo: "public_listing",
    external_id: "MLB1",
    external_permalink: "https://www.mercadolivre.com.br/p/MLB1",
    external_status: "active",
    external_active: true,
    seller_id: null,
    seller_nickname: null,
    external_category_id: null,
    currency: "BRL",
    title: "X",
    price_current: 100,
    price_original: null,
    is_promo: false,
    discount_percent: null,
    thumbnail: null,
    images: [],
    description_plain: "",
    attributes: [],
    brand: null,
    model: null,
    gtin: null,
    rating: null,
    reviews_count: null,
    raw_item: {},
    raw_description: null,
    ...over,
  };
}

describe("mapMlNormalizedToDrafts — preço lista vs promo", () => {
  it("com desconto: price = original (lista), promo_price = current (venda)", () => {
    const { productDraft } = mapMlNormalizedToDrafts({
      normalized: baseN({
        price_current: 2500,
        price_original: 3200,
        is_promo: true,
        discount_percent: 22,
      }),
    });
    expect(productDraft.price).toBe(3200);
    expect(productDraft.promo_price).toBe(2500);
    expect(productDraft.is_offer).toBe(true);
    expect(productDraft.off_percent).toBe(22);
  });

  it("sem desconto: price = current, promo_price null", () => {
    const { productDraft } = mapMlNormalizedToDrafts({
      normalized: baseN({
        price_current: 1999,
        price_original: null,
      }),
    });
    expect(productDraft.price).toBe(1999);
    expect(productDraft.promo_price).toBeNull();
    expect(productDraft.is_offer).toBe(false);
  });

  it("fallback HTML: price alto + promo baixo", () => {
    const { productDraft } = mapMlNormalizedToDrafts({
      normalized: baseN({ price_current: 1 }),
      fallbackPrice: { price: 3000, promo_price: 2400 },
    });
    expect(productDraft.price).toBe(3000);
    expect(productDraft.promo_price).toBe(2400);
    expect(productDraft.is_offer).toBe(true);
  });
});
