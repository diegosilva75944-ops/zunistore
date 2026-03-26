/**
 * Teste manual: npx tsx scripts/test-meli-profile-price.ts
 * Primeiro `poly-component__price`: 1º valor = normal, 2º = promocional (ordem no HTML).
 */
import { fetchPricesFromUrl } from "../lib/ml-price";

const CASES: {
  url: string;
  expectPrice: number;
  expectPromo: number | null;
}[] = [
  { url: "https://meli.la/2x3muYy", expectPrice: 1199, expectPromo: 999 },
  // ML manda 649,90 no DOM; sync do catálogo: só lista (1000) quando Agora traz “centavos” no aria
  { url: "https://meli.la/1NV24Sq", expectPrice: 1000, expectPromo: null },
];

function approx(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

async function main() {
  for (const { url, expectPrice, expectPromo } of CASES) {
    console.log(`\n--- ${url} ---`);
    const r = await fetchPricesFromUrl(url);
    console.log(JSON.stringify(r, null, 2));
    const r2 = await fetchPricesFromUrl({ sourceUrl: null, affiliateUrl: url });
    if (r2.kind !== r.kind) {
      console.log("Divergência string vs { affiliateUrl }:", r.kind, r2.kind);
    }
    if (r.kind === "ok") {
      const promoOk =
        expectPromo == null
          ? r.promoPrice == null
          : r.promoPrice != null && approx(r.promoPrice, expectPromo);
      const ok = approx(r.price, expectPrice) && promoOk;
      console.log(
        ok
          ? `OK (esperado ~${expectPrice} / promo ${expectPromo})`
          : `FALHA esperado price=${expectPrice} promo=${expectPromo} obtido ${r.price} ${r.promoPrice}`,
      );
    }
  }
}

main().catch(console.error);
