import { describe, expect, it } from "vitest";
import { resolveMercadoLivreFetchUrl } from "@/lib/ml-price";

describe("resolveMercadoLivreFetchUrl — paridade com URL completa (Teste ML)", () => {
  const base =
    "https://www.mercadolivre.com.br/hisense-smart-tv-4k-65-polegadas-65a6nv/p/MLB63328831";
  const withDeal = `${base}?pdp_filters=deal%3AMLB779362-1`;

  it("prioriza source_url com pdp_filters mesmo havendo affiliate (mesma PDP do teste com link completo)", () => {
    const u = resolveMercadoLivreFetchUrl(withDeal, `${base}?tracking=1`);
    expect(u).toContain("pdp_filters=");
    expect(u).toContain("MLB63328831");
  });

  it("sem pdp_filters: usa affiliate quando existir", () => {
    const aff = `${base}?wid=123`;
    const src = base;
    const u = resolveMercadoLivreFetchUrl(src, aff);
    expect(u).toContain("wid=123");
  });

  it("só source: mantém query (não remove mais ?… como antes)", () => {
    const u = resolveMercadoLivreFetchUrl(`${base}?foo=bar`, null);
    expect(u).toContain("foo=bar");
  });
});
