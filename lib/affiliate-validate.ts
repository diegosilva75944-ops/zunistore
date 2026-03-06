/**
 * Validação do link de afiliado pelo preço normal.
 * Abre a URL, baixa a página e tenta extrair o preço (normal) da página do ML.
 * Se não conseguir detectar o preço normal → link de afiliado expirado.
 */

import { extractPricesFromHtml } from "@/lib/ml-price";

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Valida pelo preço normal: se a página tiver preço detectável, link válido; senão, expirado.
 */
export async function checkAffiliatePageContainsProduct(
  affiliateUrl: string,
  _productTitle: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(affiliateUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) return { valid: false, error: `HTTP ${res.status}` };

    const html = await res.text();
    const { price } = extractPricesFromHtml(html);

    const valid =
      price != null && Number.isFinite(price) && price > 0;

    return { valid };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { valid: false, error: message };
  }
}
