import { describe, expect, it } from "vitest";
import { extractFromHtml } from "./extractFromHtml";
import { resolvePreviewPricing } from "./resolvePreviewPricing";
import { normalizeMlFetchUrl } from "./normalize";
import { extractMlItemIdFromUrlWithRedirects } from "@/services/mercadolivre/ml-url-resolve";

const MLBU_URL =
  "https://www.mercadolivre.com.br/chuteira-kappa-milan-3-society-ag-grama-sintetica/up/MLBU3340811183";

const networkOk = process.env.CI !== "true" && process.env.SKIP_ML_NETWORK !== "1";

describe("MLBU /up/ sem wid no hash (catálogo)", () => {
  it.skipIf(!networkOk)("resolve MLB real via HTML (meli://item) a partir de /up/MLBU…", async () => {
    const id = await extractMlItemIdFromUrlWithRedirects(MLBU_URL);
    expect(id).toBe("MLB6100526080");
  });

  it.skipIf(!networkOk)("extrai título e preço do HTML real (rede)", async () => {
    const fetchUrl = normalizeMlFetchUrl(MLBU_URL);
    const r = await fetch(fetchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    expect(r.ok).toBe(true);
    const html = await r.text();
    expect(html.length).toBeGreaterThan(50_000);
    const ex = extractFromHtml(html, "integration");
    const res = resolvePreviewPricing(html, ex.candidates, "html");
    expect(ex.title?.length).toBeGreaterThan(5);
    expect(res.pricing.currentPrice).not.toBeNull();
    expect(res.pricing.currentPrice).toBeGreaterThan(0);
  });
});
