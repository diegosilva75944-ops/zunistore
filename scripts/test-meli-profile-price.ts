/**
 * Teste manual: npx tsx scripts/test-meli-profile-price.ts
 * Esperado (perfil social Kärcher): normal ~1199, promo ~999
 */
import { extractPricesFromHtml, fetchPricesFromUrl } from "../lib/ml-price";

const URL = "https://meli.la/2x3muYy";

async function main() {
  console.log("--- fetchPricesFromUrl (string) ---");
  const r = await fetchPricesFromUrl(URL);
  console.log(JSON.stringify(r, null, 2));

  console.log("\n--- fetchPricesFromUrl ({ affiliateUrl }) ---");
  const r2 = await fetchPricesFromUrl({ sourceUrl: null, affiliateUrl: URL });
  console.log(JSON.stringify(r2, null, 2));

  if (r.kind === "ok" || r2.kind === "ok") {
    const x = r.kind === "ok" ? r : (r2 as { kind: "ok"; price: number; promoPrice: number | null });
    if (x.kind === "ok") {
      console.log("\nComparar: esperado price=1199, promo=999");
      console.log("Obtido:", x.price, x.promoPrice);
    }
  }
}

main().catch(console.error);
