/**
 * Teste manual: npx tsx scripts/test-meli-profile-price.ts
 * Casos: perfil social (poly) com "Antes/Agora" em aria — milhar e centavos no "Agora".
 */
import { fetchPricesFromUrl } from "../lib/ml-price";

const CASES: { url: string; expectPrice: number; expectPromo: number }[] = [
  { url: "https://meli.la/2x3muYy", expectPrice: 1199, expectPromo: 999 },
  { url: "https://meli.la/1NV24Sq", expectPrice: 1000, expectPromo: 649.9 },
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
      const ok =
        approx(r.price, expectPrice) &&
        r.promoPrice != null &&
        approx(r.promoPrice, expectPromo);
      console.log(
        ok
          ? `OK (esperado ~${expectPrice} / ~${expectPromo})`
          : `FALHA esperado price=${expectPrice} promo=${expectPromo} obtido ${r.price} ${r.promoPrice}`,
      );
    }
  }
}

main().catch(console.error);
