/**
 * Teste local: compara extração só-HTML vs fetchPricesFromUrl (Playwright).
 * Uso: npx tsx scripts/test-ml-sync-price.ts "https://www.mercadolivre.com.br/..."
 */
import {
  extractAriaLabelPriceSequenceFromFragment,
  extractPricesFromHtml,
  fetchPricesFromUrl,
} from "../lib/ml-price";

const ML_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Referer: "https://www.mercadolivre.com.br/",
} as const;

async function main() {
  const url =
    process.argv[2] ||
    "https://www.mercadolivre.com.br/cabo-mxt-p10xp10-5m-lilas-p-guitarra-violo-baixo-teclado/p/MLB22743210";

  console.log("URL:", url.slice(0, 100) + (url.length > 100 ? "…" : ""));
  console.log("---");

  const res = await fetch(url, { cache: "no-store", redirect: "follow", headers: ML_FETCH_HEADERS });
  console.log("fetch() status:", res.status, "final:", res.url.slice(0, 90) + "…");
  const html = await res.text();
  const mainIdx = html.toLowerCase().indexOf("ui-pdp-price__main-container");
  if (mainIdx >= 0) {
    const ariaSeq = extractAriaLabelPriceSequenceFromFragment(html.slice(mainIdx, mainIdx + 20000));
    console.log("aria-label (ordem no main-container):", JSON.stringify(ariaSeq));
  }
  const fromHtml = extractPricesFromHtml(html);
  console.log("extractPricesFromHtml (SSR / fetch):", JSON.stringify(fromHtml));

  console.log("\nfetchPricesFromUrl (inclui Playwright quando disponível)…");
  const t0 = Date.now();
  const full = await fetchPricesFromUrl(url);
  console.log("tempo_ms:", Date.now() - t0);
  console.log("resultado:", JSON.stringify(full));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
